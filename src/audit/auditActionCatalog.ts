export const auditActionCatalog = ["asset.created", "asset.deletion_requested", "asset.deleted"] as const

export type AuditAction = (typeof auditActionCatalog)[number]
