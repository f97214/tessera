"use client";

import type { ComponentProps, ReactNode } from "react";
import { ChevronRight, FileText, FileJson, ImageIcon, Folder, FolderOpen, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function workspaceTreePadding(depth: number): number {
  return 8 + depth * 12;
}

export function workspaceTreeFileRowClassName(selected: boolean): string {
  return cn(
    "group relative border-l-2 transition-colors",
    selected
      ? "border-l-(--accent) bg-(--accent)/10 text-(--text-primary)"
      : "border-l-transparent text-(--text-primary) hover:bg-(--sidebar-hover)",
  );
}

export function WorkspaceFileIcon({ name }: { name: string }) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(extension)) {
    return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  }
  if (extension === 'json') return <FileJson className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
  return <FileText className={cn('h-3.5 w-3.5 shrink-0', extension === 'md' ? 'text-sky-500' : 'text-(--text-secondary)')} />;
}

export function WorkspaceFileName({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0 && dot < name.length - 1;
  return (
    <span className="flex min-w-0 flex-1 text-[13px] leading-5">
      <span className="truncate">{hasExtension ? name.slice(0, dot) : name}</span>
      {hasExtension ? <span className="shrink-0">{name.slice(dot)}</span> : null}
    </span>
  );
}

export function WorkspaceTreeBranchGuide({ depth }: { depth: number }) {
  return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-(--divider)" style={{ left: workspaceTreePadding(depth) + 9 }} />;
}

export function WorkspaceTreeDirectoryButton({
  name, depth, expanded, loading, decoration, nameProps, className, ...props
}: ComponentProps<"button"> & {
  name: string;
  depth: number;
  expanded: boolean;
  loading?: boolean;
  decoration?: ReactNode;
  nameProps?: ComponentProps<"span">;
}) {
  const FolderIcon = expanded ? FolderOpen : Folder;
  return (
    <button {...props} type="button" aria-expanded={expanded}
      className={cn("flex h-7 min-w-0 flex-1 items-center gap-1.5 border-l-2 border-l-transparent pr-2 text-left text-(--text-primary) transition-colors focus-visible:outline-1 focus-visible:outline-(--accent) focus-visible:-outline-offset-1", className)}
      style={{ paddingLeft: workspaceTreePadding(depth) }}>
      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-(--text-muted) transition-transform", expanded && "rotate-90")} />
      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-(--text-secondary)" />
      <span {...nameProps} className="min-w-0 flex-1 truncate text-[13px] leading-5">{name}</span>
      {decoration}
      {loading ? <LoaderCircle className="h-3 w-3 shrink-0 animate-spin text-(--text-muted)" /> : null}
    </button>
  );
}

export function WorkspaceTreeFileButton({ depth, children, className, ...props }: ComponentProps<"button"> & {
  depth: number;
  children: ReactNode;
}) {
  return (
    <button {...props} type="button"
      className={cn("flex h-7 w-full min-w-0 items-center gap-1.5 pr-2 text-left transition-colors focus-visible:outline-1 focus-visible:outline-(--accent) focus-visible:-outline-offset-1", className)}
      style={{ paddingLeft: workspaceTreePadding(depth) + 20 }}>
      {children}
    </button>
  );
}
