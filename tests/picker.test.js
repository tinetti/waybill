import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bayCandidates, rankBranches } from '../src/picker.js';
import { gatherSignals, historyBranches } from '../src/signals.js';
import { addWorktree, cleanupAll, createRepo, git, stubBin, tempRoot, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

/** No shell to read anything from — the shape every CLI test runs under. */
const QUIET = { tmux: null, history: [] };

/**
 * Three candidates in the order `bayCandidates` returns them: no bay first, then bays.
 *
 * @returns {import('../src/picker.js').Candidate[]}
 */
function candidates() {
  return [
    { branch: 'feat/session-handover', bay: null },
    { branch: 'fix/stamp_scoping', bay: null },
    { branch: 'ideation/fleet-view', bay: '/repo/.claude/worktrees/repo-ideation-fleet-view' },
  ];
}

/** Everything a real ref check would accept, so the ranking rules can be tested without git. */
const ANY_REF = { base: 'main', repoName: 'waybill', isValidBranch: () => true };

/** @param {Partial<import('../src/signals.js').TmuxNames>} names */
const tmux = (names) => ({ session: '', window: '', pane: '', ...names });

const branches = (rows) => rows.map((row) => row.branch);

describe('historyBranches', () => {
  it('reads the branch out of every command that names one, most recent first', () => {
    const text = [
      'git checkout -b feat/one',
      'git switch -c feat/two origin/main',
      'git branch feat/three',
      'git worktree add ../bays/x -b feat/four',
      'waybill bay feat/five',
      'wyb bay --bay-dir ../bays feat/six',
      'git checkout feat/seven',
      'git switch feat/eight',
    ].join('\n');

    assert.deepEqual(historyBranches(text), [
      'feat/eight',
      'feat/seven',
      'feat/six',
      'feat/five',
      'feat/four',
      'feat/three',
      'feat/two',
      'feat/one',
    ]);
  });

  it("strips zsh's extended-history prefix, which would otherwise hide the `git` word", () => {
    assert.deepEqual(historyBranches(': 1757500000:0;git checkout -b feat/zsh\n'), ['feat/zsh']);
  });

  it('finds a branch inside a chained command, and in quotes', () => {
    const text = 'cd ~/src/app && git switch -c "feat/chained" ; make\n';
    assert.deepEqual(historyBranches(text), ['feat/chained']);
  });

  it('counts a branch once, at its most recent mention', () => {
    const text = 'git checkout feat/a\ngit checkout feat/b\ngit checkout feat/a\n';
    assert.deepEqual(historyBranches(text), ['feat/a', 'feat/b']);
  });

  it('ignores deletions, renames and flags — none of them is a branch being worked on', () => {
    const text = [
      'git branch -D feat/deleted',
      'git branch -m feat/renamed',
      'git checkout -- src/file.js',
      'git switch -',
      'git status',
      'git branch',
    ].join('\n');
    assert.deepEqual(historyBranches(text), []);
  });
});

describe('rankBranches', () => {
  it("leaves bayCandidates' order alone, with no reasons, when the shell says nothing", () => {
    const rows = rankBranches(candidates(), QUIET, ANY_REF);

    assert.deepEqual(branches(rows), branches(candidates()));
    assert.deepEqual(
      rows.map((row) => row.reason),
      [null, null, null],
    );
    assert.equal(rows.some((row) => row.isNew), false);
  });

  it('promotes a branch named in shell history, and says so', () => {
    const rows = rankBranches(candidates(), { tmux: null, history: ['ideation/fleet-view'] }, ANY_REF);

    assert.equal(rows[0].branch, 'ideation/fleet-view');
    assert.equal(rows[0].reason, 'shell history');
    assert.deepEqual(branches(rows.slice(1)), ['feat/session-handover', 'fix/stamp_scoping']);
  });

  it('orders history matches by recency', () => {
    const history = ['fix/stamp_scoping', 'ideation/fleet-view'];
    const rows = rankBranches(candidates(), { tmux: null, history }, ANY_REF);

    assert.deepEqual(branches(rows), ['fix/stamp_scoping', 'ideation/fleet-view', 'feat/session-handover']);
  });

  it("matches a tmux name to a branch's last segment, ignoring case, spaces, `-` and `_`", () => {
    const rows = rankBranches(candidates(), { tmux: tmux({ window: 'Stamp Scoping' }), history: [] }, ANY_REF);

    assert.equal(rows[0].branch, 'fix/stamp_scoping');
    assert.equal(rows[0].reason, 'tmux window "Stamp Scoping"');
  });

  it('matches a tmux name to the whole branch flattened to a slug, the way bay directories are', () => {
    const rows = rankBranches(candidates(), { tmux: tmux({ session: 'ideation-fleet-view' }), history: [] }, ANY_REF);

    assert.equal(rows[0].branch, 'ideation/fleet-view');
    assert.equal(rows[0].reason, 'tmux session "ideation-fleet-view"');
  });

  it('ranks the tmux window over shell history, history over the session, the session over the pane', () => {
    const signals = {
      tmux: tmux({ window: 'session-handover', session: 'fleet-view', pane: 'stamp-scoping' }),
      history: ['fix/stamp_scoping', 'ideation/fleet-view'],
    };
    // History outranks the session, so fleet-view is carried by history rather than by tmux; the
    // best signal a branch has is the one it is ranked and labelled by.
    const rows = rankBranches(candidates(), signals, ANY_REF);

    assert.deepEqual(
      rows.map((row) => [row.branch, row.reason]),
      [
        ['feat/session-handover', 'tmux window "session-handover"'],
        ['fix/stamp_scoping', 'shell history'],
        ['ideation/fleet-view', 'shell history'],
      ],
    );

    const noHistory = rankBranches(candidates(), { ...signals, history: [] }, ANY_REF);
    assert.deepEqual(
      noHistory.map((row) => row.reason),
      ['tmux window "session-handover"', 'tmux session "fleet-view"', 'tmux pane "stamp-scoping"'],
    );
  });

  it('suggests a new branch from the tmux window when no existing branch matches anything', () => {
    const rows = rankBranches(candidates(), { tmux: tmux({ window: 'Bay Picker' }), history: [] }, ANY_REF);

    assert.deepEqual(rows[0], {
      branch: 'feat/bay-picker',
      bay: null,
      isNew: true,
      reason: 'tmux window "Bay Picker"',
    });
    assert.deepEqual(branches(rows.slice(1)), branches(candidates()));
  });

  it('keeps a window that already names a prefix, rather than stacking `feat/` on top of it', () => {
    const rows = rankBranches([], { tmux: tmux({ window: 'fix/flaky-clock' }), history: [] }, ANY_REF);
    assert.equal(rows[0].branch, 'fix/flaky-clock');
  });

  it('suggests nothing new once an existing branch matched, even on a weaker signal', () => {
    const signals = { tmux: tmux({ window: 'bay-picker' }), history: ['fix/stamp_scoping'] };
    const rows = rankBranches(candidates(), signals, ANY_REF);

    assert.equal(rows.some((row) => row.isNew), false);
    assert.equal(rows[0].branch, 'fix/stamp_scoping');
  });

  it('never suggests a new branch from shell history — a `checkout -b` since deleted is history', () => {
    const rows = rankBranches(candidates(), { tmux: null, history: ['feat/long-gone'] }, ANY_REF);
    assert.equal(rows.some((row) => row.isNew), false);
  });

  it("refuses window names tmux or a program chose, the repository's own, and the trunk's", () => {
    for (const window of ['zsh', 'bash', 'node', 'claude', 'nvim', '2', '2.1.14', 'Waybill', 'main', '']) {
      const rows = rankBranches(candidates(), { tmux: tmux({ window }), history: [] }, ANY_REF);
      assert.equal(rows.some((row) => row.isNew), false, `suggested a branch from window "${window}"`);
    }
  });

  it('refuses a suggestion git would not accept as a branch name', () => {
    const options = { ...ANY_REF, isValidBranch: (name) => name !== 'feat/bay-picker' };
    const rows = rankBranches(candidates(), { tmux: tmux({ window: 'bay-picker' }), history: [] }, options);
    assert.equal(rows.some((row) => row.isNew), false);

    const weird = rankBranches(candidates(), { tmux: tmux({ window: 'what?*' }), history: [] }, ANY_REF);
    assert.equal(weird.some((row) => row.isNew), false);
  });
});

describe('bayCandidates', () => {
  it('lists every local branch but the trunk, branches without a bay first, in git order', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/a-with-bay');
    git(repo, ['branch', 'feat/z-no-bay']);
    git(repo, ['branch', 'feat/b-no-bay']);

    assert.deepEqual(bayCandidates(repo), [
      { branch: 'feat/b-no-bay', bay: null },
      { branch: 'feat/z-no-bay', bay: null },
      { branch: 'feat/a-with-bay', bay },
    ]);
  });

  it('answers the same from inside a bay as from the trunk', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/a');

    assert.deepEqual(bayCandidates(bay), bayCandidates(repo));
  });

  it('treats a bay whose directory is gone as no bay at all', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/gone');
    fs.rmSync(bay, { recursive: true, force: true });

    assert.deepEqual(bayCandidates(repo), [{ branch: 'feat/gone', bay: null }]);
  });

  it('leaves out a branch the main checkout has checked out — git will not give it a bay', () => {
    const repo = createRepo();
    git(repo, ['branch', 'feat/other']);
    git(repo, ['checkout', '-b', 'feat/here']);

    assert.deepEqual(bayCandidates(repo), [{ branch: 'feat/other', bay: null }]);
  });

  it('is empty in a repository with only its trunk', () => {
    assert.deepEqual(bayCandidates(createRepo()), []);
  });
});

