"""/api/bot-library routes over the real app: scan, install, update, sync, rollback."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from hermes_cli.web_server import _SESSION_TOKEN, app
from tests.hermes_cli.test_bot_library import write_bot

@pytest.fixture()
def profile_env(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / ".hermes").mkdir(exist_ok=True)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    return tmp_path


@pytest.fixture()
def library(tmp_path):
    lib = tmp_path / "drive" / "bots"
    lib.mkdir(parents=True)
    return lib


client = TestClient(app)
HEADERS = {"X-Hermes-Session-Token": _SESSION_TOKEN}


def _get(source: str):
    return client.get("/api/bot-library", params={"source": source}, headers=HEADERS)


def _post(path: str, body: dict | None = None):
    return client.post(f"/api/bot-library/{path}", json=body, headers=HEADERS)


def test_routes_walk_the_whole_lifecycle(profile_env, library):
    write_bot(library, "hr-bot")
    scanned = _get(str(library))
    assert scanned.status_code == 200, scanned.text
    body = scanned.json()
    assert body["source"] == str(library)
    [entry] = body["entries"]
    assert set(entry) == {"name", "version", "description", "author", "source", "env_requires", "skills",
                          "has_cron", "status", "installed_profile", "installed_version", "error"}
    assert entry["status"] == "new"

    assert _post("install", {"source": entry["source"]}).json() == {"profile": "hr-bot", "version": "1.0.0"}
    assert _get(str(library)).json()["entries"][0]["installed_profile"] == "hr-bot"

    write_bot(library, "hr-bot", "1.1.0", soul="v2")
    assert _post("update", {"profile": "hr-bot"}).json() == {
        "profile": "hr-bot", "from_version": "1.0.0", "version": "1.1.0"}
    assert _post("rollback", {"profile": "hr-bot"}).json() == {"profile": "hr-bot", "version": "1.0.0"}

    write_bot(library, "hr-bot", "1.2.0")
    assert _post("sync").json() == {"results": [
        {"profile": "hr-bot", "from_version": "1.0.0", "to_version": "1.2.0", "status": "updated"}]}


def test_sync_reports_an_unavailable_source_with_its_message(profile_env, library):
    entry = write_bot(library, "hr-bot")
    _post("install", {"source": str(entry)})
    import shutil
    shutil.rmtree(entry)

    [result] = _post("sync").json()["results"]

    assert result["status"] == "source-unavailable" and result["error"]


@pytest.mark.parametrize("path,body", [
    ("install", {"source": "/definitely/not/here"}),
    ("update", {"profile": "ghost"}),
    ("rollback", {"profile": "ghost"}),
])
def test_distribution_errors_are_client_errors_with_the_message(profile_env, path, body):
    resp = _post(path, body)

    assert resp.status_code == 400 and resp.json()["detail"]


def test_scan_of_a_missing_folder_is_a_client_error(profile_env, tmp_path):
    resp = _get(str(tmp_path / "nope"))

    assert resp.status_code == 400 and "bot library folder" in resp.json()["detail"]
