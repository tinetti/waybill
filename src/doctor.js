import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LEGS } from './legs.js';
import { configuredBookingsDir, resolveBookings } from './bookings.js';
import { checkoutRoot } from './repo.js';

/**
 * @typedef {'ok'|'warn'|'fail'|'info'} Verdict
 * @typedef {{label: string, verdict: Verdict, detail: string, fix?: string}} Check
 */

/** This plugin's own directory — the one holding `commands/`, `package.json` and `src/`. */
const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Milliseconds a local version or config query is allowed, matching `src/openspec.js`. */
const QUERY_TIMEOUT_MS = 2000;

/**
 * Milliseconds an auth probe is allowed. Longer than {@link QUERY_TIMEOUT_MS} because `gh auth
 * status` and `glab auth status` touch the network: behind a proxy or a captive portal the local
 * budget would report every machine as broken. A timeout is still never a green check.
 */
const AUTH_TIMEOUT_MS = 5000;

/** The legs an overlay may bind, resolved once rather than per lookup. */
const KNOWN_LEGS = { knownLegs: LEGS.map((leg) => leg.id) };

/**
 * This plugin's own `package.json`.
 *
 * Deliberately throws when it cannot be read. That is this module's *own* installation being
 * broken, not the machine's, and dressing a packaging bug up as advice about the operator's laptop
 * would send them chasing the wrong thing.
 *
 * @returns {{version: string, engines?: {node?: string}}}
 */
function packageInfo() {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
}

/**
 * @typedef {{state:'absent'}|{state:'error', reason:string}|{state:'ran', status:number}} Status
 * @typedef {{state:'absent'}|{state:'error', reason:string}|
 *           {state:'ran', status:number, stdout:string}} Output
 */

/**
 * Why a spawn produced no exit code at all, or `null` when it produced one.
 *
 * Presence and health are told apart here and nowhere else: an absent binary sets
 * `error.code === 'ENOENT'`, while an unauthenticated `glab` exits non-zero with **no** `error` at
 * all. A check that only tested `status !== 0` would report the two identically, and their
 * remediations have nothing in common.
 *
 * @param {import('node:child_process').SpawnSyncReturns<string>} result
 * @param {number} timeout
 * @returns {{state:'absent'}|{state:'error', reason:string}|null}
 */
function spawnFailure(result, timeout) {
  if (!result.error) return null;
  if (result.error.code === 'ENOENT') return { state: 'absent' };
  if (result.error.code === 'ETIMEDOUT') return { state: 'error', reason: `timed out after ${timeout} ms` };
  return { state: 'error', reason: `could not be run (${result.error.code ?? result.error.message})` };
}

/**
 * Run a query and read **only** its exit code, discarding both streams.
 *
 * Separate from {@link probeOutput} so the security constraint is structural rather than a habit:
 * `gh auth status` and `glab auth status` print token metadata, and a function that never returns
 * their output cannot leak it into a detail line, however a later edit rewords one.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {number} timeout
 * @returns {Status}
 */
function probeStatus(command, args, timeout) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, windowsHide: true });
  return spawnFailure(result, timeout) ?? { state: 'ran', status: result.status ?? 1 };
}

/**
 * Run a query and read its exit code and stdout. Only for commands whose output is a version
 * string or a hostname — never for an auth probe; see {@link probeStatus}.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {number} timeout
 * @returns {Output}
 */
function probeOutput(command, args, timeout) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout, windowsHide: true });
  return spawnFailure(result, timeout) ?? { state: 'ran', status: result.status ?? 1, stdout: result.stdout ?? '' };
}

/**
 * Check 1 — the **running** interpreter against `engines.node`.
 *
 * The running node is the subject rather than whatever `node` resolves to on `PATH`, because every
 * `/waybill:*` command runs `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"` — the interpreter executing
 * this check is the interpreter the route uses. Zero dependencies means no semver library, so the
 * minimum major is parsed out of `>=N` and majors compared; a range this cannot read is a `warn`
 * rather than a green check, for the same honesty rule check 7 follows.
 *
 * @param {string} version e.g. `process.versions.node`
 * @param {string|undefined} range e.g. `>=22.0.0`, straight from package.json engines
 * @returns {Check}
 */
