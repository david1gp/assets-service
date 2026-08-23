import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"

import type { AssetDatabase } from "../infrastructure/db/assetDatabase.js"
import { databaseRecordInsert } from "../infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../infrastructure/db/databaseTransactionRun.js"
import { assetStructureFolderMembershipTable } from "../infrastructure/db/schema/assetStructureFolderMembershipTable.js"
import { assetTable } from "../infrastructure/db/schema/assetTable.js"
import { projectTable } from "../infrastructure/db/schema/projectTable.js"
import { structureFolderTable } from "../infrastructure/db/schema/structureFolderTable.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import {
  assetStructureFolderMembershipSchema,
  type AssetStructureFolderMembership,
} from "./assetStructureFolderMembershipSchema.js"
import type { StructureFolderCreateInput } from "./structureFolderCreateInputSchema.js"
import { structureFolderCreateInputSchema } from "./structureFolderCreateInputSchema.js"
import type { StructureFolderRepository } from "./structureFolderRepository.js"
import { structureFolderSchema, type StructureFolder } from "./structureFolderSchema.js"
import type { StructureFolderUpdateInput } from "./structureFolderUpdateInputSchema.js"
import { structureFolderUpdateInputSchema } from "./structureFolderUpdateInputSchema.js"

type StructureFolderRecord = typeof structureFolderTable.$inferSelect
type AssetStructureFolderMembershipRecord = typeof assetStructureFolderMembershipTable.$inferSelect

