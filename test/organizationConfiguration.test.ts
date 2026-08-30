import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import { environmentConfigurationResolve } from "../src/config/environmentConfigurationResolve.js"
import { environmentFilePathResolve } from "../src/config/environmentFilePathResolve.js"
import { environmentFileRead } from "../src/config/environmentFileRead.js"
import { organizationConfigurationResolve } from "../src/config/organizationConfigurationResolve.js"

const organizationConfiguration = {
  organizations: {
    david: { id: "org-david", name: "David", slug: "david" },
    contentoren: { id: "org-contentoren", name: "Contentoren", slug: "contentoren" },
  },
  directoryMappings: {},
} as const

const globalConfigurationWrite = async (homeDirectory: string, configuration: unknown): Promise<void> => {
  const path = join(homeDirectory, ".config", "assets-service", "config.json")
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, JSON.stringify(configuration))
}

test("environment file selection prefers the option, then ASSETS_ENV_FILE, then the command root", () => {
  const optionPath = environmentFilePathResolve({
    env: { ASSETS_ENV_FILE: "/from-environment.env", PWD: "/working" },
    envFile: "/from-option.env",
    commandRoot: "/project",
  })
  expect(optionPath).toBe("/from-option.env")
  expect(
    environmentFilePathResolve({
      env: { ASSETS_ENV_FILE: "/from-environment.env", PWD: "/working" },
      commandRoot: "/project",
    }),
  ).toBe("/from-environment.env")
  expect(environmentFilePathResolve({ env: { PWD: "/working" }, commandRoot: "/project" })).toBe("/project/.env")
  expect(environmentFilePathResolve({ env: { PWD: "/working" } })).toBe("/working/.env")
  expect(environmentFilePathResolve({ env: { PWD: "relative-working" }, workingDirectory: "relative-working" })).toBe(
    join(process.cwd(), "relative-working", ".env"),
  )
})

