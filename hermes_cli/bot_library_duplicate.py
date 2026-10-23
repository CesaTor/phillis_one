"""Duplicate a bot into an independent, unlocked profile.

A library bot is locked (:mod:`hermes_cli.bot_library_locks`); duplicating it is how a user customises
one. The copy carries the bot's persona, skills, settings and scheduled-job definitions and nothing
that is personal or tied to the library: no memories, sessions, credentials (``.env``) or
memory-provider keys, and none of ``distribution.yaml``, ``.library-owned.json`` or
``.library-backup/``, so a library update never reaches it. Jobs arrive paused, like a library install's.

Built on :func:`hermes_cli.profiles.create_profile` (no clone options: ``--clone`` would copy ``.env``
and the memory files) plus the same copy helpers the clone uses.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from hermes_cli.profile_distribution import DistributionError

_SLUG_RE = re.compile(r"[^a-z0-9_-]+")


def _new_profile_id(name: str) -> tuple[str, str]:
    """``(profile id, display name)`` for the user's *name*; the display name is empty when the id equals it."""
    from hermes_cli.profiles import get_profile_dir, validate_profile_name

    shown = name.strip()
    if not shown:
        raise DistributionError("Give the copy a name.")
    slug = _SLUG_RE.sub("-", shown.lower()).strip("-_")[:64]
    try:
        validate_profile_name(slug)
    except ValueError as exc:
        raise DistributionError(str(exc)) from exc
    if slug == "default" or get_profile_dir(slug).exists():
        raise DistributionError(f"A bot named '{slug}' already exists. Choose a different name.")
    return slug, "" if shown == slug else shown


def _copy_cron_definitions(source: Path, target: Path) -> None:
    from cron import jobs as cron_jobs
    from cron.job_definition import JOB_DEFINITION_FIELDS, import_job_definitions

    with cron_jobs.use_cron_store(source):
        shipped = {job["id"]: {k: v for k, v in job.items() if k in JOB_DEFINITION_FIELDS | {"repeat"}}
                   for job in cron_jobs.load_jobs() if isinstance(job, dict) and job.get("id")}
    if shipped:
        with cron_jobs.use_cron_store(target):
            import_job_definitions(shipped, paused_reason="Copied from another bot; review it, then resume.")


def _fill_copy(source: Path, target: Path) -> None:
    from hermes_cli.profile_channels import strip_channel_settings
    from hermes_cli.profiles import (
        _copytree_keep_junctions, _migrate_profile_config_if_outdated, _non_exportable_entries,
        _strip_multiplex_flag)

    if (source / "config.yaml").is_file():
        shutil.copy2(source / "config.yaml", target / "config.yaml")
        _strip_multiplex_flag(target / "config.yaml")
        strip_channel_settings(target, include_state=False, source_dir=source)
        _migrate_profile_config_if_outdated(target)
    if (source / "skills").is_dir():
        _copytree_keep_junctions(source / "skills", target / "skills", _non_exportable_entries, dirs_exist_ok=True)
    _copy_cron_definitions(source, target)


def duplicate_profile(source: str, name: str) -> str:
    """Create the copy of profile *source* named after *name*; returns the new profile id."""
    from hermes_cli.profile_distribution import _existing_profile
    from hermes_cli.profiles import create_profile, read_profile_meta, write_profile_meta

    _, source_dir = _existing_profile(source)
    new_id, display_name = _new_profile_id(name)
    soul = source_dir / "SOUL.md"
    target = create_profile(new_id, soul=soul.read_text(encoding="utf-8-sig") if soul.is_file() else None)
    try:
        _fill_copy(source_dir, target)
        description = read_profile_meta(source_dir)["description"]
        if display_name or description:
            write_profile_meta(target, display_name=display_name or None, description=description or None)
    except BaseException:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return new_id
