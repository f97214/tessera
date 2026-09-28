import type { WorkspaceTreeNode } from './workspace-file-tree';

export interface WorkspaceTreeSelection {
  paths: ReadonlySet<string>;
  anchor: string | null;
  primary: string | null;
}

export function visibleWorkspaceTreeNodes(
  tree: readonly WorkspaceTreeNode[],
  expanded: ReadonlySet<string>,
  searching = false,
): WorkspaceTreeNode[] {
  const rows: WorkspaceTreeNode[] = [];
  function visit(nodes: readonly WorkspaceTreeNode[]) {
    for (const node of nodes) {
      rows.push(node);
      if (node.type === 'directory' && (searching || expanded.has(node.path))) visit(node.children);
    }
  }
  visit(tree);
  return rows;
}

export function selectWorkspaceTreePath(
  previous: WorkspaceTreeSelection,
  visiblePaths: readonly string[],
  path: string,
  modifiers: { toggle: boolean; range: boolean },
): WorkspaceTreeSelection {
  if (modifiers.range) {
    const anchorIndex = previous.anchor ? visiblePaths.indexOf(previous.anchor) : -1;
    const currentIndex = visiblePaths.indexOf(path);
    if (anchorIndex !== -1 && currentIndex !== -1) {
      const range = visiblePaths.slice(Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex) + 1);
      return {
        paths: new Set(modifiers.toggle ? [...previous.paths, ...range] : range),
        anchor: previous.anchor,
        primary: path,
      };
    }
  }
  if (modifiers.toggle) {
    const paths = new Set(previous.paths);
    if (paths.has(path)) paths.delete(path);
    else paths.add(path);
    return { paths, anchor: path, primary: paths.has(path) ? path : null };
  }
  return { paths: new Set([path]), anchor: path, primary: path };
}

/** A selected parent owns its descendants; do not delete a child twice. */
export function workspaceSelectionRoots<T extends { path: string; kind: 'file' | 'directory' }>(
  entries: readonly T[],
): T[] {
  const directories = new Set(entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.path));
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    const parts = entry.path.split('/');
    parts.pop();
    while (parts.length) {
      if (directories.has(parts.join('/'))) return false;
      parts.pop();
    }
    return true;
  });
}
