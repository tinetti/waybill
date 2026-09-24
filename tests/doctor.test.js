import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkNode, checkSpecCommands, renderDoctor, runChecks } from '../src/doctor.js';
import { run } from '../src/cli.js';
import {
  cleanupAll,
  createRepo,
  pathWithout,
  stubBin,
  tempRoot,
  withEnv,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';

after(cleanupAll);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SPEC_COMMANDS = fs.readdirSync(path.join(ROOT, 'commands', 'spec')).filter((n) => n.endsWith('.md'));

/**
 * The first directory on the real `PATH` holding `name`, so a synthetic `PATH` can keep one real
 * binary reachable. `git` in particular must stay reachable in every case that exercises check 6:
 * `configuredBookingsDir` shells out to `git config`.
 *
 * @param {string} name
 * @returns {string}
 */
function dirOf(name) {
  const found = (process.env.PATH ?? '')
    .split(path.delimiter)
    .find((entry) => entry !== '' && fs.existsSync(path.join(entry, name)));
  assert.ok(found, `no \`${name}\` on PATH — this suite needs one`);
  return found;
}

/** Everything a synthetic `PATH` needs to stay usable: the running node, and the real git. */
const BASELINE = [path.dirname(process.execPath), dirOf('git')];

/**
 * A `PATH` built from stub directories plus the baseline, rather than chained `pathWithout` calls.
 * A synthetic path is the only hermetic way to assert "neither forge CLI present" on a developer
 * machine that has both.
 *
 * @param {...string} dirs
 * @returns {string}
 */
const synthetic = (...dirs) => [...dirs, ...BASELINE].join(path.delimiter);

/** A `glab` stub dispatching on `"$1 $2"`, as the real CLI's two sub-commands are spelled. */
const glabStub = ({ auth = 0, host = 'gitlab.example-corp.net' } = {}) =>
  stubBin(
    'glab',
    [
      'case "$1 $2" in',
      `  "auth status") exit ${auth} ;;`,
      `  "config get") echo "${host}"; exit 0 ;;`,
      '  *) exit 0 ;;',
      'esac',
    ].join('\n'),
  );

const ghStub = (script = 'exit 0') => stubBin('gh', script);
const openspecStub = (version = '1.9.0') => stubBin('openspec', `echo "${version}"; exit 0`);

/**
 * A config directory that satisfies checks 4 and 7: the four `/spec:*` commands linked, and an
 * `installed_plugins.json` naming this CLI's own version.
 *
 * @param {{version?: string, commands?: string[], manifest?: string|null}} [options]
 * @returns {string}
 */
function configDirFixture(options = {}) {
  const { version = PKG.version, commands = SPEC_COMMANDS, manifest } = options;
  const dir = path.join(tempRoot(), 'config');
  for (const name of commands) writeFile(path.join(dir, 'commands', 'spec', name), '# stub\n');
  const file = path.join(dir, 'plugins', 'installed_plugins.json');
  if (manifest === null) fs.mkdirSync(path.dirname(file), { recursive: true });
  else if (manifest !== undefined) writeFile(file, manifest);
  else {
    writeFile(
      file,
      JSON.stringify({
        version: 2,
        plugins: { 'waybill@tinetti': [{ version, installPath: `${dir}/plugins/cache/tinetti/waybill/${version}` }] },
      }),
    );
  }
  return dir;
}

/**
 * Run the CLI with the streams captured. `WAYBILL_BOOKINGS_DIR` is unset unless a case sets one:
 * the fixture module only neutralises `WAYBILL_BAY_DIR`, so an operator's own overlay would
 * otherwise decide what check 6 reports.
 *
 * @param {string[]} argv
 * @param {{cwd?: string, path?: string, env?: Record<string,string|undefined>}} [options]
 * @returns {{code: number, out: string, err: string}}
 */
function cli(argv, options = {}) {
  const cwd = options.cwd ?? tempRoot();
  let out = '';
  let err = '';
  const invoke = () =>
    withEnv({ WAYBILL_BOOKINGS_DIR: undefined, ...options.env }, () =>
      run(argv, {
        cwd,
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
      }),
    );
  const code = options.path === undefined ? invoke() : withPath(options.path, invoke);
  return { code, out, err };
}

/**
 * `waybill doctor` on a machine stubbed healthy: every probed binary answers, the config directory
 * carries the four spec commands, and the manifest agrees with `package.json`.
 *
 * @param {{glab?: object, gh?: string, cwd?: string, config?: object,
 *          env?: Record<string,string|undefined>, extra?: string[]}} [options]
 * @returns {{code: number, out: string, err: string}}
 */
function healthy(options = {}) {
  const config = configDirFixture(options.config);
  const dirs = [openspecStub(), ghStub(options.gh), glabStub(options.glab), ...(options.extra ?? [])];
  return cli(['doctor'], {
    cwd: options.cwd,
    path: synthetic(...dirs),
    env: { CLAUDE_CONFIG_DIR: config, HOME: tempRoot(), ...options.env },
  });
}

describe('checkNode', () => {
  it('fails below the engines minimum, and its fix names the major', () => {
    const check = checkNode('20.11.0', '>=22.0.0');
    assert.equal(check.verdict, 'fail');
    assert.match(check.fix, /22/);
  });

  it('passes at the minimum and above it', () => {
    assert.equal(checkNode('22.0.0', '>=22.0.0').verdict, 'ok');
    assert.equal(checkNode('26.2.0', '>=22.0.0').verdict, 'ok');
  });

  it('warns rather than greening on an engines range it cannot read', () => {
    const check = checkNode('26.2.0', 'weird');
    assert.equal(check.verdict, 'warn');
    assert.ok(check.fix, 'a warn with no remediation recreates the cost doctor exists to remove');
  });
});

describe('renderDoctor', () => {
  it('aligns the statuses and puts each fix on its own line beneath its row', () => {
    const page = renderDoctor(
      [
        { label: 'node', verdict: 'ok', detail: 'v26.2.0' },
        { label: 'spec commands', verdict: 'fail', detail: 'missing apply', fix: 'ln -sf …' },
        { label: 'glab', verdict: 'warn', detail: 'exited 1', fix: 'glab auth login' },
        { label: 'bookings', verdict: 'info', detail: 'no overlay in force' },
      ],
      '0.8.0',
    );
    const lines = page.split('\n');

    for (const [label, badge] of [['node', 'ok  '], ['spec commands', 'FAIL'], ['glab', 'WARN'], ['bookings', 'info']]) {
      const row = lines.find((line) => line.includes(` ${label} `));
      assert.ok(row, `no row for ${label}`);
      assert.equal(row.slice(2, 6), badge, row);
    }

    // The label column is padded to the widest label, so every detail starts at one offset.
    const details = ['v26.2.0', 'missing apply', 'exited 1', 'no overlay in force'].map(
      (detail) => lines.find((line) => line.endsWith(detail)).indexOf(detail),
    );
    assert.equal(new Set(details).size, 1, `details do not align: ${details}`);

    // Each remediation is its own line, directly under the row that owns it, so a copy-paste picks
    // up the command and nothing else.
    for (const [fix, owner] of [['ln -sf …', 'spec commands'], ['glab auth login', 'glab']]) {
      const at = lines.indexOf(`        fix: ${fix}`);
      assert.notEqual(at, -1, `\`${fix}\` is not on a line of its own`);
      assert.ok(lines[at - 1].includes(owner), `\`${fix}\` does not sit under the ${owner} row`);
    }
    assert.equal(lines.filter((line) => line.includes('fix:')).length, 2, 'ok and info rows carry no fix');
  });

  it('does not throw on an empty check list', () => {
    assert.doesNotThrow(() => renderDoctor([], '0.8.0'));
    assert.match(renderDoctor([], '0.8.0'), /^waybill doctor — 0\.8\.0\n/);
  });
});

describe('checkSpecCommands — the remediation it offers', () => {
  /**
   * A plugin root shipping exactly the named commands, so the required set is under the case's
   * control rather than whatever `commands/spec/` happens to hold today.
   *
   * @param {...string} names
   * @returns {string}
   */
  function pluginWith(...names) {
    const root = path.join(tempRoot(), 'plugin');
    fs.mkdirSync(path.join(root, 'commands', 'spec'), { recursive: true });
    for (const name of names) writeFile(path.join(root, 'commands', 'spec', name), '# stub\n');
    return root;
  }

  /** A config directory that does not exist — the state the FAIL is reported for. */
  const absent = () => path.join(tempRoot(), 'no-config');

  it('creates the directory it is about to link into', () => {
    // `ln -sf` does not create a parent, and the FAIL fires precisely when the parent is missing:
    // without `mkdir -p` the remediation fails in the one case it is offered for.
    const check = checkSpecCommands(absent(), pluginWith('propose.md'));

    assert.equal(check.verdict, 'fail');
    assert.ok(check.fix.includes('mkdir -p'), check.fix);
  });

  it('links into the config directory doctor read, not a hardcoded $HOME/.claude', () => {
    // With CLAUDE_CONFIG_DIR set, a fix naming `$HOME/.claude` writes somewhere doctor never
    // looks: the operator runs it and the same FAIL comes back.
    const configured = path.join(tempRoot(), 'elsewhere');
    const check = checkSpecCommands(configured, pluginWith('propose.md'));

    assert.ok(check.fix.includes(path.join(configured, 'commands', 'spec')), check.fix);
    assert.equal(check.fix.includes('$HOME/.claude'), false, check.fix);
  });

  it('names what the source ships rather than four hardcoded words', () => {
    const check = checkSpecCommands(absent(), pluginWith('propose.md', 'vendored.md'));

    assert.match(check.fix, /\bvendored\b/);
    assert.match(check.fix, /\bpropose\b/);
    assert.equal(/\barchive\b/.test(check.fix), false, check.fix);
  });

  it('still offers a remediation before the target and the required set are known', () => {
    // Three early returns fire before both are in hand. A `warn` with no fix recreates the cost
    // doctor exists to remove, and neither may throw.
    const unreadable = checkSpecCommands(absent(), path.join(tempRoot(), 'not-a-plugin'));
    const empty = checkSpecCommands(absent(), pluginWith());
    const noConfig = checkSpecCommands(null, pluginWith('propose.md'));

    for (const check of [unreadable, empty, noConfig]) {
      assert.equal(check.verdict, 'warn');
      assert.ok(check.fix?.includes('mkdir -p'), `${check.detail}: ${check.fix}`);
    }
  });
});

describe('waybill doctor — the gaps, each with its remediation', () => {
  it('reports a missing git, and exits 1', () => {
    const config = configDirFixture();
    const { code, out } = cli(['doctor'], {
      path: [openspecStub(), ghStub(), glabStub(), path.dirname(process.execPath), pathWithout('git')].join(path.delimiter),
      env: { CLAUDE_CONFIG_DIR: config, HOME: tempRoot() },
    });

    assert.equal(code, 1);
    assert.match(out, /^ {2}FAIL {2}git /m);
    assert.ok(/xcode-select --install|brew install git/.test(out), out);
  });

  it('reports a missing openspec, naming the silent fallback and the install', () => {
    const config = configDirFixture();
    const { code, out } = cli(['doctor'], {
      path: [ghStub(), glabStub(), path.dirname(process.execPath), pathWithout('openspec')].join(path.delimiter),
      env: { CLAUDE_CONFIG_DIR: config, HOME: tempRoot() },
    });

    assert.equal(code, 1);
    assert.match(out, /legs 5 and 6 fall back to parsing tasks\.md, silently/);
    assert.ok(out.includes('npm install -g @fission-ai/openspec'), out);
  });

  it('reports an empty spec commands directory, and gives the symlink loop', () => {
    const { code, out } = healthy({ config: { commands: [] } });

    assert.equal(code, 1);
    const fix = out.split('\n').find((line) => line.trim().startsWith('fix: mkdir -p'));
    assert.ok(fix, out);
    assert.ok(fix.includes('ln -sf'), fix);
  });

  it('names exactly which spec commands are missing when the directory is half populated', () => {
    const present = SPEC_COMMANDS.slice(0, 2);
    const missing = SPEC_COMMANDS.slice(2).map((name) => name.slice(0, -'.md'.length));
    const { code, out } = healthy({ config: { commands: present } });

    assert.equal(code, 1);
    // The listed set is extracted rather than substring-matched: the detail also names
    // `/spec:propose` and `/spec:apply`, so a bare `row.includes('apply')` would pass on a check
    // that had listed nothing at all.
    const row = out.split('\n').find((line) => line.includes('spec commands'));
    const listed = /is missing ([^—]+) —/.exec(row);
    assert.ok(listed, `the detail names no missing set: ${row}`);
    assert.deepEqual(listed[1].trim().split(', '), missing);
  });
});

describe('waybill doctor — forge CLI health', () => {
  it('warns on a present but unauthenticated glab rather than calling it absent', () => {
    const { code, out } = healthy({ glab: { auth: 1 } });

    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => / glab {2}/.test(line));
    assert.match(row, /^ {2}WARN/);
    assert.match(row, /present, but `glab auth status` exited 1/);
    assert.ok(out.includes('glab auth login --hostname'), out);
  });

  it('warns separately when glab authenticates against gitlab.com', () => {
    const { out } = healthy({ glab: { auth: 0, host: 'gitlab.com' } });

    const row = out.split('\n').find((line) => line.includes('glab host'));
    assert.match(row, /^ {2}WARN/);
    assert.match(row, /gitlab\.com/);
    assert.ok(out.includes('glab config set -g host'), out);
    // The CLI itself is fine; only the host it points at is wrong.
    assert.match(out.split('\n').find((line) => / glab {2}/.test(line)), /^ {2}ok/);
  });

  it('fails when neither forge CLI is present, naming both installs', () => {
    const config = configDirFixture();
    const { code, out } = cli(['doctor'], {
      path: synthetic(openspecStub()),
      env: { CLAUDE_CONFIG_DIR: config, HOME: tempRoot() },
    });

    assert.equal(code, 1);
    assert.ok(out.includes('brew install gh'), out);
    assert.ok(out.includes('brew install glab'), out);
  });

  it('treats an absent glab beside a healthy gh as info, not a warning', () => {
    const config = configDirFixture();
    const { code, out } = cli(['doctor'], {
      path: [openspecStub(), ghStub(), ...BASELINE, pathWithout('glab')].join(path.delimiter),
      env: { CLAUDE_CONFIG_DIR: config, HOME: tempRoot() },
    });

    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => / glab {2}/.test(line));
    assert.match(row, /^ {2}info/);
    assert.equal(out.includes('glab host'), false, 'an absent glab has no host row');
  });

  it('fails when both forge CLIs are present and both are broken', () => {
    const { code } = healthy({ gh: 'exit 1', glab: { auth: 1 } });

    assert.equal(code, 1);
  });
});