test("environment file parsing follows Bun dotenv syntax and ignores non-assignment lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-env-"))
  try {
    const path = join(root, ".env")
    await writeFile(
      path,
      [
        "# comment",
        'export ASSETS_ORGANIZATION = "contentoren"',
        "SINGLE='a # value'",
        'DOUBLE="line\\nvalue" # comment',
        "UNQUOTED=value # comment",
        "BACKTICK=`backtick value`",
        "EMPTY=",
        "DUPLICATE=first",
        "DUPLICATE=second",
        "bare text tolerated by Bun dotenv parsing",
      ].join("\n"),
    )
    expect(await environmentFileRead(path)).toEqual({
      success: true,
      data: {
        ASSETS_ORGANIZATION: "contentoren",
        SINGLE: "a # value",
        DOUBLE: "line\nvalue",
        UNQUOTED: "value",
        BACKTICK: "backtick value",
        EMPTY: "",
        DUPLICATE: "second",
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("environment configuration lets exported process values override other env-file values", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-env-"))
  try {
    const path = join(root, ".env")
    await writeFile(path, "ASSETS_API_URL=https://from-file.test\nASSETS_TOKEN=file-token\n")
    const result = await environmentConfigurationResolve({
      env: { ASSETS_API_URL: "https://from-process.test", PWD: root },
      commandRoot: root,
    })
    expect(result).toEqual({
      success: true,
      data: {
        environment: {
          ASSETS_API_URL: "https://from-process.test",
          ASSETS_TOKEN: "file-token",
          PWD: root,
        },
        fileEnvironment: { ASSETS_API_URL: "https://from-file.test", ASSETS_TOKEN: "file-token" },
        envFilePath: path,
        envFileLoaded: true,
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("environment configuration gives any process alias precedence over any env-file alias", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-env-alias-precedence-"))
  try {
    const path = join(root, ".env")
    await writeFile(
      path,
      [
        "ASSETS_PROJECT=file-project",
        "ASSETS_TOKEN=file-token",
        "ASSETS_CONFIG_FILE=file-config.json",
        "ASSETS_SESSION_FILE=file-session.json",
      ].join("\n"),
    )
    const result = await environmentConfigurationResolve({
      env: {
        PWD: root,
        ASSETS_PROJECT_ID: "process-project",
        ASSETS_ACCESS_TOKEN: "process-token",
        ASSETS_CONFIG_PATH: "process-config.json",
        ASSETS_SESSION_PATH: "process-session.json",
      },
      commandRoot: root,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.environment).toMatchObject({
      ASSETS_PROJECT_ID: "process-project",
      ASSETS_ACCESS_TOKEN: "process-token",
      ASSETS_CONFIG_PATH: "process-config.json",
      ASSETS_SESSION_PATH: "process-session.json",
    })
    expect(result.data.environment.ASSETS_PROJECT).toBeUndefined()
    expect(result.data.environment.ASSETS_TOKEN).toBeUndefined()
    expect(result.data.environment.ASSETS_CONFIG_FILE).toBeUndefined()
    expect(result.data.environment.ASSETS_SESSION_FILE).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("ASSETS_ENV_FILE selects the file before the command-root default", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-env-selection-"))
  try {
    const selectedPath = join(root, "selected.env")
    await writeFile(join(root, ".env"), "FROM_DEFAULT=yes\n")
    await writeFile(selectedPath, "FROM_SELECTED=yes\n")
    const result = await environmentConfigurationResolve({
      env: { ASSETS_ENV_FILE: selectedPath, PWD: root },
      commandRoot: root,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.envFilePath).toBe(selectedPath)
    expect(result.data.fileEnvironment).toEqual({ FROM_SELECTED: "yes" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("organization resolution applies option, env-file, process, directory, then unrestricted precedence", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-org-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-org-root-"))
  try {
    const mappedRoot = join(root, "mapped")
    await globalConfigurationWrite(homeDirectory, {
      ...organizationConfiguration,
      directoryMappings: { [mappedRoot]: "david" },
    })
    const envFile = join(root, "selected.env")
    await writeFile(envFile, "ASSETS_ORGANIZATION=david\n")
    const base = { HOME: homeDirectory, PWD: root, ASSETS_ORGANIZATION: "contentoren" }

    expect(
      await organizationConfigurationResolve({ env: base, commandRoot: root, envFile, organization: "contentoren" }),
    ).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.contentoren, source: "option" },
    })
    expect(await organizationConfigurationResolve({ env: base, commandRoot: root, envFile })).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.david, source: "env-file" },
    })
    expect(
      await organizationConfigurationResolve({
        env: { ...base, ASSETS_ORGANIZATION: "" },
        commandRoot: root,
        envFile,
      }),
    ).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.david, source: "env-file" },
    })
    await rm(envFile)
    expect(await organizationConfigurationResolve({ env: base, commandRoot: root })).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.contentoren, source: "process-environment" },
    })
    const withoutProcessOrganization = {
      HOME: homeDirectory,
      PWD: root,
      ZITADEL_ORGANIZATION_ID: "org-contentoren",
    }
    expect(
      await organizationConfigurationResolve({ env: withoutProcessOrganization, commandRoot: mappedRoot }),
    ).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.david, source: "directory-mapping" },
    })
    expect(
      await organizationConfigurationResolve({
        env: withoutProcessOrganization,
        commandRoot: join(root, "unmapped"),
      }),
    ).toEqual({ success: true, data: { organization: null, source: "unrestricted" } })
    expect(
      await organizationConfigurationResolve({
        env: withoutProcessOrganization,
        commandRoot: mappedRoot,
        organization: "",
      }),
    ).toEqual({
      success: false,
      op: "organizationConfigurationResolve",
      errorMessage: "The --organization value was empty",
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("organization selector aliases only resolve own configured organization properties", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-org-selector-home-"))
  try {
    await globalConfigurationWrite(homeDirectory, organizationConfiguration)
    for (const selector of ["david", "org-david", "constructor", "__proto__"]) {
      const result = await organizationConfigurationResolve({
        env: { HOME: homeDirectory, PWD: homeDirectory },
        organization: selector,
      })
      if (selector === "constructor" || selector === "__proto__") {
        expect(result).toEqual({
          success: false,
          op: "organizationConfigurationResolve",
          errorMessage: `The organization ${selector} was not configured`,
        })
        continue
      }
      expect(result).toEqual({
        success: true,
        data: { organization: organizationConfiguration.organizations.david, source: "option" },
      })
    }
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("tilde directory mappings use the environment or injected HOME used by global configuration", async () => {
  const operatingSystemHome = homedir()
  const environmentHome = await mkdtemp(join(tmpdir(), "assets-org-environment-home-"))
  const injectedHome = await mkdtemp(join(tmpdir(), "assets-org-injected-home-"))
  try {
    expect(environmentHome).not.toBe(operatingSystemHome)
    await globalConfigurationWrite(environmentHome, {
      ...organizationConfiguration,
      directoryMappings: { "~/personal": "david" },
    })
    await globalConfigurationWrite(injectedHome, {
      ...organizationConfiguration,
      directoryMappings: { "~/leo": "contentoren" },
    })

    expect(
      await organizationConfigurationResolve({
        env: { HOME: environmentHome, PWD: join(environmentHome, "personal", "site") },
      }),
    ).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.david, source: "directory-mapping" },
    })
    expect(
      await organizationConfigurationResolve({
        env: { HOME: environmentHome, PWD: join(injectedHome, "leo", "site") },
        homeDirectory: injectedHome,
      }),
    ).toEqual({
      success: true,
      data: { organization: organizationConfiguration.organizations.contentoren, source: "directory-mapping" },
    })
  } finally {
    await rm(environmentHome, { recursive: true, force: true })
    await rm(injectedHome, { recursive: true, force: true })
  }
})

test("default env selection does not search an ancestor and explicit files are required", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-env-root-"))
  const child = join(root, "child")
  try {
    await mkdir(child)
    await writeFile(join(root, ".env"), "ASSETS_ORGANIZATION=david\n")
    const defaultFile = await environmentConfigurationResolve({ env: { PWD: child } })
    expect(defaultFile).toEqual({
      success: true,
      data: {
        environment: { PWD: child },
        fileEnvironment: {},
        envFilePath: join(child, ".env"),
        envFileLoaded: false,
      },
    })
    expect(await organizationConfigurationResolve({ env: { HOME: join(root, "home"), PWD: child } })).toEqual({
      success: true,
      data: { organization: null, source: "unrestricted" },
    })
    expect(await environmentConfigurationResolve({ env: { PWD: child }, envFile: join(child, "missing.env") })).toEqual(
      {
        success: false,
        op: "environmentFileRead",
        errorMessage: `Could not read ${join(child, "missing.env")}`,
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
