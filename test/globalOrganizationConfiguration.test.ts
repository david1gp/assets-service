import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as v from "valibot"

import { directoryOrganizationResolve } from "../src/config/directoryOrganizationResolve.js"
import { globalOrganizationConfigurationCompatibilityPathResolve } from "../src/config/globalOrganizationConfigurationCompatibilityPathResolve.js"
import { globalOrganizationConfigurationPathResolve } from "../src/config/globalOrganizationConfigurationPathResolve.js"
import { globalOrganizationConfigurationRead } from "../src/config/globalOrganizationConfigurationRead.js"
import { globalOrganizationConfigurationSchema } from "../src/config/globalOrganizationConfigurationSchema.js"
import type { GlobalOrganizationConfiguration } from "../src/config/globalOrganizationConfigurationSchema.js"

const configuration: GlobalOrganizationConfiguration = {
  organizations: {
    david: { id: "org-david", name: "David", slug: "david" },
    contentoren: { id: "org-contentoren", name: "Contentoren", slug: "contentoren" },
  },
  directoryMappings: {
    "~/personal": "david",
    "~/leo": "contentoren",
  },
}

const environmentCreate = (homeDirectory: string): NodeJS.ProcessEnv => ({ HOME: homeDirectory })

const configurationWrite = async (path: string, value: unknown): Promise<void> => {
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}

test("global organization configuration schema defaults missing directory mappings to an empty object", () => {
  const result = v.safeParse(globalOrganizationConfigurationSchema, { organizations: configuration.organizations })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.output).toEqual({ organizations: configuration.organizations, directoryMappings: {} })
})

test("global organization configuration schema keeps directory mappings strict", () => {
  const result = v.safeParse(globalOrganizationConfigurationSchema, {
    organizations: configuration.organizations,
    directoryMappings: { "~/personal": "unknown" },
  })
  expect(result.success).toBe(false)
})

test("global organization configuration reader defaults missing directory mappings to an empty object", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    const environment = environmentCreate(homeDirectory)
    await configurationWrite(globalOrganizationConfigurationPathResolve({ env: environment }), {
      organizations: configuration.organizations,
    })
    expect(await globalOrganizationConfigurationRead({ env: environment })).toEqual({
      success: true,
      data: { organizations: configuration.organizations, directoryMappings: {} },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("global organization configuration uses the canonical assets-service path", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    const environment = environmentCreate(homeDirectory)
    expect(globalOrganizationConfigurationPathResolve({ env: environment })).toBe(
      join(homeDirectory, ".config", "assets-service", "config.json"),
    )
    expect(globalOrganizationConfigurationCompatibilityPathResolve({ env: environment })).toBe(
      join(homeDirectory, ".config", "assets", "config.json"),
    )
    await configurationWrite(globalOrganizationConfigurationPathResolve({ env: environment }), configuration)
    const result = await globalOrganizationConfigurationRead({ env: environment })
    expect(result).toEqual({ success: true, data: configuration })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("global organization configuration falls back to the legacy path only when canonical is absent", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    const environment = environmentCreate(homeDirectory)
    const compatibilityPath = globalOrganizationConfigurationCompatibilityPathResolve({ env: environment })
    await configurationWrite(compatibilityPath, configuration)
    expect(await globalOrganizationConfigurationRead({ env: environment })).toEqual({
      success: true,
      data: configuration,
    })

    await configurationWrite(globalOrganizationConfigurationPathResolve({ env: environment }), {
      ...configuration,
      directoryMappings: { "~/canonical": "david" },
    })
    const canonical = await globalOrganizationConfigurationRead({ env: environment })
    expect(canonical).toEqual({
      success: true,
      data: { ...configuration, directoryMappings: { "~/canonical": "david" } },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("global organization configuration does not use compatibility after a canonical read failure", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    const environment = environmentCreate(homeDirectory)
    await configurationWrite(
      globalOrganizationConfigurationCompatibilityPathResolve({ env: environment }),
      configuration,
    )
    await configurationWrite(globalOrganizationConfigurationPathResolve({ env: environment }), "not-json")
    const result = await globalOrganizationConfigurationRead({ env: environment })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toContain("assets-service")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("global organization configuration returns null when neither path is present", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    expect(await globalOrganizationConfigurationRead({ env: environmentCreate(homeDirectory) })).toEqual({
      success: true,
      data: null,
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("global organization configuration ignores the legacy CLI configuration shape at the fallback path", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    const environment = environmentCreate(homeDirectory)
    await configurationWrite(globalOrganizationConfigurationCompatibilityPathResolve({ env: environment }), {
      project: "legacy-project",
      environment: "development",
    })
    expect(await globalOrganizationConfigurationRead({ env: environment })).toEqual({
      success: true,
      data: null,
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("global organization configuration rejects invalid JSON and schema", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-global-config-"))
  try {
    const environment = environmentCreate(homeDirectory)
    const path = globalOrganizationConfigurationPathResolve({ env: environment })
    await configurationWrite(path, { organizations: {} })
    const schemaFailure = await globalOrganizationConfigurationRead({ env: environment })
    expect(schemaFailure.success).toBe(false)

    await writeFile(path, "{")
    const jsonFailure = await globalOrganizationConfigurationRead({ env: environment })
    expect(jsonFailure).toEqual({
      success: false,
      op: "globalOrganizationConfigurationRead",
      errorMessage: `The JSON file ${path} was invalid`,
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("directory organization resolution expands tilde paths and selects the longest containing mapping", () => {
  const homeDirectory = "/home/example"
  expect(directoryOrganizationResolve("~/personal/site/project", configuration, { homeDirectory })).toEqual({
    success: true,
    data: configuration.organizations.david,
  })
  expect(
    directoryOrganizationResolve(
      "/home/example/leo/contentoren-site/assets",
      {
        ...configuration,
        directoryMappings: { ...configuration.directoryMappings, "~/leo/contentoren-site": "david" },
      },
      { homeDirectory },
    ),
  ).toEqual({ success: true, data: configuration.organizations.david })
})

test("directory organization resolution respects path boundaries and leaves adaptive unmapped", () => {
  const homeDirectory = "/home/example"
  expect(directoryOrganizationResolve("~/personal-other/project", configuration, { homeDirectory })).toEqual({
    success: true,
    data: null,
  })
  expect(directoryOrganizationResolve("~/adaptive/project", configuration, { homeDirectory })).toEqual({
    success: true,
    data: null,
  })
  expect(directoryOrganizationResolve("~/personal/../personal/./project", configuration, { homeDirectory })).toEqual({
    success: true,
    data: configuration.organizations.david,
  })
})
