# ReAgent — ReQurv's distribution of Hermes Desktop

> **Licensing.** The ReQurv parts of this repository are **All Rights Reserved**; Hermes files
> stay MIT. See [LICENSING.md](LICENSING.md) before reusing, forking or publishing anything from it.

ReAgent is upstream Hermes Desktop with a curated surface, ReQurv Hive as its only
model provider, local-only execution and ReQurv branding. It lives on the `reagent`
branch as a small stack of commits over upstream `main`.

## Build and run

```bash
# once per sandbox: provision the Python env the backend and the update check run in.
# Use bash: under zsh, scripts/_activation.sh aborts on a missing ../tools glob.
HERMES_HOME=$PWD/.hermes-sandbox/hermes-home bash -c 'source ./activate'

# dev, isolated from any installed Hermes (own HERMES_HOME, userData, app name)
cd apps/desktop
HERMES_DESKTOP_HERMES=$PWD/../../.hermes/bin/hermes \
HERMES_DISTRIBUTION=reagent HERMES_DEV_SANDBOX_NAME=ReAgentDev \
  ../../scripts/dev-sandbox.sh --persistent -- npm run dev

# packaged
HERMES_DISTRIBUTION=reagent npm run dist
```

Without `HERMES_DISTRIBUTION` the tree builds upstream Hermes, unchanged.

## Where ReAgent lives

| Piece | File | Notes |
|---|---|---|
| Surface policy (allowlists) | `apps/desktop/src/distribution/index.ts` | the one place to let a feature in |
| Product names in copy | `apps/desktop/src/distribution/branding.ts` | applied to the resolved i18n catalog |
| App identity | `apps/desktop/product-identity.cjs` | name, appId, CLI, no Nous release feed, `iconDir`, `hermesHomeName` |
| Own home (`~/.reagent`, `%LOCALAPPDATA%\reagent`) | `apps/desktop/electron/product-home.ts` | default home from `hermesHomeName`; exported as `HERMES_HOME` to every child; never adopts a Hermes install's runtime |
| Brand assets | `apps/desktop/assets/reagent/` (app icons, sources, `generate.py`), `apps/desktop/public/reagent/` (in-app mark, logo, ReQurv theme fonts) | swapped in by `iconDir`, `distributionAsset`, `DistributionLogo` |
| First-run seeds | `apps/desktop/src/distribution/seed.ts` | names the unnamed `default` bot "ReQurv" |
| ReQurv Hive provider | `plugins/model-providers/requrv-hive/` | OpenAI-compatible, `REQURV_HIVE_API_KEY`, `requrv-small-3.8` (256k) |
| Contract tests | `apps/desktop/src/distribution/*.test.ts`, `apps/desktop/electron/product-home.test.ts`, `tests/providers/test_requrv_hive_profile.py` | |

A model's reasoning levels live in two places that must agree: `_MODEL_EFFORTS` in the
provider plugin (what reaches the wire) and `modelEfforts` in `distribution/index.ts`
(what the pickers offer). `requrv-small-3.8` accepts `low`, `medium`, `xhigh` and has no
"off" level.

Everything else is a one-line gate at an upstream choke point: routes, sidebar nav,
command palette, settings nav and search, statusbar, bundled plugins, model catalog,
OAuth list, onboarding key options, remote-connection entry points, shared metrics,
composer voice. `git grep -n "@/distribution"` lists them all.

## Its own home

ReAgent never shares state with a Hermes install on the same machine. Its home is
`~/.reagent` (`%LOCALAPPDATA%\reagent` on Windows), from the identity's `hermesHomeName`:
config, memories, profiles, sessions, logs (`logs/desktop.log`, `agent.log`), the gateway
(its control socket and spawn ledger are keyed on the home) and the installed runtime
(`~/.reagent/hermes-agent`). The desktop exports that home as `HERMES_HOME`, so every child
it spawns (backend, gateway, `--version` probes, installer, terminals) uses it too. It
never adopts a Hermes runtime: not `~/.hermes/hermes-agent`, not the install a
`~/.local/bin/hermes` launcher reports. An explicit `HERMES_HOME` still wins (the dev
sandbox sets one), including a Windows user-scope one set with `setx`, which is
process-wide by nature.

## Rules that keep upstream syncs cheap

- **Allowlist, never denylist.** A page, settings group, palette jump or plugin upstream
  adds stays hidden until it is added to `REAGENT` in `distribution/index.ts`.
- **Hide, don't remove.** The backend keeps every capability; bots still own profiles,
  sessions and cron routines underneath.
