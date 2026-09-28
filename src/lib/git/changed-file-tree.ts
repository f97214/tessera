import type { GitChangedFile } from '@/types/git';
import {
  buildWorkspaceFileTree,
  type WorkspaceTreeNode,
} from '@/lib/workspace-files/workspace-file-tree';

export type ChangedFileRow =
  | { kind: 'folder'; path: string; name: string; depth: number }
  | { kind: 'file'; path: string; name: string; depth: number; file: GitChangedFile };

/** Use the Files tab's hierarchy and natural sorting for the changed subset. */
export function buildChangedFileRows(
  files: readonly GitChangedFile[],
  collapsed: ReadonlySet<string>,
): ChangedFileRow[] {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const tree = buildWorkspaceFileTree([...filesByPath.keys()], new Set(), []);
  const rows: ChangedFileRow[] = [];
  function visit(nodes: WorkspaceTreeNode[], depth: number) {
    for (const node of nodes) {
      const row = { path: node.path, name: node.name, depth };
      if (node.type === 'directory') {
        rows.push({ ...row, kind: 'folder' });
        if (!collapsed.has(node.path)) visit(node.children, depth + 1);
      } else {
        rows.push({ ...row, kind: 'file', file: filesByPath.get(node.path)! });
      }
    }
  }
  visit(tree, 0);
  return rows;
}
