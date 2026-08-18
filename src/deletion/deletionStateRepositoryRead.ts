import { eq } from "drizzle-orm"
import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { deletionStateTable } from "../infrastructure/db/schema/deletionStateTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { DeletionState } from "./deletionStateSchema.js"

export const deletionStateRepositoryRead = (db: AssetDatabase, assetId: string): Result<DeletionState | undefined> => {
  const op = "deletionStateRepositoryRead"

  try {
    const record = db.select().from(deletionStateTable).where(eq(deletionStateTable.assetId, assetId)).get()
    return { success: true, data: record as DeletionState | undefined }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
