import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"

import pkg from "../package.json" with { type: "json" }
import { assetsLocalCliMain } from "../src/entrypoints/assets-local-cli.js"
import { memoryStorageAdapterCreate } from "../src/infrastructure/storage/memoryStorageAdapter.js"
import { assetsLocalServiceCreate } from "../src/local/assetsLocalServiceCreate.js"
import { localOutputPublisherCreate } from "../src/local/localOutputPublisherCreate.js"

const localCliEnvironment = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: undefined,
  R2_ACCESS_KEY_ID: undefined,
  R2_SECRET_ACCESS_KEY: undefined,
  ASSETS_R2_ENDPOINT: undefined,
  ASSETS_R2_BUCKET: undefined,
}

const cliRun = async (root: string, args: readonly string[]) => {
  const output: string[] = []
  const exitCode = await assetsLocalCliMain([...args, "--root", root, "--json"], {
    env: localCliEnvironment,
    stdout: (text) => output.push(text),
  })
  return { exitCode, value: JSON.parse(output[0] ?? "{}") as { ok: boolean; data?: any; error?: any } }
}

test("reports the package version before configuring the local service", async () => {
  const output: string[] = []
  const exitCode = await assetsLocalCliMain(["--version"], {
    env: { ASSETS_LOCAL_ROOT: "\u0000invalid-root" },
    stdout: (text) => output.push(text),
  })

  expect(exitCode).toBe(0)
  expect(output).toEqual([`assets-local ${pkg.version}\n`])
})

