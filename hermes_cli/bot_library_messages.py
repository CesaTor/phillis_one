"""The sentences the bot library shows a person.

Library errors reach the UI as the ``detail`` of an HTTP answer (or an entry / sync ``error``) and are
displayed as they are, so they are plain sentences without file names, commands or other internals. The
installer underneath is shared with ``hermes profile install`` and keeps its technical wording; this module
maps its typed failures to the library's wording and leaves any other message alone.
"""

from __future__ import annotations

from hermes_cli.profile_distribution import GitCloneError, ManifestMissingError, SourceNotFoundError

FOLDER_UNAVAILABLE = "The library folder is not available."
CATALOG_UNREACHABLE = "Could not reach the catalog (no network or repository not found)."
ENTRY_INCOMPLETE = "This entry in the library is incomplete: it has no bot description."
FILES_NOT_DOWNLOADED = (
    "Some files in the library are not downloaded yet. In your Drive or Nextcloud app, make the folder "
    "available offline, wait for it to finish syncing, then try again.")

_BY_TYPE = (
    (GitCloneError, CATALOG_UNREACHABLE),
    (SourceNotFoundError, FOLDER_UNAVAILABLE),
    (ManifestMissingError, ENTRY_INCOMPLETE),
)


def plain_message(exc: BaseException) -> str:
    """The library's sentence for *exc*; its own text when it is already one (or not a known failure)."""
    return next((message for kind, message in _BY_TYPE if isinstance(exc, kind)), str(exc))