export function checkNode(version, range) {
  const label = 'node';
  const match = /^>=\s*(\d+)/.exec(range ?? '');
  if (match === null) {
    return {
      label,
      verdict: 'warn',
      detail: `v${version} — engines names \`${range ?? 'nothing'}\`, which this check cannot read as a minimum`,
      fix: 'state engines.node as `>=N`, or confirm the minimum by hand',
    };
  }

  const minimum = Number(match[1]);
  const major = Number.parseInt(version, 10);
  if (Number.isNaN(major)) {
    return {
      label,
      verdict: 'warn',
      detail: `\`${version}\` is not a version this check can read a major out of`,
      fix: `confirm by hand that the running node is at least ${minimum}`,
    };
  }
  if (major >= minimum) return { label, verdict: 'ok', detail: `v${version} (engines: ${range})` };

  return {
    label,
    verdict: 'fail',
    detail: `v${version} is below the engines minimum ${range} — the route runs on the node it is started with`,
    fix: `nvm install ${minimum} && nvm use ${minimum} — or however this machine manages node versions`,
  };
}

/**
 * Check 2 — `git --version`, judged by `ENOENT` against an exit code.
 *
 * @param {NodeJS.Platform} [platform]
 * @returns {Check}
 */
export function checkGit(platform = process.platform) {
  const label = 'git';
  const fix = platform === 'darwin' ? 'xcode-select --install' : 'brew install git';
  const result = probeOutput('git', ['--version'], QUERY_TIMEOUT_MS);

  if (result.state === 'absent') {
    return { label, verdict: 'fail', detail: 'not on PATH — every leg reads the repository through git', fix };
  }
  if (result.state === 'error') return { label, verdict: 'warn', detail: `\`git --version\` ${result.reason}`, fix };
  if (result.status !== 0) {
    return { label, verdict: 'fail', detail: `\`git --version\` exited ${result.status}`, fix };
  }
  return { label, verdict: 'ok', detail: result.stdout.trim() };
}

/**
 * Check 3 — `openspec --version`.
 *
 * Deliberately not `openspecAvailable` from `src/openspec.js`: that collapses `ENOENT` and a
 * non-zero exit into one `false`, which is the exact conflation check 5 exists to avoid, and it
 * discards the version string doctor reports on success.
 *
 * The detail names the consequence rather than the absence. Legs 5 and 6 fall back to parsing
 * `tasks.md` with no announcement at all, and the silence is the defect.
 *
 * @returns {Check}
 */
export function checkOpenspec() {
  const label = 'openspec';
  const fix = 'npm install -g @fission-ai/openspec';
  const result = probeOutput('openspec', ['--version'], QUERY_TIMEOUT_MS);

  if (result.state === 'absent') {
    return {
      label,
      verdict: 'fail',
      detail: 'not on PATH — legs 5 and 6 fall back to parsing tasks.md, silently',
      fix,
    };
  }
  if (result.state === 'error') {
    return { label, verdict: 'warn', detail: `\`openspec --version\` ${result.reason}`, fix };
  }
  if (result.status !== 0) {
    return { label, verdict: 'fail', detail: `\`openspec --version\` exited ${result.status}`, fix };
  }
  return { label, verdict: 'ok', detail: result.stdout.trim() };
}

/**
 * Check 4 — the bare `/spec:*` commands the OpenSpec waybills name.
 *
 * Installed as plugin files those four answer to `/waybill:spec:propose`, which is a different
 * name; only `<configDir>/commands/spec/propose.md` answers to `/spec:propose`. The required set is
 * *derived* from the plugin's own `commands/spec/`, so a fifth vendored routing command is checked
 * with no edit here. Symlink against copy is not judged: a copy still resolves, and doctor reports
 * resolvability rather than hygiene.
 *
 * @param {string|null} configDir `<HOME>/.claude`, or `CLAUDE_CONFIG_DIR`
 * @param {string} [pluginRoot] the directory holding `commands/spec/`
 * @returns {Check}
 */