describe('waybill doctor — the bookings overlay', () => {
  it('exits 0 with no overlay configured, and says so as info', () => {
    const { code, out } = healthy();

    assert.equal(code, 0, out);
    assert.match(out, /^ {2}info {2}bookings .*no overlay in force/m);
    assert.equal(out.includes('FAIL'), false, out);
  });

  it('names the overlay and the count of legs it rebooks', () => {
    const dir = path.join(tempRoot(), 'overlay');
    writeFile(
      path.join(dir, 'execute.md'),
      '---\nleg: execute\ncommand: /overlay:apply\nmodel: overlay-model\nstampPath: docs/overlay/*.md\n---\nbody\n',
    );
    const { code, out } = healthy({ env: { WAYBILL_BOOKINGS_DIR: dir } });

    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => line.includes('bookings'));
    assert.match(row, /^ {2}info/);
    assert.ok(row.includes(dir), row);
    assert.match(row, /\(1 legs rebooked\)/);
  });

  it('stays info when the configured overlay directory does not exist yet', () => {
    const dir = path.join(tempRoot(), 'not-created-yet');
    const { code, out } = healthy({ env: { WAYBILL_BOOKINGS_DIR: dir } });

    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => line.includes('bookings'));
    assert.match(row, /^ {2}info/);
    assert.match(row, /does not exist yet/);
  });

  it('warns rather than failing on a malformed overlay, and still renders every other row', () => {
    const dir = path.join(tempRoot(), 'overlay');
    const booking = '---\nleg: execute\ncommand: /overlay:apply\nmodel: m\nstampPath: a.md\n---\nbody\n';
    writeFile(path.join(dir, 'one.md'), booking);
    writeFile(path.join(dir, 'two.md'), booking);
    const { code, out } = healthy({ env: { WAYBILL_BOOKINGS_DIR: dir } });

    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => line.includes('bookings'));
    assert.match(row, /^ {2}WARN/);
    assert.match(row, /duplicate leg/);
    for (const label of ['node', 'git', 'openspec', 'spec commands', 'plugin cache']) {
      assert.ok(out.includes(` ${label} `) || out.includes(` ${label}  `), `no ${label} row`);
    }
  });
});

