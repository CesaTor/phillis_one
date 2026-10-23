"""Bot library routes: browse a library of profile distributions, install / update / roll back bots.

Thin HTTP layer over :mod:`hermes_cli.bot_library`; blocking file and git work runs in a worker
thread under the dashboard profile's own scope. Profiles are named explicitly in every body, so no
request-profile scope applies; the scope is the one the clone's ``GITHUB_TOKEN`` read needs, because a
multiplexed host fails an unscoped credential read closed.
"""

from __future__ import annotations

import contextlib
import logging
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from hermes_cli.bot_library_messages import plain_message
from hermes_cli.profile_distribution import DistributionError
from hermes_cli.web_routers._common import config_scoped_to_thread, require

_log = logging.getLogger("hermes_cli.web_server")

router = APIRouter()


class BotInstallBody(BaseModel):
    source: str
    name: Optional[str] = None


class BotProfileBody(BaseModel):
    profile: str


class BotDuplicateBody(BaseModel):
    profile: str
    name: str


@contextlib.contextmanager
def _distribution_errors(log_msg: str):
    """``DistributionError`` / bad profile name -> 400 with its message; anything else -> logged 500."""
    try:
        yield
    except HTTPException:
        raise
    except (DistributionError, ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=plain_message(exc))
    except Exception as exc:  # health: allow BLE001 -- logged with traceback, then mapped to a 500 response
        _log.exception(log_msg)
        raise HTTPException(status_code=500, detail=str(exc))


async def _run(log_msg: str, fn: Callable[[], Any]) -> Any:
    with _distribution_errors(log_msg):
        return await config_scoped_to_thread(None, fn)


@router.get("/api/bot-library")
async def get_bot_library(source: str = Query(...)):
    from hermes_cli.bot_library import scan_library

    source = require(source, "source is required")
    return {"source": source, "entries": await _run("GET /api/bot-library failed", lambda: scan_library(source))}


@router.post("/api/bot-library/install")
async def install_bot(body: BotInstallBody):
    from hermes_cli.bot_library import install_entry

    source = require(body.source, "source is required")
    name = (body.name or "").strip() or None
    done = await _run("POST /api/bot-library/install failed", lambda: install_entry(source, name))
    return {"profile": done["profile"], "version": done["version"]}


@router.post("/api/bot-library/update")
async def update_bot(body: BotProfileBody):
    from hermes_cli.bot_library import update_profile

    profile = require(body.profile, "profile is required")
    done = await _run("POST /api/bot-library/update failed", lambda: update_profile(profile))
    return {"profile": done["profile"], "from_version": done["from_version"], "version": done["version"]}


@router.post("/api/bot-library/sync")
async def sync_bots():
    from hermes_cli.bot_library import sync_installed

    results = await _run("POST /api/bot-library/sync failed", sync_installed)
    return {"results": [
        {"profile": r["profile"], "from_version": r["from"], "to_version": r["to"], "status": r["status"],
         **({"error": r["error"]} if r.get("error") else {})}
        for r in results]}


@router.post("/api/bot-library/rollback")
async def rollback_bot(body: BotProfileBody):
    from hermes_cli.bot_library import rollback_profile

    profile = require(body.profile, "profile is required")
    done = await _run("POST /api/bot-library/rollback failed", lambda: rollback_profile(profile))
    return {"profile": done["profile"], "version": done["version"]}


@router.post("/api/bot-library/duplicate")
async def duplicate_bot(body: BotDuplicateBody):
    """An independent, unlocked copy of a bot (the way to customise a locked library bot)."""
    from hermes_cli.bot_library_duplicate import duplicate_profile

    profile = require(body.profile, "profile is required")
    name = require(body.name, "name is required")
    return {"profile": await _run("POST /api/bot-library/duplicate failed", lambda: duplicate_profile(profile, name))}
