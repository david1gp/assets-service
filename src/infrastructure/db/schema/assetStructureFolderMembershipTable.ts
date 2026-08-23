import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core"

import { assetTable } from "./assetTable.js"
import { structureFolderTable } from "./structureFolderTable.js"

export const assetStructureFolderMembershipTable = sqliteTable(
  "asset_structure_folder_memberships",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assetTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    structureFolderId: text("structure_folder_id")
      .notNull()
      .references(() => structureFolderTable.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("asset_structure_folder_memberships_asset_unique").on(table.assetId),
    index("asset_structure_folder_memberships_folder_index").on(table.structureFolderId),
  ],
)
