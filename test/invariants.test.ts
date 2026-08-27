import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { assetBasenameCreate } from "../src/asset/assetBasenameCreate.js"
import { assetIdentifierCreate } from "../src/asset/assetIdentifierCreate.js"
import { assetIdentitiesUniqueCheck } from "../src/asset/assetIdentitiesUniqueCheck.js"
import { assetIdentityEqual } from "../src/asset/assetIdentityEqual.js"
import { assetIdentitySchema } from "../src/asset/assetIdentitySchema.js"
import { assetSourcePathCreate } from "../src/asset/assetSourcePathCreate.js"
import { foldersDatabaseColumnsCreate } from "../src/asset/foldersDatabaseColumnsCreate.js"
import { foldersDatabaseColumnsRead } from "../src/asset/foldersDatabaseColumnsRead.js"
import { outputKeySchema } from "../src/output/outputKeySchema.js"
import { outputRemoteObjectKeyCreate } from "../src/output/outputRemoteObjectKeyCreate.js"
import { outputVersionDecisionCreate } from "../src/output/outputVersionDecisionCreate.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"

const identity = (basename: string, folders = ["home"] as string[]) =>
  v.parse(assetIdentitySchema, { projectId: "project-1", class: "image", folders, basename })

describe("asset invariants", () => {
  test("round-trips normalized folder columns and preserves case-sensitive identity", () => {
    const columns = foldersDatabaseColumnsCreate(["e\u0301", "Hero"])
    expect(columns).toEqual({ success: true, data: { folder1: "é", folder2: "Hero", folder3: null } })
    if (!columns.success) return
    expect(foldersDatabaseColumnsRead(columns.data)).toEqual({ success: true, data: ["é", "Hero"] })

    expect(assetIdentityEqual(identity("hero"), identity("hero"))).toBe(true)
    expect(assetIdentityEqual(identity("hero"), identity("Hero"))).toBe(false)
    expect(assetIdentitiesUniqueCheck([identity("hero"), identity("Hero")]).success).toBe(true)
    expect(assetIdentitiesUniqueCheck([identity("hero"), identity("hero")]).success).toBe(false)
  })

  test("derives source paths, identifiers, and immutable output names", () => {
    const folders = ["home"]
    expect(assetBasenameCreate("hero.original.jpg")).toBe("hero.original")
    expect(assetSourcePathCreate(folders, "hero.jpg")).toBe("home/hero.jpg")
    expect(assetIdentifierCreate(folders, "hero", "1920x1080-webp")).toBe("home_hero_1920x1080_webp")
    expect(assetIdentifierCreate(folders, "hero", "default")).toBe("home_hero")
    expect(assetIdentifierCreate([], "123", "default")).toBe("i123")
    expect(
      outputRemoteObjectKeyCreate({
        assetClass: "image",
        folders,
        basename: "hero",
        outputKey: "1920x1080_webp",
        version: 3,
        extension: "webp",
      }),
    ).toBe("images/home/hero_1920x1080_webp_v3.webp")
  })

  test("reuses exact bytes and rejects checksum-size collisions", () => {
    const sha256 = contentSha256Create(new TextEncoder().encode("asset"))
    expect(outputVersionDecisionCreate([{ version: 1, byteSize: 5, sha256 }], 5, sha256)).toEqual({
      kind: "reuse",
      version: 1,
    })
    expect(outputVersionDecisionCreate([{ version: 1, byteSize: 5, sha256 }], 6, sha256)).toEqual({
      kind: "collision",
      version: 1,
    })
    expect(outputVersionDecisionCreate([{ version: 1, byteSize: 5, sha256 }], 6, "a".repeat(64))).toEqual({
      kind: "allocate",
      version: 2,
    })
    expect(v.safeParse(outputKeySchema, "../escape").success).toBe(false)
  })
})
