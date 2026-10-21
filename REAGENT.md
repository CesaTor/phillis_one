# ReAgent — ReQurv's distribution of Hermes Desktop

ReAgent is upstream Hermes Desktop with a curated surface, ReQurv Hive as its only
model provider, local-only execution and ReQurv branding. It lives on the `reagent`
branch as a small stack of commits over upstream `main`.

## Build and run

```bash
# dev, isolated from any installed Hermes (own HERMES_HOME, userData, app name)
cd apps/desktop
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
| App identity | `apps/desktop/product-identity.cjs` | name, appId, CLI, no Nous release feed |
| First-run seeds | `apps/desktop/src/distribution/seed.ts` | names the unnamed `default` bot "ReQurv" |
| ReQurv Hive provider | `plugins/model-providers/requrv-hive/` | OpenAI-compatible, `REQURV_HIVE_API_KEY`, `requrv-small-3.8` (256k) |
| Contract tests | `apps/desktop/src/distribution/*.test.ts`, `tests/providers/test_requrv_hive_profile.py` | |

A model's reasoning levels live in two places that must agree: `_MODEL_EFFORTS` in the
provider plugin (what reaches the wire) and `modelEfforts` in `distribution/index.ts`
(what the pickers offer). `requrv-small-3.8` accepts `low`, `medium`, `xhigh` and has no
"off" level.

Everything else is a one-line gate at an upstream choke point: routes, sidebar nav,
command palette, settings nav and search, statusbar, bundled plugins, model catalog,
OAuth list, onboarding key options, remote-connection entry points, shared metrics,
composer voice. `git grep -n "@/distribution"` lists them all.

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

- Packaged builds still resolve `~/.hermes` as the backend home and the first-run
  installer fetches upstream Hermes; ReAgent needs its own home and a bundled payload
  built from this branch.
- No release feed: auto-update is off until ReQurv hosts one.
- Backend defaults (`config.yaml`) still route auxiliary tasks to Nous Portal and
  enable messaging/cron/kanban toolsets; ReAgent should ship its own defaults.
- Backend-generated copy (e.g. the "not connected to any AI provider" notice) is not
  rebranded.
