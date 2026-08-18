import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { deletionStateTable } from "../infrastructure/db/schema/deletionStateTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { DeletionState } from "./deletionStateSchema.js"

export const deletionStateRepositoryUpsert = (db: AssetDatabase, state: DeletionState): Result<DeletionState> => {
  const op = "deletionStateRepositoryUpsert"

  try {
    const record = db
      .insert(deletionStateTable)
      .values({
        ...state,
        completedSteps: state.completedSteps,
        pendingRemoteObjects: state.pendingRemoteObjects,
        completedAt: state.completedAt,
        error: state.error,
      })
      .onConflictDoUpdate({
        target: deletionStateTable.assetId,
        set: {
          status: state.status,
          completedSteps: state.completedSteps,
          pendingRemoteObjects: state.pendingRemoteObjects,
          error: state.error,
          updatedAt: state.updatedAt,
          completedAt: state.completedAt,
        },
      })
      .returning()
      .get()

    return { success: true, data: record as DeletionState }
  } catch (error) {
    return resultErrorCreate(op, error instanceof Error ? error.message : String(error))
  }
}
