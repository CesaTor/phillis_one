"""Bot library — certified bots published as profile distributions in a shared folder or repo.

A library *source* is a local folder (a synced Drive/Nextcloud directory) or a git URL; each
immediate subfolder holds one bot's ``distribution.yaml``. This module is the reusable layer
over :mod:`hermes_cli.profile_distribution` that the dashboard routes and the app-start sync
call: scan a library, install an entry, update or roll back an installed bot, and bring every
installed bot up to date with its source.

A git library entry installs from ``<repo-url>#<subfolder>`` (``profile_distribution`` stages
that form), so the recorded source of an installed bot is exactly that entry's ``source``.
Profile directories are HOME-anchored (``profiles.get_profile_dir``), so nothing here depends
on the per-request profile scope.
"""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path
from typing import Any, Optional

from hermes_cli.profile_distribution import (
    DistributionError, MANIFEST_FILENAME, DistributionManifest, _existing_profile, _git_clone,
    _git_subdir, _has_cron_jobs, _looks_like_git_url, install_distribution, read_manifest,
    update_distribution)

# install / update / sync / rollback rewrite profile trees and a ledger: one at a time.
_MUTATION_LOCK = threading.RLock()


class CloudPlaceholderError(DistributionError):
    """A synced-folder file is online-only, so it cannot be read or copied yet."""


class SourceUnavailable(Exception):
    """A recorded source cannot be reached right now (folder gone, offline, files not downloaded)."""


def _split_git(source: str) -> tuple[str, str]:
    """``(git_url, subdir)`` when *source* is a git URL (optionally ``url#subdir``), else ``("", "")``."""
    base, _, subdir = source.strip().partition("#")
    return (base, subdir.strip("/")) if _looks_like_git_url(base) else ("", "")


def assert_materialized(path: Path) -> None:
    """Raise :class:`CloudPlaceholderError` when *path* (a file or folder tree) holds online-only files."""
    from hermes_platform.host.cloud_files import find_online_only

    found = find_online_only(path)
    if found:
        names = ", ".join(str(p.relative_to(path)) if p != path else p.name for p in found)
        raise CloudPlaceholderError(
            f"Some files are not downloaded yet ({names}). In your Drive/Nextcloud client set the "
            "folder to 'available offline' / 'mirror files', wait for the sync, then try again.")


def _guard_source(source: str) -> None:
    """Placeholder check for a local-folder source (git sources are fetched, not synced)."""
    if not _split_git(source)[0]:
        local = Path(source).expanduser()
        if local.exists():
            assert_materialized(local)


def _clone(url: str, dest: Path) -> None:
    from utils import rmtree_readonly

    _git_clone(url, dest)
    rmtree_readonly(dest / ".git")


# --- installed profiles ------------------------------------------------------------------------

def _installed_distributions() -> list[tuple[str, Path, DistributionManifest]]:
    """``(profile, dir, manifest)`` for every named profile that records a distribution source."""
    from hermes_cli.profiles import _iter_named_profile_dirs

    found = []
    for profile_dir in _iter_named_profile_dirs():
        try:
            manifest = read_manifest(profile_dir)
        except DistributionError:
            continue  # a broken manifest on one profile must not hide the others
        if manifest is not None and manifest.source:
            found.append((profile_dir.name, profile_dir, manifest))
    return found


def _same_source(recorded: str, entry_source: str) -> bool:
    if _split_git(recorded)[0] or _split_git(entry_source)[0]:
        return recorded.strip().rstrip("/") == entry_source.strip().rstrip("/")
    try:
        rec, ent = Path(recorded).expanduser().resolve(), Path(entry_source).expanduser().resolve()
    except OSError:
        return False
    return rec == ent or rec.is_relative_to(ent)


def _installed_match(entry_source: str, name: str, installed) -> Optional[tuple[str, DistributionManifest]]:
    """The installed profile that came from *entry_source*, preferring one named like the entry."""
    matches = [(p, m) for p, _, m in installed if _same_source(m.source, entry_source)]
    matches.sort(key=lambda pm: pm[0] != name)
    return matches[0] if matches else None


# --- scan --------------------------------------------------------------------------------------

def _skill_names(entry_dir: Path) -> list[str]:
    root = entry_dir / "skills"
    if not root.is_dir():
        return []
    names = {md.parent.name for md in root.rglob("SKILL.md")}
    if not names:  # skills shipped without SKILL.md still count by folder
        names = {d.name for d in root.iterdir() if d.is_dir() and not d.name.startswith(".")}
    return sorted(names)


def _describe_entry(entry_dir: Path, source: str, installed) -> dict[str, Any]:
    assert_materialized(entry_dir)
    manifest = read_manifest(entry_dir)
    if manifest is None:
        raise DistributionError(f"No {MANIFEST_FILENAME} in {entry_dir.name}")
    match = _installed_match(source, manifest.name, installed)
    status = "new" if match is None else ("installed" if match[1].version == manifest.version else "update")
    return {
        "name": manifest.name, "version": manifest.version, "description": manifest.description,
        "author": manifest.author, "source": source,
        "env_requires": [{"name": r.name, "description": r.description, "required": r.required}
                         for r in manifest.env_requires],
        "skills": _skill_names(entry_dir), "has_cron": _has_cron_jobs(entry_dir), "status": status,
        "installed_profile": match[0] if match else None,
        "installed_version": match[1].version if match else None, "error": None,
    }