export function checkSpecCommands(configDir, pluginRoot = PLUGIN_ROOT) {
  const label = 'spec commands';
  const fix =
    'for f in explore propose apply archive; do ln -sf "$PWD/commands/spec/$f.md" "$HOME/.claude/commands/spec/$f.md"; done';
  const source = path.join(pluginRoot, 'commands', 'spec');

  /** @type {string[]} */
  let required;
  try {
    required = fs.readdirSync(source).filter((name) => name.endsWith('.md')).sort();
  } catch {
    return { label, verdict: 'warn', detail: `cannot read ${source}, so there is no required set to check against`, fix };
  }
  if (required.length === 0) {
    return { label, verdict: 'warn', detail: `${source} ships no commands, so there is nothing to link`, fix };
  }
  if (configDir === null) {
    return { label, verdict: 'warn', detail: 'neither CLAUDE_CONFIG_DIR nor HOME is set, so no config directory can be read', fix };
  }

  const target = path.join(configDir, 'commands', 'spec');
  const missing = required.filter((name) => !fs.existsSync(path.join(target, name)));
  if (missing.length === 0) {
    return { label, verdict: 'ok', detail: `${required.length} of ${required.length} present in ${target}/` };
  }
  const names = missing.map((name) => name.slice(0, -'.md'.length)).join(', ');
  return {
    label,
    verdict: 'fail',
    detail: `${target}/ is missing ${names} — the bare /spec:propose and /spec:apply the waybills name cannot resolve`,
    fix,
  };
}

/** What to run to authenticate each forge CLI. Placeholders, never values. */
const LOGIN_FIX = {
  gh: 'gh auth login',
  glab: 'glab auth login --hostname <your-self-hosted-host>',
};

/** What to run to install each forge CLI. */
const INSTALL_FIX = { gh: 'brew install gh', glab: 'brew install glab' };

/** What each forge CLI opens, for the detail line. */
const REQUEST = { gh: 'a PR', glab: 'an MR' };

/**
 * @typedef {{present:boolean, authed:boolean, host:string|null, status:number|null,
 *            problem:string|null}} Forge
 */

/**
 * Three independent questions about one forge CLI: present, authenticated, host-configured.
 *
 * The auth probe goes through {@link probeStatus}, so neither stream can reach a rendered line.
 * Only `glab config get host` is read for its output, and that prints a hostname.
 *
 * @param {'gh'|'glab'} name
 * @returns {Forge}
 */
function probeForge(name) {
  const auth = probeStatus(name, ['auth', 'status'], AUTH_TIMEOUT_MS);
  if (auth.state === 'absent') return { present: false, authed: false, host: null, status: null, problem: null };
  if (auth.state === 'error') {
    return { present: true, authed: false, host: null, status: null, problem: auth.reason };
  }

  const authed = auth.status === 0;
  let host = null;
  if (name === 'glab' && authed) {
    const config = probeOutput('glab', ['config', 'get', 'host'], QUERY_TIMEOUT_MS);
    if (config.state === 'ran' && config.status === 0) host = config.stdout.trim() || null;
  }
  return { present: true, authed, host, status: auth.status, problem: null };
}

/**
 * One row for one forge CLI.
 *
 * An absent CLI on a machine that has the other one is a *choice*, so it is `info`; a present but
 * broken one is a misconfiguration someone will hit, so it is `warn`. With no healthy forge
 * anywhere the broken one is a `fail`, because nothing can open a review at all.
 *
 * @param {'gh'|'glab'} name
 * @param {Forge} forge
 * @param {boolean} anyHealthy
 * @returns {Check}
 */
function forgeRow(name, forge, anyHealthy) {
  if (!forge.present) {
    return { label: name, verdict: 'info', detail: 'not installed — not needed unless you ship to it' };
  }
  if (forge.problem !== null) {
    return {
      label: name,
      verdict: anyHealthy ? 'warn' : 'fail',
      detail: `present, but \`${name} auth status\` ${forge.problem}`,
      fix: LOGIN_FIX[name],
    };
  }
  if (!forge.authed) {
    return {
      label: name,
      verdict: anyHealthy ? 'warn' : 'fail',
      detail: `present, but \`${name} auth status\` exited ${forge.status} — the review leg cannot open ${REQUEST[name]}`,
      fix: LOGIN_FIX[name],
    };
  }
  return { label: name, verdict: 'ok', detail: 'authenticated' };
}

/**
 * The host row, and only for `glab`.
 *
 * A `glab` authenticated against `gitlab.com` on a self-hosted org is a *worse* state than an
 * unauthenticated one: it looks green while pointing nowhere useful. `gh` needs no equivalent —
 * `github.com` is where waybill's own repo lives and is the right answer there.
 *
 * @param {Forge} glab
 * @returns {Check}
 */