export const structureFolderRepositoryCreate = (db: AssetDatabase): StructureFolderRepository => {
  const structureFolderRecordRead = (record: StructureFolderRecord): Result<StructureFolder> => {
    const parsed = v.safeParse(structureFolderSchema, record)
    if (!parsed.success)
      return resultErrorCreate("structureFolderRepositoryRead", "The stored structure folder was invalid")
    return { success: true, data: parsed.output }
  }

  const membershipRecordRead = (
    record: AssetStructureFolderMembershipRecord,
  ): Result<AssetStructureFolderMembership> => {
    const parsed = v.safeParse(assetStructureFolderMembershipSchema, record)
    if (!parsed.success)
      return resultErrorCreate("structureFolderRepositoryMembershipRead", "The stored asset membership was invalid")
    return { success: true, data: parsed.output }
  }

  const structureFoldersRead = (projectId: string): Result<readonly StructureFolder[]> => {
    try {
      const records = db
        .select()
        .from(structureFolderTable)
        .where(eq(structureFolderTable.projectId, projectId))
        .orderBy(asc(structureFolderTable.depth), asc(structureFolderTable.name), asc(structureFolderTable.id))
        .all()
      const folders: StructureFolder[] = []
      for (const record of records) {
        const folder = structureFolderRecordRead(record)
        if (!folder.success) return folder
        folders.push(folder.data)
      }
      return { success: true, data: folders }
    } catch (error) {
      return resultErrorCreate("structureFolderRepositoryFoldersRead", "The structure folders could not be read", error)
    }
  }

  const structureFolderRead = (projectId: string, structureFolderId: string): Result<StructureFolder | null> => {
    try {
      const record = db
        .select()
        .from(structureFolderTable)
        .where(and(eq(structureFolderTable.projectId, projectId), eq(structureFolderTable.id, structureFolderId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      return structureFolderRecordRead(record)
    } catch (error) {
      return resultErrorCreate("structureFolderRepositoryFolderRead", "The structure folder could not be read", error)
    }
  }

  const structureFolderCreate = (projectId: string, input: StructureFolderCreateInput): Result<StructureFolder> => {
    const op = "structureFolderRepositoryFolderCreate"
    const parsed = v.safeParse(structureFolderCreateInputSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)

    try {
      const project = db.select({ id: projectTable.id }).from(projectTable).where(eq(projectTable.id, projectId)).get()
      if (project === undefined) return resultErrorCreate(op, "The project was not found")

      const parentId = parsed.output.parentId ?? null
      const parent = parentId
        ? db
            .select()
            .from(structureFolderTable)
            .where(and(eq(structureFolderTable.projectId, projectId), eq(structureFolderTable.id, parentId)))
            .get()
        : undefined
      if (parentId !== null && parent === undefined) return resultErrorCreate(op, "The parent folder was not found")
      const depth = parent === undefined ? 1 : parent.depth + 1
      if (depth > 3) return resultErrorCreate(op, "Structure folders cannot be deeper than three levels")

      const now = new Date().toISOString()
      const inserted = databaseRecordInsert(db, structureFolderTable, {
        id: crypto.randomUUID(),
        projectId,
        parentId,
        name: parsed.output.name,
        depth,
        createdAt: now,
        updatedAt: now,
      })
      if (!inserted.success) return resultErrorCreate(op, "The structure folder name is already in use", inserted)
      return structureFolderRecordRead(inserted.data)
    } catch (error) {
      return resultErrorCreate(op, "The structure folder could not be created", error)
    }
  }

  const structureFolderUpdate = (
    projectId: string,
    structureFolderId: string,
    input: StructureFolderUpdateInput,
  ): Result<StructureFolder | null> => {
    const op = "structureFolderRepositoryFolderUpdate"
    const parsed = v.safeParse(structureFolderUpdateInputSchema, input)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), input)

    try {
      const current = db
        .select()
        .from(structureFolderTable)
        .where(and(eq(structureFolderTable.projectId, projectId), eq(structureFolderTable.id, structureFolderId)))
        .get()
      if (current === undefined) return { success: true, data: null }

      const name = parsed.output.name ?? current.name
      const parentId = parsed.output.parentId === undefined ? current.parentId : parsed.output.parentId
      if (parentId === structureFolderId) return resultErrorCreate(op, "A folder cannot be its own parent")

      const records = db.select().from(structureFolderTable).where(eq(structureFolderTable.projectId, projectId)).all()
      const parent = parentId === null ? undefined : records.find((record) => record.id === parentId)
      if (parentId !== null && parent === undefined) return resultErrorCreate(op, "The parent folder was not found")
      if (parent && isDescendant(records, structureFolderId, parent.id))
        return resultErrorCreate(op, "A folder cannot be moved inside its own descendant")

      const depth = parent === undefined ? 1 : parent.depth + 1
      if (depth > 3) return resultErrorCreate(op, "Structure folders cannot be deeper than three levels")
      const descendants = records.filter(
        (record) => record.id !== structureFolderId && isDescendant(records, structureFolderId, record.id),
      )
      const depthDelta = depth - current.depth
      if (descendants.some((record) => record.depth + depthDelta > 3))
        return resultErrorCreate(op, "The folder move would make a descendant deeper than three levels")
      if (name === current.name && parentId === current.parentId) return structureFolderRecordRead(current)

      const now = new Date().toISOString()
      return databaseTransactionRun<StructureFolder>(db, (transaction) => {
        const updated = transaction
          .update(structureFolderTable)
          .set({ name, parentId, depth, updatedAt: now })
          .where(eq(structureFolderTable.id, structureFolderId))
          .returning()
          .get()
        if (updated === undefined) return resultErrorCreate(op, "The structure folder disappeared during the update")
        for (const descendant of descendants) {
          transaction
            .update(structureFolderTable)
            .set({ depth: descendant.depth + depthDelta, updatedAt: now })
            .where(eq(structureFolderTable.id, descendant.id))
            .run()
        }
        return structureFolderRecordRead(updated)
      })
    } catch (error) {
      return resultErrorCreate(op, "The structure folder could not be updated", error)
    }
  }

  const structureFolderDelete = (projectId: string, structureFolderId: string): Result<StructureFolder | null> => {
    const current = structureFolderRead(projectId, structureFolderId)
    if (!current.success) return current
    if (current.data === null) return current
    return databaseTransactionRun(db, (transaction) => {
      transaction.delete(structureFolderTable).where(eq(structureFolderTable.id, structureFolderId)).run()
      return { success: true, data: current.data } as const
    })
  }

  const assetStructureFolderMembershipsRead = (
    projectId: string,
  ): Result<readonly AssetStructureFolderMembership[]> => {
    try {
      const records = db
        .select({ membership: assetStructureFolderMembershipTable })
        .from(assetStructureFolderMembershipTable)
        .innerJoin(assetTable, eq(assetTable.id, assetStructureFolderMembershipTable.assetId))
        .where(eq(assetTable.projectId, projectId))
        .orderBy(asc(assetStructureFolderMembershipTable.structureFolderId), asc(assetTable.id))
        .all()
      const memberships: AssetStructureFolderMembership[] = []
      for (const record of records) {
        const membership = membershipRecordRead(record.membership)
        if (!membership.success) return membership
        memberships.push(membership.data)
      }
      return { success: true, data: memberships }
    } catch (error) {
      return resultErrorCreate(
        "structureFolderRepositoryMembershipsRead",
        "The asset structure memberships could not be read",
        error,
      )
    }
  }

  const assetStructureFolderMembershipRead = (
    projectId: string,
    assetId: string,
  ): Result<AssetStructureFolderMembership | null> => {
    try {
      const record = db
        .select({ membership: assetStructureFolderMembershipTable })
        .from(assetStructureFolderMembershipTable)
        .innerJoin(assetTable, eq(assetTable.id, assetStructureFolderMembershipTable.assetId))
        .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
        .get()
      if (record === undefined) return { success: true, data: null }
      return membershipRecordRead(record.membership)
    } catch (error) {
      return resultErrorCreate(
        "structureFolderRepositoryMembershipRead",
        "The asset structure membership could not be read",
        error,
      )
    }
  }

  const assetStructureFolderMembershipSet = (
    projectId: string,
    assetId: string,
    structureFolderId: string | null,
  ): Result<AssetStructureFolderMembership | null> => {
    const op = "structureFolderRepositoryMembershipSet"
    try {
      const asset = db
        .select({ id: assetTable.id })
        .from(assetTable)
        .where(and(eq(assetTable.projectId, projectId), eq(assetTable.id, assetId)))
        .get()
      if (asset === undefined) return { success: true, data: null }
      if (structureFolderId !== null) {
        const folder = db
          .select({ id: structureFolderTable.id })
          .from(structureFolderTable)
          .where(and(eq(structureFolderTable.projectId, projectId), eq(structureFolderTable.id, structureFolderId)))
          .get()
        if (folder === undefined) return resultErrorCreate(op, "The structure folder was not found")
      }

      return databaseTransactionRun<AssetStructureFolderMembership | null>(db, (transaction) => {
        const existing = transaction
          .select()
          .from(assetStructureFolderMembershipTable)
          .where(eq(assetStructureFolderMembershipTable.assetId, assetId))
          .get()
        if (structureFolderId === null) {
          if (existing)
            transaction
              .delete(assetStructureFolderMembershipTable)
              .where(eq(assetStructureFolderMembershipTable.assetId, assetId))
              .run()
          return { success: true, data: null } as const
        }
        const now = new Date().toISOString()
        if (existing === undefined) {
          const inserted = databaseRecordInsert(transaction, assetStructureFolderMembershipTable, {
            id: crypto.randomUUID(),
            assetId,
            structureFolderId,
            createdAt: now,
            updatedAt: now,
          })
          if (!inserted.success) return resultErrorCreate(op, "The asset membership could not be created", inserted)
          return membershipRecordRead(inserted.data)
        }
        if (existing.structureFolderId === structureFolderId) return membershipRecordRead(existing)
        const updated = transaction
          .update(assetStructureFolderMembershipTable)
          .set({ structureFolderId, updatedAt: now })
          .where(eq(assetStructureFolderMembershipTable.id, existing.id))
          .returning()
          .get()
        if (updated === undefined) return resultErrorCreate(op, "The asset membership disappeared during the move")
        return membershipRecordRead(updated)
      })
    } catch (error) {
      return resultErrorCreate(op, "The asset structure membership could not be changed", error)
    }
  }

  const structureRead = (
    projectId: string,
  ): Result<{
    folders: readonly StructureFolder[]
    memberships: readonly AssetStructureFolderMembership[]
  }> => {
    const folders = structureFoldersRead(projectId)
    if (!folders.success) return folders
    const memberships = assetStructureFolderMembershipsRead(projectId)
    if (!memberships.success) return memberships
    return { success: true, data: { folders: folders.data, memberships: memberships.data } }
  }

  return {
    structureFoldersRead,
    structureFolderRead,
    structureFolderCreate,
    structureFolderUpdate,
    structureFolderDelete,
    structureRead,
    assetStructureFolderMembershipRead,
    assetStructureFolderMembershipsRead,
    assetStructureFolderMembershipSet,
  }

  function isDescendant(records: readonly StructureFolderRecord[], ancestorId: string, candidateId: string): boolean {
    let currentId: string | null = candidateId
    while (currentId !== null) {
      const current = records.find((record) => record.id === currentId)
      if (current === undefined) return false
      if (current.parentId === ancestorId) return true
      currentId = current.parentId
    }
    return false
  }
}
