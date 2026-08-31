import type { AuditAction } from "../../audit/auditActionCatalog.js"

type UiAuditActionSelection = AuditAction | "all"

/** Applies virtual-all semantics to a CheckMultiple selection change. */
export const uiAuditActionSelectionUpdate = (
  current: UiAuditActionSelection[],
  next: UiAuditActionSelection[],
): UiAuditActionSelection[] => {
  const allWasSelected = current.includes("all")
  const allIsSelected = next.includes("all")

  if (allIsSelected && !allWasSelected) return ["all"]
  if (allIsSelected && next.length > 1) return next.filter((value) => value !== "all")
  if (next.length === 0) return ["all"]
  return next
}
