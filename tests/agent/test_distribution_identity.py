"""A distribution (HERMES_DISTRIBUTION) speaks as its own product; unset is upstream, byte for byte."""

from types import SimpleNamespace

import pytest

from agent import prompt_builder, system_prompt
from agent.system_prompt import build_system_prompt_parts

_FORBIDDEN = ("Nous Research", "nousresearch.com", "Hermes Agent")


def _agent(**overrides):
    base = dict(
        load_soul_identity=False,
        skip_context_files=True,
        valid_tool_names=[],
        _task_completion_guidance=False,
        _tool_use_enforcement=False,
        _environment_probe=False,
        _kanban_worker_guidance="",
        _memory_store=None,
        _memory_manager=None,
        model="",
        provider="",
        platform="",
        pass_session_id=False,
        session_id="",
        _emit_status=lambda *_args, **_kwargs: None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _stable(monkeypatch, *, skills: bool) -> str:
    if skills:
        monkeypatch.setattr(system_prompt, "_skills_prompt", lambda _agent: "- hermes-agent: help")
    agent = _agent(valid_tool_names=["skill_view"] if skills else [])
    return build_system_prompt_parts(agent)["stable"]


@pytest.mark.parametrize("skills", [True, False])
def test_reagent_prompt_names_reagent_and_never_nous(monkeypatch, skills):
    monkeypatch.setenv("HERMES_DISTRIBUTION", "reagent")
    stable = _stable(monkeypatch, skills=skills)

    assert "You are ReAgent, ReQurv's AI agent app, powered by ReQurv Hive." in stable
    assert "You run on ReAgent" in stable
    assert ("skill_view(name='hermes-agent')" in stable) is skills
    # The upstream copy reads "Hermes Agent" and "Nous Research"; none of it may survive.
    for text in _FORBIDDEN:
        assert text not in stable


@pytest.mark.parametrize("skills", [True, False])
def test_unset_distribution_keeps_upstream_prompt(monkeypatch, skills):
    monkeypatch.delenv("HERMES_DISTRIBUTION", raising=False)
    stable = _stable(monkeypatch, skills=skills)
    help_text = (
        prompt_builder.HERMES_AGENT_HELP_GUIDANCE if skills else prompt_builder.HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS
    )

    assert stable.startswith(prompt_builder.DEFAULT_AGENT_IDENTITY)
    assert help_text in stable
