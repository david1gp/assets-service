import { expect, test } from "bun:test"
import * as v from "valibot"

import { outputDefinitionInputSchema } from "../src/api-client/outputDefinitionInputSchema.js"
import { uploadIntentRequestSchema } from "../src/api-client/uploadIntentRequestSchema.js"
import { assetClassSchema } from "../src/schemas/assetClassSchema.js"
import { databaseClose } from "../src/infrastructure/db/databaseClose.js"
import { databaseMigrate } from "../src/infrastructure/db/databaseMigrate.js"
import { databaseOpen } from "../src/infrastructure/db/databaseOpen.js"
import { databaseRecordInsert } from "../src/infrastructure/db/databaseRecordInsert.js"
import { databaseTransactionRun } from "../src/infrastructure/db/databaseTransactionRun.js"
import { assetTable } from "../src/infrastructure/db/schema/assetTable.js"
import { organizationTable } from "../src/infrastructure/db/schema/organizationTable.js"
import { outputDefinitionTable } from "../src/infrastructure/db/schema/outputDefinitionTable.js"
import { outputVersionTable } from "../src/infrastructure/db/schema/outputVersionTable.js"
import { projectTable } from "../src/infrastructure/db/schema/projectTable.js"
import { sourceRevisionTable } from "../src/infrastructure/db/schema/sourceRevisionTable.js"
import { documentExtensionSchema } from "../src/document/documentExtensionSchema.js"
import { documentMediaTypeSchema } from "../src/document/documentMediaTypeSchema.js"
import { documentOutputDefinitionSchema } from "../src/output/documentOutputDefinitionSchema.js"
import { outputVersionSchema } from "../src/output/outputVersionSchema.js"
import { sourceRevisionSchema } from "../src/upload/sourceRevisionSchema.js"
import { documentExtensionMediaTypes } from "../src/document/documentExtensionMediaTypes.js"

