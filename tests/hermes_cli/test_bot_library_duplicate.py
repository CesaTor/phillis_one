"""POST /api/bot-library/duplicate: an independent, unlocked copy of a (library) bot."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import hermes_yaml as yaml
from fastapi.testclient import TestClient

from hermes_cli.bot_library import install_entry
from hermes_cli.bot_library_ledger import BACKUP_DIRNAME, LEDGER_FILENAME
from hermes_cli.bot_library_locks import is_library_locked
from hermes_cli.profiles import get_profile_dir
from hermes_cli.web_server import _SESSION_TOKEN, app
from tests.hermes_cli.test_bot_library import write_bot

client = TestClient(app)
HEADERS = {"X-Hermes-Session-Token": _SESSION_TOKEN}


@pytest.fixture()
def bot(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / ".hermes").mkdir(exist_ok=True)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.setenv("HERMES_DISTRIBUTION", "reagent")
    entry = write_bot(tmp_path / "drive" / "bots", "hr-bot", extra_manifest="config_managed:\n  - mcp_servers\n")
    (entry / "cron").mkdir()
    (entry / "cron" / "jobs.json").write_text(json.dumps({"jobs": [
        {"id": "lib-daily", "name": "Daily", "prompt": "say hi", "schedule": "every 2h"}]}))
    install_entry(str(entry))
    profile = get_profile_dir("hr-bot")
    (profile / "memories").mkdir(exist_ok=True)
    (profile / "memories" / "MEMORY.md").write_text("secret memory")
    (profile / "memories" / "USER.md").write_text("user facts")
    (profile / ".env").write_text("DRIVE_TOKEN=supersecret\n")
    (profile / "sessions").mkdir(exist_ok=True)
    (profile / "sessions" / "s1.json").write_text("{}")
    return profile


def _files(root: Path) -> dict[str, bytes]:
    """File contents, minus ``backups/`` (config reads keep a last-known-good copy there)."""
    return {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*")
            if p.is_file() and p.relative_to(root).parts[0] != "backups"}


def _duplicate(profile: str, name: str):
    return client.post("/api/bot-library/duplicate", json={"profile": profile, "name": name}, headers=HEADERS)


def test_duplicate_is_an_unlocked_copy_without_library_state_or_personal_data(bot):
    snapshot = _files(bot)
    soul = (bot / "SOUL.md").read_text()

    resp = _duplicate("hr-bot", "hr-custom")

    assert resp.status_code == 200 and resp.json() == {"profile": "hr-custom"}
    copy = get_profile_dir("hr-custom")
    assert (copy / "SOUL.md").read_text() == soul
    assert (copy / "skills" / "alpha" / "SKILL.md").is_file()
    assert yaml.safe_load((copy / "config.yaml").read_text())["mcp_servers"] == {"drive": {"url": "https://a.example"}}
    for absent in ("distribution.yaml", LEDGER_FILENAME, BACKUP_DIRNAME, "sessions/s1.json",
                   "memories/MEMORY.md", "memories/USER.md"):
        assert not (copy / absent).exists(), absent
    assert "supersecret" not in (copy / ".env").read_text()
    assert not is_library_locked(copy) and is_library_locked(bot)
    # the original is untouched
    assert _files(bot) == snapshot
    assert (bot / "SOUL.md").read_text() == soul


def test_duplicate_carries_cron_definitions_paused_and_is_editable(bot):
    _duplicate("hr-bot", "hr-custom")
    copy = get_profile_dir("hr-custom")

    from cron import jobs as cron_jobs

    with cron_jobs.use_cron_store(copy):
        [job] = cron_jobs.load_jobs()
    assert job["id"] == "lib-daily" and job["prompt"] == "say hi" and job["enabled"] is False

    assert client.put("/api/profiles/hr-custom/soul", json={"content": "mine"}, headers=HEADERS).status_code == 200
    assert client.put("/api/cron/jobs/lib-daily", params={"profile": "hr-custom"}, headers=HEADERS,
                      json={"updates": {"prompt": "changed"}}).status_code == 200
    assert client.put("/api/mcp/servers", params={"profile": "hr-custom"}, headers=HEADERS,
                      json={"servers": {"mine": {"url": "https://mine.example"}}}).status_code == 200


def test_display_name_becomes_an_id_and_keeps_the_label(bot):
    resp = _duplicate("hr-bot", "My HR Bot")

    assert resp.json() == {"profile": "my-hr-bot"}
    from hermes_cli.profiles import read_profile_meta

    assert read_profile_meta(get_profile_dir("my-hr-bot"))["display_name"] == "My HR Bot"


@pytest.mark.parametrize("name", ["hr-bot", "default", "HR-Bot", "   ", "!!!"])
def test_clashes_and_unusable_names_are_400_with_a_message(bot, name):
    resp = _duplicate("hr-bot", name)

    assert resp.status_code == 400 and resp.json()["detail"]


def test_unknown_source_is_400(bot):
    assert _duplicate("ghost", "copy").status_code == 400