function glabHostRow(glab) {
  const label = 'glab host';
  const fix = 'glab config set -g host <your-self-hosted-host>';
  if (!glab.authed) {
    return { label, verdict: 'warn', detail: 'not read — `glab auth status` did not pass, so the host answers for nothing', fix };
  }
  if (glab.host === null) {
    return { label, verdict: 'warn', detail: 'no host configured — work GitLab is self-hosted, so gitlab.com is not it', fix };
  }
  if (glab.host === 'gitlab.com') {
    return { label, verdict: 'warn', detail: 'gitlab.com — work GitLab is self-hosted, so this points nowhere useful', fix };
  }
  return { label, verdict: 'ok', detail: glab.host };
}

/**
 * Check 5 — forge CLI health, as one row per CLI plus a host row when `glab` is present.
 *
 * At least one healthy forge satisfies the composite, so a personal machine carrying only `gh` is
 * a healthy machine. Neither present is a single `fail` naming both install commands, because the
 * review leg then has no forge at all.
 *
 * @returns {Check[]}
 */
export function checkForges() {
  const gh = probeForge('gh');
  const glab = probeForge('glab');

  if (!gh.present && !glab.present) {
    return [
      {
        label: 'forge CLI',
        verdict: 'fail',
        detail: 'neither `gh` nor `glab` is on PATH — the review leg has no forge to open a request with',
        fix: `${INSTALL_FIX.gh} — or ${INSTALL_FIX.glab}, whichever this machine ships to`,
      },
    ];
  }

  const anyHealthy = (gh.present && gh.authed) || (glab.present && glab.authed);
  const rows = [forgeRow('gh', gh, anyHealthy), forgeRow('glab', glab, anyHealthy)];
  if (glab.present) rows.push(glabHostRow(glab));
  return rows;
}

/**
 * Check 6 — which bookings overlay is in force. **Never fails the run.**
 *
 * An absent `~/.waybill/bookings` is the steady state on a personal machine — that is the whole
 * point of the extension point — and a doctor that cries wolf about it stops being run. A
 * *malformed* overlay is the one exception: `resolveBookings` throws on an unknown leg or two files
 * claiming one, which breaks every `/waybill:*` command. That is still a `warn` rather than a
 * `fail`, because doctor has to stay runnable on the machine it is diagnosing.
 *
 * @param {string} cwd
 * @returns {Check}
 */
export function checkBookings(cwd) {
  const label = 'bookings';
  const configured = configuredBookingsDir(cwd);
  if (configured === null) {
    return { label, verdict: 'info', detail: 'no overlay in force — the stock route applies' };
  }

  // The same anchor `resolveBookings` uses, so the path reported is the path read.
  const dir = path.resolve(checkoutRoot(cwd) ?? cwd, configured);
  if (!fs.existsSync(dir)) {
    return { label, verdict: 'info', detail: `configured at ${dir}, which does not exist yet — the stock route applies` };
  }

  /** @type {Map<string, import('./bookings.js').Booking>} */
  let bookings;
  try {
    bookings = resolveBookings(cwd, KNOWN_LEGS);
  } catch (error) {
    return {
      label,
      verdict: 'warn',
      detail: `overlay at ${dir} could not be read: ${error.message.split('\n')[0]}`,
      fix: 'fix or remove that overlay file — until then every /waybill:* command fails the same way',
    };
  }

  const prefix = dir + path.sep;
  const rebooked = [...bookings.values()].filter((booking) => booking.path.startsWith(prefix)).length;
  return { label, verdict: 'info', detail: `overlay in force: ${dir} (${rebooked} legs rebooked)` };
}

/**
 * The Claude Code configuration directory, read from `env` rather than `os.homedir()` so a test can
 * relocate it. Assumption 1 of check 7: `CLAUDE_CONFIG_DIR` when set and non-blank, otherwise
 * `<HOME>/.claude`; with neither, there is no answer.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
export function configDir(env) {
  const explicit = env.CLAUDE_CONFIG_DIR;
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
  const home = env.HOME;
  if (typeof home === 'string' && home.trim() !== '') return path.join(home.trim(), '.claude');
  return null;
}

/**
 * @typedef {{version: string, installPath: string}|{problem: string}} Manifest
 */

