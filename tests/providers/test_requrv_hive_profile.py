"""The bundled ReQurv Hive provider plugin (ReAgent's only provider)."""

import json
from unittest.mock import MagicMock, patch

import pytest

from agent.models_dev import lookup_models_dev_context
from hermes_cli.models import probe_profile_catalog
from providers import get_provider_profile


def _profile():
    p = get_provider_profile("requrv-hive")
    assert p is not None
    return p


def _wire_effort(effort, model="requrv-small-3.8", enabled=True):
    _extra_body, top_level = _profile().build_api_kwargs_extras(
        reasoning_config={"enabled": enabled, "effort": effort}, model=model
    )
    return top_level.get("reasoning_effort")


@pytest.mark.parametrize(
    ("requested", "sent"),
    [
        ("minimal", "low"),
        ("low", "low"),
        ("medium", "medium"),
        ("high", "medium"),
        ("xhigh", "xhigh"),
        ("max", "xhigh"),
        ("ultra", "xhigh"),
    ],
)
def test_small_model_only_ever_receives_its_three_levels(requested, sent):
    assert _wire_effort(requested) == sent


def test_thinking_off_omits_the_field_instead_of_turning_low_back_on():
    assert _wire_effort("none") is None
    assert _wire_effort("medium", enabled=False) is None


def test_other_hive_models_keep_the_openai_compatible_levels():
    assert _wire_effort("high", model="requrv-other") == "high"


def test_small_model_declares_a_256k_window():
    assert lookup_models_dev_context("requrv-hive", "requrv-small-3.8") == 262_144


# Rows as an org's GET /v1/models may return them: some declare their kind, some only a name.
_CATALOG = [
    {"id": "requrv-small-3.8", "object": "model", "owned_by": "requrv"},
    {"id": "requrv-large", "type": "CHAT"},
    {"id": "requrv-medium"},
    {"id": "requrv-embed", "name": "Requrv Embed"},
    {"id": "hive-v1", "name": "Requrv Embed"},
    {"id": "vectors-2", "type": "EMBEDDING"},
    {"id": "ranker", "capabilities": {"type": "rerank"}},
    {"id": "narrator", "mode": "audio_speech"},
    {"id": "scribe", "capabilities": ["transcription"]},
    {"id": "whisper-large-v3"},
    {"id": "gpt-4o-mini-tts"},
    {"id": "painter", "tags": ["image_generation"]},
    {"id": "flux-pro"},
]
_CHAT_IDS = ["requrv-small-3.8", "requrv-large", "requrv-medium"]


def _serving(rows, seen_urls=None):
    def _open(req, timeout):
        if seen_urls is not None:
            seen_urls.append(req.full_url)
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({"data": rows}).encode()
        return response

    return patch("hermes_cli.urllib_security.open_credentialed_url", side_effect=_open)


def test_live_catalog_lists_only_chat_models():
    seen_urls = []
    with _serving(_CATALOG, seen_urls):
        assert _profile().fetch_models(api_key="test-key") == _CHAT_IDS
    assert seen_urls == ["https://hive.requrv.ai/api/v1/models"]


def test_declared_chat_kind_wins_over_an_embedding_shaped_name():
    rows = [{"id": "embed-aware-chat", "type": "chat"}, {"id": "requrv-small-3.8"}]
    with _serving(rows):
        assert _profile().fetch_models(api_key="test-key") == ["embed-aware-chat", "requrv-small-3.8"]


def test_custom_base_url_is_where_the_catalog_is_read():
    seen_urls = []
    with _serving(_CATALOG, seen_urls):
        _profile().fetch_models(api_key="test-key", base_url="https://hive.example.test/api/v1/")
    assert seen_urls == ["https://hive.example.test/api/v1/models"]


def test_picker_offers_the_fallback_model_and_no_embedding_model():
    profile = _profile()
    with _serving(_CATALOG):
        rows = probe_profile_catalog("requrv-hive", profile, "test-key", profile.base_url)
    assert rows[0] == "requrv-small-3.8"
    assert sorted(rows) == sorted(_CHAT_IDS)


def test_unreachable_catalog_still_offers_the_fallback_model():
    profile = _profile()
    with patch("hermes_cli.urllib_security.open_credentialed_url", side_effect=OSError("down")):
        assert profile.fetch_models(api_key="test-key") is None
        assert probe_profile_catalog("requrv-hive", profile, "test-key", profile.base_url) == ["requrv-small-3.8"]
    assert profile.fallback_models == ("requrv-small-3.8",)
