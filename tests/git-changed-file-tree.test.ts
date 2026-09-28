import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChangedFileRows } from '../src/lib/git/changed-file-tree';
import { resolveCommitSelectionRange } from '../src/components/git/git-commit-selection';
import type { GitChangedFile } from '../src/types/git';

function file(path: string): GitChangedFile {
  return { path, state: 'modified', displayStatus: 'M', indexStatus: ' ', workTreeStatus: 'M', staged: false, unstaged: true };
}

test('uses Files hierarchy without compacting, sorts folders first, and preserves original file objects', () => {
  const files = ['README.md', 'src/lib/z.ts', 'src/components/한글.tsx', 'src/lib/a.ts'].map(file);
  const rows = buildChangedFileRows(files, new Set());
  assert.deepEqual(rows.map(({ kind, path, depth }) => [kind, path, depth]), [
    ['folder', 'src', 0], ['folder', 'src/components', 1], ['file', 'src/components/한글.tsx', 2],
    ['folder', 'src/lib', 1], ['file', 'src/lib/a.ts', 2], ['file', 'src/lib/z.ts', 2], ['file', 'README.md', 0],
  ]);
  const compact = buildChangedFileRows([files[2]], new Set());
  assert.deepEqual(compact[0], { kind: 'folder', path: 'src', name: 'src', depth: 0 });
  assert.deepEqual(compact[1], { kind: 'folder', path: 'src/components', name: 'components', depth: 1 });
  assert.equal(compact[2].kind === 'file' && compact[2].file, files[2]);
});

test('collapsed descendants are excluded from Shift selection while sibling files remain visible', () => {
  const files = ['src/a.ts', 'src/hidden/b.ts', 'src/z.ts', 'README.md'].map(file);
  const rows = buildChangedFileRows(files, new Set(['src/hidden']));
  const visible = rows.filter((row) => row.kind === 'file').map((row) => row.path);
  assert.deepEqual(resolveCommitSelectionRange(visible, 'src/a.ts', 'README.md', true).paths,
    ['src/a.ts', 'src/z.ts', 'README.md']);
  assert.deepEqual(buildChangedFileRows(files, new Set(['src'])).map((row) => row.path), ['src', 'README.md']);
});

test('keeps rename metadata, root files and backslashes in Git filenames intact', () => {
  const renamed = { ...file('folder/new.ts'), previousPath: 'old.ts', state: 'renamed' as const };
  const literal = file('literal\\name.ts');
  const rows = buildChangedFileRows([renamed, literal], new Set());
  assert.equal(rows.find((row) => row.kind === 'file' && row.file === renamed)?.path, 'folder/new.ts');
  assert.equal(rows.find((row) => row.path === literal.path)?.depth, 0);
  assert.deepEqual(buildChangedFileRows([], new Set()), []);
});

test('uses the Files tab natural, case-insensitive ordering', () => {
  const rows = buildChangedFileRows(['src/file10.ts', 'src/File2.ts', 'src/file1.ts'].map(file), new Set());
  assert.deepEqual(rows.filter((row) => row.kind === 'file').map((row) => row.name), ['file1.ts', 'File2.ts', 'file10.ts']);
});
