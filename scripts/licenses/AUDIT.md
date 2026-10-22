# ReAgent third-party license audit

Branch `reagent`, 2026-10-22. Output: `apps/desktop/src/distribution/licenses/third-party.json`
(1037 entries). Regenerate with `node scripts/licenses/collect.mjs --pypi` (section 5).

## 1. Counts

| Source | Entries | License counts |
|---|---|---|
| npm (apps/desktop, ui-tui, web) | 764 (711 names) | MIT 612, ISC 96, BSD-3-Clause 11, MPL-2.0 13, BlueOak-1.0.0 10, Apache-2.0 8, BSD-2-Clause 7, CC-BY-4.0 1, Python-2.0 1, (MPL-2.0 OR Apache-2.0) 1, (MIT OR CC0-1.0) 1, LicenseRef-GSAP-Standard-No-Charge 1, Unlicense 1, 0BSD 1. No UNKNOWN. |
| python (opt-in extras excluded) | 253 | MIT 106, Apache-2.0 81, BSD-3-Clause 28, PSF-2.0 5, BSD-2-Clause 3, ISC 2, MPL-2.0 3, LGPL-3.0-only 2, GPL-3.0-only 1, GPL-3.0-or-later 1, MIT-0 1, mixed/dual expressions 8, **UNKNOWN 12** |
| bundled | 20 | MIT 17 (Electron, 10 optional skills, 5 skills, 1 plugin), LicenseRef-Chromium-bundled-notices 1, Apache-2.0 1 (security-guidance), OFL-1.1 1 (Syne) |

Totals across all sources, by license: MIT 735, Apache-2.0 90, ISC 98, BSD-3-Clause 39, BSD-2-Clause 10, BlueOak-1.0.0 10,
MPL-2.0 16 (plus 1 mixed), PSF-2.0 5, LGPL-3.0-only 2, GPL-3.0-only 1, GPL-3.0-or-later 1, CC-BY-4.0 1, OFL-1.1 1,
LicenseRef-* 2, UNKNOWN 12, and about 25 other single or dual expressions.

Python: 126 licenses were resolved from PyPI release records (cache: `scripts/licenses/pypi-cache.json`, 138 answers).
The other 115 came from installed metadata.

## 2. Scope: shipped vs not shipped

- **Python** is `uv export --all-extras --no-dev` minus `[tool.hermes] opt-in-extras` (currently `kittentts`), matching
  what the bundles install (`scripts/bundles/native.py`, then `--no-extra` per opt-in extra, as `pm/environment.py` does).
  The kittentts closure is **not** in the list: misaki, phonemizer-fork, espeakng-loader, torch, transformers, spaCy,
  nvidia-* and cuda-* were excluded because kittentts is opt-in. No torch or NVIDIA/CUDA finding remains.
- **Every other extra is still shipped.** A copyleft extra that is not opt-in still ships, so section 4 lists GPL items
  from `silk` and `piper`. If those should not ship either, add them to `opt-in-extras` in `pyproject.toml` (not changed here).
- **npm** covers apps/desktop plus ui-tui and web (shipped by the bundled variant, `scripts/bundles/desktop_prepare.py:199`).
  devDependencies and peerDependencies are excluded. Optional platform packages not installed here take version and
  license from `package-lock.json`.
- **Bundled notices:** Electron 40.10.2 (MIT, from its installed package.json), Chromium notices (`LICENSES.chromium.html`,
  recorded, not expanded), the Syne font, and 17 LICENSE files under `skills/`, `optional-skills/`, `plugins/`.

Method: a license comes from the package's declared metadata first (`package.json`, PEP 639 `License-Expression`, `License`,
classifiers), then its LICENSE text. For Python pins still unknown after the venvs, the PyPI release record is used in
this order: `license_expression`, OSI classifiers, a short `license` field that is an identifier (under 60 characters).
Anything else stays UNKNOWN. Nothing is guessed.

## 3. UNKNOWN (12 Python pins, after PyPI)

