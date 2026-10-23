"""A library bot runs on the user's own provider: install and duplicate give it the default bot's key and model.

A bot created through "New bot" gets its provider the same way: its own ``.env`` and ``config.yaml`` are
filled when it is created, from the launch profile (``tui_gateway`` ``profiles.create`` mirrors the ``.env``
and inherits the model block; a clone copies both). Nothing is resolved at run time: a profile reads only
its own ``.env``, so a bot without the key asks the user to set a provider up on its first chat. A library
install writes no ``.env`` and a duplicate deliberately copies none of the source bot's credentials, so
both would open that card. This module closes the gap for the one provider a distribution ships:

* the provider's own variables (its key, and its base URL when set) are copied from the default profile's
  ``.env``, and nothing else from it, so a library bot never receives the user's tool or channel secrets;
* the default profile's ``model`` block (with the endpoint it points at) is added when the bot has none.

A key or model the bot already has is never replaced. Outside a distribution that names a provider nothing
happens: upstream Hermes keeps its own create flows.
"""

from __future__ import annotations

from pathlib import Path

# distribution id -> the provider it ships (ReAgent's only provider is ReQurv Hive).
_PROVIDER_BY_DISTRIBUTION = {"reagent": "requrv-hive"}


def _provider_env_names() -> tuple[str, ...]:
    from agent.distribution_identity import active_distribution
    from providers import get_provider_profile

    provider = _PROVIDER_BY_DISTRIBUTION.get(active_distribution() or "")
    profile = get_provider_profile(provider) if provider else None
    return tuple(profile.env_vars) if profile is not None else ()


def _copy_env_lines(source_env: Path, target_env: Path, names: tuple[str, ...]) -> bool:
    """Append *source_env*'s assignments of *names* that *target_env* does not set yet; True if any was added."""
    from hermes_cli.config import _env_write_lock, _read_env_lines, _write_env_lines
    from hermes_cli.profile_channels import _env_key_of_line, _env_values
    from hermes_cli.profiles import _PLACEHOLDER_ENV

    wanted = dict.fromkeys(names, "")
    offered = _env_values(source_env, wanted)
    with _env_write_lock(target_env):
        lines = _read_env_lines(target_env) if target_env.is_file() else _PLACEHOLDER_ENV.splitlines(keepends=True)
        missing = set(offered) - set(_env_values(target_env, wanted))
        added = [line for line in _read_env_lines(source_env) if _env_key_of_line(line) in missing] if missing else []
        if not added:
            return False
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        _write_env_lines(target_env, lines + [line if line.endswith("\n") else line + "\n" for line in added],
                         preserve_mode=target_env.is_file())
    return True


def _seed_model(default_home: Path, profile_dir: Path) -> bool:
    """Add the default profile's model block to *profile_dir*'s config when it names no model."""
    from hermes_cli.config import atomic_config_write, read_user_config_raw
    from hermes_cli.profile_model_seed import launch_model_seed, merge_endpoint_seed

    config_path = profile_dir / "config.yaml"
    current = read_user_config_raw(config_path) if config_path.is_file() else {}
    default_config = default_home / "config.yaml"
    seed = launch_model_seed(read_user_config_raw(default_config)) if default_config.is_file() else {}
    if current.get("model") or not seed:
        return False
    atomic_config_write(config_path, {**merge_endpoint_seed(current, seed), "model": seed["model"]})
    return True


def seed_provider_setup(profile_dir: Path) -> None:
    """Give the library bot at *profile_dir* the default profile's provider key and model (see module doc)."""
    names = _provider_env_names()
    if not names:
        return
    from hermes_cli.profiles import _get_default_hermes_home

    default_home = _get_default_hermes_home()
    _copy_env_lines(default_home / ".env", Path(profile_dir) / ".env", names)
    _seed_model(default_home, Path(profile_dir))
