#!/usr/bin/env node
/*
 * Regenerates apps/desktop/src/distribution/licenses/third-party.json: the license of every
 * package the ReAgent desktop app ships, plus the bundled notices (Electron, Chromium, fonts,
 * in-tree skills and plugins). Output is sorted and deterministic for a given input tree.
 *
 *   node scripts/licenses/collect.mjs [--venv <dir>]... [--no-uv-cache] [--pypi] [--out <file>]
 *
 * Run it from any directory, after `npm install` (root and apps/desktop), with `uv` on PATH and
 * the Hermes venv present. --venv defaults to ~/.hermes/hermes-agent/venv; repeat it for other venvs
 * (for example the payload venv that `npm run payload` builds). A venv package counts only when its
 * version matches uv.lock. --no-uv-cache makes the output depend on the venvs alone.
 *
 * --pypi: for Python pins still UNKNOWN after the venvs and the uv cache, ask PyPI
 * (pypi.org/pypi/<name>/<version>/json) for the license. Answers are cached in
 * scripts/licenses/pypi-cache.json; cached answers are used with or without --pypi, so a rerun
 * is deterministic and offline-friendly. Requests are sequential, with a short delay.
 *
 * Sources:
 *   npm     production trees of apps/desktop, ui-tui and web (the workspaces the bundled payload
 *           ships): dependencies + optionalDependencies, transitively (what electron-builder packs;
 *           peerDependencies are not walked).
 *   python  pins from `uv export --frozen --all-extras --no-dev`, minus the opt-in extras. The
 *           payload is built with --all-extras (scripts/bundles/native.py) and then `--no-extra` for
 *           each `[tool.hermes] opt-in-extras` entry, so those closures never ship. The same
 *           exclusion is applied here (pm/environment.py does it for `pm`). Today that is `kittentts`,
 *           which pulls misaki, torch, transformers, spaCy, phonemizer and espeak-ng.
 *   bundled Electron (its package.json), Chromium notices (dist/LICENSES.chromium.html), the Syne
 *           font, and every LICENSE file under skills/, optional-skills/ and plugins/.
 *
 * A license is taken from the package's declared metadata first (package.json "license",
 * PEP 639 License-Expression, License, classifiers), then from its LICENSE text, and for PyPI-only
 * answers from the PyPI release record. Anything unclear is "UNKNOWN" and must be reviewed by hand
 * (see scripts/licenses/AUDIT.md).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DESKTOP = join(REPO, 'apps', 'desktop')
const DEFAULT_OUT = join(DESKTOP, 'src', 'distribution', 'licenses', 'third-party.json')
const PYPROJECT = join(REPO, 'pyproject.toml')
const PYPI_CACHE = join(REPO, 'scripts', 'licenses', 'pypi-cache.json')
const DEFAULT_VENV = join(homedir(), '.hermes', 'hermes-agent', 'venv')

// SPDX identifiers this generator will emit. Anything else declared by a package is not trusted.
const SPDX_IDS = [
  '0BSD', 'Apache-2.0', 'Artistic-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BSL-1.0',
  'CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0', 'EPL-1.0', 'EPL-2.0', 'ISC',
  'MIT', 'MIT-0', 'MPL-2.0', 'OFL-1.1', 'PSF-2.0', 'Python-2.0', 'Unlicense', 'Zlib', 'WTFPL',
  'GPL-2.0', 'GPL-2.0-or-later', 'GPL-3.0', 'GPL-3.0-or-later', 'LGPL-2.0', 'LGPL-2.0-or-later',
  'LGPL-2.1', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-or-later', 'AGPL-3.0', 'AGPL-3.0-or-later',
  'SSPL-1.0', 'BUSL-1.1', 'Elastic-2.0', 'Apache-1.1', 'GPL-2.0-only', 'GPL-3.0-only',
  'LGPL-2.0-only', 'LGPL-2.1-only', 'LGPL-3.0-only', 'AGPL-3.0-only',
]
const SPDX_BY_LOWER = new Map(SPDX_IDS.map(id => [id.toLowerCase(), id]))
const DECLARED_ALIASES = new Map([
  ['mit license', 'MIT'], ['the mit license', 'MIT'], ['expat', 'MIT'],
  ['apache license 2.0', 'Apache-2.0'], ['apache license, version 2.0', 'Apache-2.0'],
  ['apache license version 2.0', 'Apache-2.0'], ['apache 2.0', 'Apache-2.0'], ['apache software license', 'Apache-2.0'],
  ['isc license', 'ISC'], ['psf', 'PSF-2.0'], ['python software foundation license', 'PSF-2.0'],
  ['mozilla public license 2.0', 'MPL-2.0'], ['new bsd license', 'BSD-3-Clause'],
])

// Trove classifiers (Python). Unresolved "License ::" lines mean the text must decide.
const CLASSIFIER_RULES = [
  [/^License :: OSI Approved :: MIT License$/, 'MIT'],
  [/^License :: OSI Approved :: Apache Software License$/, 'Apache-2.0'],
  [/^License :: OSI Approved :: ISC License/, 'ISC'],
  [/^License :: OSI Approved :: Python Software Foundation License$/, 'PSF-2.0'],
  [/^License :: OSI Approved :: Mozilla Public License 2\.0/, 'MPL-2.0'],
  [/^License :: OSI Approved :: Eclipse Public License 2\.0/, 'EPL-2.0'],
  [/^License :: OSI Approved :: The Unlicense/, 'Unlicense'],
  [/^License :: OSI Approved :: GNU Affero General Public License v3/, 'AGPL-3.0'],
  [/^License :: OSI Approved :: GNU General Public License v3/, 'GPL-3.0'],
  [/^License :: OSI Approved :: GNU General Public License v2/, 'GPL-2.0'],
  [/^License :: OSI Approved :: GNU Lesser General Public License v3/, 'LGPL-3.0'],
  [/^License :: OSI Approved :: GNU Lesser General Public License v2\.1/, 'LGPL-2.1'],
  [/^License :: OSI Approved :: GNU Lesser General Public License v2/, 'LGPL-2.0'],
  [/^License :: OSI Approved :: BSD License$/, null],
  [/^License :: Public Domain$/, null],
]

// Ordered: the first signature that matches the license text wins.
function licenseFromText(text) {
  const t = text.replace(/\s+/g, ' ')
  const orLater = /any later version/i.test(t) ? '-or-later' : ''
  if (/SIL OPEN FONT LICENSE Version 1\.1/i.test(t)) return 'OFL-1.1'
  if (/Apache License,? Version 2\.0/i.test(t)) return 'Apache-2.0'
  if (/Mozilla Public License,? Version 2\.0/i.test(t)) return 'MPL-2.0'
  if (/Eclipse Public License\s*-?\s*v?\s*2\.0/i.test(t)) return 'EPL-2.0'
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t)) return `AGPL-3.0${orLater}`
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(t)) {
    const v = /Version 3/i.test(t) ? '3.0' : /Version 2\.1/i.test(t) ? '2.1' : '2.0'
    return `LGPL-${v}${orLater}`
  }
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t)) return `GPL-${/Version 3/i.test(t) ? '3.0' : '2.0'}${orLater}`
  if (/Permission is hereby granted, free of charge/i.test(t)) return 'MIT'
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/i.test(t)) return 'ISC'
  if (/Redistribution and use in source and binary forms/i.test(t)) {
    return /Neither the name/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause'
  }
  if (/This is free and unencumbered software/i.test(t)) return 'Unlicense'
  if (/Creative Commons Attribution-ShareAlike 4\.0/i.test(t)) return 'CC-BY-SA-4.0'
  if (/Python Software Foundation License Version 2|PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2/i.test(t)) return 'PSF-2.0'
  return null
}

const norm = name => name.toLowerCase().replace(/[-_.]+/g, '-')
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)

// A declared license string as an SPDX expression, or null when it is not one we can vouch for.
function declaredLicense(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  const alias = DECLARED_ALIASES.get(s.toLowerCase())
  if (alias) return alias
  const spelled = s
    .replace(/\bBSD[ -]([23])-Clause(?: License)?\b/gi, 'BSD-$1-Clause')
    .replace(/\b([23])-Clause BSD(?: License)?\b/gi, 'BSD-$1-Clause')
    .replace(/\bApache(?: License)?,? (?:Version )?2\.0(?: License)?\b/gi, 'Apache-2.0')
    .replace(/\bMIT License\b/gi, 'MIT')
  let ok = true
  const expr = spelled.replace(/[A-Za-z0-9.+-]+/g, token => {
    if (/^(and|or)$/i.test(token)) return token.toUpperCase()
    const id = SPDX_BY_LOWER.get(token.toLowerCase())
    if (!id) ok = false
    return id ?? token
  })
  return ok ? expr : null
}

// A GPL-family classifier names one version: "or later" (or "+") makes it -or-later, otherwise -only.
function classifierLicense(classifiers) {
  const lines = classifiers.filter(line => line.startsWith('License ::'))
  const ids = []
  for (const line of lines) {
    const rule = CLASSIFIER_RULES.find(([re]) => re.test(line))
    if (!rule || !rule[1]) return null
    const base = rule[1]
    if (/GPL/.test(base)) ids.push(base + (/or later|\+\)/i.test(line) ? '-or-later' : '-only'))
    else ids.push(base)
  }
  const unique = [...new Set(ids)]
  return unique.length ? unique.join(' OR ') : null
}

function textLicense(texts) {
  const found = [...new Set(texts.map(licenseFromText).filter(Boolean))]
  return found.length === 1 ? found[0] : null
}

function licenseFiles(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === '__pycache__') continue
    const path = join(dir, ent.name)
    if (ent.isDirectory()) licenseFiles(path, out)
    else if (/^(LICEN[CS]E|COPYING)(\.[A-Za-z0-9]+)?$/i.test(ent.name)) out.push(path)
  }
  return out
}

function cleanUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let url = raw.trim().replace(/^git\+/, '').replace(/\.git$/, '')
  url = url.replace(/^git@([^:]+):/, 'https://$1/').replace(/^git:\/\//, 'https://')
  return /^https?:\/\//.test(url) ? url : null
}

// ---- npm ----------------------------------------------------------------------------------

function resolveNpm(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const manifest = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(manifest)) return dirname(realpathSync(manifest))
    if (dirname(dir) === dir) return null
  }
}

// Workspaces whose production trees ship in the bundled desktop payload (desktop_prepare.py):
// the Electron app itself, the Ink TUI it drives, and the dashboard SPA.
const NPM_ROOTS = [DESKTOP, join(REPO, 'ui-tui'), join(REPO, 'web')]

function npmTree() {
  const seen = new Map()
  const missing = []
  const queue = []
  const enqueue = (pkg, fromDir) => {
    for (const name of Object.keys(pkg.dependencies ?? {})) queue.push({ name, fromDir, optional: false })
    for (const name of Object.keys(pkg.optionalDependencies ?? {})) queue.push({ name, fromDir, optional: true })
  }
  for (const dir of NPM_ROOTS) enqueue(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')), dir)
  while (queue.length) {
    const { name, fromDir, optional } = queue.shift()
    const dir = resolveNpm(name, fromDir)
    if (!dir) {
      missing.push({ name, optional })
      continue
    }
    if (seen.has(dir)) continue
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    seen.set(dir, { pkg, dir })
    enqueue(pkg, dir)
  }
  const entries = []
  for (const { pkg, dir } of seen.values()) {
    if (!dir.split(sep).includes('node_modules')) continue // first-party workspace package (apps/shared)
    entries.push({
      name: pkg.name,
      version: pkg.version,
      license: npmLicense(pkg, dir),
      source: 'npm',
      url: cleanUrl(pkg.homepage) ?? cleanUrl(typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url),
    })
  }
  // Optional dependencies for other platforms are not installed on this machine. The root
  // package-lock.json records each one's version and the license npm read from its registry manifest.
  const lock = JSON.parse(readFileSync(join(REPO, 'package-lock.json'), 'utf8')).packages ?? {}
  const unresolved = []
  for (const { name, optional } of missing) {
    const locked = lock[`node_modules/${name}`]
    if (optional && locked?.version) {
      entries.push({
        name, version: locked.version, license: declaredLicense(locked.license) ?? 'UNKNOWN',
        source: 'npm', url: null,
      })
    } else {
      unresolved.push(name)
    }
  }
  return { entries, unresolved }
}

// Declared licenses that are not SPDX but name a single, published license text. Recorded as a
// LicenseRef so the screen can show what the package says; the text is the URL it names.
const NPM_LICENSE_REFS = [
  [/^Standard 'no charge' license: https:\/\/gsap\.com\/standard-license\.?$/i, 'LicenseRef-GSAP-Standard-No-Charge'],
]

function npmLicense(pkg, dir) {
  let raw = pkg.license
  const ref = typeof raw === 'string' ? NPM_LICENSE_REFS.find(([re]) => re.test(raw.trim())) : undefined
  if (ref) return ref[1]
  if (raw === undefined && Array.isArray(pkg.licenses)) {
    raw = pkg.licenses.map(l => (typeof l === 'string' ? l : l.type)).join(' OR ')
  }
  if (raw && typeof raw === 'object') raw = raw.type
  const declared = declaredLicense(raw)
  if (declared) return declared
  const files = licenseFiles(dir).map(f => readFileSync(f, 'utf8').slice(0, 40000))
  return textLicense(files) ?? 'UNKNOWN'
}

// ---- python -------------------------------------------------------------------------------

const PY_HELPER = `
import json, re, sys
from pathlib import Path
from importlib.metadata import PathDistribution
items = json.load(sys.stdin)
out = []
for item in items:
    d = Path(item["dir"])
    meta = PathDistribution(d).metadata
    if meta is None:
        continue
    texts = []
    for p in sorted(d.rglob("*")):
        if p.is_file() and re.match(r"(LICEN[CS]E|COPYING)", p.name, re.I) and len(texts) < 4:
            texts.append(p.read_text(encoding="utf-8", errors="replace")[:40000])
    out.append({
        "origin": item["origin"],
        "name": meta.get("Name"),
        "version": meta.get("Version"),
        "expr": meta.get("License-Expression"),
        "license": meta.get("License"),
        "classifiers": meta.get_all("Classifier") or [],
        "project_urls": meta.get_all("Project-URL") or [],
        "home": meta.get("Home-page"),
        "texts": texts,
    })
print(json.dumps(out))
`

function pythonFor(venv) {
  return [join(venv, 'bin', 'python3'), join(venv, 'bin', 'python'), join(venv, 'Scripts', 'python.exe')].find(existsSync)
}

function distInfoDirs(sitePackages, origin) {
  if (!existsSync(sitePackages)) return []
  return readdirSync(sitePackages)
    .filter(name => name.endsWith('.dist-info'))
    .map(name => ({ origin, dir: join(sitePackages, name) }))
}

function installedDistributions(venvs) {
  const items = []
  for (const venv of venvs) {
    const py = pythonFor(venv)
    if (!py) throw new Error(`no python in venv: ${venv}`)
    const r = spawnSync(py, ['-I', '-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`cannot locate site-packages for ${venv}: ${r.stderr}`)
    items.push(...distInfoDirs(r.stdout.trim(), `venv:${venv}`))
  }
  return items
}

function uvCacheDistributions() {
  const r = spawnSync('uv', ['cache', 'dir'], { encoding: 'utf8' })
  if (r.status !== 0) return []
  const archive = join(r.stdout.trim(), 'archive-v0')
  if (!existsSync(archive)) return []
  const items = []
  for (const sub of readdirSync(archive).sort()) {
    items.push(...distInfoDirs(join(archive, sub), 'uv-cache'))
  }
  return items
}

function readDistMetadata(items, venvs) {
  const py = pythonFor(venvs[0]) ?? 'python3'
  const r = spawnSync(py, ['-I', '-c', PY_HELPER], {
    input: JSON.stringify(items), encoding: 'utf8', maxBuffer: 1 << 30,
  })
  if (r.status !== 0) throw new Error(`metadata reader failed: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

// [tool.hermes] opt-in-extras: extras the bundles never install (see the header).
function optInExtras() {
  const text = readFileSync(PYPROJECT, 'utf8')
  const start = text.indexOf('\n[tool.hermes]\n')
  if (start < 0) return []
  const section = text.slice(start + 1).split(/\n\[/)[0]
  const m = section.match(/^opt-in-extras\s*=\s*\[([^\]]*)\]/m)
  if (!m) return []
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]).sort()
}

function uvExportPins(noExtras) {
  const excluded = noExtras.flatMap(extra => ['--no-extra', extra])
  const r = spawnSync('uv', ['export', '--frozen', '--no-hashes', '--all-extras', ...excluded, '--no-emit-project', '--no-dev', '--format', 'requirements-txt'], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26,
  })
  if (r.status !== 0) throw new Error(`uv export failed: ${r.stderr}`)
  const pins = new Map()
  for (const line of r.stdout.split('\n')) {
    if (!line.trim() || line.startsWith('#') || /^\s/.test(line) || line.startsWith('-')) continue
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:==\s*([^\s;\\]+)|@\s)/)
    if (!m) throw new Error(`unparsed uv export line: ${line}`)
    pins.set(norm(m[1]), { name: m[1], version: m[2] ?? null })
  }
  return pins
}

// Versions for pins that uv exports as direct URLs (no "==" in the requirement line).
function lockVersions() {
  const text = readFileSync(join(REPO, 'uv.lock'), 'utf8')
  const versions = new Map()
  for (const block of text.split('[[package]]').slice(1)) {
    const name = block.match(/^name = "([^"]+)"/m)?.[1]
    const version = block.match(/^version = "([^"]+)"/m)?.[1]
    if (name && version && !versions.has(norm(name))) versions.set(norm(name), version)
  }
  return versions
}

function pythonUrl(rec) {
  const labels = new Map()
  for (const entry of rec.project_urls) {
    const [label, ...rest] = entry.split(',')
    labels.set(label.trim().toLowerCase(), rest.join(',').trim())
  }
  for (const label of ['homepage', 'home', 'source', 'source code', 'repository', 'code']) {
    const url = cleanUrl(labels.get(label))
    if (url) return url
  }
  return cleanUrl(rec.home)
}

function pythonLicense(rec) {
  return declaredLicense(rec.expr)
    ?? (rec.license && rec.license.length <= 120 && !rec.license.includes('\n') ? declaredLicense(rec.license) : null)
    ?? classifierLicense(rec.classifiers)
    ?? textLicense(rec.texts)
    ?? 'UNKNOWN'
}

function pythonEntries(venvs, useUvCache, noExtras) {
  const items = [...installedDistributions(venvs), ...(useUvCache ? uvCacheDistributions() : [])]
  const records = readDistMetadata(items, venvs)
  const index = new Map()
  for (const rec of records) {
    const key = `${norm(rec.name)}@${rec.version}`
    if (!index.has(key)) index.set(key, rec)
  }
  const pins = uvExportPins(noExtras)
  const versions = lockVersions()
  const entries = []
  for (const [key, pin] of pins) {
    const version = pin.version ?? versions.get(key)
    const rec = version ? index.get(`${key}@${version}`) : undefined
    entries.push({
      name: rec?.name ?? pin.name,
      version: version ?? 'UNKNOWN',
      license: rec ? pythonLicense(rec) : 'UNKNOWN',
      source: 'python',
      url: rec ? pythonUrl(rec) : null,
    })
  }
  return entries
}

// ---- PyPI (opt-in: --pypi; cached answers are always used) --------------------------------

const PYPI_DELAY_MS = 250
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))

// The raw fields a PyPI release record gives us, kept in the cache (never license text).
function pypiRaw(info) {
  const short = typeof info.license === 'string' ? info.license.trim() : ''
  return {
    license_expression: info.license_expression ?? null,
    license: short && short.length < 60 && !short.includes('\n') ? short : null,
    classifiers: (info.classifiers ?? []).filter(line => line.startsWith('License ::')),
  }
}

// License from cached raw fields, in order: license_expression, OSI classifiers, a short license
// field that is itself an identifier. Null when none of those is reliable.
function pypiLicense(raw) {
  const expr = declaredLicense(raw.license_expression)
  if (expr) return { license: expr, via: 'license_expression' }
  const fromClassifiers = classifierLicense(raw.classifiers)
  if (fromClassifiers) return { license: fromClassifiers, via: 'classifiers' }
  const id = raw.license ? declaredLicense(raw.license) : null
  if (id) return { license: id, via: 'license' }
  return null
}

async function fetchPypiRelease(name, version) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
      if (res.status === 404) return { status: 'not-found' }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { status: 'ok', info: (await res.json()).info ?? {} }
    } catch (err) {
      lastError = err
    }
  }
  return { status: 'error', error: String(lastError) }
}

// Fills UNKNOWN python licenses from the cache, and from PyPI when enabled. The cache holds raw
// release fields (status "ok") or "not-found", so the mapping can change without refetching.
// Transient errors are not cached, so a later run retries.
async function resolveFromPypi(entries, enabled) {
  const cache = existsSync(PYPI_CACHE) ? JSON.parse(readFileSync(PYPI_CACHE, 'utf8')) : {}
  const stats = { cached: 0, fetched: 0, resolved: 0, errors: [] }
  let dirty = false
  for (const entry of entries) {
    if (entry.source !== 'python' || entry.license !== 'UNKNOWN' || entry.version === 'UNKNOWN') continue
    const key = `${norm(entry.name)}==${entry.version}`
    let record = cache[key]
    if (record !== undefined) {
      stats.cached++
    } else {
      if (!enabled) continue
      if (stats.fetched > 0) await sleep(PYPI_DELAY_MS)
      stats.fetched++
      const r = await fetchPypiRelease(entry.name, entry.version)
      if (r.status === 'error') {
        stats.errors.push(`${key} (${r.error})`)
        continue
      }
      record = r.status === 'ok' ? { status: 'ok', ...pypiRaw(r.info) } : { status: 'not-found' }
      cache[key] = record
      dirty = true
    }
    const got = record.status === 'ok' ? pypiLicense(record) : null
    if (got) {
      entry.license = got.license
      stats.resolved++
    }
  }
  if (dirty) {
    const sorted = Object.fromEntries(Object.keys(cache).sort().map(k => [k, cache[k]]))
    writeFileSync(PYPI_CACHE, JSON.stringify(sorted, null, 2) + '\n')
  }
  return stats
}

// ---- bundled notices ----------------------------------------------------------------------

function bundledEntries() {
  const entries = []
  const electronDir = (() => {
    const manifest = join(DESKTOP, 'node_modules', 'electron', 'package.json')
    return existsSync(manifest) ? dirname(manifest) : null
  })()
  if (electronDir) {
    const pkg = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8'))
    entries.push({
      name: 'Electron', version: pkg.version, license: declaredLicense(pkg.license) ?? 'UNKNOWN',
      source: 'bundled', url: cleanUrl(pkg.homepage) ?? 'https://github.com/electron/electron',
    })
    if (existsSync(join(electronDir, 'dist', 'LICENSES.chromium.html'))) {
      entries.push({
        name: 'Chromium (notices in LICENSES.chromium.html, shipped inside Electron)', version: pkg.version,
        license: 'LicenseRef-Chromium-bundled-notices', source: 'bundled', url: null,
      })
    }
  }
  const fonts = join(DESKTOP, 'public', 'reagent', 'fonts')
  for (const [file, name] of [['OFL-syne.txt', 'Syne (typeface)']]) {
    const path = join(fonts, file)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    entries.push({
      name, version: 'n/a', license: textLicense([text]) ?? 'UNKNOWN', source: 'bundled',
      url: cleanUrl(text.split('\n').slice(0, 3).join(' ').match(/https?:\/\/[^\s)]+/)?.[0]),
    })
  }
  for (const root of ['skills', 'optional-skills', 'plugins']) {
    for (const file of licenseFiles(join(REPO, root))) {
      const text = readFileSync(file, 'utf8')
      entries.push({
        name: relative(REPO, dirname(file)).split(sep).join('/'), version: 'n/a',
        license: textLicense([text]) ?? 'UNKNOWN', source: 'bundled',
        url: cleanUrl(text.split('\n').slice(0, 3).join(' ').match(/https?:\/\/[^\s)]+/)?.[0]),
      })
    }
  }
  return entries
}

// ---- main ---------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { venvs: [], uvCache: true, pypi: false, out: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--venv') opts.venvs.push(resolve(argv[++i]))
    else if (argv[i] === '--no-uv-cache') opts.uvCache = false
    else if (argv[i] === '--pypi') opts.pypi = true
    else if (argv[i] === '--out') opts.out = resolve(argv[++i])
    else throw new Error(`unknown argument: ${argv[i]}`)
  }
  if (opts.venvs.length === 0) opts.venvs.push(DEFAULT_VENV)
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const npm = npmTree()
  const noExtras = optInExtras()
  const python = pythonEntries(opts.venvs, opts.uvCache, noExtras)
  const pypi = await resolveFromPypi(python, opts.pypi)
  const all = [...npm.entries, ...python, ...bundledEntries()]

  const byKey = new Map()
  for (const e of all) byKey.set(`${e.source}|${e.name}|${e.version}`, e)
  const entries = [...byKey.values()].sort((a, b) =>
    cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.version, b.version) || cmp(a.source, b.source))

  mkdirSync(dirname(opts.out), { recursive: true })
  writeFileSync(opts.out, JSON.stringify(entries, null, 2) + '\n')

  const bySource = {}
  const byLicense = {}
  for (const e of entries) {
    bySource[e.source] = (bySource[e.source] ?? 0) + 1
    byLicense[e.license] = (byLicense[e.license] ?? 0) + 1
  }
  const unknown = entries.filter(e => e.license === 'UNKNOWN').map(e => `${e.source}:${e.name}@${e.version}`)
  console.error(`wrote ${entries.length} entries to ${relative(REPO, opts.out)}`)
  console.error(`opt-in extras excluded: ${noExtras.join(', ') || '(none)'}`)
  console.error(`by source: ${JSON.stringify(bySource)}`)
  console.error(`by license: ${JSON.stringify(byLicense)}`)
  console.error(`pypi: ${pypi.cached} from cache, ${pypi.fetched} fetched, ${pypi.resolved} resolved${opts.pypi ? '' : ' (pass --pypi to fetch the rest)'}`)
  if (pypi.errors.length) console.error(`pypi: ${pypi.errors.length} lookup(s) failed and were not cached: ${pypi.errors.join('; ')}`)
  if (npm.unresolved.length) console.error(`npm: required dependencies not installed (not in output): ${npm.unresolved.join(', ')}`)
  if (unknown.length) console.error(`UNKNOWN (${unknown.length}): ${unknown.join(', ')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
