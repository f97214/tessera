"use client";

import { useCallback, useMemo, useState } from 'react';
import { selectWorkspaceTreePath, type WorkspaceTreeSelection } from '@/lib/workspace-files/workspace-tree-selection';

const EMPTY_SELECTION: WorkspaceTreeSelection = { paths: new Set(), anchor: null, primary: null };

export function useWorkspaceTreeSelection(workspaceKey: string | null, visiblePaths: readonly string[]) {
  const [stored, setStored] = useState<{ key: string | null; selection: WorkspaceTreeSelection }>({ key: null, selection: EMPTY_SELECTION });
  const selection = useMemo(() => {
    const current = stored.key === workspaceKey ? stored.selection : EMPTY_SELECTION;
    const visible = new Set(visiblePaths);
    return {
      paths: new Set([...current.paths].filter((path) => visible.has(path))),
      anchor: current.anchor && visible.has(current.anchor) ? current.anchor : null,
      primary: current.primary && visible.has(current.primary) ? current.primary : null,
    };
  }, [stored, workspaceKey, visiblePaths]);

  const selectPath = useCallback((path: string | null) => {
    setStored({ key: workspaceKey, selection: path
      ? { paths: new Set([path]), anchor: path, primary: path }
      : EMPTY_SELECTION });
  }, [workspaceKey]);

  function selectWithModifiers(path: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
    setStored({ key: workspaceKey, selection: selectWorkspaceTreePath(selection, visiblePaths, path, {
      toggle: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    }) });
    return event.ctrlKey || event.metaKey || event.shiftKey;
  }

  function selectContextPath(path: string) {
    if (!selection.paths.has(path)) selectPath(path);
  }

  function selectAll() {
    setStored({ key: workspaceKey, selection: { paths: new Set(visiblePaths), anchor: visiblePaths[0] ?? null, primary: visiblePaths.at(-1) ?? null } });
  }

  function removePath(path: string) {
    setStored((previous) => {
      if (previous.key !== workspaceKey) return previous;
      const remaining = new Set([...previous.selection.paths].filter((entry) => entry !== path && !entry.startsWith(`${path}/`)));
      return { key: workspaceKey, selection: { paths: remaining, anchor: null, primary: null } };
    });
  }

  return { selection, selectPath, selectWithModifiers, selectContextPath, selectAll, removePath };
}
