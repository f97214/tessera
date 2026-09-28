import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWorkspaceGitDecorations } from '../src/lib/workspace-files/workspace-git-decorations';
import type { GitChangedFile, GitFileState } from '../src/types/git';

function file(path: string, state: GitFileState = 'modified', previousPath?: string): GitChangedFile {
  return { path, state, previousPath, displayStatus: 'M', indexStatus: ' ', workTreeStatus: 'M', staged: false, unstaged: true };
}

function build(changedFiles: GitChangedFile[], workspaceRoot = '/repo', repoRoot = '/repo', truncated = false) {
  return buildWorkspaceGitDecorations({ changedFiles, workspaceRoot, repoRoot, truncated });
}

test('marks files and unloaded ancestor directories with deterministic conflict priority', () => {
  const changes = [file('src/a.ts', 'added'), file('src/deep/b.ts'), file('src/deep/conflict.ts', 'conflicted')];
  for (const entries of [changes, [...changes].reverse()]) {
    const result = build(entries);
    assert.equal(result.files.get('src/a.ts')?.badge, 'A');
    assert.equal(result.directories.get('src')?.state, 'conflicted');
    assert.equal(result.directories.get('src/deep')?.state, 'conflicted');
    assert.equal(result.files.has('src/untouched.ts'), false);
    assert.equal(result.partial, false);
  }
});

test('nested workspace excludes sibling prefix collisions and strips the repository prefix', () => {
  const result = build([
    file('packages/app/src/a.ts'), file('packages/application/src/b.ts'), file('README.md'),
  ], '/repo/packages/app/');
  assert.deepEqual([...result.files.keys()], ['src/a.ts']);
  assert.deepEqual([...result.directories.keys()], ['src']);
  assert.equal(result.scopeKnown, true);
  assert.equal(build([file('a.ts')], '/repository').scopeKnown, false);
});

test('Windows roots are case insensitive and support backslash separators', () => {
  const result = build([file('Packages/App/src/a.ts')], 'c:\\repo\\packages\\app', 'C:/REPO/');
  assert.deepEqual([...result.files.keys()], ['src/a.ts']);
  assert.equal(build([file('a.ts')], 'D:/repo', 'C:/repo').scopeKnown, false);
});

test('drive mount and Windows native spelling identify the same workspace', () => {
  assert.deepEqual([...build([file('app/a.ts')], 'C:\\repo\\app', '/mnt/c/repo').files.keys()], ['a.ts']);
  assert.deepEqual([...build([file('app/a.ts')], '/mnt/c/repo/app', 'C:/repo').files.keys()], ['a.ts']);
});

test('WSL UNC roots match Linux Git output without losing Linux case sensitivity', () => {
  for (const host of ['wsl.localhost', 'wsl$']) {
    const result = build([file('app/a.ts')], `\\\\${host}\\Ubuntu-24.04\\home\\work\\repo\\app`, '/home/work/repo');
    assert.deepEqual([...result.files.keys()], ['a.ts']);
  }
  assert.equal(build([file('a.ts')], '\\\\wsl.localhost\\Ubuntu-24.04\\home\\work\\Repo', '/home/work/repo').scopeKnown, false);
  assert.equal(build([file('a.ts')], '/home/work/Repo', '/home/work/repo').scopeKnown, false);
});

test('different explicit WSL distributions cannot decorate each other', () => {
  const result = build([file('a.ts')], '\\\\wsl.localhost\\Ubuntu-24.04\\repo', '\\\\wsl$\\Debian\\repo');
  assert.equal(result.scopeKnown, false);
  assert.equal(result.files.size, 0);
});

test('renames decorate old ancestors but copies do not mark their source', () => {
  const result = build([
    file('new/name.ts', 'renamed', 'old/nested/name.ts'),
    file('copies/name.ts', 'copied', 'original/name.ts'),
    file('removed/gone.ts', 'deleted'),
  ]);
  assert.equal(result.files.get('new/name.ts')?.badge, 'R');
  assert.equal(result.directories.get('old/nested')?.state, 'deleted');
  assert.equal(result.directories.get('old')?.state, 'deleted');
  assert.equal(result.files.has('old/nested/name.ts'), false);
  assert.equal(result.directories.has('original'), false);
  assert.equal(result.directories.get('removed')?.state, 'deleted');
});

test('renaming out of a nested workspace still marks its original parent', () => {
  const result = build([file('outside/new.ts', 'renamed', 'app/src/old.ts')], '/repo/app');
  assert.equal(result.files.size, 0);
  assert.equal(result.directories.get('src')?.state, 'deleted');
});

test('preserves literal backslashes, spaces and non-ASCII Git filenames', () => {
  const paths = ['src/literal\\name.ts', 'src/ 한글 .ts', 'src/untracked.ts'];
  const result = build(paths.map((path) => file(path, 'untracked')));
  assert.deepEqual([...result.files.keys()], paths);
  assert.equal(result.files.get(paths[2])?.badge, 'U');
  assert.deepEqual([...result.directories.keys()], ['src']);
});

test('partial lists remain partial and invalid or out-of-scope paths produce no markers', () => {
  const result = build([file('src/a.ts'), file('../escape.ts'), file('/absolute.ts'), file('src//bad.ts')], '/repo', '/repo', true);
  assert.equal(result.partial, true);
  assert.deepEqual([...result.files.keys()], ['src/a.ts']);
  assert.equal(build([], 'relative/path').scopeKnown, false);
  assert.equal(build([], '/repo-other').scopeKnown, false);
});

test('filesystem root and dot segments compare at directory boundaries', () => {
  const result = build([file('home/work/a.ts')], '/home/work/./', '/');
  assert.deepEqual([...result.files.keys()], ['a.ts']);
  assert.deepEqual([...build([file('src/a.ts')], '/repo/sub/../').files.keys()], ['src/a.ts']);
});