- **Never edit the i18n catalogs or `electron/main.ts`** — they are upstream's hottest
  files. New copy goes through `brandTranslations` / `brandText`.
- **New ReAgent code goes in new files**; a gate in an upstream file stays one line.

## Syncing with upstream

Remotes: `origin` is ReQurv's fork (github.com/CesaTor/phillis_one), `upstream` is
NousResearch/hermes-agent with pushing disabled.

```bash
git fetch upstream
git rebase upstream/main          # on branch reagent
git push --force-with-lease origin reagent
cd apps/desktop && npm run typecheck && npx vitest run --project ui src/distribution
```

Then launch the dev app and check that no new sidebar row, settings group or
statusbar item appeared.

## Known gaps

- The first-run installer still fetches upstream Hermes: `bootstrap-runner.ts` downloads
  `install.sh`/`install.ps1` from NousResearch at the build's commit (a `reagent` commit
  upstream does not have) and the script clones NousResearch/hermes-agent, so it would put
  upstream Hermes (no Hive plugin) into `~/.reagent/hermes-agent` and publish
  `~/.local/bin/hermes` over a Hermes install's launcher. Ship ReAgent as a bundled payload
  built from this branch (`HERMES_DESKTOP_VARIANT=bundled`), or give the identity an
  installer source (fork URL + branch, no user-bin publish) — both outside a one-line gate.
- The Python backend has no distribution concept: without `HERMES_HOME` it resolves
  `~/.hermes`. Every desktop-spawned child gets ReAgent's home, but a `hermes` CLI run from a
  user's own terminal (e.g. a bundled payload's `~/.local/bin` link) would not.
- On Linux the pre-launch read of `desktop.electron_flags` (`electron/entry.ts`) still looks
  in `~/.hermes/config.yaml` when `HERMES_HOME` is unset: entry must not load the product
  identity before main (the bundled-entry test runs it outside the app tree).
- Remote-only paths keep upstream's home: SSH control sockets (`ssh-connection.ts`,
  `~/.hermes/desktop-ssh`) and the remote `~/.hermes` probes. ReAgent has remote
  connections off. UI copy that prints `~/.hermes` paths is not rebranded either.
- No release feed: auto-update is off until ReQurv hosts one.
- **Third-party licenses (decide before shipping a packaged build).** The audit in
  `scripts/licenses/AUDIT.md` (regenerate with `node scripts/licenses/collect.mjs --pypi`)
  feeds the in-app Licenses screen. Open items: the bundled payload installs every
  non-opt-in extra, so `pilk` (`silk` extra, GPL-3.0) and `piper-tts` (`piper` extra,
  GPL-3.0-or-later) ship; both are voice features hidden in ReAgent, so ReAgent's payload
  should exclude those extras. `pillow-heif` (core) bundles GPLv2 x265 in its binary
  wheels despite declaring BSD-3. 12 Python packages still resolve to UNKNOWN. `gsap` has a
  non-OSI "no charge" license (a dependency of the web dashboard / `@nous-research/ui`).
  LGPL-3.0 (`python-telegram-bot`, `edge-tts`) and MPL-2.0 (noVNC, certifi, ...) need their
  notices kept and the libraries replaceable. Have legal review these.
- Backend prompt copy still names Hermes: every session carries upstream's help guidance
  ("You run on Hermes Agent (by Nous Research)", agent/prompt_builder.py), and bot profiles
  created later start from upstream's default SOUL. Only the default bot's SOUL is seeded.
- `seed-soul.ts` recognises an untouched persona by upstream's exact default text
  (hermes_cli/default_soul.py). If an upstream sync rewords it, copy the new text into
  `UPSTREAM_DEFAULT_SOUL` or the seed silently stops renaming the default bot.
- Auxiliary tasks need no seed: `auxiliary.*.provider: auto` already uses the main model
  (Hive). Messaging and kanban tools are already off for the agent; cron stays on.
- Backend-generated copy is not rebranded; onboarding hides the backend's launch notice,
  but other backend messages can still say Hermes.
- The default bot's handle is `@requrv` in the app (`defaultBotHandle`), but the backend still
  calls it `@hermes` (agents' teammate roster and DM stamps, `message_agent` help, `@` path
  completions). The app keeps `@hermes` as a silent alias that routes to the default bot,
  folds the backend's `@default`/`@hermes` completion rows into `@requrv`, and hands
  `message_agent` the `hermes` target every backend resolver accepts.
