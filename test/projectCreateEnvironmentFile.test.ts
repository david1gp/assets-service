import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import { projectCreateEnvironmentFilePathResolve } from "../src/config/projectCreateEnvironmentFilePathResolve.js"
import { projectCreateEnvironmentFileRead } from "../src/config/projectCreateEnvironmentFileRead.js"

test("projectCreateEnvironmentFilePathResolve resolves exactly ~/.config/assets-service/project-create.env", () => {
  expect(projectCreateEnvironmentFilePathResolve({ homeDirectory: "/custom/home" })).toBe(
    "/custom/home/.config/assets-service/project-create.env",
  )
  expect(projectCreateEnvironmentFilePathResolve({ env: { HOME: "/env/home" } })).toBe(
    "/env/home/.config/assets-service/project-create.env",
  )
  expect(projectCreateEnvironmentFilePathResolve({ env: {} })).toBe(
    join(homedir(), ".config", "assets-service", "project-create.env"),
  )
})

test("projectCreateEnvironmentFileRead loads valid environment variables from the file", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-create-env-"))
  try {
    const envDir = join(root, ".config", "assets-service")
    await mkdir(envDir, { recursive: true })
    const filePath = join(envDir, "project-create.env")
    await writeFile(filePath, "ASSETS_TOKEN=provisioner-pat\nASSETS_API_URL=https://assets.test\n")

    const result = await projectCreateEnvironmentFileRead({ homeDirectory: root })
    expect(result).toEqual({
      success: true,
      data: {
        path: filePath,
        values: {
          ASSETS_TOKEN: "provisioner-pat",
          ASSETS_API_URL: "https://assets.test",
        },
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("projectCreateEnvironmentFileRead returns actionable error when file is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-create-env-absent-"))
  try {
    const expectedPath = join(root, ".config", "assets-service", "project-create.env")
    const result = await projectCreateEnvironmentFileRead({ homeDirectory: root })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.op).toBe("projectCreateEnvironmentFileRead")
      expect(result.errorMessage).toContain("Project creation environment file was not found")
      expect(result.errorMessage).toContain(expectedPath)
      expect(result.errorMessage).toContain("--env-file")
      expect(result.errorMessage).toContain("ASSETS_ENV_FILE")
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("projectCreateEnvironmentFileRead returns clear error without credentials when file is unusable", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-create-env-unusable-"))
  try {
    const envDir = join(root, ".config", "assets-service")
    await mkdir(envDir, { recursive: true })
    const dirAsFile = join(envDir, "project-create.env")
    await mkdir(dirAsFile)

    const isDirResult = await projectCreateEnvironmentFileRead({ homeDirectory: root })
    expect(isDirResult.success).toBe(false)
    if (!isDirResult.success) {
      expect(isDirResult.errorMessage).toContain("Could not read project creation environment file")
      expect(isDirResult.errorMessage).not.toContain("password")
      expect(isDirResult.errorMessage).not.toContain("secret")
    }

    await rm(dirAsFile, { recursive: true, force: true })

    const filePath = join(envDir, "project-create.env")
    await writeFile(filePath, "SECRET_TOKEN=top-secret\0INVALID")
    const invalidResult = await projectCreateEnvironmentFileRead({ homeDirectory: root })
    expect(invalidResult.success).toBe(false)
    if (!invalidResult.success) {
      expect(invalidResult.errorMessage).toContain("was invalid")
      expect(invalidResult.errorMessage).not.toContain("top-secret")
    }

    await writeFile(filePath, "SECRET_TOKEN=top-secret\n")
    await chmod(filePath, 0o000)
    const unreadableResult = await projectCreateEnvironmentFileRead({ homeDirectory: root })
    expect(unreadableResult.success).toBe(false)
    if (!unreadableResult.success) {
      expect(unreadableResult.errorMessage).toContain("Could not read project creation environment file")
      expect(unreadableResult.errorMessage).not.toContain("top-secret")
    }
    await chmod(filePath, 0o600)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
