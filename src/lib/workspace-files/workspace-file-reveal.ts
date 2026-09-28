import type { WorkspaceFileRef } from '@/lib/workspace-tabs/special-session';
import type { WorkspaceTarget } from '@/types/worktree';

/** Match physical Worktree identity first, retaining older Session-only refs. */
export function resolveRevealedWorkspacePath(
  target: WorkspaceTarget | null,
  ref: WorkspaceFileRef | null,
): string | null {
  if (!target || !ref) return null;
  const worktreeId = target.kind === 'worktree' ? target.id : target.worktreeId;
  if (worktreeId && ref.sourceWorktreeId) {
    return worktreeId === ref.sourceWorktreeId ? ref.path : null;
  }
  return target.kind === 'session'
    && ref.type === 'workspace-file'
    && target.id === ref.sourceSessionId
    ? ref.path
    : null;
}

export interface WorkspaceFileRevealState {
  identity: string | null;
  pendingPath: string | null;
}

/** A refresh may finish a reveal, but only an editor change may start one. */
export function planWorkspaceFileReveal(
  previous: WorkspaceFileRevealState,
  options: { workspaceKey: string | null; activePath: string | null; blocked: boolean },
): WorkspaceFileRevealState & { expandParent: string | null } {
  const { workspaceKey, activePath, blocked } = options;
  const identity = JSON.stringify([workspaceKey, activePath]);
  if (identity === previous.identity) {
    return { ...previous, pendingPath: blocked ? null : previous.pendingPath, expandParent: null };
  }
  const pendingPath = workspaceKey && !blocked ? activePath : null;
  return {
    identity,
    pendingPath,
    expandParent: pendingPath?.split('/').slice(0, -1).join('/') || null,
  };
}

/** Scroll only this explorer; never focus the row or scroll parent layouts. */
export function scrollWorkspaceFileIntoView(viewport: HTMLDivElement, row: HTMLElement): void {
  const viewportRect = viewport.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const top = viewportRect.top + viewport.clientTop;
  const bottom = top + viewport.clientHeight;
  if (rowRect.top < top) viewport.scrollTop += rowRect.top - top;
  else if (rowRect.bottom > bottom) viewport.scrollTop += rowRect.bottom - bottom;
}
