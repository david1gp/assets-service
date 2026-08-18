import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { projectSourceConfigurationDefaults } from "../src/config/projectSourceConfigurationDefaults.js"
import { projectSourceConfigurationOverridesParse } from "../src/config/projectSourceConfigurationOverridesParse.js"
import { projectSourceConfigurationRead } from "../src/config/projectSourceConfigurationRead.js"
import { projectSourceConfigurationResolve } from "../src/config/projectSourceConfigurationResolve.js"

test("source configuration uses project-root-relative defaults and supports disabled classes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-source-config-"))
  try {
    await writeFile(
      join(root, "assets.config.json"),
      JSON.stringify({ image: "media/images", video: null, font: "typefaces" }),
    )
    const result = await projectSourceConfigurationRead(root)
    expect(result).toEqual({
      success: true,
      data: {
        root,
        sourceDirectories: {
          image: join(root, "media", "images"),
          video: null,
          document: join(root, "documents"),
          font: join(root, "typefaces"),
        },
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("source configuration defaults cover every supported class", () => {
  expect(projectSourceConfigurationDefaults).toEqual({
    image: "images",
    video: "videos",
    document: "documents",
    font: "fonts",
  })
})

test("source directory overrides parse changes and one-invocation disables", () => {
  const parsed = projectSourceConfigurationOverridesParse({
    "image-dir": "incoming/images",
    "no-video-dir": true,
    "document-dir": "none",
  })
  expect(parsed).toEqual({
    success: true,
    data: { image: "incoming/images", video: null, document: null },
  })
})

test("source directory overrides are applied without changing the project configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-source-config-"))
  try {
    await writeFile(join(root, "assets.config.json"), JSON.stringify({ image: "images", video: "videos" }))
    const overrides = projectSourceConfigurationOverridesParse({ "image-dir": "incoming", "no-video-dir": true })
    expect(overrides.success).toBe(true)
    if (!overrides.success) return
    const result = await projectSourceConfigurationRead(root, overrides.data)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.sourceDirectories).toEqual({
      image: join(root, "incoming"),
      video: null,
      document: join(root, "documents"),
      font: join(root, "fonts"),
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("source directory overrides reject unknown and malformed options", () => {
  expect(projectSourceConfigurationOverridesParse({ "image-dir": true }).success).toBe(false)
  expect(projectSourceConfigurationOverridesParse({ "unknown-dir": "somewhere" }).success).toBe(false)
  expect(projectSourceConfigurationOverridesParse({ "no-image-dir": "true" }).success).toBe(false)
})

test("source configuration rejects paths outside the project root", () => {
  const result = projectSourceConfigurationResolve("/project", {
    image: "../shared/images",
    video: "videos",
    document: "documents",
    font: "fonts",
  })
  expect(result.success).toBe(false)
})

test("source configuration rejects overlapping class roots", () => {
  const result = projectSourceConfigurationResolve("/project", {
    image: "assets",
    video: "assets/videos",
    document: "documents",
    font: "fonts",
  })
  expect(result).toEqual({
    success: false,
    op: "projectSourceConfigurationResolve",
    errorMessage: "The image and video source directories overlap",
  })
})