| Package | Why unresolved | Reaches the bundle through |
|---|---|---|
| resvg-py 0.4.0 | PyPI has no license field or classifiers. **Core dependency.** | `hermes-agent` (core) |
| sherpa-onnx 1.13.8 | No license field or classifiers on PyPI | `hermes-agent[wake]` |
| mistralai 2.4.8 | No license field or classifiers on PyPI | `hermes-agent[mistral]` |
| qrcode 7.4.2 | PyPI says only "BSD". The classifier does not state the clause count. | `hermes-agent[dingtalk]`, `[messaging]` |
| pycryptodome 3.23.0 | No license field or classifiers on PyPI | `hermes-agent[feishu]` → lark-oapi |
| azure-core 1.41.0 | Empty license, no classifiers | `hermes-agent[azure-identity]` |
| azure-identity 1.25.3 | No license field or classifiers on PyPI | `hermes-agent[azure-identity]` |
| dependency-injector 4.49.1 | No usable PyPI license | `hermes-agent[teams]` |
| microsoft-teams-apps 2.0.13.4 | No usable PyPI license | `hermes-agent[teams]` |
| fal-client 0.13.1 | No usable PyPI license | `hermes-agent[fal]` |
| nest-asyncio 1.6.0 | No usable PyPI license | `hermes-agent[firecrawl]` → firecrawl-py |
| wrapt 1.17.3 | No usable PyPI license | `hermes-agent[daytona]` → daytona → deprecated |

Only `resvg-py` is in the core set. Its upstream project is MPL-2.0 as far as I know. That is unverified and should be checked
before release.

Also not verified: `pillow-heif` is resolved (below), but the locked version (1.6.0) differs from the installed one
(1.7.0), and I read the wheel notice only from 1.7.0.

## 4. Flagged items in the shipped set

Dependency paths start at the workspace root or extra in brackets.

### Strong copyleft (decision needed)

| License | Package | Path | Finding and obligation |
|---|---|---|---|
| **GPL-2.0 + LGPL-3.0 inside a core wheel** | `pillow-heif` (locked 1.6.0; checked on 1.7.0) | `hermes-agent` (core) | PyPI declares BSD-3-Clause for the package. The installed wheel's `licenses/LICENSES_bundled.txt` says "License for pillow-heif binary wheels: GPLv2, due to base library licenses" and bundles x265 (GPLv2), libheif and libde265 (LGPLv3). The shipped binary is therefore GPL-2.0 plus LGPL-3.0, not BSD. **Action:** legal review; check the locked 1.6.0 wheel; consider a bundled entry for x265 and libheif, or an x265-free build. |
| GPL-3.0-only | `pilk` 0.2.4 | `hermes-agent[silk]` (not opt-in) | PyPI classifier "GNU General Public License v3 (GPLv3)". I read a version named without "or later" as `-only`. If the silk codec path is linked into the app, the combined work takes GPL-3.0. **Action:** make `silk` opt-in, or accept GPL-3.0 (source offer, full license text). |
| GPL-3.0-or-later | `piper-tts` 1.8.0 | `hermes-agent[piper]` (not opt-in) | PyPI `license` field "GPL-3.0-or-later". Depends on onnxruntime and pathvalidate. Its phonemizer closure was not checked. **Action:** same as pilk: make `piper` opt-in, or accept GPL-3.0-or-later. |

### Weak copyleft (obligations, no decision needed)

| License | Package | Path | Finding and obligation |
|---|---|---|---|
| LGPL-3.0-only | `python-telegram-bot` 22.8 | `hermes-agent[telegram]` | Python library. Keep the notice and license text; the user must be able to replace the library (plain files in the venv do that). Import sites not checked. |
| LGPL-3.0-only | `edge-tts` 7.2.7 | `hermes-agent[edge-tts]` | As above. |
| MPL-2.0 | `certifi` | `hermes-agent` (core) → httpx, requests, openai | File-level. Notice only for unmodified use. |
| MPL-2.0 AND MIT | `tqdm` 4.70.0 | `hermes-agent` (core) → openai | File-level for the MPL part. Notice only. |
| MPL-2.0 | `pathspec` 1.1.1 | `hermes-agent` (core) | No Python import found outside tests (the pyproject comment says it serves the desktop build stamp). Notice only. |
| MPL-2.0 | `@novnc/novnc` 1.7.0 | apps/desktop (direct) | Used at runtime by `apps/desktop/src/plugins/hermes-bots/screen-pane.tsx`. File-level. Publish the source of any noVNC file we modify; I did not check for local edits. |
| MPL-2.0 | `lightningcss` 1.32.0 and 11 platform packages | apps/desktop → @tailwindcss/vite → @tailwindcss/node → lightningcss | Build-time CSS transform. File-level. Notice only. |
| MPL-2.0 OR Apache-2.0 | `dompurify` 3.4.17 | apps/desktop (direct) | Used at runtime (SVG and preview sanitizing). We elect Apache-2.0. |
| CC-BY-4.0 | `@vscode/codicons` 0.0.45 | apps/desktop (direct) | Runtime: `apps/desktop/src/styles.css` imports `codicon.css` and its font. Attribution to Microsoft, link to the license, state that the font is unchanged. |
| LicenseRef-GSAP-Standard-No-Charge | `gsap` 3.15.0 | `web` (direct); optional peer of `@nous-research/ui` | Non-OSI "Standard 'no charge' license" (gsap.com/standard-license). Not declared by apps/desktop. `@nous-research/ui`'s index re-exports a gsap-based hook (`use-smooth-controls`), and no desktop source uses it, but I did not build the renderer to see whether gsap is bundled. **Action:** legal review; it ships in the `web` dashboard. |
| BlueOak-1.0.0 | `tar`, `minipass`, `minipass-flush`, `path-scurry`, `jackspeak`, `package-json-from-dist`, `isexe`, `chownr`, `sax`, `yallist` (10) | `get-windows` → node-gyp / @mapbox/node-pre-gyp; `sax` via `dbus-native` | Permissive, not OSI-approved. Notice only. Build chain, plus the Linux D-Bus client. |
| Unlicense | `robust-predicates` 3.0.3 | mermaid → d3 → d3-delaunay → delaunator | No obligation. |
| Python-2.0 | `argparse` 2.0.1 | apps/desktop → electron-updater → js-yaml | Notice only. |

