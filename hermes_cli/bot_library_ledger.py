"""Ownership ledger and pre-update snapshots for bots installed from the bot library.

Every distribution install/update records which profile-relative files it copied in
``<profile>/.library-owned.json`` (``{"version", "paths", ...}``) so library-owned skills and
files can be told from ones the user created. Before an update replaces them, the files about to
change (plus ``config.yaml`` and ``distribution.yaml``) are snapshotted under
``<profile>/.library-backup/<from_version>/``; the last :data:`KEEP_SNAPSHOTS` are kept and
:func:`rollback` restores the newest. Cron jobs are merged by id, not replaced, so a rollback
leaves them as they are.

Hooks: ``profile_distribution._copy_dist_payload`` calls :func:`snapshot_before_update` before
copying and :func:`record_library_ownership` after.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, UTC
from pathlib import Path
from typing import Any, Optional

LEDGER_FILENAME = ".library-owned.json"
BACKUP_DIRNAME = ".library-backup"
KEEP_SNAPSHOTS = 2
_META_FILENAME = ".snapshot-meta.json"
# Always snapshotted: the user-editable config the update may rewrite, and the manifest it rewrites.
_ALWAYS_SNAPSHOT = ("config.yaml", "distribution.yaml")


def _posix(parts: tuple[str, ...]) -> str:
    return "/".join(parts)


def _files_under(src: Path, rel: tuple[str, ...]):
    """Yield ``rel_parts`` of every distribution-written file at or under *src*."""
    from hermes_cli.profile_distribution import _CRON_STORE_REL, _is_installer_owned_path

    if _is_installer_owned_path(rel) or rel == _CRON_STORE_REL or src.is_symlink():
        return
    if not src.is_dir():
        yield rel
        return
    for child in sorted(src.iterdir()):
        yield from _files_under(child, (*rel, child.name))


def library_paths(staged: Path, manifest, preserve_config: bool) -> list[str]:
    """Profile-relative posix paths this install/update writes from *staged* (sorted, unique)."""
    from hermes_cli.profile_distribution import (
        ENV_EXAMPLE_FILENAME, ENV_TEMPLATE_FILENAME, MANIFEST_FILENAME, _owned_entries)

    paths = {MANIFEST_FILENAME}
    for src, rel in _owned_entries(staged, manifest):
        for file_rel in _files_under(src, rel):
            if file_rel == ("config.yaml",) and preserve_config:
                continue
            paths.add(ENV_EXAMPLE_FILENAME if file_rel == (ENV_TEMPLATE_FILENAME,) else _posix(file_rel))
    return sorted(paths)


def read_ledger(profile_dir: Path) -> Optional[dict[str, Any]]:
    """The profile's ledger, or None when absent or unreadable (a ledger is bookkeeping, never fatal)."""
    try:
        data = json.loads((profile_dir / LEDGER_FILENAME).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("paths"), list) else None


def write_ledger(profile_dir: Path, version: str, paths: list[str], **extra: Any) -> None:
    from utils import atomic_json_write

    atomic_json_write(profile_dir / LEDGER_FILENAME, {"version": version, "paths": paths, **extra})


