import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { projectStorageLocationTable } from "../infrastructure/db/schema/projectStorageLocationTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { projectStorageLocationCreateInputSchema } from "./projectStorageLocationCreateInputSchema.js"
import type { ProjectStorageLocationRepository } from "./projectStorageLocationRepository.js"
import { type ProjectStorageLocation, projectStorageLocationSchema } from "./projectStorageLocationSchema.js"

type ProjectStorageLocationRepositoryCreateOptions = {
  clock?: () => Date
}

export const projectStorageLocationRepositoryCreate = (
  db: AssetDatabase,
  options: ProjectStorageLocationRepositoryCreateOptions = {},
): ProjectStorageLocationRepository => {
  const clock = options.clock ?? (() => new Date())

  const recordRead = (
    record: typeof projectStorageLocationTable.$inferSelect,
    op: string,
  ): Result<ProjectStorageLocation> => {
    const parsed = v.safeParse(projectStorageLocationSchema, record)
    if (!parsed.success) return resultErrorCreate(op, "The stored project storage location was invalid", parsed.issues)
    return { success: true, data: parsed.output }
  }

  const projectStorageLocationCreate: ProjectStorageLocationRepository["projectStorageLocationCreate"] = (
    input,
    transactionInput,
  ) => {
    const op = "projectStorageLocationCreate"
    const parsed = v.safeParse(projectStorageLocationCreateInputSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)

    let createdAt: string
    try {
      createdAt = new Date(clock()).toISOString()
    } catch (error) {
      return resultErrorCreate(op, "The project storage location timestamp could not be created", error)
    }

    const prefix = parsed.output.prefix.replace(/^\/+|\/+$/g, "")
    const transaction = transactionInput ?? db
    try {
      transaction
        .insert(projectStorageLocationTable)
        .values({
          id: `project-storage-location-${crypto.randomUUID()}`,
          projectId: parsed.output.projectId,
          environment: parsed.output.environment,
          bucket: parsed.output.bucket,
          prefix,
          createdAt,
        })
        .onConflictDoNothing({
          target: [
            projectStorageLocationTable.projectId,
            projectStorageLocationTable.environment,
            projectStorageLocationTable.bucket,
            projectStorageLocationTable.prefix,
          ],
        })
        .run()
      const record = transaction
        .select()
        .from(projectStorageLocationTable)
        .where(
          and(
            eq(projectStorageLocationTable.projectId, parsed.output.projectId),
            eq(projectStorageLocationTable.environment, parsed.output.environment),
            eq(projectStorageLocationTable.bucket, parsed.output.bucket),
            eq(projectStorageLocationTable.prefix, prefix),
          ),
        )
        .get()
      if (record === undefined) return resultErrorCreate(op, "The project storage location could not be persisted")
      return recordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The project storage location could not be persisted", error)
    }
  }

  const projectStorageLocationsRead = (
    projectId: string,
    transactionInput?: AssetDatabase,
  ): Result<readonly ProjectStorageLocation[]> => {
    const op = "projectStorageLocationsRead"
    const transaction = transactionInput ?? db
    try {
      const records = transaction
        .select()
        .from(projectStorageLocationTable)
        .where(eq(projectStorageLocationTable.projectId, projectId))
        .orderBy(
          asc(projectStorageLocationTable.environment),
          asc(projectStorageLocationTable.bucket),
          asc(projectStorageLocationTable.prefix),
          asc(projectStorageLocationTable.id),
        )
        .all()
      return projectStorageLocationsMap(records, recordRead, op)
    } catch (error) {
      return resultErrorCreate(op, "The project storage locations could not be read", error)
    }
  }

  const projectStorageLocationsAllRead = (
    transactionInput?: AssetDatabase,
  ): Result<readonly ProjectStorageLocation[]> => {
    const op = "projectStorageLocationsAllRead"
    const transaction = transactionInput ?? db
    try {
      const records = transaction
        .select()
        .from(projectStorageLocationTable)
        .orderBy(
          asc(projectStorageLocationTable.projectId),
          asc(projectStorageLocationTable.environment),
          asc(projectStorageLocationTable.bucket),
          asc(projectStorageLocationTable.prefix),
          asc(projectStorageLocationTable.id),
        )
        .all()
      return projectStorageLocationsMap(records, recordRead, op)
    } catch (error) {
      return resultErrorCreate(op, "All project storage locations could not be read", error)
    }
  }

  return { projectStorageLocationCreate, projectStorageLocationsRead, projectStorageLocationsAllRead }
}

function projectStorageLocationsMap(
  records: readonly (typeof projectStorageLocationTable.$inferSelect)[],
  recordRead: (record: typeof projectStorageLocationTable.$inferSelect, op: string) => Result<ProjectStorageLocation>,
  op: string,
): Result<readonly ProjectStorageLocation[]> {
  const locations: ProjectStorageLocation[] = []
  for (const record of records) {
    const location = recordRead(record, op)
    if (!location.success) return location
    locations.push(location.data)
  }
  return { success: true, data: locations }
}
