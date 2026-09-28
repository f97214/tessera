'use client';

import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { isHiddenWorkspaceRelativePath } from '@/lib/workspace-files/hidden-workspace-path';
import {
  planWorkspaceFileReveal,
  scrollWorkspaceFileIntoView,
  type WorkspaceFileRevealState,
} from '@/lib/workspace-files/workspace-file-reveal';

interface WorkspaceFileRevealOptions {
  workspaceKey: string | null;
  activePath: string | null;
  visibleFiles: readonly string[];
  expandedPaths: ReadonlySet<string>;
  loading: boolean;
  searching: boolean;
  showHiddenFiles: boolean;
  editing: boolean;
  expandParent: (path: string) => void;
  selectPath: (path: string) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  stopScrollRestore: () => void;
}

/** Auto reveal is a one-shot navigation request; manual tree actions take over. */
export function useWorkspaceFileReveal({
  workspaceKey, activePath, visibleFiles, expandedPaths, loading, searching,
  showHiddenFiles, editing, expandParent, selectPath, viewportRef, stopScrollRestore,
}: WorkspaceFileRevealOptions): { cancelReveal: () => void } {
  const revealRef = useRef<WorkspaceFileRevealState>({ identity: null, pendingPath: null });
  const cancelReveal = useCallback(() => {
    revealRef.current.pendingPath = null;
  }, []);

  useEffect(() => {
    const blocked = searching || editing
      || Boolean(activePath && !showHiddenFiles && isHiddenWorkspaceRelativePath(activePath));
    const plan = planWorkspaceFileReveal(revealRef.current, { workspaceKey, activePath, blocked });
    revealRef.current = { identity: plan.identity, pendingPath: plan.pendingPath };
    if (plan.expandParent) expandParent(plan.expandParent);
    const pendingPath = plan.pendingPath;
    const viewport = viewportRef.current;
    if (!pendingPath || loading || !viewport || !visibleFiles.includes(pendingPath)) return;
    const row = Array.from(viewport.querySelectorAll<HTMLElement>('[data-workspace-file-path]'))
      .find((element) => element.dataset.workspaceFilePath === pendingPath);
    if (!row) return;
    revealRef.current.pendingPath = null;
    stopScrollRestore();
    selectPath(pendingPath);
    scrollWorkspaceFileIntoView(viewport, row);
  }, [
    workspaceKey, activePath, visibleFiles, expandedPaths, loading, searching,
    showHiddenFiles, editing, expandParent, selectPath, viewportRef, stopScrollRestore,
  ]);

  return { cancelReveal };
}
