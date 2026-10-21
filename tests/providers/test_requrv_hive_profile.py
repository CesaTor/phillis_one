"""The bundled ReQurv Hive provider plugin (ReAgent's only provider)."""

import pytest

from agent.models_dev import lookup_models_dev_context
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
