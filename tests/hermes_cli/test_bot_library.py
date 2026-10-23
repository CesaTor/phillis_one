"""Bot library layer: scan, install, update, sync, rollback and the ownership ledger.

Real imports against a temp HOME / HERMES_HOME with local-folder libraries (git transport is
exercised by hand, not mocked).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_cli import bot_library
from hermes_cli.bot_library import (
    CloudPlaceholderError, install_entry, rollback_profile, scan_library, sync_installed, update_profile)
from hermes_cli.bot_library_ledger import BACKUP_DIRNAME, LEDGER_FILENAME, read_ledger
from hermes_cli.profile_distribution import DistributionError, read_manifest
from hermes_cli.profiles import get_profile_dir
from hermes_platform.host import cloud_files


@pytest.fixture()
def profile_env(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    default_home = tmp_path / ".hermes"
    default_home.mkdir(exist_ok=True)
    monkeypatch.setenv("HERMES_HOME", str(default_home))
    return tmp_path


def write_bot(library: Path, name: str, version: str = "1.0.0", *, soul: str = "v1", skills=("alpha",),
              extra_manifest: str = "") -> Path:
    entry = library / name
    entry.mkdir(parents=True, exist_ok=True)
    (entry / "SOUL.md").write_text(f"I am {name} {soul}.\n")
    (entry / "config.yaml").write_text("model:\n  model: gpt-4\nmcp_servers:\n  drive:\n    url: https://a.example\n")
    for skill in skills:
        (entry / "skills" / skill).mkdir(parents=True, exist_ok=True)
        (entry / "skills" / skill / "SKILL.md").write_text(f"---\nname: {skill}\ndescription: d\n---\n# {skill}\n")
    (entry / "distribution.yaml").write_text(
        f"name: {name}\nversion: {version}\ndescription: Bot {name}\nauthor: Dept\n"
        "env_requires:\n  - name: DRIVE_TOKEN\n    description: token\n"
        "  - name: OPTIONAL_X\n    required: false\n" + extra_manifest)
    return entry


@pytest.fixture()
def library(tmp_path):
    lib = tmp_path / "drive" / "bots"
    lib.mkdir(parents=True)
    return lib


def test_scan_reports_good_and_malformed_entries_without_failing(profile_env, library):
    write_bot(library, "hr-bot")
    broken = library / "broken-bot"
    broken.mkdir()
    (broken / "distribution.yaml").write_text("name: broken-bot\nenv_requires: not-a-list\n")
    (library / "notes").mkdir()  # no distribution.yaml: not an entry

    entries = {e["name"]: e for e in scan_library(str(library))}

    assert set(entries) == {"hr-bot", "broken-bot"}
    good = entries["hr-bot"]
    assert (good["version"], good["author"], good["description"]) == ("1.0.0", "Dept", "Bot hr-bot")
    assert good["status"] == "new" and good["error"] is None
    assert good["skills"] == ["alpha"] and good["has_cron"] is False
    assert good["env_requires"] == [
        {"name": "DRIVE_TOKEN", "description": "token", "required": True},
        {"name": "OPTIONAL_X", "description": "", "required": False}]
    assert good["source"] == str((library / "hr-bot").resolve())
    assert entries["broken-bot"]["status"] == "error"
    assert "env_requires" in entries["broken-bot"]["error"]


def test_install_then_update_tracks_state_and_records_ownership(profile_env, library):
    write_bot(library, "hr-bot")
    source = scan_library(str(library))[0]["source"]

    assert install_entry(source) == {"profile": "hr-bot", "version": "1.0.0", "from_version": None}
    entry = scan_library(str(library))[0]
    assert (entry["status"], entry["installed_profile"], entry["installed_version"]) == ("installed", "hr-bot", "1.0.0")
    profile = get_profile_dir("hr-bot")
    ledger = read_ledger(profile)
    assert ledger["version"] == "1.0.0"
    assert {"SOUL.md", "config.yaml", "skills/alpha/SKILL.md", "distribution.yaml"} <= set(ledger["paths"])
    (profile / "skills" / "mine").mkdir()
    (profile / "skills" / "mine" / "SKILL.md").write_text("user skill")

    write_bot(library, "hr-bot", "1.1.0", soul="v2", skills=("alpha", "beta"))
    assert scan_library(str(library))[0]["status"] == "update"
    assert update_profile("hr-bot") == {"profile": "hr-bot", "version": "1.1.0", "from_version": "1.0.0"}

    assert "v2" in (profile / "SOUL.md").read_text()
    assert (profile / "skills" / "beta" / "SKILL.md").is_file()
    assert (profile / "skills" / "mine" / "SKILL.md").is_file()  # user-created skill is not library-owned
    ledger = read_ledger(profile)
    assert ledger["version"] == "1.1.0"
    assert "skills/beta/SKILL.md" in ledger["paths"] and "skills/mine/SKILL.md" not in ledger["paths"]
    assert scan_library(str(library))[0]["status"] == "installed"


def test_sync_updates_changed_skips_unchanged_and_reports_unavailable(profile_env, library, tmp_path):
    write_bot(library, "a-bot")
    write_bot(library, "b-bot")
    gone = tmp_path / "gone-lib"
    write_bot(gone, "c-bot")
    for name, lib in (("a-bot", library), ("b-bot", library), ("c-bot", gone)):
        install_entry(str(lib / name))
    write_bot(library, "a-bot", "2.0.0")
    import shutil
    shutil.rmtree(gone)

    results = {r["profile"]: r for r in sync_installed()}

    assert results["a-bot"] == {"profile": "a-bot", "from": "1.0.0", "to": "2.0.0", "status": "updated"}
    assert results["b-bot"]["status"] == "unchanged" and results["b-bot"]["to"] == "1.0.0"
    assert results["c-bot"]["status"] == "source-unavailable" and "not available" in results["c-bot"]["error"]
    assert read_manifest(get_profile_dir("a-bot")).version == "2.0.0"
    assert [r["status"] for r in sync_installed() if r["profile"] == "a-bot"] == ["unchanged"]


def test_sync_collects_a_failing_profile_and_continues(profile_env, library):
    write_bot(library, "a-bot")
    write_bot(library, "b-bot")
    install_entry(str(library / "a-bot"))
    install_entry(str(library / "b-bot"))
    (library / "a-bot" / "distribution.yaml").write_text("name: a-bot\nversion: 2.0.0\nenv_requires: nope\n")
    write_bot(library, "b-bot", "2.0.0")

    results = {r["profile"]: r for r in sync_installed()}

    assert results["a-bot"]["status"] == "error" and "env_requires" in results["a-bot"]["error"]
    assert results["b-bot"]["status"] == "updated"


def test_rollback_restores_the_previous_version_and_sync_does_not_reapply_it(profile_env, library):
    write_bot(library, "hr-bot", soul="v1")
    install_entry(str(library / "hr-bot"))
    profile = get_profile_dir("hr-bot")
    (profile / "config.yaml").write_text("model:\n  model: user-choice\n")
    write_bot(library, "hr-bot", "1.1.0", soul="v2", skills=("alpha", "beta"))
    update_profile("hr-bot")
    assert (profile / BACKUP_DIRNAME / "1.0.0" / "SOUL.md").is_file()

    assert rollback_profile("hr-bot") == {"profile": "hr-bot", "version": "1.0.0"}

    assert "v1" in (profile / "SOUL.md").read_text()
    assert "user-choice" in (profile / "config.yaml").read_text()
    assert not (profile / "skills" / "beta").exists()  # added by 1.1.0
    assert read_manifest(profile).version == "1.0.0"
    assert read_ledger(profile)["rolled_back_from"] == "1.1.0"
    assert [r["status"] for r in sync_installed()] == ["unchanged"]
    with pytest.raises(DistributionError, match="no previous version"):
        rollback_profile("hr-bot")


def test_only_the_last_two_snapshots_are_kept(profile_env, library):
    write_bot(library, "hr-bot")
    install_entry(str(library / "hr-bot"))
    for version in ("1.1.0", "1.2.0", "1.3.0"):
        write_bot(library, "hr-bot", version)
        update_profile("hr-bot")

    kept = sorted(d.name for d in (get_profile_dir("hr-bot") / BACKUP_DIRNAME).iterdir())

    assert kept == ["1.1.0", "1.2.0"]


def test_online_only_files_are_refused_with_a_download_hint(profile_env, library, monkeypatch):
    entry = write_bot(library, "hr-bot")
    (entry / "SOUL.md").write_text("x" * 777)  # a size no other fixture file has
    monkeypatch.setattr(cloud_files, "_stat_flags", lambda st: (0x40000000, 0) if st.st_size == 777 else (0, 0))

    with pytest.raises(CloudPlaceholderError, match="available offline"):
        install_entry(str(entry))
    assert not get_profile_dir("hr-bot").exists()
    scanned = scan_library(str(library))[0]
    assert scanned["status"] == "error" and "SOUL.md" in scanned["error"]


def test_windows_recall_attributes_count_as_online_only(tmp_path, monkeypatch):
    f = tmp_path / "f.txt"
    f.write_text("x")
    assert cloud_files.find_online_only(tmp_path) == []
    monkeypatch.setattr(cloud_files, "_stat_flags", lambda st: (0, 0x400000) if st.st_size == 1 else (0, 0))
    assert cloud_files.find_online_only(tmp_path) == [f]


def test_sync_reports_online_only_manifest_as_source_unavailable(profile_env, library, monkeypatch):
    entry = write_bot(library, "hr-bot")
    install_entry(str(entry))
    size = (entry / "distribution.yaml").stat().st_size
    monkeypatch.setattr(cloud_files, "_stat_flags", lambda st: (0x40000000, 0) if st.st_size == size else (0, 0))

    [result] = sync_installed()

    assert result["status"] == "source-unavailable" and "not downloaded" in result["error"]
    assert json.loads((get_profile_dir("hr-bot") / LEDGER_FILENAME).read_text())["version"] == "1.0.0"
    assert bot_library._MUTATION_LOCK.acquire(blocking=False)  # lock released after the sync
    bot_library._MUTATION_LOCK.release()
