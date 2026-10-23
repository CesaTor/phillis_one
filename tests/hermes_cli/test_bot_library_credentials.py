"""Library bots and their duplicates run on the user's provider, like a bot created through "New bot".

A profile reads only its own ``.env`` and ``config.yaml``, so a bot without the provider key and a model
opens the provider setup card on its first chat. ReAgent ships one provider; install and duplicate give the
bot that provider's variables from the default profile (nothing else from its ``.env``) and the default
profile's model block when the bot names none.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import hermes_yaml as yaml
from fastapi.testclient import TestClient

from hermes_cli.bot_library import install_entry
from hermes_cli.bot_library_credentials import seed_provider_setup
from hermes_cli.profiles import get_profile_dir
from hermes_cli.web_server import _SESSION_TOKEN, app
from tests.hermes_cli.test_bot_library import write_bot

client = TestClient(app)
HEADERS = {"X-Hermes-Session-Token": _SESSION_TOKEN}
KEY = "requrv_sk_default_profile_key"
DEFAULT_ENV = f"REQURV_HIVE_API_KEY={KEY}\nGITHUB_TOKEN=gh_secret\nTELEGRAM_BOT_TOKEN=tg_secret\nOPENAI_API_KEY=sk-other\n"
DEFAULT_MODEL = {"provider": "requrv-hive", "default": "requrv-small-3.8"}


@pytest.fixture()
def home(tmp_path, monkeypatch):
    """A ReAgent install: the default profile holds the provider key (among other secrets) and a model."""
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    default = tmp_path / ".hermes"
    default.mkdir(exist_ok=True)
    (default / ".env").write_text(DEFAULT_ENV)
    (default / "config.yaml").write_text(yaml.safe_dump({"model": DEFAULT_MODEL}))
    monkeypatch.setenv("HERMES_HOME", str(default))
    monkeypatch.setenv("HERMES_DISTRIBUTION", "reagent")
    return default


def _entry(tmp_path: Path, *, model: dict | None = None) -> Path:
    entry = write_bot(tmp_path / "drive" / "bots", "hr-bot")
    config = {"mcp_servers": {"drive": {"url": "https://a.example"}}, **({"model": model} if model else {})}
    (entry / "config.yaml").write_text(yaml.safe_dump(config))
    return entry


def _env(profile: Path) -> dict[str, str]:
    from dotenv import dotenv_values

    return dict(dotenv_values(profile / ".env"))


def _config(profile: Path) -> dict:
    return yaml.safe_load((profile / "config.yaml").read_text())


def test_an_installed_bot_gets_only_the_provider_key_and_the_default_model_and_can_chat(home, tmp_path, monkeypatch):
    install_entry(str(_entry(tmp_path)))
    bot = get_profile_dir("hr-bot")

    assert _env(bot) == {"REQURV_HIVE_API_KEY": KEY}
    assert _config(bot)["model"] == DEFAULT_MODEL
    assert _config(bot)["mcp_servers"] == {"drive": {"url": "https://a.example"}}  # the library's settings stay
    assert oct((bot / ".env").stat().st_mode & 0o777) == oct(0o600)
    monkeypatch.setenv("HERMES_HOME", str(bot))
    from hermes_cli.runtime_provider import resolve_runtime_provider

    resolved = resolve_runtime_provider()
    assert resolved["provider"] == "requrv-hive" and resolved["api_key"] == KEY


def test_a_model_the_library_ships_is_kept(home, tmp_path):
    install_entry(str(_entry(tmp_path, model={"provider": "requrv-hive", "default": "requrv-large"})))

    assert _config(get_profile_dir("hr-bot"))["model"]["default"] == "requrv-large"
    assert _env(get_profile_dir("hr-bot")) == {"REQURV_HIVE_API_KEY": KEY}


def test_a_duplicate_gets_the_default_key_but_never_the_source_bots_secrets(home, tmp_path):
    install_entry(str(_entry(tmp_path)))
    bot = get_profile_dir("hr-bot")
    (bot / ".env").write_text("DRIVE_TOKEN=supersecret\nREQURV_HIVE_API_KEY=requrv_sk_stale_copy\n")

    resp = client.post("/api/bot-library/duplicate", json={"profile": "hr-bot", "name": "hr-custom"}, headers=HEADERS)

    assert resp.status_code == 200, resp.text
    copy = get_profile_dir("hr-custom")
    assert _env(copy) == {"REQURV_HIVE_API_KEY": KEY}
    assert _config(copy)["model"] == DEFAULT_MODEL


def test_a_key_the_bot_already_has_is_not_replaced(home, tmp_path):
    bot = get_profile_dir("own-key")
    bot.mkdir(parents=True)
    (bot / ".env").write_text("REQURV_HIVE_API_KEY=requrv_sk_own\n")
    (bot / "config.yaml").write_text(yaml.safe_dump({"model": {"provider": "requrv-hive", "default": "x"}}))

    seed_provider_setup(bot)

    assert _env(bot) == {"REQURV_HIVE_API_KEY": "requrv_sk_own"}
    assert _config(bot)["model"]["default"] == "x"


def test_a_default_profile_without_a_key_changes_nothing(home, tmp_path):
    (home / ".env").write_text("GITHUB_TOKEN=gh_secret\n")

    install_entry(str(_entry(tmp_path)))

    assert not (get_profile_dir("hr-bot") / ".env").exists()


def test_outside_a_distribution_a_library_install_is_untouched(home, tmp_path, monkeypatch):
    monkeypatch.delenv("HERMES_DISTRIBUTION")

    install_entry(str(_entry(tmp_path)))

    bot = get_profile_dir("hr-bot")
    assert not (bot / ".env").exists() and "model" not in _config(bot)
