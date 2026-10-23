"""Library-managed ``config.yaml`` keys for profile distributions.

``config.yaml`` is preserved on update, so a distribution's later change to, say, its MCP
connections would never reach installed bots. A manifest may list ``config_managed`` keys
(top-level or dotted: ``mcp_servers``, ``agent.max_turns``): on update those keys alone are
replaced with the staged values; every other key stays as the user has it. A managed key the
staged config no longer carries is removed from the profile.

Values are copied raw from the staged file (``${VAR}`` references stay unexpanded) and nothing
here reads or writes ``.env``.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

_CONFIG_FILENAME = "config.yaml"
_MISSING = object()


def parse_config_managed(raw: Any) -> list[str]:
    """Validate the manifest's ``config_managed`` value: a list of non-empty dotted-key strings."""
    from hermes_cli.profile_distribution import DistributionError

    if not raw:
        return []
    if not isinstance(raw, list):
        raise DistributionError("config_managed must be a list")
    keys: list[str] = []
    for item in raw:
        key = item.strip() if isinstance(item, str) else ""
        if not key or any(not part.strip() for part in key.split(".")):
            raise DistributionError(f"config_managed entries must be non-empty key paths, got {item!r}")
        if key not in keys:
            keys.append(key)
    return keys


def _lookup(config: dict, parts: list[str]) -> Any:
    node: Any = config
    for part in parts:
        if not isinstance(node, dict) or part not in node:
            return _MISSING
        node = node[part]
    return node


def _assign(config: dict, parts: list[str], value: Any) -> None:
    node = config
    for part in parts[:-1]:
        if not isinstance(node.get(part), dict):
            node[part] = {}
        node = node[part]
    node[parts[-1]] = value


def _discard(config: dict, parts: list[str]) -> None:
    parent = _lookup(config, parts[:-1]) if len(parts) > 1 else config
    if isinstance(parent, dict):
        parent.pop(parts[-1], None)


def _with_managed_keys(current: dict, staged: dict, keys: list[str]) -> dict:
    merged = copy.deepcopy(current)
    for key in keys:
        parts = key.split(".")
        value = _lookup(staged, parts)
        if value is _MISSING:
            _discard(merged, parts)
        else:
            _assign(merged, parts, copy.deepcopy(value))
    return merged


def apply_managed_config(staged: Path, target: Path, manifest) -> None:
    """Replace the manifest's ``config_managed`` keys in ``target/config.yaml`` with the staged values.

    No-op without managed keys or without a target config (a fresh copy brings the whole file).
    The write goes through the comment-preserving config writer, whose unreadable-file guard
    refuses to touch a config it cannot parse."""
    from hermes_cli.config import atomic_config_replace, read_user_config_raw, require_readable_config_before_write

    if not manifest.config_managed:
        return
    config_path = target / _CONFIG_FILENAME
    if not config_path.is_file():
        return
    current = require_readable_config_before_write(config_path)
    merged = _with_managed_keys(current, read_user_config_raw(staged / _CONFIG_FILENAME), manifest.config_managed)
    if merged != current:
        # Replace, not additive write: a managed key that shrank (a retired MCP server) must disappear.
        atomic_config_replace(config_path, merged)
