"""Locked library bots (ReAgent distribution): every write path that reaches library-owned content refuses.

Real imports against a temp HOME / HERMES_HOME; bots are installed from a local library folder so the
ledger and manifest are the real ones. With ``HERMES_DISTRIBUTION`` unset nothing is locked.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import hermes_yaml as yaml
from fastapi.testclient import TestClient

from hermes_cli.bot_library import install_entry
from hermes_cli.bot_library_locks import (
    LibraryLockedError, is_library_locked, library_cron_refusal, library_owned, managed_config_keys,
    profile_lock_fields)
from hermes_cli.profiles import get_profile_dir
from hermes_cli.web_server import _SESSION_TOKEN, app
from tests.hermes_cli.test_bot_library import write_bot

client = TestClient(app)
HEADERS = {"X-Hermes-Session-Token": _SESSION_TOKEN}
OWNED_TAIL = "library bot and is replaced on update. Duplicate the bot to customise it."
SKILL = "---\nname: {n}\ndescription: d\n---\n# {n}\nstep one\n"


@pytest.fixture()
def profile_env(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / ".hermes").mkdir(exist_ok=True)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.delenv("HERMES_DISTRIBUTION", raising=False)
    return tmp_path


@pytest.fixture()
def bot(profile_env, tmp_path):
    """An installed library bot 'hr-bot' (managed key: mcp_servers; one shipped cron job)."""
    library = tmp_path / "drive" / "bots"
    entry = write_bot(library, "hr-bot", extra_manifest="config_managed:\n  - mcp_servers\n")
    (entry / "cron").mkdir()
    (entry / "cron" / "jobs.json").write_text(json.dumps({"jobs": [
        {"id": "lib-daily", "name": "Daily", "prompt": "say hi", "schedule": "every 2h"}]}))
    install_entry(str(entry))
    profile = get_profile_dir("hr-bot")
    (profile / "skills" / "mine").mkdir()
    (profile / "skills" / "mine" / "SKILL.md").write_text(SKILL.format(n="mine"))
    return profile


@pytest.fixture()
def reagent(monkeypatch):
    monkeypatch.setenv("HERMES_DISTRIBUTION", "reagent")


@pytest.fixture()
def active(bot, monkeypatch):
    """The bot is the active profile of this process (what an agent turn sees)."""
    monkeypatch.setenv("HERMES_HOME", str(bot))
    return bot


def _skill(**kw) -> dict:
    from tools.skill_manager_tool import skill_manage

    return json.loads(skill_manage(**kw))


# --- ownership -----------------------------------------------------------------------------------

def test_ownership_covers_shipped_files_skills_and_managed_config_but_not_user_content(bot, reagent):
    assert is_library_locked(bot)
    assert managed_config_keys(bot) == ["mcp_servers"]
    assert library_owned(bot, "SOUL.md") and library_owned(bot, "skills/alpha/SKILL.md")
    assert library_owned(bot, "skills/alpha") and library_owned(bot, "skills")  # ancestor of a shipped file
    assert library_owned(bot, "skills/alpha/references/new.md")  # a skill is replaced as a whole
    assert library_owned(bot, "config.yaml")  # through the managed keys
    assert not library_owned(bot, "skills/mine/SKILL.md") and not library_owned(bot, "notes.md")


def test_nothing_is_locked_without_the_distribution(bot):
    assert not is_library_locked(bot) and not library_owned(bot, "SOUL.md")
    assert profile_lock_fields(bot) == {}


# --- skills --------------------------------------------------------------------------------------

def test_library_skill_is_refused_on_every_action_while_a_user_skill_is_editable(active, reagent):
    for call in (
        dict(action="patch", name="alpha", old_string="# alpha", new_string="# hacked"),
        dict(action="edit", name="alpha", content=SKILL.format(n="alpha")),
        dict(action="delete", name="alpha"),
        dict(action="write_file", name="alpha", file_path="references/x.md", file_content="x"),
        dict(action="remove_file", name="alpha", file_path="references/x.md"),
        dict(action="patch", name="x", operations=[{"action": "patch", "name": "alpha",
                                                    "old_string": "# alpha", "new_string": "# hacked"}]),
    ):
        result = _skill(**call)
        assert result["success"] is False and "belongs to the hr-bot library bot" in result["error"], call
        assert result["error"].endswith(OWNED_TAIL)
    assert "# alpha" in (active / "skills" / "alpha" / "SKILL.md").read_text()

    assert _skill(action="patch", name="mine", old_string="step one", new_string="step two")["success"]
    assert _skill(action="create", name="fresh", content=SKILL.format(n="fresh"))["success"]
    assert _skill(action="write_file", name="fresh", file_path="references/a.md", file_content="a")["success"]


def test_library_skill_is_editable_without_the_distribution(active):
    assert _skill(action="patch", name="alpha", old_string="# alpha", new_string="# mine")["success"]


# --- file tools ----------------------------------------------------------------------------------

def test_file_tools_refuse_soul_and_shipped_files_before_any_approval_prompt(active, reagent, monkeypatch):
    from tools import file_tools
    from tools.file_tools import patch_tool, write_file_tool

    def no_prompt(*_a, **_k):
        raise AssertionError("an approval prompt was shown for a file the update overwrites")

    monkeypatch.setattr(file_tools, "_check_protected_instruction_write", no_prompt)
    original = (active / "SOUL.md").read_text()

    for result in (
        json.loads(write_file_tool(str(active / "SOUL.md"), "new soul")),
        json.loads(patch_tool(path=str(active / "SOUL.md"), old_string="hr-bot", new_string="x")),
        json.loads(write_file_tool(str(active / "skills" / "alpha" / "SKILL.md"), "x")),
        json.loads(patch_tool(mode="patch", patch="*** Begin Patch\n*** Delete File: "
                              f"{active / 'skills' / 'alpha' / 'SKILL.md'}\n*** End Patch")),
    ):
        assert "belongs to the hr-bot library bot" in result["error"], result
    assert (active / "SOUL.md").read_text() == original
    assert (active / "skills" / "alpha" / "SKILL.md").is_file()


def test_file_tools_still_write_user_content_of_a_locked_bot(active, reagent):
    from tools.file_tools import write_file_tool

    result = json.loads(write_file_tool(str(active / "notes.md"), "hello"))

    assert not result.get("error"), result
    assert (active / "notes.md").read_text() == "hello"


def test_soul_file_tool_write_reaches_the_approval_gate_without_the_distribution(active, monkeypatch):
    from tools import file_tools
    from tools.file_tools import write_file_tool

    asked = []
    monkeypatch.setattr(file_tools, "_check_protected_instruction_write", lambda *a, **k: asked.append(a))

    write_file_tool(str(active / "SOUL.md"), "new soul")

    assert asked  # upstream behaviour: the protected-instruction gate decides


# --- SOUL route ----------------------------------------------------------------------------------

def test_soul_route_is_a_409_with_the_message_and_leaves_the_file(bot, reagent):
    before = (bot / "SOUL.md").read_text()

    resp = client.put("/api/profiles/hr-bot/soul", json={"content": "mine"}, headers=HEADERS)

    assert resp.status_code == 409
    assert resp.json()["detail"] == f"This file belongs to the hr-bot {OWNED_TAIL}"
    assert (bot / "SOUL.md").read_text() == before


def test_soul_route_writes_without_the_distribution(bot):
    resp = client.put("/api/profiles/hr-bot/soul", json={"content": "mine"}, headers=HEADERS)

    assert resp.status_code == 200 and (bot / "SOUL.md").read_text() == "mine"


# --- config.yaml / MCP ---------------------------------------------------------------------------

def _config(bot: Path) -> dict:
    return yaml.safe_load((bot / "config.yaml").read_text())


def test_managed_config_key_is_refused_through_every_dashboard_path_and_other_keys_stay_editable(bot, reagent):
    before = _config(bot)

    cfg = client.get("/api/config", params={"profile": "hr-bot"}, headers=HEADERS).json()
    cfg["mcp_servers"] = {"evil": {"url": "https://evil.example"}}
    resp = client.put("/api/config", params={"profile": "hr-bot"}, json={"config": cfg}, headers=HEADERS)
    assert resp.status_code == 409 and "belongs to the hr-bot library bot" in resp.json()["detail"]

    for method, path, body in (
        ("post", "/api/mcp/servers", {"name": "mine", "url": "https://mine.example"}),
        ("put", "/api/mcp/servers", {"servers": {"mine": {"url": "https://mine.example"}}}),
        ("delete", "/api/mcp/servers/drive", None),
        ("put", "/api/mcp/servers/drive/enabled", {"enabled": False}),
    ):
        resp = getattr(client, method)(path, params={"profile": "hr-bot"}, headers=HEADERS,
                                       **({"json": body} if body is not None else {}))
        assert resp.status_code == 409, (path, resp.text)
        assert resp.json()["detail"].endswith(OWNED_TAIL)
    assert _config(bot) == before


def test_other_config_keys_of_a_locked_bot_stay_editable(bot, reagent):
    cfg = client.get("/api/config", params={"profile": "hr-bot"}, headers=HEADERS).json()
    cfg["display"] = {**cfg.get("display", {}), "compact": True}

    resp = client.put("/api/config", params={"profile": "hr-bot"}, json={"config": cfg}, headers=HEADERS)

    assert resp.status_code == 200, resp.text
    saved = _config(bot)
    assert saved["display"]["compact"] is True
    assert saved["mcp_servers"] == {"drive": {"url": "https://a.example"}}


def test_save_config_refuses_a_managed_key_for_every_caller_and_allows_the_rest(active, reagent):
    from hermes_cli.config import load_config, save_config

    cfg = load_config()
    cfg["agent"] = {**cfg.get("agent", {}), "max_turns": 7}
    save_config(cfg)  # unmanaged key: fine
    cfg["mcp_servers"] = {}
    with pytest.raises(LibraryLockedError, match="belongs to the hr-bot library bot"):
        save_config(cfg)
    assert _config(active)["mcp_servers"] == {"drive": {"url": "https://a.example"}}


def test_managed_config_is_editable_without_the_distribution(bot):
    resp = client.put("/api/mcp/servers", params={"profile": "hr-bot"}, headers=HEADERS,
                      json={"servers": {"mine": {"url": "https://mine.example"}}})

    assert resp.status_code == 200, resp.text
    assert list(_config(bot)["mcp_servers"]) == ["mine"]


# --- cron ----------------------------------------------------------------------------------------

def _agent_cron(**kw) -> dict:
    from tools.cronjob_tools import cronjob

    return json.loads(cronjob(**kw))


def test_library_cron_job_cannot_be_edited_or_removed_but_new_jobs_and_state_changes_are_allowed(active, reagent):
    for call in (dict(action="update", job_id="lib-daily", prompt="changed"),
                 dict(action="update", job_id="lib-daily", schedule="every 5h"),
                 dict(action="remove", job_id="lib-daily")):
        result = _agent_cron(**call)
        assert result["success"] is False and result["error"].endswith(OWNED_TAIL), call

    created = _agent_cron(action="create", prompt="mine", schedule="every 3h", name="Mine")
    assert created["success"], created
    assert _agent_cron(action="resume", job_id="lib-daily")["success"]  # state, not definition
    assert _agent_cron(action="remove", job_id=created["job_id"])["success"]


def test_cron_routes_refuse_library_job_edits_with_409(bot, reagent):
    resp = client.put("/api/cron/jobs/lib-daily", params={"profile": "hr-bot"}, headers=HEADERS,
                      json={"updates": {"prompt": "changed"}})
    assert resp.status_code == 409 and resp.json()["detail"].endswith(OWNED_TAIL)

    resp = client.delete("/api/cron/jobs/lib-daily", params={"profile": "hr-bot"}, headers=HEADERS)
    assert resp.status_code == 409

    assert client.post("/api/cron/jobs/lib-daily/resume", params={"profile": "hr-bot"}, headers=HEADERS).status_code == 200


def test_cron_ownership_is_in_the_ledger_and_survives_without_the_distribution(bot, monkeypatch):
    assert library_cron_refusal(bot, "lib-daily") is None  # unset: nothing is locked
    monkeypatch.setenv("HERMES_DISTRIBUTION", "reagent")
    assert library_cron_refusal(bot, "lib-daily", {"prompt": "x"}) is not None
    assert library_cron_refusal(bot, "lib-daily", {"enabled": True}) is None
    assert library_cron_refusal(bot, "someone-elses") is None


# --- dashboard skills routes and the hub installer ----------------------------------------------
# The agent's skill_manage is covered above; these are the other writers that reach a shipped skill.
# Toggling a skill is a config.yaml state change and stays allowed.

PARAMS = {"profile": "hr-bot"}


def _put_content(name: str, content: str):
    return client.put("/api/skills/content", params=PARAMS, json={"name": name, "content": content}, headers=HEADERS)


def test_editing_a_shipped_skill_through_the_dashboard_is_a_409_and_leaves_the_file(bot, reagent):
    before = (bot / "skills" / "alpha" / "SKILL.md").read_text()

    resp = _put_content("alpha", SKILL.format(n="alpha").replace("# alpha", "# hacked"))

    assert resp.status_code == 409
    assert resp.json()["detail"] == f"This skill belongs to the hr-bot {OWNED_TAIL}"
    assert (bot / "skills" / "alpha" / "SKILL.md").read_text() == before


def test_user_skills_of_a_locked_bot_stay_editable_and_creatable_and_any_skill_can_be_toggled(bot, reagent):
    assert _put_content("mine", SKILL.format(n="mine").replace("step one", "step two")).status_code == 200
    assert "step two" in (bot / "skills" / "mine" / "SKILL.md").read_text()

    created = client.post("/api/skills", params=PARAMS, headers=HEADERS,
                          json={"name": "fresh", "content": SKILL.format(n="fresh")})
    assert created.status_code == 200, created.text

    toggled = client.put("/api/skills/toggle", params=PARAMS, headers=HEADERS,
                         json={"name": "alpha", "enabled": False})
    assert toggled.status_code == 200 and toggled.json()["enabled"] is False


def test_creating_a_skill_inside_a_shipped_skill_is_a_409(bot, reagent):
    resp = client.post("/api/skills", params=PARAMS, headers=HEADERS,
                       json={"name": "sneaky", "category": "alpha", "content": SKILL.format(n="sneaky")})

    assert resp.status_code == 409 and resp.json()["detail"].endswith(OWNED_TAIL)
    assert not (bot / "skills" / "alpha" / "sneaky").exists()


def test_a_shipped_skill_is_editable_through_the_dashboard_without_the_distribution(bot):
    resp = _put_content("alpha", SKILL.format(n="alpha").replace("# alpha", "# mine"))

    assert resp.status_code == 200, resp.text
    assert "# mine" in (bot / "skills" / "alpha" / "SKILL.md").read_text()


def _quarantined(skills_dir, name: str):
    from tools.skills_guard import ScanResult
    from tools.skills_hub_models import SkillBundle

    q_dir = skills_dir / ".hub" / "quarantine" / "pending"
    q_dir.mkdir(parents=True)
    (q_dir / "SKILL.md").write_text(f"---\nname: {name}\ndescription: hub\n---\nhub copy\n")
    bundle = SkillBundle(name=name, files={"SKILL.md": "x"}, source="community", identifier="x",
                         trust_level="community")
    return q_dir, bundle, ScanResult(skill_name=name, source="community", trust_level="community", verdict="safe")


@pytest.mark.parametrize("name,allowed", [("alpha", False), ("hub-extra", True)])
def test_hub_install_cannot_replace_a_shipped_skill(active, reagent, name, allowed):
    from unittest.mock import patch

    import tools.skills_hub as hub
    from tools.skills_hub_install import install_from_quarantine

    skills_dir = active / "skills"
    q_dir, bundle, scan = _quarantined(skills_dir, name)

    with patch.object(hub, "SKILLS_DIR", skills_dir), patch.object(hub, "QUARANTINE_DIR", skills_dir / ".hub" / "quarantine"):
        if allowed:
            assert (install_from_quarantine(q_dir, name, "", bundle, scan) / "SKILL.md").is_file()
        else:
            with pytest.raises(ValueError, match="belongs to the hr-bot library bot"):
                install_from_quarantine(q_dir, name, "", bundle, scan)

    assert "# alpha" in (skills_dir / "alpha" / "SKILL.md").read_text()


# --- rows ----------------------------------------------------------------------------------------

def test_profile_rows_expose_the_lock_state_only_in_a_reagent_distribution(bot, monkeypatch):
    plain = {r["name"]: r for r in client.get("/api/profiles", headers=HEADERS).json()["profiles"]}
    assert "library_locked" not in plain["hr-bot"]

    monkeypatch.setenv("HERMES_DISTRIBUTION", "reagent")
    rows = {r["name"]: r for r in client.get("/api/profiles", headers=HEADERS).json()["profiles"]}

    assert rows["hr-bot"]["library_locked"] is True and rows["hr-bot"]["library_managed_config"] == ["mcp_servers"]
    assert rows["default"]["library_locked"] is False and rows["default"]["library_managed_config"] == []
