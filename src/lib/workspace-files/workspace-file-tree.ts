export interface WorkspaceFileNode {
  type: "file";
  name: string;
  path: string;
  isSymlink: boolean;
}

export interface WorkspaceDirectoryNode {
  type: "directory";
  name: string;
  path: string;
  children: WorkspaceTreeNode[];
}

export type WorkspaceTreeNode = WorkspaceDirectoryNode | WorkspaceFileNode;

interface MutableDirectoryNode {
  name: string;
  path: string;
  directories: Map<string, MutableDirectoryNode>;
  files: WorkspaceFileNode[];
}

function createMutableDirectory(name: string, path: string): MutableDirectoryNode {
  return {
    name,
    path,
    directories: new Map(),
    files: [],
  };
}

function compareNodeNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function finalizeDirectory(node: MutableDirectoryNode): WorkspaceDirectoryNode {
  const directories = Array.from(node.directories.values())
    .map(finalizeDirectory)
    .sort((a, b) => compareNodeNames(a.name, b.name));
  const files = [...node.files].sort((a, b) => compareNodeNames(a.name, b.name));
  const children: WorkspaceTreeNode[] = [...directories, ...files];

  return {
    type: "directory",
    name: node.name,
    path: node.path,
    children,
  };
}

function ensureDirectory(root: MutableDirectoryNode, directoryPath: string): MutableDirectoryNode {
  let directory = root;
  for (const part of directoryPath.split("/").filter(Boolean)) {
    const childPath = directory.path ? `${directory.path}/${part}` : part;
    let child = directory.directories.get(part);
    if (!child) {
      child = createMutableDirectory(part, childPath);
      directory.directories.set(part, child);
    }
    directory = child;
  }
  return directory;
}

export function buildWorkspaceFileTree(
  filePaths: string[],
  symlinkPaths: Set<string>,
  directoryPaths: string[],
): WorkspaceTreeNode[] {
  const root = createMutableDirectory("", "");

  // Folders first and in their own right: one with no files in it appears in no
  // file path, so inferring the tree from `filePaths` alone would hide exactly
  // the folder a user just created.
  for (const directoryPath of directoryPaths) {
    ensureDirectory(root, directoryPath);
  }

  for (const filePath of filePaths) {
    const parts = filePath.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;

    const directory = ensureDirectory(root, parts.join("/"));

    directory.files.push({
      type: "file",
      name: fileName,
      path: filePath,
      isSymlink: symlinkPaths.has(filePath),
    });
  }

  return finalizeDirectory(root).children;
}