test("local import writes content-hashed outputs and deterministic lists", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-local-"))
  try {
    await mkdir(join(root, "images", "500x500_webp", "home"), { recursive: true })
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: { r: 220, g: 40, b: 30 } },
    })
      .png()
      .toBuffer()
    await writeFile(join(root, "images", "500x500_webp", "home", "hero.png"), image)
    await writeFile(join(root, "images", "500x500_webp", "home", "hero.txt"), "A home hero")
    await writeFile(join(root, "images", "500x500_webp", "home", "unused.png"), image)

    const imported = await cliRun(root, ["import", root])
    expect(imported.exitCode).toBe(0)
    expect(imported.value.ok).toBe(true)
    const importedAssets = imported.value.data?.assets as Array<{
      sourcePath: string
      outputs: Array<{ path: string; sha256: string }>
    }>
    expect(importedAssets).toHaveLength(2)
    const output = importedAssets.find((asset) => asset.sourcePath.endsWith("hero.png"))?.outputs[0]
    expect(output?.path).toMatch(/^images\/home\/hero_500x500_webp_[0-9a-f]{8}\.webp$/u)
    expect(output?.sha256).toHaveLength(64)
    expect((await readFile(join(root, "public", output?.path ?? ""))).byteLength).toBeGreaterThan(0)

    const listed = await cliRun(root, ["list"])
    expect(listed.value.data?.assets).toHaveLength(2)
    const generated = await cliRun(root, ["lists"])
    expect(generated.exitCode).toBe(0)
    expect(generated.value.data?.written).toBe(true)
    const checked = await cliRun(root, ["lists", "--check"])
    expect(checked.exitCode).toBe(0)
    expect(checked.value.data?.matches).toBe(true)

    await writeFile(join(root, "src", "app", "assets", "imageList.ts"), "different\n")
    const mismatch = await cliRun(root, ["lists", "--check"])
    expect(mismatch.exitCode).toBe(1)
    expect(mismatch.value.data?.matches).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("local fallback imports byte-preserving documents and writes documentList", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-local-documents-"))
  try {
    await mkdir(join(root, "documents", "guides"), { recursive: true })
    const source = new Uint8Array([0, 1, 2, 0xff, 0x0a])
    await writeFile(join(root, "documents", "guides", "guide.txt"), source)

    const imported = await cliRun(root, ["import", root])
    expect(imported.exitCode).toBe(0)
    const asset = (
      imported.value.data?.assets as
        | Array<{
            class: string
            sourcePath: string
            outputs: Array<{ key: string; path: string; mediaType: string }>
          }>
        | undefined
    )?.[0]
    expect(asset).toMatchObject({ class: "document", sourcePath: "documents/guides/guide.txt" })
    expect(asset?.outputs[0]).toMatchObject({ key: "default", mediaType: "text/plain" })
    expect(
      Buffer.from(await readFile(join(root, "public", asset?.outputs[0]?.path ?? ""))).equals(Buffer.from(source)),
    ).toBe(true)

    const listed = await cliRun(root, ["lists"])
    expect(listed.exitCode).toBe(0)
    expect(await readFile(join(root, "src", "app", "assets", "documentList.ts"), "utf8")).toContain("guides_guide")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("local references include zero counts and ignore dynamic accesses", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-references-"))
  try {
    await mkdir(join(root, "images", "100x100_webp"), { recursive: true })
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 20, g: 30, b: 40 } },
    })
      .png()
      .toBuffer()
    await writeFile(join(root, "images", "100x100_webp", "used.png"), image)
    await writeFile(join(root, "images", "100x100_webp", "unused.png"), image)
    const imported = await cliRun(root, ["import", root])
    expect(imported.exitCode).toBe(0)
    const assets = imported.value.data?.assets as Array<{ sourcePath: string; outputs: Array<{ path: string }> }>
    const used = assets.find((asset) => asset.sourcePath.endsWith("/used.png"))
    const unused = assets.find((asset) => asset.sourcePath.endsWith("/unused.png"))
    expect(used).toBeDefined()
    expect(unused).toBeDefined()
    const usedKey = "used_100x100_webp"
    const unusedKey = "unused_100x100_webp"
    await mkdir(join(root, "src", "pages"), { recursive: true })
    await writeFile(
      join(root, "src", "pages", "Home.tsx"),
      `import { imageList as images } from "../app/assets/imageList"
const { ${usedKey}: hero } = images
const direct = images.${usedKey}
const bracket = images["${usedKey}"]
const dynamic = images[window.location.hash]
void hero
void direct
void bracket
void dynamic
 const path = "${used?.outputs[0]?.path ?? ""}"
       const details = { path, label: "${used?.outputs[0]?.path ?? ""}" }
       void details
`,
    )
    await writeFile(
      join(root, "src", "pages", "Home.html"),
      `<img src="/${used?.outputs[0]?.path ?? ""}" data-name="/${used?.outputs[0]?.path ?? ""}" aria-label="/${used?.outputs[0]?.path ?? ""}"><a href="/${used?.outputs[0]?.path ?? ""}">Card</a><script>const ignored = "${used?.outputs[0]?.path ?? ""}"</script><!-- "${used?.outputs[0]?.path ?? ""}" -->`,
    )
    const references = await cliRun(root, ["references", "--include", "src/pages"])
    expect(references.exitCode).toBe(0)
    expect(references.value.data).toEqual({ [usedKey]: 7, [unusedKey]: 0 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("local output, metadata, move, and delete commands update state atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-local-mutations-"))
  try {
    await mkdir(join(root, "images", "80x80_webp"), { recursive: true })
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 80, g: 90, b: 100 } },
    })
      .png()
      .toBuffer()
    await writeFile(join(root, "images", "80x80_webp", "card.png"), image)
    const imported = await cliRun(root, ["import", root])
    expect(imported.exitCode).toBe(0)
    const key = "card_80x80_webp"

    const added = await cliRun(root, ["outputs", "add", key, "--width", "40", "--height", "40", "--format", "png"])
    expect(added.exitCode).toBe(0)
    const addedAsset = added.value.data?.asset as { outputs: Array<{ key: string; path: string }> } | undefined
    expect(addedAsset).toBeDefined()
    if (addedAsset === undefined) return
    expect(addedAsset.outputs.some((output) => output.key === "40x40_png")).toBe(true)
    const oldOutputPath = addedAsset.outputs[0]?.path

    const metadata = await cliRun(root, ["metadata", "set", key, "--alt", "Card image"])
    expect(metadata.exitCode).toBe(0)
    const unset = await cliRun(root, ["metadata", "unset", key, "--alt"])
    expect(unset.exitCode).toBe(0)

    const moved = await cliRun(root, ["move", key, "--to", "home/card.png"])
    expect(moved.exitCode).toBe(0)
    expect(moved.value.data?.asset.sourcePath as string).toBe("images/80x80_webp/home/card.png")
    expect(
      oldOutputPath === undefined ? false : (await readFile(join(root, "public", oldOutputPath))).byteLength > 0,
    ).toBe(true)
    const removed = await cliRun(root, ["delete", "home_card_80x80_webp"])
    expect(removed.exitCode).toBe(0)
    const listed = await cliRun(root, ["list"])
    expect(listed.value.data?.assets).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("local upload does not fall back to filesystem-only success without R2 configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-local-upload-"))
  const source = await mkdtemp(join(tmpdir(), "assets-service-local-upload-source-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer()
    const sourcePath = join(source, "card.png")
    await writeFile(sourcePath, image)
    const result = await cliRun(root, ["upload", sourcePath, "--path", "images/80x80_webp/card.png"])
    expect(result.exitCode).toBe(1)
    expect(result.value.ok).toBe(false)
    expect(result.value.error?.message).toContain("requires R2 credentials")
    expect(await readFile(join(root, "images", "80x80_webp", "card.png")).catch(() => null)).toBeNull()
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})

