export async function deleteWorkspaceSelection<T extends { path: string }>(
  entries: readonly T[],
  remove: (entry: T) => Promise<void>,
): Promise<{ deleted: string[]; failures: { path: string; message: string }[] }> {
  const deleted: string[] = [];
  const failures: { path: string; message: string }[] = [];
  for (const entry of entries) {
    try {
      await remove(entry);
      deleted.push(entry.path);
    } catch (error) {
      failures.push({ path: entry.path, message: error instanceof Error ? error.message : 'Failed to delete.' });
    }
  }
  return { deleted, failures };
}
