"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { telemetryClickAttributes } from '@/lib/telemetry/ui-click';

import { deleteWorkspaceSelection } from "@/lib/workspace-files/delete-workspace-selection";

export interface WorkspaceDeleteRequest {
  /** Workspace-relative path of the entry to delete. */
  path: string;
  kind: "file" | "directory";
  /** True when a tab has unsaved edits to this file. */
  dirty?: boolean;
}

/**
 * Confirm a permanent delete.
 *
 * There is no Trash to fall back on and no undo stack, so the dialog has to
 * say exactly what goes: the folder's contents, and any unsaved edits that
 * would be discarded along with the file.
 */
export function WorkspaceDeleteDialog({
  onConfirm,
  onOpenChange,
  request,
  requests,
}: {
  onConfirm: (request: WorkspaceDeleteRequest) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  /** null when closed; the entry to delete otherwise. */
  request?: WorkspaceDeleteRequest | null;
  requests?: readonly WorkspaceDeleteRequest[] | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const entries = requests ?? (request ? [request] : []);
  const open = entries.length > 0;
  const completed = useRef(new Set<string>());
  const remaining = entries.filter((entry) => !completed.current.has(entry.path));
  const multiple = entries.length > 1;
  const first = entries[0];

  useEffect(() => {
    if (!open) return;
    completed.current = new Set();
    setError(null);
    setDeleting(false);
  }, [open, request, requests]);

  async function confirm() {
    if (!open || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteWorkspaceSelection(remaining, onConfirm);
      for (const path of result.deleted) completed.current.add(path);
      if (result.failures.length) {
        setError(result.failures.map(({ path, message }) => `${path}: ${message}`).join("\n"));
      } else {
        onOpenChange(false);
      }
    } finally {
      setDeleting(false);
    }
  }

  function changeOpen(next: boolean) {
    if (!deleting) onOpenChange(next);
  }
  const name = first ? first.path.split("/").pop() || first.path : "";

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-labelledby="dialog-title" data-testid="workspace-delete-dialog">
        <DialogHeader onClose={() => changeOpen(false)}>
          <DialogTitle>
            {multiple ? `Delete ${remaining.length} selected items` : first?.kind === "directory" ? "Delete folder" : "Delete file"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-(--status-error-text)" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-(--text-primary)">
              {multiple ? `Delete these ${remaining.length} selected items?` : <>Delete <span className="font-mono">{name}</span>?</>}
            </p>
            <p className="text-xs leading-5 text-(--text-muted)" data-testid="workspace-delete-detail">
              {entries.some((entry) => entry.kind === "directory")
                ? multiple ? "All contents of the selected folders are deleted too." : "Everything inside this folder is deleted too."
                : multiple ? "These files are deleted from the workspace." : "This file is deleted from the workspace."}
              {" "}
              This is permanent — it does not go to the Trash and cannot be undone.
              {entries.some((entry) => entry.dirty)
                ? " Unsaved edits in the selected items will be discarded."
                : ""}
            </p>
            <ul className="max-h-48 overflow-y-auto break-all font-mono text-[11px] text-(--text-muted)">
              {remaining.map((entry) => <li key={entry.path}>{entry.path}</li>)}
            </ul>
          </div>
        </div>
        {error ? (
          <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-all text-xs text-(--status-error-text)" data-testid="workspace-delete-error">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            {...telemetryClickAttributes('workspace_editor.delete.cancel', 'workspace_editor')}
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button
            {...telemetryClickAttributes('workspace_editor.delete.confirm', 'workspace_editor')}
            type="button"
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={() => void confirm()}
            data-testid="workspace-delete-confirm"
          >
            {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>Delete</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
