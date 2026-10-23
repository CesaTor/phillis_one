"""The bot library answers failures in plain sentences: the UI shows the ``detail`` / ``error`` as it is."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from hermes_cli.bot_library import install_entry, sync_installed
from hermes_cli.bot_library_messages import (
    CATALOG_UNREACHABLE, ENTRY_INCOMPLETE, FILES_NOT_DOWNLOADED, FOLDER_UNAVAILABLE)
from hermes_cli.web_server import _SESSION_TOKEN, app
from hermes_platform.host import cloud_files
from tests.hermes_cli.test_bot_library import write_bot

client = TestClient(app)
HEADERS = {"X-Hermes-Session-Token": _SESSION_TOKEN}


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


def _scan(source: str):
    return client.get("/api/bot-library", params={"source": source}, headers=HEADERS)


def _install(source: str):
    return client.post("/api/bot-library/install", json={"source": source}, headers=HEADERS)


def _assert_plain(resp, message: str) -> None:
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == message


def test_a_missing_library_folder_is_a_plain_sentence(profile_env, tmp_path):
    _assert_plain(_scan(str(tmp_path / "nope")), FOLDER_UNAVAILABLE)
    _assert_plain(_install(str(tmp_path / "nope" / "hr-bot")), FOLDER_UNAVAILABLE)


@pytest.mark.platforms("posix")
@pytest.mark.skipif(os.geteuid() == 0 if hasattr(os, "geteuid") else False, reason="root can list any directory")
def test_an_unreadable_library_folder_is_the_same_plain_sentence(profile_env, library):
    write_bot(library, "hr-bot")
    library.chmod(0o000)
    try:
        _assert_plain(_scan(str(library)), FOLDER_UNAVAILABLE)
    finally:
        library.chmod(0o755)


def test_a_failed_clone_is_a_plain_sentence_whatever_git_said(profile_env, monkeypatch):
    def refuse(argv, **kwargs):
        return subprocess.CompletedProcess(argv, 128, "", "fatal: repository 'https://x.example/b.git/' not found")

    monkeypatch.setattr("hermes_cli.git_credentials.subprocess.run", refuse)

    _assert_plain(_scan("https://x.example/b.git"), CATALOG_UNREACHABLE)
    _assert_plain(_install("https://x.example/b.git#hr-bot"), CATALOG_UNREACHABLE)


def test_an_entry_without_a_description_file_is_a_plain_sentence(profile_env, library):
    (library / "half-bot").mkdir()

    _assert_plain(_install(str(library / "half-bot")), ENTRY_INCOMPLETE)


def test_an_entry_that_lost_its_description_file_is_reported_by_sync_in_plain_words(profile_env, library):
    entry = write_bot(library, "hr-bot")
    install_entry(str(entry))
    (entry / "distribution.yaml").unlink()

    [result] = sync_installed()

    assert result["status"] == "error" and result["error"] == ENTRY_INCOMPLETE


def test_online_only_files_are_a_plain_sentence_without_file_names(profile_env, library, monkeypatch):
    entry = write_bot(library, "hr-bot")
    (entry / "SOUL.md").write_text("x" * 777)  # a size no other fixture file has
    monkeypatch.setattr(cloud_files, "_stat_flags", lambda st: (0x40000000, 0) if st.st_size == 777 else (0, 0))

    _assert_plain(_install(str(entry)), FILES_NOT_DOWNLOADED)


def test_a_source_folder_that_vanished_is_reported_by_sync_in_plain_words(profile_env, library):
    entry = write_bot(library, "hr-bot")
    install_entry(str(entry))
    shutil.rmtree(entry)

    [result] = sync_installed()

    assert result["status"] == "source-unavailable" and result["error"] == FOLDER_UNAVAILABLE