describe('waybill doctor — the plugin cache', () => {
  /** @param {object} [config] @returns {string} the `plugin cache` row */
  const cacheRow = (config) => {
    const { code, out } = healthy({ config });
    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => line.includes('plugin cache'));
    assert.ok(row, out);
    return row;
  };

  it('cannot locate the cache when the config directory holds no manifest', () => {
    const config = configDirFixture({ manifest: null });
    const { code, out } = cli(['doctor'], {
      path: synthetic(openspecStub(), ghStub(), glabStub()),
      env: { CLAUDE_CONFIG_DIR: config, HOME: tempRoot() },
    });

    assert.equal(code, 0, out);
    const row = out.split('\n').find((line) => line.includes('plugin cache'));
    assert.match(row, /cannot locate plugin cache/);
    assert.equal(row.startsWith('  ok'), false, 'a cache it cannot see must never be a green check');
  });

  it('cannot locate the cache when the manifest is not JSON', () => {
    assert.match(cacheRow({ manifest: 'not json' }), /cannot locate plugin cache/);
  });

  it('cannot locate the cache when the manifest schema version is not 2', () => {
    assert.match(cacheRow({ manifest: '{"version": 3, "plugins": {}}' }), /cannot locate plugin cache/);
  });

  it('cannot locate the cache when no entry is a waybill', () => {
    const manifest = JSON.stringify({
      version: 2,
      plugins: { 'ideation@tinetti': [{ version: '0.15.0', installPath: '/nope' }] },
    });
    assert.match(cacheRow({ manifest }), /cannot locate plugin cache/);
  });

  it('warns on version skew, naming both versions and the update', () => {
    const row = cacheRow({ version: '0.3.1' });
    assert.match(row, /^ {2}WARN/);
    assert.ok(row.includes('0.3.1') && row.includes(PKG.version), row);
    assert.ok(healthy({ config: { version: '0.3.1' } }).out.includes('/plugin update'), 'no update fix');
  });

  it('is ok when the cache and this CLI agree', () => {
    assert.match(cacheRow(), /^ {2}ok/);
  });

  it('cannot locate the cache with HOME and CLAUDE_CONFIG_DIR both unset, and does not throw', () => {
    /** @type {{code:number, out:string}} */
    let result;
    assert.doesNotThrow(() => {
      result = cli(['doctor'], {
        path: synthetic(openspecStub(), ghStub(), glabStub()),
        env: { HOME: undefined, CLAUDE_CONFIG_DIR: undefined },
      });
    });
    assert.match(result.out, /cannot locate plugin cache/);
  });
});