def shipped_cron_job_ids(staged: Path, manifest) -> list[str]:
    """Ids of the cron jobs the distribution ships (merged by id into the profile, never replaced),
    so a locked bot can tell its library jobs from ones the user or agent scheduled."""
    from hermes_cli.profile_distribution import _owned_entries, _shipped_cron_store

    store = _shipped_cron_store(list(_owned_entries(staged, manifest)))
    if store is None:
        return []
    try:
        data = json.loads(store.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return []  # the cron merge already rejected an unreadable store before this runs
    jobs = data.get("jobs", []) if isinstance(data, dict) else data
    if isinstance(jobs, dict):  # id-keyed map: the inline id wins, else the key (cron.jobs.load_jobs)
        jobs = [{**v, "id": v.get("id") or k} for k, v in jobs.items() if isinstance(v, dict)]
    ids = {str(j["id"]) for j in jobs if isinstance(j, dict) and j.get("id")} if isinstance(jobs, list) else set()
    return sorted(ids)


def record_library_ownership(staged: Path, target: Path, manifest, preserve_config: bool) -> None:
    write_ledger(target, manifest.version, library_paths(staged, manifest, preserve_config),
                 cron_job_ids=shipped_cron_job_ids(staged, manifest))


def _slug(version: str) -> str:
    return re.sub(r"[^\w.+-]", "_", version) or "unversioned"


def _snapshots(profile_dir: Path) -> list[Path]:
    """Snapshot dirs, oldest first."""
    root = profile_dir / BACKUP_DIRNAME
    if not root.is_dir():
        return []
    return sorted((d for d in root.iterdir() if (d / _META_FILENAME).is_file()),
                  key=lambda d: (d / _META_FILENAME).stat().st_mtime_ns)


def _copy_file(src: Path, dest: Path) -> None:
    if os.path.lexists(dest):
        dest.unlink()
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def snapshot_before_update(staged: Path, target: Path, manifest, preserve_config: bool) -> None:
    """Snapshot what an update of an installed distribution is about to replace; a no-op for a
    target that is not yet a distribution (fresh install)."""
    from hermes_cli.profile_distribution import DistributionError, read_manifest

    try:
        existing = read_manifest(target)
    except DistributionError:
        return
    if existing is None:
        return
    ledger = read_ledger(target)
    prior = list(ledger["paths"]) if ledger else []
    candidates = {*prior, *library_paths(staged, manifest, preserve_config), *_ALWAYS_SNAPSHOT}
    dest = target / BACKUP_DIRNAME / _slug(existing.version)
    if dest.exists():
        shutil.rmtree(dest)
    for rel in sorted(candidates):
        if (target / rel).is_file() and not (target / rel).is_symlink():
            _copy_file(target / rel, dest / rel)
    meta = {"from_version": existing.version, "to_version": manifest.version, "had_ledger": ledger is not None,
            "prior_paths": prior, "created_at": datetime.now(UTC).isoformat(timespec="seconds")}
    (dest / _META_FILENAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    for stale in _snapshots(target)[:-KEEP_SNAPSHOTS]:
        shutil.rmtree(stale)


def _drop_added_files(target: Path, current: list[str], prior: list[str]) -> None:
    """Delete files the rolled-back version added (in the current ledger, not the prior one)."""
    for rel in sorted(set(current) - set(prior)):
        path = target / rel
        if path.is_file() or path.is_symlink():
            path.unlink()
            for parent in path.parents:
                if parent == target or any(parent.iterdir()):
                    break
                parent.rmdir()


def rollback(profile_dir: Path) -> str:
    """Restore the newest snapshot into *profile_dir*; returns the restored version.

    The rolled-back version is remembered in the ledger (``rolled_back_from``) so the start-up sync
    does not immediately re-apply it; an explicit update clears that."""
    from hermes_cli.profile_distribution import DistributionError

    snapshots = _snapshots(profile_dir)
    if not snapshots:
        raise DistributionError("There is no previous version to roll back to.")
    snap = snapshots[-1]
    meta = json.loads((snap / _META_FILENAME).read_text(encoding="utf-8-sig"))
    current = read_ledger(profile_dir)
    prior = meta["prior_paths"]
    if meta["had_ledger"] and current:
        _drop_added_files(profile_dir, current["paths"], prior)
    for src in sorted(p for p in snap.rglob("*") if p.is_file() and p != snap / _META_FILENAME):
        _copy_file(src, profile_dir / src.relative_to(snap))
    # Cron jobs are merged by id and not rolled back, so the jobs the library shipped stay library-owned.
    write_ledger(profile_dir, meta["from_version"], prior, rolled_back_from=meta["to_version"],
                 cron_job_ids=(current or {}).get("cron_job_ids", []))
    shutil.rmtree(snap)
    return meta["from_version"]
