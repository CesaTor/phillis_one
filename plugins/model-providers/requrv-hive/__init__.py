"""ReQurv Hive provider profile — the ReAgent distribution's only provider."""

import json
import logging
import re
import urllib.request
from typing import Any

from agent.reasoning_effort import OPENAI_COMPAT_WIRE_EFFORTS, clamp_effort, requested_effort
from providers import register_provider
from providers.base import ProviderProfile, _profile_user_agent

logger = logging.getLogger(__name__)

# Levels a model's `reasoning_effort` accepts, where it is narrower than the
# OpenAI-compatible set. ReAgent's desktop pins the same list for its pickers
# (apps/desktop/src/distribution); this side is what reaches the wire.
_MODEL_EFFORTS: dict[str, tuple[str, ...]] = {"requrv-small-3.8": ("low", "medium", "xhigh")}

# GET /v1/models lists every model the organization enabled, not just chat ones: embedding
# models (served on /v1/embeddings), rerankers, speech and image models too. A row that
# declares its kind is classified by it; one that does not is classified by its id and name.
_KIND_FIELDS = ("type", "model_type", "mode", "task", "category", "kind", "object")
_LABEL_LIST_FIELDS = ("capabilities", "tags")
_CHAT_KINDS = frozenset({
    "chat", "chat_completion", "chat_completions", "completion", "completions",
    "llm", "text", "text_generation", "language",
})
_NON_CHAT_KINDS = frozenset({
    "embed", "embedding", "embeddings", "text_embedding",
    "rerank", "reranker", "reranking",
    "tts", "text_to_speech", "speech", "audio_speech",
    "stt", "asr", "speech_to_text", "transcription", "transcriptions", "audio_transcription",
    "image", "images", "image_generation", "text_to_image", "video", "video_generation",
})
_NON_CHAT_NAME_RE = re.compile(
    r"(?i)embed|rerank|whisper|transcri|speech|"
    r"(?:^|[^a-z0-9])(?:tts|stt|asr|image|dall-e)(?:$|[^a-z0-9])"
)


def _kind(value: Any) -> str:
    return re.sub(r"[\s-]+", "_", value.strip().lower()) if isinstance(value, str) else ""


def _declared_chat(row: dict) -> bool | None:
    """True/False when the row's own metadata says chat/non-chat, None when it says neither."""
    capabilities = row.get("capabilities")
    kinds = [row.get(field) for field in _KIND_FIELDS]
    if isinstance(capabilities, dict):
        kinds.append(capabilities.get("type"))
    for kind in map(_kind, kinds):
        if kind in _CHAT_KINDS:
            return True
        if kind in _NON_CHAT_KINDS:
            return False
    labels = {_kind(label) for field in _LABEL_LIST_FIELDS
              if isinstance(row.get(field), list) for label in row[field]}
    if labels & _CHAT_KINDS:
        return True
    return False if labels & _NON_CHAT_KINDS else None


def _is_chat_row(row: Any) -> bool:
    if not isinstance(row, dict):
        return False
    declared = _declared_chat(row)
    if declared is not None:
        return declared
    names = (row.get(field) for field in ("id", "name", "display_name"))
    return not any(isinstance(name, str) and _NON_CHAT_NAME_RE.search(name) for name in names)


class _ReQurvHiveProfile(ProviderProfile):
    """Chat-only live catalog; top-level ``reasoning_effort``, clamped to what the model accepts."""

    def fetch_models(
        self, *, api_key: str | None = None, base_url: str | None = None, timeout: float = 8.0
    ) -> list[str] | None:
        """The organization's chat models from ``GET /models``, without its embedding, rerank,
        speech and image rows: picking one of those for chat breaks the conversation.

        Reads the rows itself because the base fetch keeps only their ids, and the kind a row
        declares is the signal to trust. Hive has no separate catalog URL, so the endpoint is
        the configured base URL (or the default one) plus ``/models``.
        """
        from hermes_cli.chat_catalog import chat_catalog_ids
        from hermes_cli.urllib_security import open_credentialed_url

        url = ((base_url or "").strip() or self.base_url).rstrip("/") + "/models"
        req = urllib.request.Request(url)
        if api_key:
            req.add_header("Authorization", f"Bearer {api_key}")
        req.add_header("Accept", "application/json")
        req.add_header("User-Agent", _profile_user_agent())
        for key, value in self.default_headers.items():
            req.add_header(key, value)
        try:
            with open_credentialed_url(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
            rows = data if isinstance(data, list) else data.get("data", [])
        except Exception as exc:
            logger.debug("fetch_models(%s): %s", self.name, exc)
            return None
        return chat_catalog_ids([row for row in rows if _is_chat_row(row)])

    def build_api_kwargs_extras(
        self, *, reasoning_config: dict | None = None, model: str | None = None, **context: Any
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Send the requested level, or the nearest accepted one below it (``high`` → ``medium``).

        Hive's generic host is not in the core reasoning allowlist, so without this the effort
        never reaches the wire. "Off" omits the field: these models have no off level, and
        clamping it would silently turn thinking back on at ``low``.
        """
        effort = requested_effort(reasoning_config)
        if effort is None or effort == "none":
            return {}, {}
        supported = _MODEL_EFFORTS.get((model or "").strip(), OPENAI_COMPAT_WIRE_EFFORTS)
        clamped = clamp_effort(effort, supported)
        return ({}, {"reasoning_effort": clamped}) if clamped in supported else ({}, {})


requrv_hive = _ReQurvHiveProfile(
    name="requrv-hive",
    aliases=("requrv", "hive"),
    display_name="ReQurv Hive",
    description="ReQurv Hive — OpenAI-compatible inference for your organization",
    signup_url="https://hive.requrv.ai/",
    env_vars=("REQURV_HIVE_API_KEY", "REQURV_HIVE_BASE_URL"),
    base_url="https://hive.requrv.ai/api/v1",
    auth_type="api_key",
    # The enabled models are per organization and GET /v1/models stays the source
    # of truth; this is the standard deployment's model, offered when the live
    # list is unreachable and declared here because /v1/models carries no window.
    fallback_models=("requrv-small-3.8",),
    model_capabilities={"requrv-small-3.8": {"context_window": 262_144}},
)

register_provider(requrv_hive)
