"""Locked library bots: what a bot library install owns cannot be edited until the bot is duplicated.

The next library update replaces a library bot's SOUL.md, shipped skills, shipped cron jobs and the
``config_managed`` keys of its ``config.yaml`` (see :mod:`hermes_cli.bot_library_ledger`), so an edit
made in the meantime would be lost silently. In a ReAgent distribution (``HERMES_DISTRIBUTION=reagent``)
every write path that can reach that content calls into this module and refuses with
:data:`LOCKED_TAIL`. Anything else is untouched: skills, cron jobs and settings the user or agent
created stay editable, and with the distribution unset every function here answers "not locked".

Not covered on purpose: a shell command that rewrites a file (``terminal``, ``execute_code``) is outside
every file guard Hermes has; the library update still restores the owned content from its source.

Profile directories are passed in by the caller. Code that runs inside a turn passes
``get_hermes_home()``, which is the active profile's under multiplex; nothing here caches a home.
"""

from __future__ import annotations

import contextlib
import os
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

LOCKED_TAIL = "belongs to the {name} library bot and is replaced on update. Duplicate the bot to customise it."
_CONFIG_FILENAME = "config.yaml"
_SKILL_MD = "/skill.md"
_NOUNS = {"file": "This file", "setting": "This setting", "job": "This scheduled job", "skill": "This skill"}


class LibraryLockedError(ValueError):
    """A write would change content a library update replaces."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def distribution_active() -> bool:
    from agent.distribution_identity import active_distribution

    return active_distribution() == "reagent"


def _ledger(profile_dir: Path) -> Optional[dict[str, Any]]:
    if not distribution_active():
        return None
    from hermes_cli.bot_library_ledger import read_ledger

    return read_ledger(Path(profile_dir))


def is_library_locked(profile_dir: Path) -> bool:
    """A ReAgent profile that a library install recorded ownership in."""
    return _ledger(profile_dir) is not None


def library_bot_name(profile_dir: Path) -> str:
    from hermes_cli.profile_distribution import DistributionError, read_manifest

    try:
        manifest = read_manifest(Path(profile_dir))
    except DistributionError:
        manifest = None
    return manifest.name if manifest is not None else Path(profile_dir).name


def refusal_message(profile_dir: Path, kind: str = "file") -> str:
    """The user-facing refusal, e.g. "This file belongs to the Sales library bot and is replaced on update ..."."""
    return f"{_NOUNS[kind]} {LOCKED_TAIL.format(name=library_bot_name(profile_dir))}"


def managed_config_keys(profile_dir: Path) -> list[str]:
    """The manifest's ``config_managed`` keys of a locked profile (top-level or dotted); else ``[]``."""
    if _ledger(profile_dir) is None:
        return []
    from hermes_cli.profile_distribution import DistributionError, read_manifest

    try:
        manifest = read_manifest(Path(profile_dir))
    except DistributionError:
        return []
    return list(manifest.config_managed) if manifest is not None else []


def _norm(rel_path: str) -> str:
    """Posix, case-folded, no leading ``./`` or ``/``: macOS and Windows file systems ignore case."""
    return os.path.normpath(str(rel_path).replace("\\", "/")).replace("\\", "/").strip("/").casefold()


def library_owned(profile_dir: Path, rel_path: str) -> bool:
    """Whether the library replaces *rel_path* (profile-relative) on update.

    True when the path, an ancestor directory or a descendant is in the ledger, or when it lies inside a
    shipped skill (a skill directory is replaced as a whole, so a file added to it is lost as well).
    ``config.yaml`` is owned only through the manifest's ``config_managed`` keys; see
    :func:`managed_config_keys` for which."""
    ledger = _ledger(profile_dir)
    rel = _norm(rel_path)
    if ledger is None or rel in ("", "."):
        return False
    if rel == _CONFIG_FILENAME:
        return bool(managed_config_keys(profile_dir))
    paths = [_norm(p) for p in ledger["paths"] if isinstance(p, str)]
    skill_roots = [p[:-len(_SKILL_MD)] for p in paths if p.endswith(_SKILL_MD)]
    return any(rel == p or rel.startswith(p + "/") or p.startswith(rel + "/") for p in paths) or any(
        rel == root or rel.startswith(root + "/") for root in skill_roots)


# --- file tools ---------------------------------------------------------------------------------

def _owning_profile(resolved: str) -> Optional[tuple[Path, str]]:
    """``(profile_dir, relative path)`` when *resolved* lies in a named profile or the active home."""
    from hermes_cli.profiles import _get_profiles_root
    from hermes_constants import get_hermes_home

    roots = [(os.path.realpath(str(_get_profiles_root())), True), (os.path.realpath(str(get_hermes_home())), False)]
    for root, per_profile in roots:
        if resolved == root or not resolved.startswith(root + os.sep):
            continue
        rel = resolved[len(root) + 1:]
        if not per_profile:
            return Path(root), rel
        name, _, inner = rel.partition(os.sep)
        return Path(root) / name, inner
    return None


