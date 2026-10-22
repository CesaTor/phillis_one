"""Product identity copy for a Hermes distribution (ReQurv's ReAgent).

A desktop distribution exports ``HERMES_DISTRIBUTION=<id>`` into every child it spawns, the same
variable it is built with. Unset means upstream Hermes, and every function here returns its
upstream argument untouched, so the prompt is byte-identical to upstream's.

Kept out of ``prompt_builder.py`` so upstream's identity and help-guidance constants stay verbatim
and sync cleanly; ``system_prompt.py`` routes them through this module with one call each.
"""

from __future__ import annotations

import os
from typing import Optional

_UPSTREAM_IDENTITY_OPENING = "You are Hermes Agent, built by Nous Research."

# The CLI and the skill keep the name `hermes` internally; only that literal name is referenced.
_REAGENT_HELP = (
    "You run on ReAgent, ReQurv's AI agent app, powered by ReQurv Hive. When the user needs help with "
    "ReAgent itself — configuring, setting up, using, extending, or troubleshooting it — or when you "
    "need to understand your own features, tools, or capabilities, "
)

_DISTRIBUTIONS = {
    "reagent": {
        "identity_opening": "You are ReAgent, ReQurv's AI agent app, powered by ReQurv Hive.",
        "help_skills": _REAGENT_HELP
        + "load the `hermes-agent` skill with skill_view(name='hermes-agent') for the actual commands "
        "and proven workflows before configuring or troubleshooting, so you don't guess or invent "
        "workarounds.",
        "help_no_skills": _REAGENT_HELP
        + "say what you know about it and say plainly when you don't; don't invent commands, "
        "settings, or workarounds.",
    },
}


def active_distribution() -> Optional[str]:
    """The distribution id from ``HERMES_DISTRIBUTION``, or None for upstream Hermes."""
    # health: allow HX002 -- the build-time distribution id, re-exported by the desktop; not a new setting
    value = os.environ.get("HERMES_DISTRIBUTION", "").strip().lower()
    return value if value in _DISTRIBUTIONS else None


def agent_identity(upstream: str) -> str:
    """``upstream`` with its opening sentence naming this distribution's product."""
    dist = active_distribution()
    if dist is None:
        return upstream
    return upstream.replace(_UPSTREAM_IDENTITY_OPENING, _DISTRIBUTIONS[dist]["identity_opening"], 1)


def help_guidance(upstream: str, *, skills: bool) -> str:
    """The self-help guidance block: ``upstream`` unless a distribution supplies its own copy."""
    dist = active_distribution()
    if dist is None:
        return upstream
    return _DISTRIBUTIONS[dist]["help_skills" if skills else "help_no_skills"]
