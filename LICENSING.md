# Licensing

This repository combines three kinds of files. **Which license applies depends
on the file**, not on the repository.

| Files | License | Owner |
|---|---|---|
| **ReQurv Works** (listed below) | [ReQurv Proprietary — All Rights Reserved](LICENSES/LicenseRef-ReQurv-Proprietary.txt) | ReQurv |
| Hermes Agent, as published by Nous Research, including the small edits ReQurv made to those files | MIT ([`LICENSE`](LICENSE)) | Nous Research |
| Other third-party files (for example `plugins/security-guidance` under Apache-2.0, bundled skills with their own `LICENSE`, the Syne font under OFL-1.1) | The license in that directory or file | Their authors |

## ReQurv Works

Machine-readable and authoritative: [`REUSE.toml`](REUSE.toml). In short:

- the ReAgent distribution layer: `apps/desktop/src/distribution/`
- the Hive provider plugin: `plugins/model-providers/requrv-hive/`
- ReQurv brand assets: `apps/desktop/assets/reagent/` and the images in
  `apps/desktop/public/reagent/` (logo, mark, icons)
- ReAgent-only files added next to Hermes code (home resolution, the default
  bot's handle, and their tests)
- this documentation (`REAGENT.md`, `LICENSING.md`)

Anything the ReQurv team adds later (the department bot catalog, in
particular) is a ReQurv Work unless a file or directory says otherwise.

## Edits to Hermes files

ReQurv's changes inside files that come from Nous Research are small gates in
a file that remains MIT. They are made available under the same MIT license as
the file, and the Nous Research copyright notice stays in [`LICENSE`](LICENSE).

## What "all rights reserved" means here

No license is granted to the ReQurv Works beyond what GitHub's Terms of
Service give to anyone viewing or forking a public repository. Using,
copying, modifying, hosting or distributing them requires a written agreement
with ReQurv. Contact: licensing@requrv.io

This is a starting position: ReQurv, as the owner, can loosen it later for
all or part of the ReQurv Works. What was already published under a license
cannot be withdrawn.

## Contributing

Contributions to the ReQurv Works are accepted only under a written assignment
or contributor agreement. Do not open pull requests against them without one.

## Checking

```bash
uvx reuse lint
```

reports every file without a license. Hermes files are expected to appear as
unannotated: their license is the upstream one.
