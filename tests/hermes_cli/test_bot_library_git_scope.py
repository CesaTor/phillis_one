"""Bot library routes with a git source on a multiplexed host (more than one profile).

The library routes name their profiles in the body, so the clone ran in the threadpool with no secret
scope; under multiplexing ``get_secret("GITHUB_TOKEN")`` (reached by ``git_credentials`` once the remote
asks for a credential) then raised ``UnscopedSecretError`` and the route answered 500. The clone must run
under the dashboard profile's own scope, whose ``.env`` holds the token.

The remote is a temp repository: the first (anonymous) clone is refused with the credential-required
message GitHub sends, the retry carrying the token is served from the local repository.
"""

from __future__ import annotations

import base64
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent.secret_scope import set_multiplex_active
from hermes_cli.profiles import create_profile
from hermes_cli.web_server import _SESSION_TOKEN, app
from tests.hermes_cli.test_bot_library import write_bot

client = TestClient(app)
HEADERS = {"X-Hermes-Session-Token": _SESSION_TOKEN}
URL = "https://github.com/acme/bots.git"
TOKEN = "ghp_scoped_test_token"


_REAL_RUN = subprocess.run  # the fixture replaces ``subprocess.run`` for the whole process


def _git(cwd: Path, *args: str) -> None:
    _REAL_RUN(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args], cwd=cwd, check=True,
                   capture_output=True)


@pytest.fixture()
def remote(tmp_path, monkeypatch):
    """A multiplexed host whose default ``.env`` holds a GitHub token and whose ``acme/bots`` repo is local."""
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    home = tmp_path / ".hermes"
    home.mkdir(exist_ok=True)
    (home / ".env").write_text(f"GITHUB_TOKEN={TOKEN}\n")
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    create_profile("other")
    repo = tmp_path / "remote"
    write_bot(repo, "hr-bot")
    _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "bots")

    authorised: list[str] = []

    def serve(argv, env=None, **kw):
        sent = [v for k, v in (env or {}).items() if k.startswith("GIT_CONFIG_VALUE_") and v.startswith("Authorization:")]
        if not sent:
            return subprocess.CompletedProcess(argv, 128, "", "fatal: could not read Username for 'https://github.com'")
        authorised.extend(sent)
        return _REAL_RUN([*argv[:-2], f"file://{repo}", argv[-1]], env=env, **kw)

    monkeypatch.setattr("hermes_cli.git_credentials.subprocess.run", serve)
    set_multiplex_active(True)
    return repo, authorised


def _sent_token(authorised: list[str]) -> bool:
    expected = base64.b64encode(f"x-access-token:{TOKEN}".encode()).decode()
    return bool(authorised) and all(header.endswith(expected) for header in authorised)


def test_git_library_lifecycle_uses_the_dashboard_profiles_token_on_a_multiplexed_host(remote):
    repo, authorised = remote

    scanned = client.get("/api/bot-library", params={"source": URL}, headers=HEADERS)
    assert scanned.status_code == 200, scanned.text
    [entry] = scanned.json()["entries"]
    assert entry["name"] == "hr-bot" and entry["status"] == "new" and entry["source"] == f"{URL}#hr-bot"

    installed = client.post("/api/bot-library/install", json={"source": entry["source"]}, headers=HEADERS)
    assert installed.status_code == 200, installed.text
    assert installed.json() == {"profile": "hr-bot", "version": "1.0.0"}

    write_bot(repo, "hr-bot", "1.1.0", soul="v2")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "v2")
    synced = client.post("/api/bot-library/sync", headers=HEADERS)
    assert synced.status_code == 200, synced.text
    assert [(r["profile"], r["status"]) for r in synced.json()["results"]] == [("hr-bot", "updated")]

    write_bot(repo, "hr-bot", "1.2.0", soul="v3")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "v3")
    updated = client.post("/api/bot-library/update", json={"profile": "hr-bot"}, headers=HEADERS)
    assert updated.status_code == 200, updated.text
    assert updated.json() == {"profile": "hr-bot", "from_version": "1.1.0", "version": "1.2.0"}

    assert _sent_token(authorised)