Non-package items: Syne (OFL-1.1, text shipped beside the font). Electron (MIT; ship its LICENSE and `LICENSES.chromium.html`).
`plugins/security-guidance` (Apache-2.0; ship the NOTICE, which records the change to `patterns.py`).

Apache-2.0 with NOTICE files: `requests` (licenses/NOTICE), `boto3`, `botocore`, `s3transfer`. Installed in the dev venv, so
they must ship their NOTICE text. No npm Apache package ships a NOTICE.

## 5. Regenerate and files

### Regenerate

```
node scripts/licenses/collect.mjs --pypi                                     # current output: cached PyPI answers, fetches the rest
node scripts/licenses/collect.mjs --pypi --venv apps/desktop/build/agent-payload/venv   # after `npm run payload`, to cover more pins locally
node scripts/licenses/collect.mjs                                            # offline: cache and venvs only
```

Requires `uv` on PATH and the Hermes venv. `--pypi` makes sequential requests to pypi.org (10 s timeout, one retry,
250 ms delay). The cache stores raw release fields (never license text), so the mapping can change without refetching.
Output is deterministic on the same tree.

### Files

- `scripts/licenses/collect.mjs`: the generator.
- `scripts/licenses/pypi-cache.json`: PyPI answers (138), name==version to raw release fields.
- `scripts/licenses/AUDIT.md`: this report.
- `apps/desktop/src/distribution/licenses/third-party.json`: the generated list (1037 entries). The old copy at
  `apps/desktop/public/reagent/licenses/` was removed, along with its now-empty directory.

## 6. Obligations we must meet

1. **Ship the license text and copyright notice for every license in the list.** That covers MIT, ISC, BSD-2/3,
   Python-2.0, PSF-2.0, 0BSD, Unlicense, BlueOak-1.0.0, Apache-2.0, MPL-2.0, LGPL-3.0, GPL-3.0 (if kept), OFL-1.1, CC-BY-4.0.
2. **Decide the GPL items (pilk, piper-tts) and pillow-heif (x265 GPLv2)** before any release. Each is either made opt-in
   in `pyproject.toml`, or shipped with its GPL obligations (source offer, full text). pillow-heif is a core dependency, so
   it cannot be made opt-in without changing the core set.
3. **Apache-2.0 NOTICE:** ship `plugins/security-guidance/NOTICE`, and the NOTICE text of `requests`, `boto3`, `botocore`
   and `s3transfer`. Already present for security-guidance in `apps/desktop/src/distribution/licenses/`.
4. **MPL-2.0:** notice for every MPL file. Publish the source of any MPL file we modify (noVNC, certifi, pathspec, tqdm,
   lightningcss).
5. **LGPL-3.0 (python-telegram-bot, edge-tts):** keep the license text and make the library replaceable (plain files
   satisfy this). Offer source.
6. **CC-BY-4.0 (`@vscode/codicons`):** attribute Microsoft, link the license, state the font is unchanged. Shown on the Licenses screen.
7. **OFL-1.1 (Syne):** ship the OFL text next to the font (done).
8. **Electron and Chromium:** ship Electron's LICENSE and `LICENSES.chromium.html` in the packaged app.
9. **GSAP:** legal review of the "no charge" license, or remove the dependency if the `web` dashboard does not need it.
10. **Resolve the 12 UNKNOWN pins** (section 3), starting with core `resvg-py`, and re-scan the payload venv.
11. **Regenerate** whenever `package-lock.json`, `uv.lock`, `pyproject.toml` (opt-in list) or bundled skills change, and before each release.