/**
 * What `installed_plugins.json` says about this plugin, or which assumption failed.
 *
 * The manifest is read rather than the cache directory globbed, because the cache's version
 * segment is not reliably a version — `cache/claude-plugins-official/frontend-design/022b3c274938/`
 * is a content hash, and that plugin has eight such directories side by side. A glob would have to
 * guess which one is current; the manifest states it. Never throws.
 *
 * @param {string} dir the config directory
 * @returns {Manifest}
 */
function readInstalledPlugins(dir) {
  const file = path.join(dir, 'plugins', 'installed_plugins.json');

  /** @type {string} */
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { problem: `no ${file}` };
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { problem: `${file} does not parse as JSON` };
  }
  if (parsed === null || typeof parsed !== 'object') return { problem: `${file} is not a JSON object` };
  if (parsed.version !== 2) {
    return { problem: `${file} declares schema version ${JSON.stringify(parsed.version)}, and only 2 is understood` };
  }
  if (parsed.plugins === null || typeof parsed.plugins !== 'object') {
    return { problem: `${file} carries no \`plugins\` object` };
  }

  const key = Object.keys(parsed.plugins).find((name) => name.split('@')[0] === 'waybill');
  if (key === undefined) return { problem: `no waybill entry in ${file}` };

  const entry = parsed.plugins[key]?.[0];
  if (!entry || typeof entry.version !== 'string' || typeof entry.installPath !== 'string') {
    return { problem: `the \`${key}\` entry in ${file} names no version and installPath` };
  }
  return { version: entry.version, installPath: entry.installPath };
}

/**
 * Check 7 — what the plugin cache holds, and whether this CLI is the same thing.
 *
 * Every miss is a `warn` carrying the literal words *cannot locate plugin cache*, never a green
 * check: the layout is an undocumented Claude Code internal, and a release that reorganised it
 * would otherwise turn every machine's doctor red overnight — doctor failing rather than the
 * machine. Skew is a `warn` for a second reason: between shipping doctor and the release carrying
 * it, the working tree legitimately runs ahead of the cache.
 *
 * @param {Manifest} manifest
 * @param {string} version this CLI's own `package.json` version
 * @returns {Check}
 */
function checkPluginCache(manifest, version) {
  const label = 'plugin cache';
  if ('problem' in manifest) {
    return {
      label,
      verdict: 'warn',
      detail: `cannot locate plugin cache — ${manifest.problem}`,
      fix: '/plugin install waybill@tinetti, then re-run',
    };
  }
  if (manifest.version !== version) {
    return {
      label,
      verdict: 'warn',
      detail: `plugin cache is at ${manifest.version}, this CLI is ${version} — every /waybill:* command runs the cached copy`,
      fix: '/plugin update waybill@tinetti',
    };
  }
  return { label, verdict: 'ok', detail: `${manifest.version} at ${manifest.installPath}` };
}

/**
 * The second, cheap half of check 7: which `waybill` a terminal would actually run.
 *
 * Answered from `env.PATH` with `fs.existsSync` rather than a `which` subprocess. A binary resolving
 * inside the plugin cache is the `wyb`-does-not-resolve gap in one line; not finding one at all is
 * `info`, since a machine that only ever uses the slash commands never needs it.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cliPath this CLI's own entry point
 * @param {string|null} cacheRoot `<configDir>/plugins/cache`, or null when there is no config dir
 * @returns {Check}
 */
export function checkWaybillOnPath(env, cliPath, cacheRoot) {
  const label = 'waybill';
  const found = (env.PATH ?? '')
    .split(path.delimiter)
    .filter((entry) => entry !== '')
    .map((entry) => path.join(entry, 'waybill'))
    .find((file) => fs.existsSync(file));

  if (found === undefined) {
    return { label, verdict: 'info', detail: `not on PATH — this CLI: ${cliPath}` };
  }
  if (cacheRoot !== null && (found === cacheRoot || found.startsWith(cacheRoot + path.sep))) {
    return {
      label,
      verdict: 'warn',
      detail: `${found} resolves inside the plugin cache, so a terminal runs the cached copy, not this one`,
      fix: 'npm link, run from the waybill working tree',
    };
  }
  return { label, verdict: 'info', detail: `${found} — this CLI: ${cliPath}` };
}