const now = "2026-08-18T00:00:00.000Z"
const documentCases = [
  { extension: "pdf", mediaType: "application/pdf" },
  { extension: "json", mediaType: "application/json" },
  { extension: "doc", mediaType: "application/msword" },
  { extension: "docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { extension: "xls", mediaType: "application/vnd.ms-excel" },
  { extension: "xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { extension: "xlsm", mediaType: "application/vnd.ms-excel.sheet.macroenabled.12" },
  { extension: "ppt", mediaType: "application/vnd.ms-powerpoint" },
  { extension: "pptx", mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  { extension: "odt", mediaType: "application/vnd.oasis.opendocument.text" },
  { extension: "ods", mediaType: "application/vnd.oasis.opendocument.spreadsheet" },
  { extension: "odp", mediaType: "application/vnd.oasis.opendocument.presentation" },
  { extension: "rtf", mediaType: "application/rtf" },
  { extension: "csv", mediaType: "text/csv" },
  { extension: "txt", mediaType: "text/plain" },
] as const

test("document schemas accept only the supported passthrough contract", () => {
  expect(v.safeParse(assetClassSchema, "document").success).toBe(true)
  for (const documentCase of documentCases) {
    expect(v.safeParse(documentMediaTypeSchema, documentCase.mediaType).success).toBe(true)
    expect(v.safeParse(documentExtensionSchema, documentCase.extension).success).toBe(true)
    expect(documentExtensionMediaTypes[documentCase.extension]).toBe(documentCase.mediaType)
  }
  expect(
    v.safeParse(documentOutputDefinitionSchema, {
      id: "output-document",
      assetId: "asset-document",
      kind: "document",
      key: "default",
    }).success,
  ).toBe(true)
  expect(v.safeParse(outputDefinitionInputSchema, { kind: "document", key: "default" }).success).toBe(true)
  expect(v.safeParse(outputDefinitionInputSchema, { kind: "document", key: "preview" }).success).toBe(false)
  for (const [index, documentCase] of documentCases.entries()) {
    const uploadIntent = {
      originalFilename: `guide.${documentCase.extension}`,
      folders: [],
      integrationNote: "document",
      byteSize: 8,
      mediaType: documentCase.mediaType,
    }
    expect(v.safeParse(uploadIntentRequestSchema, uploadIntent).success).toBe(true)
    for (const wrongCase of documentCases) {
      if (wrongCase.extension === documentCase.extension) continue
      expect(
        v.safeParse(uploadIntentRequestSchema, { ...uploadIntent, originalFilename: `guide.${wrongCase.extension}` })
          .success,
      ).toBe(false)
    }

    const source = {
      id: `source-document-schema-${index}`,
      assetId: `asset-document-schema-${index}`,
      revision: 1,
      class: "document",
      originalFilename: `guide.${documentCase.extension}`,
      mediaType: documentCase.mediaType,
      byteSize: 8,
      sha256: "a".repeat(64),
      objectKey: `sources/source-document-schema-${index}/guide.${documentCase.extension}`,
      createdAt: now,
    }
    expect(v.safeParse(sourceRevisionSchema, source).success).toBe(true)
    for (const wrongCase of documentCases) {
      if (wrongCase.extension === documentCase.extension) continue
      expect(
        v.safeParse(sourceRevisionSchema, { ...source, originalFilename: `guide.${wrongCase.extension}` }).success,
      ).toBe(false)
    }

    const version = {
      id: `version-document-schema-${index}`,
      outputDefinitionId: `output-document-schema-${index}`,
      assetId: `asset-document-schema-${index}`,
      sourceRevisionId: null,
      version: 1,
      byteSize: 8,
      sha256: "b".repeat(64),
      mediaType: documentCase.mediaType,
      extension: documentCase.extension,
      objectKey: `documents/guide_default_v1.${documentCase.extension}`,
      toolchainVersion: "test",
      current: true,
      createdAt: now,
    }
    expect(v.safeParse(outputVersionSchema, version).success).toBe(true)
    for (const wrongCase of documentCases) {
      if (wrongCase.extension === documentCase.extension) continue
      expect(v.safeParse(outputVersionSchema, { ...version, extension: wrongCase.extension }).success).toBe(false)
    }
  }
})

test("document constraints survive the SQLite migration", () => {
  const opened = databaseOpen(":memory:")
  expect(opened.success).toBe(true)
  if (!opened.success) return

  try {
    expect(databaseMigrate(opened.data).success).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, organizationTable, {
        id: "org-document",
        name: "Documents",
        slug: "documents",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, projectTable, {
        id: "project-document",
        organizationId: "org-document",
        name: "Documents",
        slug: "documents",
        defaultEnvironment: "development",
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)

    expect(
      databaseTransactionRun(opened.data.db, (transaction) => {
        const asset = databaseRecordInsert(transaction, assetTable, {
          id: "asset-document",
          projectId: "project-document",
          class: "document",
          folder1: null,
          folder2: null,
          folder3: null,
          filename: "guide.pdf",
          basename: "guide",
          currentSourceRevisionId: "source-document",
          integrationNote: null,
          createdAt: now,
          updatedAt: now,
        })
        if (!asset.success) return asset
        return databaseRecordInsert(transaction, sourceRevisionTable, {
          id: "source-document",
          assetId: "asset-document",
          revision: 1,
          class: "document",
          originalFilename: "guide.pdf",
          mediaType: "application/pdf",
          byteSize: 8,
          sha256: "a".repeat(64),
          objectKey: "sources/source-document/guide.pdf",
          createdAt: now,
        })
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, outputDefinitionTable, {
        id: "output-document",
        assetId: "asset-document",
        kind: "document",
        key: "default",
        width: null,
        height: null,
        format: null,
        quality: null,
        showAiLabel: null,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true)
    expect(
      databaseRecordInsert(opened.data.db, outputVersionTable, {
        id: "version-document",
        outputDefinitionId: "output-document",
        assetId: "asset-document",
        version: 1,
        byteSize: 8,
        sha256: "b".repeat(64),
        mediaType: "application/pdf",
        extension: "pdf",
        objectKey: "documents/guide_default_v1.pdf",
        toolchainVersion: "passthrough",
        width: null,
        height: null,
        current: true,
        createdAt: now,
      }).success,
    ).toBe(true)

    for (const [index, documentCase] of documentCases.entries()) {
      const assetId = `asset-document-migration-${index}`
      const sourceId = `source-document-migration-${index}`
      expect(
        databaseTransactionRun(opened.data.db, (transaction) => {
          const asset = databaseRecordInsert(transaction, assetTable, {
            id: assetId,
            projectId: "project-document",
            class: "document",
            folder1: null,
            folder2: null,
            folder3: null,
            filename: `guide.${documentCase.extension}`,
            basename: `guide-${index}`,
            currentSourceRevisionId: sourceId,
            integrationNote: null,
            createdAt: now,
            updatedAt: now,
          })
          if (!asset.success) return asset
          const source = databaseRecordInsert(transaction, sourceRevisionTable, {
            id: sourceId,
            assetId,
            revision: 1,
            class: "document",
            originalFilename: `guide.${documentCase.extension}`,
            mediaType: documentCase.mediaType,
            byteSize: 8,
            sha256: "a".repeat(64),
            objectKey: `sources/${sourceId}/guide.${documentCase.extension}`,
            createdAt: now,
          })
          if (!source.success) return source
          const definition = databaseRecordInsert(transaction, outputDefinitionTable, {
            id: `output-document-migration-${index}`,
            assetId,
            kind: "document",
            key: "default",
            width: null,
            height: null,
            format: null,
            quality: null,
            showAiLabel: null,
            createdAt: now,
            updatedAt: now,
          })
          if (!definition.success) return definition
          return databaseRecordInsert(transaction, outputVersionTable, {
            id: `version-document-migration-${index}`,
            outputDefinitionId: `output-document-migration-${index}`,
            assetId,
            version: 1,
            byteSize: 8,
            sha256: "b".repeat(64),
            mediaType: documentCase.mediaType,
            extension: documentCase.extension,
            objectKey: `documents/migration-${index}/guide_default_v1.${documentCase.extension}`,
            toolchainVersion: "passthrough",
            width: null,
            height: null,
            current: true,
            createdAt: now,
          })
        }).success,
      ).toBe(true)
    }

    expect(
      databaseRecordInsert(opened.data.db, sourceRevisionTable, {
        id: "source-document-invalid",
        assetId: "asset-document",
        revision: 2,
        class: "document",
        originalFilename: "guide.json",
        mediaType: "application/pdf",
        byteSize: 8,
        sha256: "c".repeat(64),
        objectKey: "sources/source-document/guide.json",
        createdAt: now,
      }).success,
    ).toBe(false)
    expect(
      databaseRecordInsert(opened.data.db, outputDefinitionTable, {
        id: "output-document-invalid",
        assetId: "asset-document",
        kind: "document",
        key: "preview",
        width: null,
        height: null,
        format: null,
        quality: null,
        showAiLabel: null,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(false)
    expect(
      databaseRecordInsert(opened.data.db, outputVersionTable, {
        id: "version-document-invalid",
        outputDefinitionId: "output-document",
        assetId: "asset-document",
        version: 2,
        byteSize: 8,
        sha256: "d".repeat(64),
        mediaType: "application/pdf",
        extension: "json",
        objectKey: "documents/guide_default_v2.json",
        toolchainVersion: "passthrough",
        width: null,
        height: null,
        current: false,
        createdAt: now,
      }).success,
    ).toBe(false)

    for (const [index, documentCase] of documentCases.entries()) {
      const wrongCase = documentCases[(index + 1) % documentCases.length]
      if (wrongCase === undefined) continue
      expect(
        databaseRecordInsert(opened.data.db, sourceRevisionTable, {
          id: `source-document-invalid-${index}`,
          assetId: "asset-document",
          revision: 10 + index,
          class: "document",
          originalFilename: `guide.${wrongCase.extension}`,
          mediaType: documentCase.mediaType,
          byteSize: 8,
          sha256: `${index}`.padStart(64, "c"),
          objectKey: `sources/source-document-invalid-${index}/guide.${wrongCase.extension}`,
          createdAt: now,
        }).success,
      ).toBe(false)
      expect(
        databaseRecordInsert(opened.data.db, outputVersionTable, {
          id: `version-document-invalid-${index}`,
          outputDefinitionId: "output-document",
          assetId: "asset-document",
          version: 10 + index,
          byteSize: 8,
          sha256: `${index}`.padStart(64, "d"),
          mediaType: documentCase.mediaType,
          extension: wrongCase.extension,
          objectKey: `documents/guide_default_v${10 + index}.${wrongCase.extension}`,
          toolchainVersion: "passthrough",
          width: null,
          height: null,
          current: false,
          createdAt: now,
        }).success,
      ).toBe(false)
    }
  } finally {
    databaseClose(opened.data)
  }
})
