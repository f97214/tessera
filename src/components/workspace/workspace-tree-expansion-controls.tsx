"use client";

import { ChevronsDownUp, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function WorkspaceTreeExpansionControls({
  onExpandAll,
  onCollapseAll,
  expanding = false,
  disabled = false,
}: {
  onExpandAll?: () => void;
  onCollapseAll: () => void;
  expanding?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {onExpandAll ? <Button type="button" variant="ghost" size="icon"
        className="h-6 w-6 text-(--text-muted)"
        title={t("gitPanel.commit.expandFolders")}
        aria-label={t("gitPanel.commit.expandFolders")}
        aria-busy={expanding}
        disabled={disabled || expanding}
        onClick={onExpandAll}>
        {expanding ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
      </Button> : null}
      <Button type="button" variant="ghost" size="icon"
        className="h-6 w-6 text-(--text-muted)"
        title={t("gitPanel.commit.collapseFolders")}
        aria-label={t("gitPanel.commit.collapseFolders")}
        disabled={disabled}
        onClick={onCollapseAll}>
        <ChevronsDownUp className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
