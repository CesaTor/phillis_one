#!/usr/bin/env bash
# Build the desktop bundle for the commit checked out here, on this machine.
#
#   scripts/build-bundle.sh [--variant bundled|light] [--tag vX.Y.Z] [-- <electron-builder args>]
#
# --tag builds HEAD as the release vX.Y.Z (the plain product identity, not a commit
# build) with a local claim tag that is deleted when the build ends. Nothing is pushed.
# The bundled variant only.
#
# macOS gets a DMG and ZIP, Linux an AppImage, in apps/desktop/release/.
# The commit does not need to be pushed. The build is not notarized, and the
# release signing variables in your shell are ignored. macOS can still sign
# nested binaries with a Developer ID that it finds in your keychain.
# Windows has its own script: scripts/build-bundle.ps1.
set -euo pipefail

variant=bundled
tag=
while [ $# -gt 0 ]; do
  case "$1" in
    --variant) variant="${2:?--variant needs bundled or light}"; shift 2 ;;
    --tag) tag="${2:?--tag needs vX.Y.Z}"; shift 2 ;;
    --) shift; break ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "build-bundle: unknown argument $1 (see --help)" >&2; exit 2 ;;
  esac
done
case "$variant" in bundled|light) ;; *) echo "build-bundle: --variant must be bundled or light" >&2; exit 2 ;; esac
if [ -n "$tag" ]; then
  [ "$variant" = bundled ] || { echo "build-bundle: --tag needs the bundled variant" >&2; exit 2; }
  case "$tag" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "build-bundle: --tag must look like vX.Y.Z" >&2; exit 2 ;;
  esac
fi

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

# The driver needs a host Python 3.11+ only to bootstrap; PM installs the pinned one.
python=
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
     "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
    python="$candidate"; break
  fi
done
[ -n "$python" ] || { echo "build-bundle: needs Python 3.11+ on PATH" >&2; exit 1; }

# The driver refuses a dirty tree. Say so before any work starts.
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "build-bundle: the checkout has uncommitted changes. Commit them (the build packages HEAD) or stash them." >&2
  git status --short --untracked-files=all >&2
  exit 1
fi
commit="$(git rev-parse HEAD)"

# A local build never signs or notarizes with credentials from the caller's shell.
# CSC_IDENTITY_AUTO_DISCOVERY=false is the same switch the desktop rebuild command uses.
unset APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_NOTARY_PROFILE APPLE_SIGNING_IDENTITY \
      CSC_LINK CSC_KEY_PASSWORD CSC_NAME CSC_KEYCHAIN
export CSC_IDENTITY_AUTO_DISCOVERY=false

# --clean removes the previous outputs after the driver holds the checkout lock, so a
# second invocation cannot delete the files of a build that is still running.
# .cache stays: it holds downloaded tools and is safe to reuse.
if [ -n "$tag" ]; then
  # A release build needs a claim tag (rc.<N>-vX.Y.Z, annotated) on the commit: its tagger
  # time is the build's immutable release time. It is local only and removed on exit. The
  # attempt number starts at 900, above any real release attempt, as build-bundle.ps1 does.
  attempt=900
  while git rev-parse -q --verify "refs/tags/rc.$attempt-$tag" >/dev/null; do attempt=$((attempt + 1)); done
  claim="rc.$attempt-$tag"
  git -c user.name=hermes-local-build -c user.email=local-build@invalid -c tag.gpgSign=false \
    tag -a "$claim" -m 'local build claim' "$commit"
  trap 'git tag -d "$claim" >/dev/null 2>&1 || true' EXIT
  export RELEASE_CLAIM_TAG="$claim" RELEASE_CLAIM_OBJECT="$(git rev-parse "refs/tags/$claim")"
  echo "build-bundle: building $commit as release $tag ($variant, local claim $claim)"
  "$python" scripts/bundles/desktop.py --tag "$tag" --release-commit "$commit" --variant "$variant" --clean ${1+-- "$@"}
else
  echo "build-bundle: building $commit ($variant)"
  "$python" scripts/bundles/desktop.py --commit "$commit" --variant "$variant" --clean ${1+-- "$@"}
fi

echo "build-bundle: done. Artifacts in $repo/apps/desktop/release:"
ls -lh apps/desktop/release | sed 's/^/  /'
