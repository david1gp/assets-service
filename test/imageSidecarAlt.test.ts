import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { imageSidecarAltRead } from "../src/asset-cli/imageSidecarAltRead.js"

const fixtureCreate = async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-image-sidecar-alt-"))
  const imagePath = join(root, "hero.jpg")
  await writeFile(imagePath, "image")
  return { root, imagePath }
}

test("image sidecar alt prefers markdown over text", async () => {
  const fixture = await fixtureCreate()
  try {
    await writeFile(join(fixture.root, "hero.txt"), "Text alt")
    await writeFile(join(fixture.root, "hero.md"), "# Markdown alt\n")

    expect(await imageSidecarAltRead(fixture.imagePath)).toEqual({
      success: true,
      data: { alt: "# Markdown alt", sidecarPath: join(fixture.root, "hero.md") },
    })
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("image sidecar alt falls back to text", async () => {
  const fixture = await fixtureCreate()
  try {
    await writeFile(join(fixture.root, "hero.txt"), "Text alt")

    expect(await imageSidecarAltRead(fixture.imagePath)).toEqual({
      success: true,
      data: { alt: "Text alt", sidecarPath: join(fixture.root, "hero.txt") },
    })
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("image sidecar alt returns null when no sidecar exists", async () => {
  const fixture = await fixtureCreate()
  try {
    expect(await imageSidecarAltRead(fixture.imagePath)).toEqual({
      success: true,
      data: { alt: null, sidecarPath: null },
    })
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("image sidecar alt returns null for an empty file", async () => {
  const fixture = await fixtureCreate()
  try {
    const sidecarPath = join(fixture.root, "hero.md")
    await writeFile(sidecarPath, "")

    expect(await imageSidecarAltRead(fixture.imagePath)).toEqual({
      success: true,
      data: { alt: null, sidecarPath },
    })
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("image sidecar alt returns null for whitespace-only content", async () => {
  const fixture = await fixtureCreate()
  try {
    const sidecarPath = join(fixture.root, "hero.txt")
    await writeFile(sidecarPath, " \n\t ")

    expect(await imageSidecarAltRead(fixture.imagePath)).toEqual({
      success: true,
      data: { alt: null, sidecarPath },
    })
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("image sidecar alt trims surrounding whitespace", async () => {
  const fixture = await fixtureCreate()
  try {
    await writeFile(join(fixture.root, "hero.md"), " \n  Hero alt  \n")

    const result = await imageSidecarAltRead(fixture.imagePath)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.alt).toBe("Hero alt")
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("image sidecar alt rejects content over 10000 characters", async () => {
  const fixture = await fixtureCreate()
  try {
    await writeFile(join(fixture.root, "hero.txt"), "a".repeat(10001))

    const result = await imageSidecarAltRead(fixture.imagePath)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.op).toBe("imageSidecarAltRead")
    expect(result.errorMessage).toContain("10000")
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})
