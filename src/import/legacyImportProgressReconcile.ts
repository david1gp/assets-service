import { and, eq } from "drizzle-orm"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { legacyImportTable } from "../infrastructure/db/schema/legacyImportTable.js"
import { jobTable } from "../infrastructure/db/schema/jobTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const legacyImportProgressReconcile = (
  db: AssetDatabase,
  input: { importId: string; currentJobId?: string; now: string },
): Result<null> => {
  const record = db.select().from(legacyImportTable).where(eq(legacyImportTable.id, input.importId)).get()
  if (record === undefined) return resultErrorCreate("legacyImportProgressReconcile", "The legacy import was not found")
  const jobs = db
    .select()
    .from(jobTable)
    .where(eq(jobTable.kind, "publish_asset"))
    .all()
    .filter((job) => job.payload["legacyImportId"] === input.importId)
  const succeeded = jobs.filter((job) => job.status === "succeeded" || job.id === input.currentJobId).length
  const failed = jobs.some((job) => job.status === "dead")
  if (!failed && (jobs.length === 0 || succeeded < jobs.length)) return { success: true, data: null }
  const status = failed ? "failed" : "succeeded"
  db.update(legacyImportTable)
    .set({ status, completedAt: input.now, updatedAt: input.now })
    .where(and(eq(legacyImportTable.id, input.importId), eq(legacyImportTable.status, "queued")))
    .run()
  return { success: true, data: null }
}
