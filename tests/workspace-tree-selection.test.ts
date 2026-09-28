import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkspaceFileTree } from '../src/lib/workspace-files/workspace-file-tree';
import {
  selectWorkspaceTreePath,
  visibleWorkspaceTreeNodes,
  workspaceSelectionRoots,
  type WorkspaceTreeSelection,
} from '../src/lib/workspace-files/workspace-tree-selection';
import { deleteWorkspaceSelection } from '../src/lib/workspace-files/delete-workspace-selection';

const empty: WorkspaceTreeSelection = { paths: new Set(), anchor: null, primary: null };
const plain = { toggle: false, range: false };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };
const rows = ['src', 'src/a.ts', 'src/b.ts', 'src/c.ts', 'readme.md'];

test('plain selection replaces previous items, modifier toggles preserve independent items', () => {
  let selection = selectWorkspaceTreePath(empty, rows, 'src/a.ts', plain);
  selection = selectWorkspaceTreePath(selection, rows, 'readme.md', toggle);
  assert.deepEqual([...selection.paths], ['src/a.ts', 'readme.md']);
  assert.equal(selection.primary, 'readme.md');
  assert.equal(selection.anchor, 'readme.md');
  selection = selectWorkspaceTreePath(selection, rows, 'readme.md', toggle);
  assert.deepEqual([...selection.paths], ['src/a.ts']);
  assert.equal(selection.primary, null);
  selection = selectWorkspaceTreePath(selection, rows, 'src/b.ts', plain);
  assert.deepEqual([...selection.paths], ['src/b.ts']);
  assert.equal(selection.anchor, 'src/b.ts');
});

test('shift ranges use rendered row order in either direction and retain the original anchor', () => {
  const anchored = selectWorkspaceTreePath(empty, rows, 'src/c.ts', plain);
  const backwards = selectWorkspaceTreePath(anchored, rows, 'src/a.ts', range);
  assert.deepEqual([...backwards.paths], ['src/a.ts', 'src/b.ts', 'src/c.ts']);
  assert.equal(backwards.anchor, 'src/c.ts');
  assert.equal(backwards.primary, 'src/a.ts');
  const forwards = selectWorkspaceTreePath(backwards, rows, 'readme.md', range);
  assert.deepEqual([...forwards.paths], ['src/c.ts', 'readme.md']);
  assert.equal(forwards.anchor, 'src/c.ts');
});

test('modifier plus shift unions a range with the earlier independent selection', () => {
  const anchored = {
    paths: new Set(['readme.md', 'src/a.ts']), anchor: 'src/a.ts', primary: 'src/a.ts',
  };
  const result = selectWorkspaceTreePath(anchored, rows, 'src/c.ts', { toggle: true, range: true });
  assert.deepEqual([...result.paths], ['readme.md', 'src/a.ts', 'src/b.ts', 'src/c.ts']);
  assert.equal(result.anchor, 'src/a.ts');
  assert.deepEqual([...anchored.paths], ['readme.md', 'src/a.ts'], 'the prior selection is immutable');
});

test('a filtered or collapsed anchor cannot select an invisible range', () => {
  const anchored = selectWorkspaceTreePath(empty, rows, 'src/a.ts', plain);
  const visible = ['src', 'readme.md'];
  const result = selectWorkspaceTreePath(anchored, visible, 'readme.md', range);
  assert.deepEqual([...result.paths], ['readme.md']);
  assert.equal(result.anchor, 'readme.md');
});

