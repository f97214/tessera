import { FILE_STATE_META } from '@/components/git/git-panel-shared';
import type { WorkspaceGitDecoration } from '@/lib/workspace-files/workspace-git-decorations';
import { cn } from '@/lib/utils';

export function WorkspaceGitBadge({
  decoration,
  directory = false,
  label,
}: {
  decoration?: WorkspaceGitDecoration;
  directory?: boolean;
  label?: string;
}) {
  if (!decoration) return null;
  const meta = FILE_STATE_META[decoration.state];
  const description = label ?? (directory ? `Contains ${meta.label.toLowerCase()} files` : meta.label);
  return (
    <span
      className={cn('inline-flex w-3.5 shrink-0 items-center justify-center text-[11px] font-medium', meta.statusClassName)}
      title={description}
      aria-label={description}
      data-git-state={decoration.state}
    >
      {directory ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" /> : <span aria-hidden="true">{decoration.badge}</span>}
    </span>
  );
}
