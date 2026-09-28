import type { GitChangedFile, GitFileState } from '@/types/git';

export interface WorkspaceGitDecoration {
  state: GitFileState;
  badge: string;
}

export interface WorkspaceGitDecorations {
  files: Map<string, WorkspaceGitDecoration>;
  directories: Map<string, WorkspaceGitDecoration>;
  /** Missing markers are inconclusive when Git capped its change list. */
  partial: boolean;
  /** False when the workspace cannot be located inside this repository. */
  scopeKnown: boolean;
}

const BADGES: Record<GitFileState, string> = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', copied: 'C',
  untracked: 'U', conflicted: '!', typechange: 'T', unknown: '?',
};

const PRIORITY: Record<GitFileState, number> = {
  conflicted: 9, modified: 8, deleted: 7, renamed: 6, typechange: 5,
  added: 4, copied: 3, untracked: 2, unknown: 1,
};

interface ComparableRoot {
  path: string;
  windows: boolean;
  distro?: string;
}

/** Display-path comparison only; never use this to authorize filesystem I/O. */
function comparableRoot(value: string): ComparableRoot | null {
  let path = value.trim();
  let distro: string | undefined;
  let windows = false;
  const unc = path.replace(/\\/g, '/').match(/^\/\/(wsl\$|wsl\.localhost)\/([^/]+)(\/.*)?$/i);
  if (unc) {
    distro = unc[2].toLowerCase();
    path = unc[3] || '/';
  } else if (/^[a-z]:[/\\]/i.test(path) || /^[\\/]{2}/.test(path)) {
    windows = true;
    path = path.replace(/\\/g, '/');
  }
  // A Windows drive may arrive through the WSL CLI's /mnt/<drive> spelling.
  const mountedDrive = path.match(/^\/mnt\/([a-z])(?:\/(.*))?$/i);
  if (mountedDrive) {
    windows = true;
    distro = undefined;
    path = `${mountedDrive[1]}:/${mountedDrive[2] ?? ''}`;
  }
  if (!path.startsWith('/') && !/^[a-z]:\//i.test(path)) return null;
  const leading = path.startsWith('//') ? '//' : path.startsWith('/') ? '/' : '';
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length || /^[a-z]:$/i.test(parts.at(-1)!)) return null;
      parts.pop();
    } else parts.push(part);
  }
  return { path: leading + parts.join('/'), windows, distro };
}

function workspacePrefix(repoRoot: string, workspaceRoot: string): {
  prefix: string;
  windows: boolean;
} | null {
  const repo = comparableRoot(repoRoot);
  const workspace = comparableRoot(workspaceRoot);
  if (!repo || !workspace || repo.windows !== workspace.windows) return null;
  if (repo.distro && workspace.distro && repo.distro !== workspace.distro) return null;
  const root = repo.windows ? repo.path.toLowerCase() : repo.path;
  const target = repo.windows ? workspace.path.toLowerCase() : workspace.path;
  if (target === root) return { prefix: '', windows: repo.windows };
  const parent = root.endsWith('/') ? root : `${root}/`;
  return target.startsWith(parent)
    ? { prefix: workspace.path.slice(parent.length) + '/', windows: repo.windows }
    : null;
}

/** Derive markers independently of the explorer's loaded/expanded directories. */
export function buildWorkspaceGitDecorations({
  changedFiles,
  repoRoot,
  workspaceRoot,
  truncated = false,
}: {
  changedFiles: readonly GitChangedFile[];
  repoRoot: string;
  workspaceRoot: string;
  truncated?: boolean;
}): WorkspaceGitDecorations {
  const scope = workspacePrefix(repoRoot, workspaceRoot);
  const result: WorkspaceGitDecorations = {
    files: new Map(), directories: new Map(), partial: truncated, scopeKnown: scope !== null,
  };
  if (!scope) return result;

  function relativePath(path: string): string | null {
    // Git uses slash separators even on Windows; a POSIX backslash is a name.
    if (!path || path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) return null;
    const comparedPath = scope!.windows ? path.toLowerCase() : path;
    const comparedPrefix = scope!.windows ? scope!.prefix.toLowerCase() : scope!.prefix;
    if (!comparedPath.startsWith(comparedPrefix)) return null;
    return path.slice(scope!.prefix.length) || null;
  }

  function markAncestors(path: string, decoration: WorkspaceGitDecoration) {
    let separator = path.lastIndexOf('/');
    while (separator >= 0) {
      const directory = path.slice(0, separator);
      const current = result.directories.get(directory);
      if (!current || PRIORITY[decoration.state] > PRIORITY[current.state]) {
        result.directories.set(directory, decoration);
      }
      separator = path.lastIndexOf('/', separator - 1);
    }
  }

  for (const file of changedFiles) {
    const path = relativePath(file.path);
    if (path) {
      const decoration = { state: file.state, badge: BADGES[file.state] };
      result.files.set(path, decoration);
      markAncestors(path, decoration);
    }
    if (file.state === 'renamed' && file.previousPath) {
      const previousPath = relativePath(file.previousPath);
      if (previousPath) markAncestors(previousPath, { state: 'deleted', badge: 'D' });
    }
  }
  return result;
}