/**
 * Run one probe, converting an unexpected throw into a `warn`.
 *
 * A diagnostic that dies on the machine it is diagnosing is worthless, so one broken probe costs
 * its own row and nothing else.
 *
 * @param {string} label
 * @param {() => Check|Check[]} probe
 * @returns {Check[]}
 */
function guard(label, probe) {
  try {
    const result = probe();
    return Array.isArray(result) ? result : [result];
  } catch (error) {
    return [
      {
        label,
        verdict: 'warn',
        detail: `this check threw: ${error.message.split('\n')[0]}`,
        fix: 'report this — a probe that throws is a bug in doctor, not a fault on this machine',
      },
    ];
  }
}

/**
 * Every check, in report order, plus the version the report is headed with.
 *
 * `env` is a parameter defaulting to the live `process.env` rather than being snapshotted at module
 * load, so `withEnv` can relocate `HOME` and `CLAUDE_CONFIG_DIR` around a call.
 *
 * @param {string} cwd used only to resolve the bookings overlay in force
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{version: string, checks: Check[]}}
 */
export function runChecks(cwd, env = process.env) {
  const pkg = packageInfo();
  const dir = configDir(env);
  const manifest = dir === null
    ? { problem: 'neither CLAUDE_CONFIG_DIR nor HOME is set, so no config directory can be read' }
    : readInstalledPlugins(dir);
  const cacheRoot = dir === null ? null : path.join(dir, 'plugins', 'cache');
  const cliPath = path.join(PLUGIN_ROOT, 'src', 'cli.js');

  return {
    version: pkg.version,
    checks: [
      ...guard('node', () => checkNode(process.versions.node, pkg.engines?.node)),
      ...guard('git', () => checkGit()),
      ...guard('openspec', () => checkOpenspec()),
      ...guard('spec commands', () => checkSpecCommands(dir)),
      ...guard('forge CLI', () => checkForges()),
      ...guard('plugin cache', () => checkPluginCache(manifest, pkg.version)),
      ...guard('bookings', () => checkBookings(cwd)),
      ...guard('waybill', () => checkWaybillOnPath(env, cliPath, cacheRoot)),
    ],
  };
}

/**
 * The status column. All four are four characters wide, so the column needs no padding of its own
 * and the eye can scan it; uppercase for the two that want attention, lowercase for the two that
 * do not.
 */
const BADGE = { ok: 'ok  ', warn: 'WARN', fail: 'FAIL', info: 'info' };

/**
 * The report: one aligned row per check, each remediation on its own continuation line directly
 * beneath the row it belongs to.
 *
 * The label column is padded to the widest label computed from the data, the same construction
 * `routeLines` uses in `src/help.js` — and counted with `[...text].length` there too, because the
 * details carry em dashes. The footer is a count rather than a verdict sentence, except for the
 * all-clear case: `all clear` is the string a human greps for.
 *
 * @param {Check[]} checks
 * @param {string} version
 * @returns {string}
 */
export function renderDoctor(checks, version) {
  const width = checks.length === 0 ? 0 : Math.max(...checks.map((check) => [...check.label].length));
  const pad = (text) => text + ' '.repeat(width - [...text].length);
  // Two spaces, the four-character badge, two spaces: where a `fix:` line starts, so a copy-paste
  // picks up the command and nothing else.
  const indent = ' '.repeat(8);

  const rows = checks.flatMap((check) => {
    const row = `  ${BADGE[check.verdict] ?? BADGE.info}  ${pad(check.label)}  ${check.detail}`;
    return check.fix === undefined ? [row] : [row, `${indent}fix: ${check.fix}`];
  });

  const failed = checks.filter((check) => check.verdict === 'fail').length;
  const warned = checks.filter((check) => check.verdict === 'warn').length;
  const footer =
    failed === 0 && warned === 0
      ? 'all clear'
      : `${failed} failed, ${warned} warned — ${
          failed > 0
            ? 'fix the FAIL rows above, then re-run `waybill doctor`'
            : 'nothing is broken; the WARN rows say what doctor could not see'
        }`;

  return `${[`waybill doctor — ${version}`, '', ...rows, '', footer].join('\n')}\n`;
}