describe('waybill doctor — the constraints', () => {
  it('never prints a token, whichever stream the forge CLI wrote it to', () => {
    const secret = 'ghp_SECRETVALUE0123';
    const { out, err } = healthy({ gh: `echo "Token: ${secret}"; echo "Token: ${secret}" >&2; exit 0` });

    assert.equal(out.includes(secret), false, 'a forge CLI token reached stdout');
    assert.equal(err.includes(secret), false, 'a forge CLI token reached stderr');
  });

  it('exits 0 and says `all clear` on a fully healthy machine', () => {
    const { code, out } = healthy();

    assert.equal(code, 0, out);
    assert.match(out, /^all clear$/m);
    assert.equal(out.includes('FAIL'), false, out);
    assert.equal(out.includes('WARN'), false, out);
  });

  it('gives every fail and every warn a remediation, and gives ok and info none', () => {
    // A row that names a problem and not the command that closes it recreates the whole cost this
    // verb exists to remove — so the rule is asserted over the records rather than trusted.
    const shapes = [
      {
        path: synthetic(openspecStub(), ghStub(), glabStub({ host: 'gitlab.com' })),
        env: { CLAUDE_CONFIG_DIR: configDirFixture({ commands: [], version: '0.3.1' }), HOME: tempRoot() },
      },
      { path: synthetic(), env: { HOME: undefined, CLAUDE_CONFIG_DIR: undefined } },
      {
        path: synthetic(ghStub('exit 1'), glabStub({ auth: 1 })),
        env: { CLAUDE_CONFIG_DIR: configDirFixture(), HOME: tempRoot() },
      },
    ];

    for (const shape of shapes) {
      const checks = withPath(shape.path, () =>
        withEnv({ WAYBILL_BOOKINGS_DIR: undefined, ...shape.env }, () => runChecks(tempRoot()).checks),
      );
      assert.ok(checks.length > 0, 'no checks ran');
      for (const check of checks) {
        const wanted = check.verdict === 'fail' || check.verdict === 'warn';
        assert.equal(check.fix !== undefined, wanted, `${check.verdict} ${check.label}: ${check.detail}`);
      }
    }
  });

  it('rejects an argument with exit 2 and the usage banner on stderr', () => {
    const { code, out, err } = cli(['doctor', '--json']);

    assert.equal(code, 2);
    assert.equal(out, '');
    assert.match(err, /unknown option `--json` for `doctor`/);
    assert.match(err, /^Usage: waybill <command> \[options\]$/m);
  });

  it('answers outside a repository rather than asking for one', () => {
    const { out, err } = healthy({ cwd: tempRoot() });

    assert.equal(out.includes('not inside a git repository'), false, out);
    assert.equal(err, '');
  });

  it('answers inside a repository too, with the same rows', () => {
    const { code, out } = healthy({ cwd: createRepo() });

    assert.equal(code, 0, out);
    assert.match(out, /^all clear$/m);
  });
});
