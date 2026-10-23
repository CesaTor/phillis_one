"""``config_managed``: manifest keys the distribution keeps authoritative in a preserved config.yaml."""

from __future__ import annotations

from pathlib import Path

import pytest

import hermes_yaml as yaml
from hermes_cli.profile_distribution import (
    DistributionError, DistributionManifest, install_distribution, update_distribution)
from hermes_cli.profile_distribution_managed import apply_managed_config, parse_config_managed
from hermes_cli.profiles import get_profile_dir


@pytest.fixture()
def profile_env(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    default_home = tmp_path / ".hermes"
    default_home.mkdir(exist_ok=True)
    monkeypatch.setenv("HERMES_HOME", str(default_home))
    return tmp_path


def _dist(root: Path, config: str, version: str, managed: str = "config_managed: [mcp_servers]\n") -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "SOUL.md").write_text("soul\n")
    (root / "config.yaml").write_text(config)
    (root / "distribution.yaml").write_text(f"name: mbot\nversion: {version}\n{managed}")
    return root


def _cfg(profile: Path) -> dict:
    return yaml.safe_load((profile / "config.yaml").read_text())


def test_manifest_field_round_trips_and_is_validated():
    m = DistributionManifest.from_dict({"name": "x", "config_managed": [" mcp_servers ", "agent.max_turns", "mcp_servers"]})
    assert m.config_managed == ["mcp_servers", "agent.max_turns"]
    assert DistributionManifest.from_dict(m.to_dict()).config_managed == m.config_managed
    assert "config_managed" not in DistributionManifest(name="x").to_dict()
    for bad in ("mcp_servers", [3], [""], ["a..b"]):
        with pytest.raises(DistributionError, match="config_managed"):
            parse_config_managed(bad)


def test_update_replaces_only_managed_keys_and_keeps_user_changes(profile_env):
    src = _dist(profile_env / "src", "model:\n  model: gpt-4\nmcp_servers:\n  a:\n    url: https://a\n  b:\n    url: https://b\n", "1.0.0")
    install_distribution(str(src))
    profile = get_profile_dir("mbot")
    (profile / "config.yaml").write_text(
        "# my notes\nmodel:\n  model: user-model\nmcp_servers:\n  a:\n    url: https://stale\n  mine:\n    url: https://mine\n")
    _dist(src, "model:\n  model: gpt-4\nmcp_servers:\n  a:\n    url: https://a2\n", "1.1.0")

    update_distribution("mbot")

    cfg = _cfg(profile)
    assert cfg["mcp_servers"] == {"a": {"url": "https://a2"}}  # replaced wholesale: b gone, user's `mine` gone
    assert cfg["model"] == {"model": "user-model"}  # unmanaged key untouched
    assert "# my notes" in (profile / "config.yaml").read_text()


def test_dotted_key_and_retired_key(profile_env):
    src = _dist(profile_env / "src", "agent:\n  max_turns: 5\n  other: 1\nextra: 1\n", "1.0.0",
                "config_managed: [agent.max_turns, extra]\n")
    install_distribution(str(src))
    profile = get_profile_dir("mbot")
    (profile / "config.yaml").write_text("agent:\n  max_turns: 99\n  other: mine\nextra: 2\n")
    _dist(src, "agent:\n  max_turns: 7\n", "1.1.0", "config_managed: [agent.max_turns, extra]\n")

    update_distribution("mbot")

    assert _cfg(profile) == {"agent": {"max_turns": 7, "other": "mine"}}


def test_without_managed_keys_a_preserved_config_is_untouched(profile_env):
    src = _dist(profile_env / "src", "mcp_servers:\n  a: {}\n", "1.0.0", "")
    install_distribution(str(src))
    profile = get_profile_dir("mbot")
    (profile / "config.yaml").write_text("mcp_servers:\n  mine: {}\n")
    _dist(src, "mcp_servers:\n  a: {}\n  new: {}\n", "1.1.0", "")

    update_distribution("mbot")

    assert _cfg(profile) == {"mcp_servers": {"mine": {}}}


def test_apply_is_a_noop_when_the_target_has_no_config(tmp_path):
    staged, target = tmp_path / "s", tmp_path / "t"
    staged.mkdir(), target.mkdir()
    (staged / "config.yaml").write_text("a: 1\n")

    apply_managed_config(staged, target, DistributionManifest(name="x", config_managed=["a"]))

    assert not (target / "config.yaml").exists()


def test_unreadable_target_config_is_never_overwritten(profile_env):
    src = _dist(profile_env / "src", "mcp_servers:\n  a: {}\n", "1.0.0")
    install_distribution(str(src))
    profile = get_profile_dir("mbot")
    (profile / "config.yaml").write_text("mcp_servers: [unclosed\n")
    _dist(src, "mcp_servers:\n  a: {}\n  b: {}\n", "1.1.0")

    with pytest.raises(Exception):
        update_distribution("mbot")

    assert (profile / "config.yaml").read_text() == "mcp_servers: [unclosed\n"
