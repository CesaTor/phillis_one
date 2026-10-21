"""ReQurv Hive provider profile — the ReAgent distribution's only provider."""

from typing import Any

from agent.reasoning_effort import OPENAI_COMPAT_WIRE_EFFORTS, clamp_effort, requested_effort
from providers import register_provider
from providers.base import ProviderProfile

# Levels a model's `reasoning_effort` accepts, where it is narrower than the
# OpenAI-compatible set. ReAgent's desktop pins the same list for its pickers
# (apps/desktop/src/distribution); this side is what reaches the wire.
_MODEL_EFFORTS: dict[str, tuple[str, ...]] = {"requrv-small-3.8": ("low", "medium", "xhigh")}


class _ReQurvHiveProfile(ProviderProfile):
    """Top-level ``reasoning_effort``, clamped to what the model accepts."""

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