test('visible rows exclude collapsed descendants while search exposes only the supplied matching tree', () => {
  const tree = buildWorkspaceFileTree(['src/nested/a.ts', 'src/b.ts', 'readme.md'], new Set(), ['empty']);
  const paths = (expanded: string[], searching = false) =>
    visibleWorkspaceTreeNodes(tree, new Set(expanded), searching).map((node) => node.path);
  assert.deepEqual(paths([]), ['empty', 'src', 'readme.md']);
  assert.deepEqual(paths(['src']), ['empty', 'src', 'src/nested', 'src/b.ts', 'readme.md']);
  assert.deepEqual(paths(['src', 'src/nested']), ['empty', 'src', 'src/nested', 'src/nested/a.ts', 'src/b.ts', 'readme.md']);
  assert.deepEqual(paths([], true), paths(['src', 'src/nested']));
  const searchTree = buildWorkspaceFileTree(['src/nested/a.ts'], new Set(), []);
  assert.deepEqual(visibleWorkspaceTreeNodes(searchTree, new Set(), true).map((node) => node.path), ['src', 'src/nested', 'src/nested/a.ts']);
});

test('delete roots remove duplicate and nested entries even when parent is listed after descendants', () => {
  const entries = [
    { path: 'src/deep/a.ts', kind: 'file' as const },
    { path: 'src/deep', kind: 'directory' as const },
    { path: 'src', kind: 'directory' as const },
    { path: 'src-other/keep.ts', kind: 'file' as const },
    { path: 'readme.md', kind: 'file' as const },
    { path: 'readme.md', kind: 'file' as const },
  ];
  assert.deepEqual(workspaceSelectionRoots(entries).map((entry) => entry.path), ['src', 'src-other/keep.ts', 'readme.md']);
  assert.equal(entries.length, 6, 'confirmation input stays immutable');
});

test('bulk delete awaits every item and continues after individual failures', async () => {
  const entries = ['a.ts', 'locked.ts', 'b.ts', 'unknown.ts', 'c.ts'].map((path) => ({ path }));
  const calls: string[] = [];
  let running = 0;
  const result = await deleteWorkspaceSelection(entries, async ({ path }) => {
    assert.equal(running, 0, 'requests must be sequential so each mutation reconciliation finishes');
    running++;
    calls.push(path);
    await Promise.resolve();
    running--;
    if (path === 'locked.ts') throw new Error('Permission denied');
    if (path === 'unknown.ts') throw 'failed';
  });
  assert.deepEqual(calls, entries.map((entry) => entry.path));
  assert.deepEqual(result.deleted, ['a.ts', 'b.ts', 'c.ts']);
  assert.deepEqual(result.failures, [
    { path: 'locked.ts', message: 'Permission denied' },
    { path: 'unknown.ts', message: 'Failed to delete.' },
  ]);
  const retry = entries.filter(({ path }) => result.failures.some((failure) => failure.path === path));
  const retryCalls: string[] = [];
  await deleteWorkspaceSelection(retry, async ({ path }) => { retryCalls.push(path); });
  assert.deepEqual(retryCalls, ['locked.ts', 'unknown.ts'], 'retry input excludes already deleted entries');
});

test('empty bulk deletion completes without any mutation', async () => {
  const result = await deleteWorkspaceSelection([], async () => { assert.fail('no delete request expected'); });
  assert.deepEqual(result, { deleted: [], failures: [] });
});

test('folder deletion detects unsaved descendants without matching sibling prefixes or other workspaces', async () => {
  const { markWorkspaceFileDirty, clearWorkspaceFileDirty, hasUnsavedWorkspaceFileEditsUnder } = await import('../src/lib/workspace-files/workspace-dirty-registry');
  markWorkspaceFileDirty('qa', 'src/deep/draft.ts');
  try {
    assert.equal(hasUnsavedWorkspaceFileEditsUnder('qa', 'src'), true);
    assert.equal(hasUnsavedWorkspaceFileEditsUnder('qa', 'sr'), false);
    assert.equal(hasUnsavedWorkspaceFileEditsUnder('other', 'src'), false);
    assert.equal(hasUnsavedWorkspaceFileEditsUnder(null, 'src'), false);
  } finally {
    clearWorkspaceFileDirty('qa', 'src/deep/draft.ts');
  }
});