def _scan_entry(entry_dir: Path, source: str, installed) -> dict[str, Any]:
    try:
        return _describe_entry(entry_dir, source, installed)
    except Exception as exc:  # health: allow BLE001 -- one malformed entry must not fail the whole scan; the message is surfaced as its error
        return {"name": entry_dir.name, "version": "", "description": "", "author": "", "source": source,
                "env_requires": [], "skills": [], "has_cron": False, "status": "error",
                "installed_profile": None, "installed_version": None, "error": str(exc)}


def _library_root(source: str, workdir: Path) -> tuple[Path, Any]:
    """``(folder holding the entries, entry-name -> install source)`` for a library source."""
    url, subdir = _split_git(source)
    if url:
        _clone(url, workdir / "clone")
        root = _git_subdir(workdir / "clone", subdir)
        prefix = f"{subdir}/" if subdir else ""
        return root, lambda name: f"{url}#{prefix}{name}"
    root = Path(source).expanduser()
    if not root.is_dir():
        raise DistributionError(f"Cannot find the bot library folder {source!r}.")
    root = root.resolve()
    return root, lambda name: str(root / name)


def scan_library(source: str) -> list[dict[str, Any]]:
    """Describe every bot (subfolder holding a ``distribution.yaml``) offered by *source*."""
    with tempfile.TemporaryDirectory(prefix="hermes_bot_library_") as tmp:
        root, entry_source = _library_root(source, Path(tmp))
        installed = _installed_distributions()
        return [
            _scan_entry(d, entry_source(d.name), installed) for d in sorted(root.iterdir())
            if d.is_dir() and not d.name.startswith(".") and (d / MANIFEST_FILENAME).exists()
        ]


# --- install / update / rollback ---------------------------------------------------------------

def install_entry(source: str, name: Optional[str] = None) -> dict[str, Any]:
    """Install the bot at *source* (an entry's ``source``) as a new profile."""
    with _MUTATION_LOCK:
        _guard_source(source)
        plan = install_distribution(source, name=name)
    return {"profile": plan.manifest.name, "version": plan.manifest.version, "from_version": None}


def update_profile(profile: str) -> dict[str, Any]:
    """Re-pull an installed bot from its recorded source (config.yaml kept, managed keys refreshed)."""
    with _MUTATION_LOCK:
        canon, target = _existing_profile(profile)
        before = read_manifest(target)
        if before is not None and before.source:
            _guard_source(before.source)
        plan = update_distribution(canon)
    return {"profile": canon, "version": plan.manifest.version, "from_version": before.version if before else None}


def rollback_profile(profile: str) -> dict[str, Any]:
    """Restore the snapshot taken before the profile's last update."""
    from hermes_cli.bot_library_ledger import rollback

    with _MUTATION_LOCK:
        canon, target = _existing_profile(profile)
        return {"profile": canon, "version": rollback(target)}


# --- sync --------------------------------------------------------------------------------------

def _offered_version(source: str, workdir: Path, clones: dict[str, Any]) -> str:
    """The version *source* offers now, without installing. Raises :class:`SourceUnavailable`."""
    url, subdir = _split_git(source)
    if url:
        if url not in clones:
            dest = workdir / f"clone{len(clones)}"
            try:
                _clone(url, dest)
                clones[url] = dest
            except DistributionError as exc:
                clones[url] = exc
        if isinstance(clones[url], Exception):
            raise SourceUnavailable(str(clones[url]))
        staged = _git_subdir(clones[url], subdir)
    else:
        staged = Path(source).expanduser()
        if not staged.is_dir():
            raise SourceUnavailable(f"The source folder {source} is not available.")
        try:
            assert_materialized(staged / MANIFEST_FILENAME)
        except CloudPlaceholderError as exc:
            raise SourceUnavailable(str(exc)) from exc
    manifest = read_manifest(staged)
    if manifest is None:
        raise DistributionError(f"The source no longer offers a {MANIFEST_FILENAME}.")
    return manifest.version


def _sync_one(profile: str, profile_dir: Path, manifest: DistributionManifest, workdir: Path,
              clones: dict[str, Any]) -> dict[str, Any]:
    from hermes_cli.bot_library_ledger import read_ledger

    result: dict[str, Any] = {"profile": profile, "from": manifest.version, "to": manifest.version,
                              "status": "unchanged"}
    try:
        offered = _offered_version(manifest.source, workdir, clones)
        ledger = read_ledger(profile_dir) or {}
        if offered == manifest.version or offered == ledger.get("rolled_back_from"):
            return result
        result["to"] = update_profile(profile)["version"]
        result["status"] = "updated"
    except (SourceUnavailable, CloudPlaceholderError) as exc:
        result.update(status="source-unavailable", error=str(exc))
    except Exception as exc:  # health: allow BLE001 -- sync reports per-profile failures in its result, never raises
        result.update(status="error", error=str(exc))
    return result


def sync_installed() -> list[dict[str, Any]]:
    """Bring every installed bot up to date with the version its source offers now.

    Safe at every app start: a local source costs one manifest read, a source folder that is gone
    reports ``source-unavailable`` without touching the network, and a rolled-back version is not
    re-applied until the source moves on."""
    results: list[dict[str, Any]] = []
    with _MUTATION_LOCK, tempfile.TemporaryDirectory(prefix="hermes_bot_sync_") as tmp:
        clones: dict[str, Any] = {}
        for profile, profile_dir, manifest in _installed_distributions():
            results.append(_sync_one(profile, profile_dir, manifest, Path(tmp), clones))
    return results