describe('gatherSignals', () => {
  /** An environment with nothing in it but what the case names — never the developer's own. */
  const env = (vars) => ({ PATH: process.env.PATH, ...vars });

  it('reads HISTFILE, zsh extended format included, and reports no tmux outside tmux', () => {
    const file = writeFile(path.join(tempRoot(), 'history'), ': 1:0;git checkout -b feat/x\n');

    assert.deepEqual(gatherSignals(env({ HISTFILE: file })), { tmux: null, history: ['feat/x'] });
  });

  it('falls back to ~/.zsh_history, then ~/.bash_history, when HISTFILE is not exported', () => {
    const home = tempRoot();
    writeFile(path.join(home, '.bash_history'), 'git switch -c feat/bash\n');
    assert.deepEqual(gatherSignals(env({ HOME: home })).history, ['feat/bash']);

    writeFile(path.join(home, '.zsh_history'), ': 1:0;git switch -c feat/zsh\n');
    assert.deepEqual(gatherSignals(env({ HOME: home })).history, ['feat/zsh']);
  });

  it('reads only the tail of a long history, so an old mention cannot outrank the present', () => {
    const lines = ['git checkout -b feat/ancient', ...Array.from({ length: 600 }, () => 'ls')];
    const file = writeFile(path.join(tempRoot(), 'history'), `${lines.join('\n')}\n`);

    assert.deepEqual(gatherSignals(env({ HISTFILE: file })).history, []);
  });

  it('is silent, not failing, when no history file exists anywhere', () => {
    assert.deepEqual(gatherSignals(env({ HOME: tempRoot() })), QUIET);
  });

  it("asks tmux for this pane's session, window and pane title when TMUX is set", () => {
    const bin = stubBin('tmux', 'printf "waybill\\tBay Picker\\thost.local\\n"');
    const signals = gatherSignals(env({ TMUX: '/tmp/tmux-1/default,1,0', TMUX_PANE: '%1', PATH: bin, HOME: tempRoot() }));

    assert.deepEqual(signals.tmux, { session: 'waybill', window: 'Bay Picker', pane: 'host.local' });
  });

  it('reports no tmux when tmux itself fails', () => {
    const bin = stubBin('tmux', 'exit 1');
    const signals = gatherSignals(env({ TMUX: '/tmp/tmux-1/default,1,0', PATH: bin, HOME: tempRoot() }));

    assert.equal(signals.tmux, null);
  });
});
