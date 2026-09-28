import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planWorkspaceFileReveal,
  resolveRevealedWorkspacePath,
  scrollWorkspaceFileIntoView,
} from '../src/lib/workspace-files/workspace-file-reveal';
import type { WorkspaceFileRef } from '../src/lib/workspace-tabs/special-session';

const file: WorkspaceFileRef = {
  type: 'workspace-file', sourceSessionId: 'session-a', sourceWorktreeId: 'tree-a',
  kind: 'file', path: 'src/deep/file.ts',
};

test('reveal matches canonical Worktree identity across Session and Worktree editors', () => {
  assert.equal(resolveRevealedWorkspacePath({ kind: 'worktree', id: 'tree-a' }, file), file.path);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-b', worktreeId: 'tree-a' }, file), file.path);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-a', worktreeId: 'tree-b' }, file), null);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'worktree', id: 'tree-b' }, file), null);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-b' }, file), null);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-a' }, file), file.path);
});

test('legacy and Kanban Session refs remain scoped to the source Session', () => {
  const legacy = { ...file, sourceWorktreeId: undefined };
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-a', worktreeId: 'tree-a' }, legacy), file.path);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-b', worktreeId: 'tree-a' }, legacy), null);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'worktree', id: 'tree-a' }, legacy), null);
  assert.equal(resolveRevealedWorkspacePath(null, file), null);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'session', id: 'session-a' }, null), null);
  assert.equal(resolveRevealedWorkspacePath({ kind: 'worktree', id: 'tree-a' }, {
    type: 'worktree-file', sourceWorktreeId: 'tree-a', kind: 'diff', path: file.path,
  }), file.path);
});

test('lazy refreshes preserve pending reveal without expanding again or overriding manual cancellation', () => {
  const options = { workspaceKey: 'worktree:tree-a', activePath: file.path, blocked: false };
  const first = planWorkspaceFileReveal({ identity: null, pendingPath: null }, options);
  assert.equal(first.expandParent, 'src/deep');
  assert.equal(first.pendingPath, file.path);
  const loading = planWorkspaceFileReveal(first, options);
  assert.equal(loading.expandParent, null);
  assert.equal(loading.pendingPath, file.path);
  const cancelled = { ...loading, pendingPath: null };
  assert.equal(planWorkspaceFileReveal(cancelled, options).pendingPath, null);
  assert.equal(planWorkspaceFileReveal(cancelled, { ...options, activePath: 'other.ts' }).pendingPath, 'other.ts');
  assert.equal(planWorkspaceFileReveal(cancelled, { ...options, workspaceKey: 'worktree:tree-b' }).pendingPath, file.path);
});

test('search, inline editing, or a hidden file cancels reveal until another editor is activated', () => {
  const options = { workspaceKey: 'session:session-a', activePath: file.path, blocked: false };
  const first = planWorkspaceFileReveal({ identity: null, pendingPath: null }, options);
  const blocked = planWorkspaceFileReveal(first, { ...options, blocked: true });
  assert.equal(blocked.pendingPath, null);
  assert.equal(planWorkspaceFileReveal(blocked, options).pendingPath, null);
  const initiallyBlocked = planWorkspaceFileReveal({ identity: null, pendingPath: null }, { ...options, blocked: true });
  assert.equal(initiallyBlocked.expandParent, null);
  assert.equal(initiallyBlocked.pendingPath, null);
});

test('reveal scrolls only the explorer as far as needed and never focuses the file', () => {
  const viewport = {
    clientTop: 1, clientHeight: 100, scrollTop: 40,
    getBoundingClientRect: () => ({ top: 20 }),
  } as HTMLDivElement;
  const row = (top: number, bottom: number) => ({
    getBoundingClientRect: () => ({ top, bottom }),
    focus: () => assert.fail('must retain editor focus'),
    scrollIntoView: () => assert.fail('must not scroll ancestor layouts'),
  }) as unknown as HTMLElement;
  scrollWorkspaceFileIntoView(viewport, row(50, 74));
  assert.equal(viewport.scrollTop, 40);
  scrollWorkspaceFileIntoView(viewport, row(110, 134));
  assert.equal(viewport.scrollTop, 53);
  scrollWorkspaceFileIntoView(viewport, row(10, 34));
  assert.equal(viewport.scrollTop, 42);
});