test("local upload publishes hash-named outputs and removes local binaries after verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-local-publish-"))
  const source = await mkdtemp(join(tmpdir(), "assets-service-local-publish-source-"))
  try {
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 6, b: 7 } },
    })
      .png()
      .toBuffer()
    const sourcePath = join(source, "card.png")
    await writeFile(sourcePath, image)
    const adapter = memoryStorageAdapterCreate()
    const publisher = localOutputPublisherCreate({
      adapter,
      binding: {
        projectId: "assets-local",
        environment: "development",
        bucket: "assets-development",
        prefix: "assets-local",
        publicBaseUrl: "https://assets.example.test",
      },
    })
    const service = assetsLocalServiceCreate({
      root,
      statePath: join(root, ".assets-service", "state.json"),
      outputPublisher: publisher,
      remoteRequired: true,
    })
    const uploaded = await service.upload(sourcePath, "images/80x80_webp/card.png", "Use the card")
    expect(uploaded.success).toBe(true)
    if (!uploaded.success) return
    expect(uploaded.data.asset.publishedAt).toBeString()
    expect(uploaded.data.asset.outputs[0]?.path).toMatch(/^images\/card_80x80_webp_[0-9a-f]{8}\.webp$/u)
    expect(await readFile(join(root, uploaded.data.asset.sourcePath)).catch(() => null)).toBeNull()
    expect(
      await readFile(join(root, "public", uploaded.data.asset.outputs[0]?.path ?? "")).catch(() => null),
    ).toBeNull()
    const listed = await service.list()
    expect(listed.success).toBe(true)
    if (listed.success) expect(listed.data.assets[0]?.integrationNote).toBe("Use the card")
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})

test("local published assets keep mutation and deletion parity through the deterministic adapter", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-service-local-parity-"))
  const source = await mkdtemp(join(tmpdir(), "assets-service-local-parity-source-"))
  try {
    const image = await sharp({
      create: { width: 8, height: 4, channels: 3, background: { r: 15, g: 25, b: 35 } },
    })
      .png()
      .toBuffer()
    const sourcePath = join(source, "card.png")
    await writeFile(sourcePath, image)
    const adapter = memoryStorageAdapterCreate()
    const publisher = localOutputPublisherCreate({
      adapter,
      binding: {
        projectId: "assets-local-parity",
        environment: "development",
        bucket: "assets-development",
        prefix: "assets-local-parity",
        publicBaseUrl: "https://assets.example.test",
      },
    })
    const service = assetsLocalServiceCreate({
      root,
      statePath: join(root, ".assets-service", "state.json"),
      outputPublisher: publisher,
      remoteRequired: true,
    })
    const uploaded = await service.upload(sourcePath, "images/80x80_webp/card.png")
    expect(uploaded.success).toBe(true)
    if (!uploaded.success) return

    const added = await service.outputsAdd(uploaded.data.asset.id, {
      kind: "image",
      key: "40x40_png",
      width: 40,
      height: 40,
      format: "png",
    })
    expect(added.success).toBe(true)
    if (!added.success) return
    expect(added.data.asset.publishedAt).toBeString()
    expect(added.data.asset.outputs.some((output) => output.key === "40x40_png")).toBe(true)
    expect(await readFile(join(root, added.data.asset.sourcePath)).catch(() => null)).toBeNull()

    const moved = await service.move(uploaded.data.asset.id, "home/card.png")
    expect(moved.success).toBe(true)
    if (!moved.success) return
    expect(moved.data.asset.folders).toEqual(["home"])
    expect(moved.data.asset.publishedAt).toBeString()
    expect(moved.data.asset.unreferencedPaths.length).toBeGreaterThan(0)

    const deleted = await service.remove(moved.data.asset.id)
    expect(deleted).toMatchObject({ success: true })
    const objects = await adapter.listObjects?.({ bucket: "assets-development" })
    expect(objects).toMatchObject({ success: true, data: { objects: [] } })
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})
