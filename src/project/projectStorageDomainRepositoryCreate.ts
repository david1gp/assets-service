import { and, asc, eq, type SQL } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { projectStorageDomainTable } from "../infrastructure/db/schema/projectStorageDomainTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { projectStorageDomainCreateInputSchema } from "./projectStorageDomainCreateInputSchema.js"
import type { ProjectStorageDomainRepository } from "./projectStorageDomainRepository.js"
import { type ProjectStorageDomain, projectStorageDomainSchema } from "./projectStorageDomainSchema.js"

type ProjectStorageDomainRepositoryCreateOptions = {
  clock?: () => Date
}

export const projectStorageDomainRepositoryCreate = (
  db: AssetDatabase,
  options: ProjectStorageDomainRepositoryCreateOptions = {},
): ProjectStorageDomainRepository => {
  const clock = options.clock ?? (() => new Date())

  const recordRead = (
    record: typeof projectStorageDomainTable.$inferSelect,
    op: string,
  ): Result<ProjectStorageDomain> => {
    const parsed = v.safeParse(projectStorageDomainSchema, record)
    if (!parsed.success) return resultErrorCreate(op, "The stored project storage domain was invalid")
    return { success: true, data: parsed.output }
  }

  const projectStorageDomainCreate: ProjectStorageDomainRepository["projectStorageDomainCreate"] = (
    input,
    transactionInput,
  ) => {
    const op = "projectStorageDomainCreate"
    const parsed = v.safeParse(projectStorageDomainCreateInputSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues))

    let now: string
    try {
      now = new Date(clock()).toISOString()
    } catch (error) {
      return resultErrorCreate(op, "The project storage domain timestamp could not be created", error)
    }

    const transaction = transactionInput ?? db
    try {
      const existing = transaction
        .select()
        .from(projectStorageDomainTable)
        .where(
          and(
            eq(projectStorageDomainTable.projectId, parsed.output.projectId),
            eq(projectStorageDomainTable.bucket, parsed.output.bucket),
            eq(projectStorageDomainTable.customDomain, parsed.output.customDomain),
          ),
        )
        .get()
      if (existing === undefined) {
        transaction
          .insert(projectStorageDomainTable)
          .values({
            id: `project-storage-domain-${crypto.randomUUID()}`,
            projectId: parsed.output.projectId,
            bucket: parsed.output.bucket,
            customDomain: parsed.output.customDomain,
            zoneId: parsed.output.zoneId,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      } else if (existing.zoneId !== parsed.output.zoneId) {
        transaction
          .update(projectStorageDomainTable)
          .set({ zoneId: parsed.output.zoneId, updatedAt: now })
          .where(eq(projectStorageDomainTable.id, existing.id))
          .run()
      }

      const record = transaction
        .select()
        .from(projectStorageDomainTable)
        .where(
          and(
            eq(projectStorageDomainTable.projectId, parsed.output.projectId),
            eq(projectStorageDomainTable.bucket, parsed.output.bucket),
            eq(projectStorageDomainTable.customDomain, parsed.output.customDomain),
          ),
        )
        .get()
      if (record === undefined) return resultErrorCreate(op, "The project storage domain could not be persisted")
      return recordRead(record, op)
    } catch (error) {
      return resultErrorCreate(op, "The project storage domain could not be persisted", error)
    }
  }

  const projectStorageDomainsRead = (
    projectId: string,
    transactionInput?: AssetDatabase,
  ): Result<readonly ProjectStorageDomain[]> => {
    const op = "projectStorageDomainsRead"
    return projectStorageDomainsReadBy(
      transactionInput ?? db,
      eq(projectStorageDomainTable.projectId, projectId),
      recordRead,
      op,
    )
  }

  const projectStorageDomainsForBucketRead = (
    bucket: string,
    transactionInput?: AssetDatabase,
  ): Result<readonly ProjectStorageDomain[]> => {
    const op = "projectStorageDomainsForBucketRead"
    return projectStorageDomainsReadBy(
      transactionInput ?? db,
      eq(projectStorageDomainTable.bucket, bucket),
      recordRead,
      op,
    )
  }

  return { projectStorageDomainCreate, projectStorageDomainsRead, projectStorageDomainsForBucketRead }
}

function projectStorageDomainsReadBy(
  db: AssetDatabase,
  filter: SQL,
  recordRead: (record: typeof projectStorageDomainTable.$inferSelect, op: string) => Result<ProjectStorageDomain>,
  op: string,
): Result<readonly ProjectStorageDomain[]> {
  try {
    const records = db
      .select()
      .from(projectStorageDomainTable)
      .where(filter)
      .orderBy(
        asc(projectStorageDomainTable.projectId),
        asc(projectStorageDomainTable.bucket),
        asc(projectStorageDomainTable.customDomain),
        asc(projectStorageDomainTable.id),
      )
      .all()
    const domains: ProjectStorageDomain[] = []
    for (const record of records) {
      const domain = recordRead(record, op)
      if (!domain.success) return domain
      domains.push(domain.data)
    }
    return { success: true, data: domains }
  } catch (error) {
    return resultErrorCreate(op, "The project storage domains could not be read", error)
  }
}