def library_write_refusal(paths: Iterable[str], task_id: str = "default") -> Optional[str]:
    """Refusal for an agent file-tool write, patch or delete that touches library-owned files."""
    if not distribution_active():
        return None
    from tools.file_tools_paths import _resolve_path_for_task

    for path in paths:
        try:
            resolved = os.path.realpath(str(_resolve_path_for_task(path, task_id)))
        except (OSError, ValueError):
            resolved = os.path.realpath(os.path.expanduser(path))
        owner = _owning_profile(resolved)
        if owner is not None and library_owned(*owner):
            return refusal_message(owner[0])
    return None


# --- skills -------------------------------------------------------------------------------------

def library_skill_refusal(
    action: str, name: str, operations: Any = None, category: Optional[str] = None
) -> Optional[str]:
    """Refusal for a ``skill_manage`` call (flat or batch) that edits a skill the library ships.

    ``create`` is refused only when its ``category`` is a shipped skill: a new skill is not in the ledger
    and a name that collides with a shipped skill is already rejected as existing, but a category that
    names a shipped skill would put the new one inside a directory the update replaces."""
    if not distribution_active():
        return None
    from hermes_constants import get_hermes_home
    from tools import skill_manager_tool as smt

    home = get_hermes_home()
    if _ledger(home) is None:
        return None
    ops = operations if isinstance(operations, list) else [{"action": action, "name": name, "category": category}]
    for op in ops:
        op = op if isinstance(op, dict) else {}
        skill = op.get("name") or name
        if (op.get("action") or action) == "create":
            inside = str(op.get("category") or category or "").strip()
            if inside and skill and library_owned(home, f"skills/{inside}/{skill}"):
                return refusal_message(home, "skill")
            continue
        if not skill:
            continue
        found = smt._find_skill(skill)
        if found is None:
            continue
        with contextlib.suppress(ValueError, OSError):  # outside the profile (an external skills dir): not ours
            if library_owned(home, Path(found["path"]).resolve().relative_to(home.resolve()).as_posix()):
                return refusal_message(home, "skill")
    return None


def library_skill_install_refusal(rel_dir: str) -> Optional[str]:
    """Refusal for a hub install that would replace a shipped skill (*rel_dir* is relative to ``skills/``)."""
    if not distribution_active():
        return None
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    return refusal_message(home, "skill") if library_owned(home, f"skills/{rel_dir}") else None


# --- config.yaml --------------------------------------------------------------------------------

def _managed_keys_changed(keys: list[str], on_disk: dict, proposed: dict) -> list[str]:
    from hermes_cli.profile_distribution_managed import _lookup

    return [k for k in keys if _lookup(on_disk, k.split(".")) != _lookup(proposed, k.split("."))]


def assert_managed_config_untouched(config_path: Path, on_disk: dict, proposed: dict, canonicalize) -> None:
    """Raise :class:`LibraryLockedError` when a save would change a ``config_managed`` key.

    Called by ``save_config`` with the file as written and the mapping about to be written (env
    references kept, defaults stripped), both in canonical form so an untouched key compares equal."""
    keys = managed_config_keys(config_path.parent)
    if keys and _managed_keys_changed(keys, canonicalize(on_disk), proposed):
        raise LibraryLockedError(refusal_message(config_path.parent, "setting"))


def config_key_managed(profile_dir: Path, key: str) -> bool:
    """Whether *key* (dotted) is, contains or lies inside a ``config_managed`` key."""
    return any(key == k or k.startswith(key + ".") or key.startswith(k + ".") for k in managed_config_keys(profile_dir))


# --- cron ---------------------------------------------------------------------------------------

def library_cron_refusal(profile_dir: Path, job_id: str, updates: Optional[dict] = None) -> Optional[str]:
    """Refusal for removing a library-shipped job (``updates`` None) or editing its definition.

    Pausing, resuming and running a job change state, not the definition the library refreshes."""
    ledger = _ledger(profile_dir)
    if ledger is None or job_id not in ledger.get("cron_job_ids", []):
        return None
    if updates is not None:
        from cron.job_definition import JOB_DEFINITION_FIELDS

        if not JOB_DEFINITION_FIELDS.intersection(updates):
            return None
    return refusal_message(profile_dir, "job")


# --- dashboard ----------------------------------------------------------------------------------

def refuse_http(message: Optional[str]) -> None:
    """Raise 409 with *message* when it is set; the dashboard routes' one-line hook."""
    if message:
        from fastapi import HTTPException

        raise HTTPException(status_code=409, detail=message)


def refuse_http_file(profile_dir: Path, rel_path: str) -> None:
    refuse_http(refusal_message(profile_dir) if library_owned(profile_dir, rel_path) else None)


def refuse_http_config_key(key: str) -> None:
    """409 when *key* is library-managed in the profile bound to the current request scope."""
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    refuse_http(refusal_message(home, "setting") if config_key_managed(home, key) else None)


@contextlib.contextmanager
def locked_as_conflict() -> Iterator[None]:
    """Turn a :class:`LibraryLockedError` raised inside into a 409."""
    try:
        yield
    except LibraryLockedError as exc:
        refuse_http(exc.message)


def profile_lock_fields(profile_dir: Path) -> dict[str, Any]:
    """Extra ``/api/profiles`` row fields; empty outside a ReAgent distribution so upstream rows are unchanged."""
    if not distribution_active():
        return {}
    locked = is_library_locked(profile_dir)
    return {"library_locked": locked, "library_managed_config": managed_config_keys(profile_dir) if locked else []}
