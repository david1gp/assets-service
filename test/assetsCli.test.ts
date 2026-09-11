import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import pkg from "../package.json" with { type: "json" }
import { assetsCliMain } from "../src/entrypoints/assets-cli.js"
import type { AssetClass } from "../src/schemas/assetClassSchema.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"

const envelopeResponseCreate = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data, requestId: "request-1" }), {
    status,
    headers: { "content-type": "application/json" },
  })

const failureResponseCreate = (message: string, status = 401): Response =>
  new Response(
    JSON.stringify({
      ok: false,
      error: { code: "unauthorized", message, retryable: false },
      requestId: "request-auth",
    }),
    { status, headers: { "content-type": "application/json" } },
  )

const sourceCreate = (input: {
  id: string
  assetId: string
  filename: string
  sha256: string
  byteSize: number
  class?: AssetClass
  mediaType?: string
}) => ({
  id: input.id,
  assetId: input.assetId,
  revision: 1,
  class: input.class ?? ("image" as const),
  originalFilename: input.filename,
  mediaType: input.mediaType ?? "image/jpeg",
  byteSize: input.byteSize,
  sha256: input.sha256,
  objectKey: `sources/${input.id}/${input.filename}`,
  createdAt: "2026-08-18T00:00:00.000Z",
})

const assetCreate = (input: {
  id: string
  filename: string
  sha256: string
  byteSize: number
  sourceRevisionId?: string
  class?: AssetClass
  mediaType?: string
  folders?: string[]
  sourcePath?: string
  alt?: string | null
}) => {
  const source = sourceCreate({
    id: input.sourceRevisionId ?? input.id,
    assetId: input.id,
    filename: input.filename,
    sha256: input.sha256,
    byteSize: input.byteSize,
    class: input.class,
    mediaType: input.mediaType,
  })
  const folders = input.folders ?? []
  return {
    id: input.id,
    projectId: "project-1",
    class: input.class ?? ("image" as const),
    folders,
    filename: input.filename,
    basename: input.filename.slice(0, input.filename.lastIndexOf(".")),
    currentSourceRevisionId: source.id,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    sourcePath: input.sourcePath ?? input.filename,
    outputCount: 0,
    sourceHistory: [source],
    outputHistory: [],
    ...(input.alt === undefined
      ? {}
      : {
          metadata: {
            id: `metadata-${input.id}`,
            assetId: input.id,
            sourceRevisionId: source.id,
            metadata: {
              kind: "image" as const,
              width: 1,
              height: 1,
              format: "jpg" as const,
              colorSpace: "sRGB",
              alpha: false,
              orientationApplied: true,
              frameCount: 1,
              animated: false,
              alt: input.alt,
              aiProvenance: null,
            },
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
          },
        }),
  }
}

const deletionEligibilityCreate = (sourceRevisionId: string, eligible = true) => ({
  sourceRevisionId,
  eligible,
  checks: {
    sourceIdentity: true,
    verifiedBackup: eligible,
    successfulWorkflow: eligible,
    lineageMatchingCurrentOutputs: eligible,
    currentCatalogInclusion: eligible,
  },
})

const cliEnvironment = {
  ASSETS_API_URL: "https://assets.example.test",
  ASSETS_TOKEN: "service-token",
  ASSETS_PROJECT: "project-1",
  ASSETS_ENVIRONMENT: "development",
  ASSETS_CONFIG_FILE: join(tmpdir(), "assets-cli-test-missing-config.json"),
  ASSETS_SESSION_FILE: join(tmpdir(), "assets-cli-test-missing-session.json"),
}

const cliEnvironmentWithoutProject: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(cliEnvironment).filter(([name]) => name !== "ASSETS_PROJECT"),
)

const cliEnvironmentWithoutProjectOrConfig: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(cliEnvironment).filter(([name]) => name !== "ASSETS_PROJECT" && name !== "ASSETS_CONFIG_FILE"),
)

const organizationConfiguration = {
  organizations: {
    david: { id: "organization-david", name: "David", slug: "david" },
    contentoren: { id: "organization-contentoren", name: "Contentoren", slug: "contentoren" },
  },
  directoryMappings: {},
} as const

const globalOrganizationConfigurationWrite = async (homeDirectory: string, configuration: unknown): Promise<void> => {
  const path = join(homeDirectory, ".config", "assets-service", "config.json")
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, JSON.stringify(configuration))
}

const projectCreateEnvironmentFileWrite = async (homeDirectory: string, contents = ""): Promise<string> => {
  const path = join(homeDirectory, ".config", "assets-service", "project-create.env")
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, contents)
  return path
}

const globalOrganizationCompatibilityConfigurationWrite = async (
  homeDirectory: string,
  configuration: unknown,
): Promise<void> => {
  const path = join(homeDirectory, ".config", "assets", "config.json")
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, JSON.stringify(configuration))
}

const apiProjectCreate = (input: { id: string; name: string; slug?: string; organizationId?: string }) => ({
  id: input.id,
  organizationId: input.organizationId ?? "organization-1",
  name: input.name,
  slug: input.slug ?? input.id,
  defaultEnvironment: "development",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
})

const apiProjectSettingsCreate = () => ({
  project: apiProjectCreate({ id: "project-1", name: "Example project" }),
  organization: null,
  binding: {
    id: "binding-1",
    projectId: "project-1",
    organizationId: "organization-1",
    zitadelProjectId: "zitadel-1",
    serviceProjectId: "service-project-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  },
  environments: [
    {
      id: "environment-development",
      projectId: "project-1",
      name: "development" as const,
      r2Bucket: "assets-development",
      r2Prefix: "development-prefix",
      publicBaseUrl: "https://dev.assets.example.test",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "environment-production",
      projectId: "project-1",
      name: "production" as const,
      r2Bucket: "assets-production",
      r2Prefix: "production-prefix",
      publicBaseUrl: "https://assets.example.test",
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    },
  ],
})

const projectResolutionFetcherCreate = (
  projects: readonly ReturnType<typeof apiProjectCreate>[],
  projectsResponse?: Response,
) => {
  const requests: Request[] = []
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const url = new URL(request.url)
    if (url.pathname === "/api/v1/projects")
      return (
        projectsResponse ??
        envelopeResponseCreate({
          projects: projects.map((project) => ({ ...project, assetCount: 0, totalFileSize: 0 })),
          page: { limit: 100, nextCursor: null },
        })
      )
    const projectPrefix = "/api/v1/projects/"
    if (url.pathname.startsWith(projectPrefix) && !url.pathname.endsWith("/assets")) {
      const project = projects.find(
        (value) => value.id === decodeURIComponent(url.pathname.slice(projectPrefix.length)),
      )
      return project === undefined ? failureResponseCreate("Project not found", 404) : envelopeResponseCreate(project)
    }
    if (url.pathname.endsWith("/assets"))
      return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
    return failureResponseCreate(`Unexpected request ${url.pathname}`, 404)
  }
  return { fetcher, requests }
}

const projectResolutionDiffRun = async (
  root: string,
  projects: readonly ReturnType<typeof apiProjectCreate>[],
  env: NodeJS.ProcessEnv = cliEnvironmentWithoutProject,
  extraArgs: readonly string[] = [],
) => {
  const output: string[] = []
  const transport = projectResolutionFetcherCreate(projects)
  const exitCode = await assetsCliMain(["diff", root, ...extraArgs, "--json"], {
    env,
    fetcher: transport.fetcher,
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })
  return { exitCode, output: JSON.parse(output[0] ?? ""), requests: transport.requests }
}

const projectCreateArguments = (zitadelProjectId?: string, slug = "allgroups-chat"): string[] => [
  "projects",
  "create",
  "--organization",
  "contentoren",
  "--name",
  "Allgroups Chat",
  "--slug",
  slug,
  "--default-environment",
  "development",
  "--service-project-id",
  "allgroups-chat",
  ...(zitadelProjectId === undefined ? [] : ["--zitadel-project-id", zitadelProjectId]),
  "--development-r2-bucket",
  "allgroups-chat",
  "--development-r2-prefix",
  "allgroups-chat",
  "--development-public-base-url",
  "https://dev.assets.example.test",
  "--production-r2-bucket",
  "allgroups-chat",
  "--production-r2-prefix",
  "allgroups-chat",
  "--production-public-base-url",
  "https://assets.example.test",
  "--json",
]

test("diff help documents its root and all source directory controls", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["diff", "--help", "--json"], {
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: true,
    data: {
      commands: expect.arrayContaining([
        "config show [root]",
        "diff [root]",
        "upload-all [root] --integration-note <text>",
        "reprocess <asset-key-or-id> --environment <development|production> [--wait]",
        expect.stringContaining("projects create") as string,
      ]),
      options: expect.arrayContaining(["--dry-run", "--delete", "--organization", "--env-file"]),
      diff: {
        root: "Default: .",
        sourceDirectories: [
          "image: ./images, --image-dir <directory>, --no-image-dir",
          "video: ./videos, --video-dir <directory>, --no-video-dir",
          "document: ./documents, --document-dir <directory>, --no-document-dir",
          "font: ./fonts, --font-dir <directory>, --no-font-dir",
        ],
      },
      config: {
        root: "Default: .",
        output: expect.stringContaining("without displaying credentials"),
      },
      projectResolution: expect.stringContaining("package.json.name"),
      organizationResolution: expect.stringContaining("ASSETS_ORGANIZATION"),
      environmentFile: expect.stringContaining("<command-root>/.env"),
    },
  })
})

test("projects create sends the complete registration to the service", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-home-"))
  const output: string[] = []
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(homeDirectory)
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          ...cliEnvironment,
          ASSETS_TOKEN: undefined,
          ASSETS_SESSION_COOKIE: "human-session-cookie",
          HOME: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe("https://assets.example.test/api/v1/projects")
    expect(request?.headers.get("authorization")).toBeNull()
    expect(request?.headers.get("cookie")).toBe("human-session-cookie")
    expect(await request?.clone().json()).toMatchObject({
      organization: { id: "organization-contentoren", slug: "contentoren" },
      binding: { serviceProjectId: "allgroups-chat" },
      environments: [{ name: "development" }, { name: "production" }],
    })
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { created: true } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create creates a Zitadel project when its ID is omitted", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-zitadel-home-"))
  const output: string[] = []
  const requests: Request[] = []
  let zitadelOptions: unknown
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      [
        "ASSETS_TOKEN=service-token",
        "ASSETS_API_URL=https://assets.example.test",
        "ZITADEL_BASE_URL=https://zitadel.example.test",
        "ZITADEL_TOKEN=zitadel-project-token",
      ].join("\n"),
    )
    const exitCode = await assetsCliMain(projectCreateArguments(), {
      env: {
        HOME: homeDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      zitadelProjectCreate: async (options) => {
        zitadelOptions = options
        return { success: true, data: { projectId: "zitadel-created" } }
      },
      fetcher: async (input, init) => {
        requests.push(new Request(String(input), init))
        return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(zitadelOptions).toEqual({
      config: { baseUrl: "https://zitadel.example.test", token: "zitadel-project-token" },
      request: { organizationId: "organization-contentoren", name: "Allgroups Chat" },
    })
    expect(await requests[0]?.clone().json()).toMatchObject({ binding: { zitadelProjectId: "zitadel-created" } })
    expect(output[0]).not.toContain("zitadel-project-token")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create preserves a supplied Zitadel project ID without provisioning", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-zitadel-existing-home-"))
  const requests: Request[] = []
  let zitadelCallCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=service-token\nASSETS_API_URL=https://assets.example.test\n",
    )
    const exitCode = await assetsCliMain(projectCreateArguments("zitadel-existing"), {
      env: {
        HOME: homeDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      zitadelProjectCreate: async () => {
        zitadelCallCount += 1
        return { success: true, data: { projectId: "unexpected" } }
      },
      fetcher: async (input, init) => {
        requests.push(new Request(String(input), init))
        return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
      },
      stdout: () => undefined,
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(zitadelCallCount).toBe(0)
    expect(await requests[0]?.clone().json()).toMatchObject({ binding: { zitadelProjectId: "zitadel-existing" } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create rejects an invalid supplied Zitadel project ID before contacting either service", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-zitadel-invalid-id-home-"))
  const output: string[] = []
  let zitadelCallCount = 0
  let serviceCallCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=service-token\nASSETS_API_URL=https://assets.example.test\n",
    )
    const exitCode = await assetsCliMain(projectCreateArguments("not a valid id"), {
      env: {
        HOME: homeDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      zitadelProjectCreate: async () => {
        zitadelCallCount += 1
        return { success: true, data: { projectId: "unexpected" } }
      },
      fetcher: async () => {
        serviceCallCount += 1
        return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(zitadelCallCount).toBe(0)
    expect(serviceCallCount).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: false, error: { code: "validation_failed" } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create validates omitted-ID inputs before Zitadel provisioning", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-zitadel-invalid-home-"))
  const output: string[] = []
  let zitadelCallCount = 0
  let serviceCallCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=service-token\nASSETS_API_URL=https://assets.example.test\nZITADEL_BASE_URL=https://zitadel.example.test\nZITADEL_TOKEN=zitadel-project-token\n",
    )
    const exitCode = await assetsCliMain(projectCreateArguments(undefined, "not a slug"), {
      env: {
        HOME: homeDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      zitadelProjectCreate: async () => {
        zitadelCallCount += 1
        return { success: true, data: { projectId: "unexpected" } }
      },
      fetcher: async () => {
        serviceCallCount += 1
        return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(zitadelCallCount).toBe(0)
    expect(serviceCallCount).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: false, error: { code: "validation_failed" } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create reports missing Zitadel credentials without contacting either service", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-zitadel-missing-home-"))
  const output: string[] = []
  let zitadelCallCount = 0
  let serviceCallCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=service-token\nASSETS_API_URL=https://assets.example.test\n",
    )
    const exitCode = await assetsCliMain(projectCreateArguments(), {
      env: {
        HOME: homeDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      zitadelProjectCreate: async () => {
        zitadelCallCount += 1
        return { success: true, data: { projectId: "unexpected" } }
      },
      fetcher: async () => {
        serviceCallCount += 1
        return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(zitadelCallCount).toBe(0)
    expect(serviceCallCount).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: false,
      error: { message: "Automatic Zitadel project creation requires ZITADEL_BASE_URL" },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create hides Zitadel provisioning failures", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-zitadel-failure-home-"))
  const output: string[] = []
  let serviceCallCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=service-token\nASSETS_API_URL=https://assets.example.test\nZITADEL_BASE_URL=https://zitadel.example.test\nZITADEL_TOKEN=super-secret-zitadel-token\n",
    )
    const exitCode = await assetsCliMain(projectCreateArguments(), {
      env: {
        HOME: homeDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      zitadelProjectCreate: async () => ({ success: false, errorMessage: "token=super-secret-zitadel-token" }),
      fetcher: async () => {
        serviceCallCount += 1
        return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(serviceCallCount).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: false,
      error: { code: "upstream_failure", message: "Automatic Zitadel project creation failed" },
    })
    expect(output[0]).not.toContain("super-secret-zitadel-token")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create authenticates with ASSETS_TOKEN bearer credential", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-token-home-"))
  const output: string[] = []
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(homeDirectory)
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          ...cliEnvironment,
          ASSETS_TOKEN: "machine-provisioner-pat",
          HOME: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe("https://assets.example.test/api/v1/projects")
    expect(request?.headers.get("authorization")).toBe("Bearer machine-provisioner-pat")
    expect(request?.headers.get("cookie")).toBeNull()
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { created: true } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create authenticates with ASSETS_ACCESS_TOKEN bearer credential", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-access-token-home-"))
  const output: string[] = []
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(homeDirectory)
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          ...cliEnvironment,
          ASSETS_TOKEN: undefined,
          ASSETS_ACCESS_TOKEN: "machine-provisioner-access-pat",
          HOME: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe("https://assets.example.test/api/v1/projects")
    expect(request?.headers.get("authorization")).toBe("Bearer machine-provisioner-access-pat")
    expect(request?.headers.get("cookie")).toBeNull()
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { created: true } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create authenticates with stored session token from auth login token-stdin", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-stdin-home-"))
  const sessionFile = join(homeDirectory, "cli-session.json")
  const output: string[] = []
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    const loginExitCode = await assetsCliMain(["auth", "login", "--token-stdin"], {
      env: {
        ...cliEnvironment,
        ASSETS_TOKEN: undefined,
        ASSETS_ACCESS_TOKEN: undefined,
        HOME: homeDirectory,
        ASSETS_SESSION_FILE: sessionFile,
      },
      stdinRead: async () => "session-pat-from-stdin\n",
      stdout: () => undefined,
      stderr: () => undefined,
    })
    expect(loginExitCode).toBe(0)

    await projectCreateEnvironmentFileWrite(homeDirectory)
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          ...cliEnvironment,
          ASSETS_TOKEN: undefined,
          ASSETS_ACCESS_TOKEN: undefined,
          HOME: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: sessionFile,
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.method).toBe("POST")
    expect(request?.url).toBe("https://assets.example.test/api/v1/projects")
    expect(request?.headers.get("authorization")).toBe("Bearer session-pat-from-stdin")
    expect(request?.headers.get("cookie")).toBeNull()
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { created: true } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create rejects --token as a command-line argument", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-arg-reject-home-"))
  const output: string[] = []
  let fetchCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--token",
        "leaked-cli-arg-token",
        "--json",
      ],
      {
        env: {
          ...cliEnvironment,
          HOME: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async () => {
          fetchCount += 1
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(1)
    expect(fetchCount).toBe(0)
    const parsed = JSON.parse(output[0] ?? "")
    expect(parsed).toMatchObject({
      ok: false,
      error: {
        message: "Tokens are not accepted as command arguments",
      },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create validates both environment bindings before requesting the service", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-validation-home-"))
  const output: string[] = []
  let fetchCount = 0
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(homeDirectory)
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--json",
      ],
      {
        env: {
          ...cliEnvironment,
          HOME: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async () => {
          fetchCount += 1
          return envelopeResponseCreate({})
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(1)
    expect(fetchCount).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: false, error: { code: "validation_failed" } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create automatically loads ~/.config/assets-service/project-create.env when neither --env-file nor ASSETS_ENV_FILE is set", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-auto-env-home-"))
  const output: string[] = []
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=provisioner-from-implicit-env\nASSETS_API_URL=https://assets.example.test\n",
    )
    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.headers.get("authorization")).toBe("Bearer provisioner-from-implicit-env")
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { created: true } })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create fails with clear actionable error when ~/.config/assets-service/project-create.env is absent", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-absent-env-home-"))
  const jsonOutput: string[] = []
  const humanStderr: string[] = []
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    const exitCodeJson = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        stdout: (text) => jsonOutput.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCodeJson).toBe(1)
    const parsedJson = JSON.parse(jsonOutput[0] ?? "")
    expect(parsedJson).toMatchObject({
      ok: false,
      error: {
        code: "validation_failed",
      },
    })
    expect(parsedJson.error.message).toContain("Project creation environment file was not found")
    expect(parsedJson.error.message).toContain(join(homeDirectory, ".config", "assets-service", "project-create.env"))
    expect(parsedJson.error.message).toContain("--env-file")
    expect(parsedJson.error.message).toContain("ASSETS_ENV_FILE")

    const exitCodeHuman = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        stdout: () => undefined,
        stderr: (text) => humanStderr.push(text),
      },
    )

    expect(exitCodeHuman).toBe(1)
    expect(humanStderr.join("")).toContain("Project creation environment file was not found")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create fails with clear actionable error without credentials when project-create.env is unusable", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-unusable-home-"))
  const output: string[] = []
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    const envDir = join(homeDirectory, ".config", "assets-service")
    const envPath = join(envDir, "project-create.env")
    await mkdir(envDir, { recursive: true })
    await writeFile(envPath, "SECRET_TOKEN=super-confidential-token\0MALFORMED")

    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: homeDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(1)
    const parsed = JSON.parse(output[0] ?? "")
    expect(parsed.ok).toBe(false)
    expect(parsed.error.message).toContain("was invalid")
    expect(parsed.error.message).not.toContain("super-confidential-token")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
  }
})

test("projects create gives precedence to implicit project-create.env over project/PWD .env discovery", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-pwd-precedence-home-"))
  const workingDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-pwd-dir-"))
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await writeFile(
      join(workingDirectory, ".env"),
      "ASSETS_TOKEN=pwd-local-token\nASSETS_API_URL=https://pwd.example.test\n",
    )
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=global-provisioner-token\nASSETS_API_URL=https://assets.example.test\n",
    )

    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: workingDirectory,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: () => undefined,
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.headers.get("authorization")).toBe("Bearer global-provisioner-token")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(workingDirectory, { recursive: true, force: true })
  }
})

test("projects create respects explicit --env-file over implicit project-create.env and process ASSETS_ENV_FILE", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-env-opt-home-"))
  const explicitEnvDir = await mkdtemp(join(tmpdir(), "assets-project-create-explicit-dir-"))
  const explicitEnvPath = join(explicitEnvDir, "custom.env")
  const processEnvPath = join(explicitEnvDir, "process.env")
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await writeFile(explicitEnvPath, "ASSETS_TOKEN=explicit-cli-token\nASSETS_API_URL=https://assets.example.test\n")
    await writeFile(processEnvPath, "ASSETS_TOKEN=process-env-token\nASSETS_API_URL=https://assets.example.test\n")
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=implicit-file-token\nASSETS_API_URL=https://assets.example.test\n",
    )

    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--env-file",
        explicitEnvPath,
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: homeDirectory,
          ASSETS_ENV_FILE: processEnvPath,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: () => undefined,
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.headers.get("authorization")).toBe("Bearer explicit-cli-token")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(explicitEnvDir, { recursive: true, force: true })
  }
})

test("projects create respects process ASSETS_ENV_FILE over implicit project-create.env", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-project-create-env-process-home-"))
  const envDir = await mkdtemp(join(tmpdir(), "assets-project-create-process-dir-"))
  const processEnvPath = join(envDir, "process.env")
  let request: Request | undefined
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await writeFile(processEnvPath, "ASSETS_TOKEN=process-env-token\nASSETS_API_URL=https://assets.example.test\n")
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_TOKEN=implicit-file-token\nASSETS_API_URL=https://assets.example.test\n",
    )

    const exitCode = await assetsCliMain(
      [
        "projects",
        "create",
        "--organization",
        "contentoren",
        "--name",
        "Allgroups Chat",
        "--slug",
        "allgroups-chat",
        "--default-environment",
        "development",
        "--service-project-id",
        "allgroups-chat",
        "--zitadel-project-id",
        "zitadel-allgroups-chat",
        "--development-r2-bucket",
        "allgroups-chat",
        "--development-r2-prefix",
        "allgroups-chat",
        "--development-public-base-url",
        "https://dev.assets.example.test",
        "--production-r2-bucket",
        "allgroups-chat",
        "--production-r2-prefix",
        "allgroups-chat",
        "--production-public-base-url",
        "https://assets.example.test",
        "--json",
      ],
      {
        env: {
          HOME: homeDirectory,
          PWD: homeDirectory,
          ASSETS_ENV_FILE: processEnvPath,
          ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
          ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
        },
        fetcher: async (input, init) => {
          request = new Request(String(input), init)
          return envelopeResponseCreate({ project: apiProjectSettingsCreate(), created: true }, 201)
        },
        stdout: () => undefined,
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(request?.headers.get("authorization")).toBe("Bearer process-env-token")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(envDir, { recursive: true, force: true })
  }
})

test("other commands never implicitly load ~/.config/assets-service/project-create.env", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-other-commands-home-"))
  const workingDirectory = await mkdtemp(join(tmpdir(), "assets-other-commands-dir-"))
  const output: string[] = []
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await writeFile(
      join(workingDirectory, ".env"),
      "ASSETS_PROJECT=project-from-pwd\nASSETS_API_URL=https://pwd.test\n",
    )
    await projectCreateEnvironmentFileWrite(
      homeDirectory,
      "ASSETS_PROJECT=project-from-implicit-create\nASSETS_API_URL=https://implicit.test\n",
    )

    const exitCode = await assetsCliMain(["config", "show", workingDirectory, "--json"], {
      env: {
        HOME: homeDirectory,
        PWD: workingDirectory,
        ASSETS_CONFIG_FILE: join(homeDirectory, "missing-cli-config.json"),
        ASSETS_SESSION_FILE: join(homeDirectory, "missing-cli-session.json"),
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    const configData = JSON.parse(output[0] ?? "").data
    expect(configData.environmentFile.path).toBe(join(workingDirectory, ".env"))
    expect(configData.environmentFile.source).toBe("command-root")
    expect(configData.project.value).toBe("project-from-pwd")
    expect(configData.apiUrl.value).toBe("https://pwd.test")
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(workingDirectory, { recursive: true, force: true })
  }
})

test("config show reports effective local configuration without creating an API client", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-config-show-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-config-show-root-"))
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await globalOrganizationCompatibilityConfigurationWrite(homeDirectory, organizationConfiguration)
    await writeFile(
      join(root, ".env"),
      [
        "ASSETS_ORGANIZATION=contentoren",
        "ASSETS_API_URL=https://file-user:file-password@file.example.test?token=file-secret",
      ].join("\n"),
    )
    await writeFile(join(root, "assets.config.json"), JSON.stringify({ image: "media", video: null }))
    const output: string[] = []
    const exitCode = await assetsCliMain(["config", "show", root, "--json"], {
      env: {
        HOME: homeDirectory,
        PWD: root,
        ASSETS_API_URL: "https://process-user:process-password@api.example.test/v1?token=process-secret",
        ASSETS_PROJECT: "process-project",
        ASSETS_ENVIRONMENT: "production",
        ASSETS_TOKEN: "do-not-print",
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
      fetcher: async () => {
        throw new Error("config show must not create an API client")
      },
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        globalConfiguration: {
          canonicalPath: join(homeDirectory, ".config", "assets-service", "config.json"),
          fallbackPath: join(homeDirectory, ".config", "assets", "config.json"),
          canonicalExists: true,
          fallbackExists: true,
          canonicalLoaded: true,
          fallbackLoaded: false,
          loaded: true,
          source: "canonical",
        },
        environmentFile: { path: join(root, ".env"), source: "command-root", loaded: true },
        organization: {
          value: "contentoren",
          id: "organization-contentoren",
          name: "Contentoren",
          source: "env-file",
        },
        project: { value: "process-project", source: "process-environment" },
        environment: { value: "production", source: "process-environment" },
        apiUrl: { value: "https://api.example.test/v1", source: "process-environment" },
        sourceDirectories: {
          root,
          configPath: join(root, "assets.config.json"),
          configLoaded: true,
          values: {
            image: join(root, "media"),
            video: null,
            document: join(root, "documents"),
            font: join(root, "fonts"),
          },
        },
      },
    })
    expect(output[0]).not.toContain("do-not-print")
    expect(output[0]).not.toContain("process-secret")
    expect(output[0]).not.toContain("process-password")

    const humanOutput: string[] = []
    const humanExitCode = await assetsCliMain(["config", "show", root], {
      env: {
        HOME: homeDirectory,
        PWD: root,
        ASSETS_API_URL: "https://process-user:process-password@api.example.test/v1?token=process-secret",
        ASSETS_PROJECT: "process-project",
        ASSETS_ENVIRONMENT: "production",
      },
      stdout: (text) => humanOutput.push(text),
      stderr: () => undefined,
    })

    expect(humanExitCode).toBe(0)
    expect(humanOutput[0]).toContain(
      `  canonical: ${join(homeDirectory, ".config", "assets-service", "config.json")} (exists, loaded, selected)`,
    )
    expect(humanOutput[0]).toContain(
      `  fallback: ${join(homeDirectory, ".config", "assets", "config.json")} (exists, not loaded, not selected)`,
    )
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("config show reports the selected environment file inside a project .env directory", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-config-directory-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-config-directory-root-"))
  try {
    await globalOrganizationConfigurationWrite(homeDirectory, organizationConfiguration)
    await mkdir(join(root, ".env"))
    await writeFile(
      join(root, ".env", "production"),
      "ASSETS_ORGANIZATION=contentoren\nASSETS_PROJECT=semesterkur\nASSETS_API_URL=https://assets.example.test\n",
    )
    await writeFile(join(root, "assets.config.json"), JSON.stringify({ image: "images" }))
    const output: string[] = []
    const exitCode = await assetsCliMain(["config", "show", root, "--json"], {
      env: { HOME: homeDirectory, PWD: root, ASSETS_ENVIRONMENT: "production" },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        environmentFile: { path: join(root, ".env", "production"), source: "command-root", loaded: true },
        project: { value: "semesterkur", source: "env-file" },
        environment: { value: "production", source: "process-environment" },
        apiUrl: { value: "https://assets.example.test", source: "env-file" },
      },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("config show reports compatibility fallback and directory-mapped organization without API settings", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-config-show-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-config-show-root-"))
  try {
    const fallbackPath = join(homeDirectory, ".config", "assets", "config.json")
    await mkdir(join(fallbackPath, ".."), { recursive: true })
    await writeFile(
      fallbackPath,
      JSON.stringify({ ...organizationConfiguration, directoryMappings: { [root]: "david" } }),
    )
    const output: string[] = []
    const exitCode = await assetsCliMain(["config", "show", root, "--json"], {
      env: { HOME: homeDirectory, PWD: root },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        globalConfiguration: {
          canonicalExists: false,
          fallbackExists: true,
          canonicalLoaded: false,
          fallbackLoaded: true,
          loaded: true,
          source: "fallback",
        },
        environmentFile: { path: join(root, ".env"), source: "command-root", loaded: false },
        organization: { value: "david", source: "directory-mapping" },
        project: { value: null, source: "unresolved" },
        environment: { value: null, source: "unresolved" },
        apiUrl: { value: null, source: "unresolved" },
        sourceDirectories: { root, configLoaded: false },
      },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("config show distinguishes an existing legacy CLI fallback from a loaded global configuration", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "assets-config-show-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-config-show-root-"))
  try {
    await globalOrganizationCompatibilityConfigurationWrite(homeDirectory, {
      project: "legacy-project",
      environment: "development",
    })
    const output: string[] = []
    const exitCode = await assetsCliMain(["config", "show", root, "--json"], {
      env: { HOME: homeDirectory, PWD: root },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        globalConfiguration: {
          canonicalExists: false,
          fallbackExists: true,
          canonicalLoaded: false,
          fallbackLoaded: false,
          loaded: false,
          source: "none",
        },
        organization: { value: null, source: "unrestricted" },
      },
    })
  } finally {
    await rm(homeDirectory, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("settings help documents read, update, and R2 options", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["settings", "read", "--help", "--json"], {
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: true,
    data: {
      commands: expect.arrayContaining([
        "settings read [--project <id-or-name>] [--environment <development|production>]",
        "settings update [--project <id-or-name>] --environment <development|production> [--r2-bucket <bucket>] [--r2-prefix <prefix>] [--public-base-url <url>]",
        expect.stringContaining("settings migrate") as string,
      ]),
      options: expect.arrayContaining([
        "--r2-bucket",
        "--r2-prefix",
        "--public-base-url",
        "--wait",
        "--no-wait",
        "--poll-interval",
      ]),
    },
  })
})

test("settings read returns only the selected environment binding", async () => {
  const output: string[] = []
  const requests: Request[] = []
  const settings = apiProjectSettingsCreate()
  const exitCode = await assetsCliMain(
    ["settings", "read", "--project", "project-1", "--environment", "production", "--json"],
    {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return envelopeResponseCreate(settings)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    },
  )

  expect(exitCode).toBe(0)
  expect(requests.map((request) => ({ method: request.method, path: new URL(request.url).pathname }))).toEqual([
    { method: "GET", path: "/api/v1/projects/project-1/settings" },
  ])
  expect(JSON.parse(output[0] ?? "")).toEqual({
    ok: true,
    data: {
      environment: "production",
      r2Bucket: "assets-production",
      r2Prefix: "production-prefix",
      publicBaseUrl: "https://assets.example.test",
    },
  })
})

test("settings read defaults to the project environment instead of the configured CLI environment", async () => {
  const output: string[] = []
  const requests: Request[] = []
  const settings = apiProjectSettingsCreate()
  const project = { ...settings.project, defaultEnvironment: "production" as const }
  const exitCode = await assetsCliMain(["settings", "read", "--project", "project-1", "--json"], {
    env: cliEnvironment,
    fetcher: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return request.url.endsWith("/settings")
        ? envelopeResponseCreate({ ...settings, project })
        : envelopeResponseCreate(project)
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    "/api/v1/projects/project-1",
    "/api/v1/projects/project-1/settings",
  ])
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: true,
    data: {
      environment: "production",
      r2Bucket: "assets-production",
    },
  })
})

test("settings update reads and writes a complete merged settings document", async () => {
  const output: string[] = []
  const requests: Request[] = []
  const settings = apiProjectSettingsCreate()
  let updateBody: unknown
  const exitCode = await assetsCliMain(
    [
      "settings",
      "update",
      "--project",
      "project-1",
      "--environment",
      "production",
      "--r2-bucket",
      "assets-production-new",
      "--r2-prefix",
      "",
      "--json",
    ],
    {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        if (request.method === "GET") return envelopeResponseCreate(settings)
        const body = JSON.parse(await request.text()) as {
          environments: Array<{ name: string; r2Bucket: string; r2Prefix: string; publicBaseUrl: string }>
        }
        updateBody = body
        return envelopeResponseCreate({
          ...settings,
          environments: settings.environments.map((environment) => ({
            ...environment,
            ...(body.environments.find((candidate) => candidate.name === environment.name) ?? {}),
          })),
        })
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    },
  )

  expect(exitCode).toBe(0)
  expect(requests.map((request) => request.method)).toEqual(["GET", "PUT"])
  expect(updateBody).toEqual({
    name: "Example project",
    defaultEnvironment: "development",
    binding: { zitadelProjectId: "zitadel-1", serviceProjectId: "service-project-1" },
    environments: [
      {
        name: "development",
        r2Bucket: "assets-development",
        r2Prefix: "development-prefix",
        publicBaseUrl: "https://dev.assets.example.test",
      },
      {
        name: "production",
        r2Bucket: "assets-production-new",
        r2Prefix: "",
        publicBaseUrl: "https://assets.example.test",
      },
    ],
  })
  expect(JSON.parse(output[0] ?? "")).toEqual({
    ok: true,
    data: {
      environment: "production",
      r2Bucket: "assets-production-new",
      r2Prefix: "",
      publicBaseUrl: "https://assets.example.test",
    },
  })
})

test("settings update requires an explicit environment and at least one field before reaching the API", async () => {
  let requestCount = 0
  const fetcher = async () => {
    requestCount += 1
    return envelopeResponseCreate(apiProjectSettingsCreate())
  }
  const run = async (args: string[]) => {
    const output: string[] = []
    const exitCode = await assetsCliMain([...args, "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    return { exitCode, response: JSON.parse(output[0] ?? "") }
  }

  await expect(
    run(["settings", "update", "--project", "project-1", "--r2-prefix", "new-prefix"]),
  ).resolves.toMatchObject({
    exitCode: 1,
    response: { ok: false, error: { message: "Settings update requires --environment" } },
  })
  await expect(
    run(["settings", "update", "--project", "project-1", "--environment", "production"]),
  ).resolves.toMatchObject({
    exitCode: 1,
    response: { ok: false, error: { message: "Settings update requires at least one changed field" } },
  })
  expect(requestCount).toBe(0)
})

test("settings update validates merged fields and does not write invalid settings", async () => {
  const output: string[] = []
  const requests: Request[] = []
  const settings = apiProjectSettingsCreate()
  const exitCode = await assetsCliMain(
    [
      "settings",
      "update",
      "--project",
      "project-1",
      "--environment",
      "production",
      "--public-base-url",
      "not-a-url",
      "--json",
    ],
    {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return envelopeResponseCreate(settings)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    },
  )

  expect(exitCode).toBe(1)
  expect(requests.map((request) => request.method)).toEqual(["GET"])
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: false,
    error: { code: "validation_failed", message: "The project settings update was invalid" },
  })
})

test("settings read preserves remote API errors", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(
    ["settings", "read", "--project", "project-1", "--environment", "production", "--json"],
    {
      env: cliEnvironment,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "service_unavailable", message: "Settings service unavailable", retryable: true },
            requestId: "request-settings",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    },
  )

  expect(exitCode).toBe(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    error: { code: "service_unavailable", message: "Settings service unavailable", retryable: true },
    ok: false,
    requestId: "request-settings",
  })
})

test("reports the package version before reading configuration", async () => {
  const output: string[] = []
  const errors: string[] = []
  const exitCode = await assetsCliMain(["--version"], {
    env: { ASSETS_CONFIG_FILE: join(tmpdir(), "assets-cli-invalid-config.json") },
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
  })

  expect(exitCode).toBe(0)
  expect(output).toEqual([`assets ${pkg.version}\n`])
  expect(errors).toEqual([])
})

test("reports verbose package metadata before reading configuration", async () => {
  const output: string[] = []
  const errors: string[] = []
  const exitCode = await assetsCliMain(["version", "--verbose"], {
    env: { ASSETS_CONFIG_FILE: join(tmpdir(), "assets-cli-invalid-config.json") },
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
  })

  expect(exitCode).toBe(0)
  const rendered = output.join("")
  expect(rendered).toStartWith(`assets ${pkg.version}\n`)
  expect(rendered).toContain(`user agent: ${pkg.name}/${pkg.version}`)
  expect(rendered).toMatch(/executable: .+\nexecutable target: .+\n/)
  expect(rendered).toContain(`version: ${pkg.version}`)
  expect(rendered).toContain(`description: ${pkg.description}`)
  expect(rendered).toContain("author: David Siewert — https://david-siewert.com/")
  expect(rendered).toContain(`license: ${pkg.license}`)
  expect(rendered).toContain(`project: ${pkg.homepage}`)
  expect(rendered).toContain("installation type: development checkout")
  expect(rendered).toContain("runtime: bun ")
  expect(rendered).toContain("runtime requirements: node >=22, bun >=1.3.0")
  expect(rendered).toContain(`platform: ${process.platform} ${process.arch} (OS release `)
  expect(rendered).not.toContain("build details:")
  expect(errors).toEqual([])
})

test("bulk project resolution gives an explicit project precedence over package.json.name", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-explicit-"))
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "package-project" }))
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({ id: "package-project-id", name: "package-project" }),
        apiProjectCreate({ id: "explicit-project-id", name: "explicit-project" }),
      ],
      { ...cliEnvironmentWithoutProject },
      ["--project", "explicit-project-id"],
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/explicit-project-id/assets"))).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/package-project-id/assets"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution loads the command-root .env and scopes package names by organization", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-package-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-package-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, organizationConfiguration)
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "shared-project" }))
    await writeFile(join(root, ".env"), "ASSETS_ORGANIZATION=contentoren\n")
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "david-shared-project-id",
          name: "shared-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
        apiProjectCreate({
          id: "contentoren-shared-project-id",
          name: "shared-project",
          organizationId: organizationConfiguration.organizations.contentoren.id,
        }),
      ],
      { ...cliEnvironmentWithoutProject, HOME: home, PWD: home },
    )
    expect(result.exitCode).toBe(0)
    expect(
      result.requests.some((request) => request.url.includes("/projects/contentoren-shared-project-id/assets")),
    ).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/david-shared-project-id/assets"))).toBe(
      false,
    )
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution scopes explicit project names by organization", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-name-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-name-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, organizationConfiguration)
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "david-named-project-id",
          name: "shared-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
        apiProjectCreate({
          id: "contentoren-named-project-id",
          name: "shared-project",
          organizationId: organizationConfiguration.organizations.contentoren.id,
        }),
      ],
      { ...cliEnvironmentWithoutProject, HOME: home, PWD: root, ASSETS_ORGANIZATION: "contentoren" },
      ["--organization", "david", "--project", "shared-project"],
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => new URL(request.url).pathname === "/api/v1/projects")).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/david-named-project-id/assets"))).toBe(
      true,
    )
    expect(
      result.requests.some((request) => request.url.includes("/projects/contentoren-named-project-id/assets")),
    ).toBe(false)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution preserves ambiguity for names within the selected organization", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-name-ambiguity-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-name-ambiguity-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, organizationConfiguration)
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "david-first-named-project-id",
          name: "shared-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
        apiProjectCreate({
          id: "david-second-named-project-id",
          name: "shared-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
      ],
      { ...cliEnvironmentWithoutProject, HOME: home, PWD: root, ASSETS_ORGANIZATION: "david" },
      ["--project", "shared-project"],
    )

    expect(result.exitCode).toBe(1)
    expect(result.output.error.message).toBe("More than one project named shared-project was found")
    expect(result.requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/projects/shared-project",
      "/api/v1/projects",
    ])
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution scopes the sole-project fallback by organization", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-sole-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-sole-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, {
      ...organizationConfiguration,
      directoryMappings: { [root]: "david" },
    })
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "david-sole-project-id",
          name: "david-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
        apiProjectCreate({
          id: "contentoren-other-project-id",
          name: "contentoren-project",
          organizationId: organizationConfiguration.organizations.contentoren.id,
        }),
      ],
      { ...cliEnvironmentWithoutProject, HOME: home, PWD: root },
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/david-sole-project-id/assets"))).toBe(true)
    expect(
      result.requests.some((request) => request.url.includes("/projects/contentoren-other-project-id/assets")),
    ).toBe(false)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution keeps explicit project IDs authoritative across organizations", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-id-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-id-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, organizationConfiguration)
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "explicit-contentoren-project-id",
          name: "contentoren-project",
          organizationId: organizationConfiguration.organizations.contentoren.id,
        }),
      ],
      { ...cliEnvironmentWithoutProject, HOME: home, PWD: root, ASSETS_ORGANIZATION: "david" },
      ["--project", "explicit-contentoren-project-id"],
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/v1/projects/explicit-contentoren-project-id",
      "/api/v1/projects/explicit-contentoren-project-id/assets",
    ])
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("--env-file selects organization configuration before the command-root default", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-env-file-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-env-file-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, organizationConfiguration)
    await writeFile(join(root, ".env"), "ASSETS_ORGANIZATION=contentoren\n")
    const selectedEnvFile = join(root, "selected.env")
    await writeFile(selectedEnvFile, "ASSETS_ORGANIZATION=david\n")
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "david-selected-project-id",
          name: "david-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
        apiProjectCreate({
          id: "contentoren-selected-project-id",
          name: "contentoren-project",
          organizationId: organizationConfiguration.organizations.contentoren.id,
        }),
      ],
      { ...cliEnvironmentWithoutProject, HOME: home, PWD: root },
      ["--env-file", selectedEnvFile],
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/david-selected-project-id/assets"))).toBe(
      true,
    )
    expect(
      result.requests.some((request) => request.url.includes("/projects/contentoren-selected-project-id/assets")),
    ).toBe(false)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution uses ASSETS_PROJECT before package.json.name", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-env-"))
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "package-project" }))
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({ id: "package-project-id", name: "package-project" }),
        apiProjectCreate({ id: "env-project-id", name: "env-project" }),
      ],
      { ...cliEnvironmentWithoutProject, ASSETS_PROJECT: "env-project-id" },
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/env-project-id/assets"))).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/package-project-id/assets"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution keeps ASSETS_PROJECT_ID as a legacy override", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-legacy-env-"))
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "package-project" }))
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({ id: "package-project-id", name: "package-project" }),
        apiProjectCreate({ id: "legacy-project-id", name: "legacy-project" }),
      ],
      { ...cliEnvironmentWithoutProject, ASSETS_PROJECT_ID: "legacy-project-id" },
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/legacy-project-id/assets"))).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/package-project-id/assets"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution gives a process legacy alias precedence over a selected env-file alias", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-alias-precedence-"))
  try {
    await writeFile(join(root, ".env"), "ASSETS_PROJECT=file-project-id\n")
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({ id: "file-project-id", name: "file-project" }),
        apiProjectCreate({ id: "process-project-id", name: "process-project" }),
      ],
      { ...cliEnvironmentWithoutProject, ASSETS_PROJECT_ID: "process-project-id" },
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/process-project-id/assets"))).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/file-project-id/assets"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("CLI authentication gives a process legacy token alias precedence over a selected env-file alias", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-token-alias-precedence-"))
  try {
    await writeFile(join(root, ".env"), "ASSETS_TOKEN=file-token\n")
    const { ASSETS_TOKEN: _token, ...environmentWithoutCanonicalToken } = cliEnvironmentWithoutProject
    const result = await projectResolutionDiffRun(
      root,
      [apiProjectCreate({ id: "sole-project-id", name: "sole-project" })],
      { ...environmentWithoutCanonicalToken, ASSETS_ACCESS_TOKEN: "process-token" },
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.length).toBeGreaterThan(0)
    expect(result.requests.every((request) => request.headers.get("authorization") === "Bearer process-token")).toBe(
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("config show reports process aliases over selected env-file aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-config-show-alias-precedence-"))
  try {
    await writeFile(join(root, ".env"), "ASSETS_PROJECT=file-project\nASSETS_TOKEN=file-token\n")
    const output: string[] = []
    const exitCode = await assetsCliMain(["config", "show", root, "--json"], {
      env: {
        HOME: root,
        PWD: root,
        ASSETS_PROJECT_ID: "process-project",
        ASSETS_ACCESS_TOKEN: "process-token",
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: { project: { value: "process-project", source: "process-environment" } },
    })
    expect(output[0]).not.toContain("file-token")
    expect(output[0]).not.toContain("process-token")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution reads an exact scoped package name from the explicit root", async () => {
  const root = await mkdtemp(join(tmpdir(), "unrelated-directory-name-"))
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@acme/site" }))
    const result = await projectResolutionDiffRun(root, [
      apiProjectCreate({ id: "scoped-project-id", name: "@acme/site", slug: "acme-site" }),
      apiProjectCreate({ id: "other-project-id", name: "other-site" }),
    ])
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/scoped-project-id/assets"))).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/other-project-id/assets"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution keeps saved CLI project configuration compatible", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-saved-"))
  const config = join(root, "config.json")
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "package-project" }))
    await writeFile(config, JSON.stringify({ project: "saved-project-id" }))
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({ id: "package-project-id", name: "package-project" }),
        apiProjectCreate({ id: "saved-project-id", name: "saved-project" }),
      ],
      { ...cliEnvironmentWithoutProject, ASSETS_CONFIG_FILE: config },
    )
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/saved-project-id/assets"))).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("normal commands ignore fallback organization configuration as saved CLI configuration", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-fallback-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-fallback-root-"))
  try {
    await globalOrganizationCompatibilityConfigurationWrite(home, {
      ...organizationConfiguration,
      directoryMappings: { [root]: "david" },
    })
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "fallback-organization-project-id",
          name: "fallback-organization-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
      ],
      { ...cliEnvironmentWithoutProjectOrConfig, HOME: home, PWD: root },
    )

    expect(result.exitCode).toBe(0)
    expect(
      result.requests.some((request) => request.url.includes("/projects/fallback-organization-project-id/assets")),
    ).toBe(true)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("normal commands preserve saved CLI configuration beside canonical organization configuration", async () => {
  const home = await mkdtemp(join(tmpdir(), "assets-cli-org-coexist-home-"))
  const root = await mkdtemp(join(tmpdir(), "assets-cli-org-coexist-root-"))
  try {
    await globalOrganizationConfigurationWrite(home, {
      ...organizationConfiguration,
      directoryMappings: { [root]: "david" },
    })
    await globalOrganizationCompatibilityConfigurationWrite(home, { project: "saved-project" })
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "package-project" }))
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({
          id: "saved-project-id",
          name: "saved-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
        apiProjectCreate({
          id: "package-project-id",
          name: "package-project",
          organizationId: organizationConfiguration.organizations.david.id,
        }),
      ],
      { ...cliEnvironmentWithoutProjectOrConfig, HOME: home, PWD: root },
    )

    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/saved-project-id/assets"))).toBe(true)
    expect(result.requests.some((request) => request.url.includes("/projects/package-project-id/assets"))).toBe(false)
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution falls back to the sole accessible project", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-sole-"))
  try {
    const result = await projectResolutionDiffRun(root, [
      apiProjectCreate({ id: "sole-project-id", name: "sole-project" }),
    ])
    expect(result.exitCode).toBe(0)
    expect(result.requests.some((request) => request.url.includes("/projects/sole-project-id/assets"))).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution reports API, token, and access guidance when no project is accessible", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-zero-"))
  try {
    const result = await projectResolutionDiffRun(root, [])
    expect(result.exitCode).toBe(1)
    expect(result.output.error.message).toBe(
      "Could not determine the project. No accessible projects were found. Verify the API URL, token, and access.",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution reports actionable guidance for multiple unmatched projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-multiple-"))
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "unmatched-package" }))
    const result = await projectResolutionDiffRun(root, [
      apiProjectCreate({ id: "project-one-id", name: "project-one" }),
      apiProjectCreate({ id: "project-two-id", name: "project-two" }),
    ])
    expect(result.exitCode).toBe(1)
    expect(result.output.error.message).toBe(
      "Could not determine the project. Use --project <name> or set ASSETS_PROJECT in the environment or the current working directory's .env file.",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution preserves project-list API failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-api-failure-"))
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "package-project" }))
    const transport = projectResolutionFetcherCreate(
      [apiProjectCreate({ id: "package-project-id", name: "package-project" })],
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "service_unavailable", message: "Project listing failed", retryable: true },
          requestId: "request-project-list",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    )
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root, "--json"], {
      env: cliEnvironmentWithoutProject,
      fetcher: transport.fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      error: { code: "service_unavailable", message: "Project listing failed", retryable: true },
      ok: false,
      requestId: "request-project-list",
    })
    expect(transport.requests.map((request) => new URL(request.url).pathname)).toEqual(["/api/v1/projects"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk project resolution treats an inaccessible package.json as unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-inaccessible-package-"))
  try {
    await mkdir(join(root, "package.json"))
    const result = await projectResolutionDiffRun(root, [
      apiProjectCreate({ id: "project-one-id", name: "project-one" }),
      apiProjectCreate({ id: "project-two-id", name: "project-two" }),
    ])
    expect(result.exitCode).toBe(1)
    expect(result.output.error.message).toBe(
      "Could not determine the project. Use --project <name> or set ASSETS_PROJECT in the environment or the current working directory's .env file.",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bulk commands validate the root count before project resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-project-invalid-roots-"))
  try {
    const result = await projectResolutionDiffRun(
      root,
      [
        apiProjectCreate({ id: "project-one-id", name: "project-one" }),
        apiProjectCreate({ id: "project-two-id", name: "project-two" }),
      ],
      cliEnvironmentWithoutProject,
      [join(root, "second-root")],
    )
    expect(result.exitCode).toBe(1)
    expect(result.output.error.message).toBe("The diff command takes zero or one root argument")
    expect(result.requests).toHaveLength(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("commands without a project root do not infer identity from the current package", async () => {
  const transport = projectResolutionFetcherCreate([
    apiProjectCreate({ id: "cwd-project-id", name: "@adaptive-ds/assets-service" }),
    apiProjectCreate({ id: "other-project-id", name: "other-project" }),
  ])
  const output: string[] = []
  const exitCode = await assetsCliMain(["list", "--json"], {
    env: cliEnvironmentWithoutProject,
    fetcher: transport.fetcher,
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })
  expect(exitCode).toBe(1)
  expect(JSON.parse(output[0] ?? "").error.message).toBe(
    "Could not determine the project. Use --project <name> or set ASSETS_PROJECT in the environment or the current working directory's .env file.",
  )
})

test("doctor reports remote checks in a deterministic JSON envelope", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["doctor", "--json"], {
    env: cliEnvironment,
    fetcher: async (input) => {
      const path = new URL(input).pathname
      if (path.endsWith("/health")) return envelopeResponseCreate({ status: "ok" })
      if (path.endsWith("/ready")) return envelopeResponseCreate({ status: "ready" })
      return envelopeResponseCreate({
        id: "environment-1",
        projectId: "project-1",
        name: "development",
        r2Bucket: "assets-development",
        r2Prefix: "public",
        publicBaseUrl: "https://cdn.example.test",
        createdAt: "2026-08-17T12:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z",
      })
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(0)
  expect(output).toHaveLength(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    ok: true,
    data: {
      checks: [
        { name: "api", status: "ok" },
        { name: "readiness", status: "ok" },
        { name: "environment", status: "ok" },
      ],
      environment: "development",
      ok: true,
      projectId: "project-1",
    },
  })
  expect(output[0]).toBe(
    '{"data":{"checks":[{"name":"api","status":"ok"},{"name":"readiness","status":"ok"},{"name":"environment","status":"ok"}],"environment":"development","ok":true,"projectId":"project-1"},"ok":true}\n',
  )
})

test("lists --check returns a nonzero exit when generated files differ", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-cli-lists-"))
  await writeFile(join(directory, "imageList.ts"), "different\n")
  await writeFile(join(directory, "videoList.ts"), "")
  await writeFile(join(directory, "fontList.ts"), "")
  await writeFile(join(directory, "documentList.ts"), "")
  const output: string[] = []

  const exitCode = await assetsCliMain(["lists", "--check", "--dir", directory, "--json"], {
    env: cliEnvironment,
    fetcher: async () =>
      envelopeResponseCreate({ imageList: "", videoList: "", fontList: "", documentList: "", digest: "0".repeat(64) }),
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    ok: true,
    data: {
      digest: "0".repeat(64),
      files: {
        fontListPath: join(directory, "fontList.ts"),
        documentListPath: join(directory, "documentList.ts"),
        imageListPath: join(directory, "imageList.ts"),
        videoListPath: join(directory, "videoList.ts"),
      },
      matches: false,
    },
  })
})

test("catalogs rebuild calls the synchronous production admin endpoint", async () => {
  const requests: Request[] = []
  const stdout: string[] = []
  const exitCode = await assetsCliMain(
    ["catalogs", "rebuild", "--project", "project-1", "--environment", "production", "--json"],
    {
      env: cliEnvironment,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
      fetcher: async (input, init) => {
        const request = new Request(String(input), init)
        requests.push(request)
        return envelopeResponseCreate({
          id: "catalog-project-1-production",
          generationId: "generation-1",
          current: true,
          catalog: {
            schema: "assets.catalog.v1",
            projectId: "project-1",
            environment: "production",
            digest: "a".repeat(64),
            rendererVersion: "assets-service.catalog.v1",
            generatedAt: "2026-08-31T00:00:00.000Z",
            outputs: [],
          },
        })
      },
    },
  )

  expect(exitCode).toBe(0)
  expect(requests).toHaveLength(1)
  expect(requests[0]?.method).toBe("POST")
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/projects/project-1/catalogs/production/rebuild")
  expect(stdout.join("")).toContain('"generationId":"generation-1"')
})

test("reprocess targets an explicit environment without uploading bytes and reports a waited workflow", async () => {
  const listedAsset = assetCreate({
    id: "asset-reprocess",
    filename: "hero.jpg",
    sourcePath: "home/hero.jpg",
    sha256: "a".repeat(64),
    byteSize: 10,
    folders: ["home"],
  })
  const { outputCount: _outputCount, ...listedAssetDetail } = listedAsset
  const asset = { ...listedAssetDetail, metadata: null }
  const workflow = {
    id: "workflow-reprocess",
    projectId: "project-1",
    assetId: "asset-reprocess",
    sourceRevisionId: listedAsset.currentSourceRevisionId,
    kind: "asset_processing" as const,
    status: "succeeded" as const,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:01.000Z",
  }
  const requests: Request[] = []
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const request = new Request(String(input), init)
    requests.push(request)
    const url = new URL(request.url)
    if (url.pathname.endsWith("/environments"))
      return envelopeResponseCreate({
        environments: [
          {
            id: "environment-production",
            projectId: "project-1",
            name: "production",
            r2Bucket: "assets-production",
            r2Prefix: "production",
            publicBaseUrl: "https://assets.example.test",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
          },
        ],
      })
    if (url.pathname.endsWith("/assets"))
      return envelopeResponseCreate({ assets: [listedAsset], page: { limit: 100, nextCursor: null } })
    if (url.pathname.endsWith("/assets/asset-reprocess/reprocess"))
      return envelopeResponseCreate({ asset, workflowId: workflow.id }, 202)
    if (url.pathname.endsWith("/workflows/workflow-reprocess/status")) return envelopeResponseCreate(workflow)
    throw new Error(`Unexpected request ${request.url}`)
  }
  const output: string[] = []
  const exitCode = await assetsCliMain(
    ["reprocess", "home/hero.jpg", "--project", "project-1", "--environment", "production", "--wait", "--json"],
    {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    },
  )

  expect(exitCode).toBe(0)
  expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "POST", "GET"])
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/projects/project-1/environments")
  expect(
    requests.some(
      (request) => request.url.includes("/uploads") || new URL(request.url).hostname === "upload.example.test",
    ),
  ).toBe(false)
  expect(requests[2]?.url).toBe(
    "https://assets.example.test/api/v1/projects/project-1/assets/asset-reprocess/reprocess",
  )
  expect(await requests[2]?.clone().json()).toEqual({ environmentId: "environment-production" })
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: true,
    data: { asset: { id: "asset-reprocess" }, workflowId: "workflow-reprocess", workflow: { status: "succeeded" } },
  })
})

test("reprocess rejects missing and duplicate selected environments before reading assets", async () => {
  const productionEnvironment = {
    id: "environment-production",
    projectId: "project-1",
    name: "production" as const,
    r2Bucket: "assets-production",
    r2Prefix: "production",
    publicBaseUrl: "https://assets.example.test",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }
  const run = async (environments: readonly unknown[]) => {
    const requests: Request[] = []
    const output: string[] = []
    const exitCode = await assetsCliMain(
      ["reprocess", "asset-reprocess", "--project", "project-1", "--environment", "production", "--json"],
      {
        env: cliEnvironment,
        fetcher: async (input, init) => {
          const request = new Request(String(input), init)
          requests.push(request)
          if (new URL(request.url).pathname.endsWith("/environments")) return envelopeResponseCreate({ environments })
          throw new Error(`Unexpected request ${request.url}`)
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )
    return { exitCode, output: JSON.parse(output[0] ?? "{}"), requests }
  }

  const missing = await run([])
  expect(missing.exitCode).toBe(1)
  expect(missing.output).toMatchObject({
    ok: false,
    error: { message: "The production environment is not configured for this project" },
  })
  expect(missing.requests).toHaveLength(1)
  expect(missing.requests[0]?.url).toBe("https://assets.example.test/api/v1/projects/project-1/environments")

  const duplicate = await run([productionEnvironment, { ...productionEnvironment, id: "environment-production-copy" }])
  expect(duplicate.exitCode).toBe(1)
  expect(duplicate.output).toMatchObject({
    ok: false,
    error: { message: "The production environment is configured more than once for this project" },
  })
  expect(duplicate.requests).toHaveLength(1)
})

test("reprocess reports a failed waited workflow and rejects ambiguous assets without starting work", async () => {
  const assetOne = assetCreate({
    id: "asset-reprocess-one",
    filename: "hero.jpg",
    sourcePath: "home/hero.jpg",
    sha256: "a".repeat(64),
    byteSize: 10,
    folders: ["home"],
  })
  const assetTwo = assetCreate({
    id: "asset-reprocess-two",
    filename: "hero-copy.jpg",
    sourcePath: "home/hero.jpg",
    sha256: "b".repeat(64),
    byteSize: 10,
    folders: ["home"],
  })
  const { outputCount: _assetOneOutputCount, ...assetOneDetailWithoutMetadata } = assetOne
  const assetOneDetail = { ...assetOneDetailWithoutMetadata, metadata: null }
  const requests: Request[] = []
  const workflow = {
    id: "workflow-reprocess-failed",
    projectId: "project-1",
    assetId: "asset-reprocess-one",
    sourceRevisionId: assetOne.currentSourceRevisionId,
    kind: "asset_processing" as const,
    status: "failed" as const,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:01.000Z",
  }
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const request = new Request(String(input), init)
    requests.push(request)
    const url = new URL(request.url)
    if (url.pathname.endsWith("/environments"))
      return envelopeResponseCreate({
        environments: [
          {
            id: "environment-production",
            projectId: "project-1",
            name: "production",
            r2Bucket: "assets-production",
            r2Prefix: "production",
            publicBaseUrl: "https://assets.example.test",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
          },
        ],
      })
    if (url.pathname.endsWith("/assets"))
      return envelopeResponseCreate({ assets: [assetOne, assetTwo], page: { limit: 100, nextCursor: null } })
    if (url.pathname.endsWith("/assets/asset-reprocess-one/reprocess"))
      return envelopeResponseCreate({ asset: assetOneDetail, workflowId: workflow.id }, 202)
    if (url.pathname.endsWith("/workflows/workflow-reprocess-failed/status")) return envelopeResponseCreate(workflow)
    throw new Error(`Unexpected request ${request.url}`)
  }

  const ambiguousOutput: string[] = []
  const ambiguousExitCode = await assetsCliMain(
    ["reprocess", "home/hero.jpg", "--project", "project-1", "--environment", "production", "--json"],
    {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => ambiguousOutput.push(text),
      stderr: () => undefined,
    },
  )
  expect(ambiguousExitCode).toBe(1)
  expect(JSON.parse(ambiguousOutput[0] ?? "")).toMatchObject({
    ok: false,
    error: { message: "More than one asset matched home/hero.jpg; use an asset id" },
  })
  expect(requests.map((request) => request.method)).toEqual(["GET", "GET"])

  const missingOutput: string[] = []
  const missingExitCode = await assetsCliMain(
    ["reprocess", "missing-asset", "--project", "project-1", "--environment", "production", "--json"],
    {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => missingOutput.push(text),
      stderr: () => undefined,
    },
  )
  expect(missingExitCode).toBe(1)
  expect(JSON.parse(missingOutput[0] ?? "")).toMatchObject({
    ok: false,
    error: { message: "The asset missing-asset was not found" },
  })
  expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "GET"])

  const failedOutput: string[] = []
  const failedExitCode = await assetsCliMain(
    ["reprocess", "asset-reprocess-one", "--project", "project-1", "--environment", "production", "--wait", "--json"],
    {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => failedOutput.push(text),
      stderr: () => undefined,
    },
  )
  expect(failedExitCode).toBe(1)
  expect(JSON.parse(failedOutput[0] ?? "")).toMatchObject({
    ok: true,
    data: { workflowId: "workflow-reprocess-failed", workflow: { status: "failed" } },
  })
  expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "GET", "GET", "GET", "POST", "GET"])
})

test("reprocess requires an explicit environment instead of using the configured default", async () => {
  const requests: Request[] = []
  const output: string[] = []
  const exitCode = await assetsCliMain(["reprocess", "asset-1", "--project", "project-1", "--json"], {
    env: cliEnvironment,
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return envelopeResponseCreate({})
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(1)
  expect(requests).toHaveLength(0)
  expect(JSON.parse(output[0] ?? "")).toMatchObject({
    ok: false,
    error: { message: "Reprocess requires --environment" },
  })
})

test("remote upload sends an intent, the exact bytes, and completion without local fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-cli-upload-"))
  try {
    const filePath = join(directory, "card.png")
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    await writeFile(filePath, bytes)
    const output: string[] = []
    const requests: Request[] = []
    const exitCode = await assetsCliMain(
      ["upload", filePath, "--path", "home/card.png", "--integration-note", "Use the card", "--json"],
      {
        env: cliEnvironment,
        fetcher: async (input, init) => {
          const request = new Request(input, init)
          requests.push(request)
          if (request.url.includes("/uploads/intent"))
            return envelopeResponseCreate({
              uploadId: "upload-1",
              status: "pending",
              intent: {
                method: "PUT",
                url: "https://upload.example.test/staging/upload-1",
                key: "private/staging/upload-1",
                expiresAt: "2026-08-17T12:10:00.000Z",
                headers: { "content-length": String(bytes.byteLength), "content-type": "image/png" },
                mediaType: "image/png",
                byteSize: bytes.byteLength,
              },
            })
          if (request.url.includes("upload.example.test")) return new Response(null, { status: 200 })
          return envelopeResponseCreate({
            uploadId: "upload-1",
            assetId: "asset-1",
            sourceRevisionId: "source-1",
            workflowId: "workflow-1",
            status: "accepted",
          })
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["POST", "PUT", "POST"])
    expect(new Uint8Array(await requests[1]!.arrayBuffer())).toEqual(bytes)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      ok: true,
      data: {
        completion: {
          assetId: "asset-1",
          sourceRevisionId: "source-1",
          status: "accepted",
          uploadId: "upload-1",
          workflowId: "workflow-1",
        },
        status: "pending",
        uploadId: "upload-1",
      },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("upload-all uploads only new and changed files in stable order and skips matching files", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const changedBytes = new TextEncoder().encode("changed locally")
    const matchingBytes = new TextEncoder().encode("matching")
    const newBytes = new TextEncoder().encode("new")
    await writeFile(join(root, "images", "changed.jpg"), changedBytes)
    await writeFile(join(root, "images", "matching.jpg"), matchingBytes)
    await writeFile(join(root, "images", "new.jpg"), newBytes)
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(matchingBytes),
      byteSize: matchingBytes.byteLength,
    })
    const changed = assetCreate({
      id: "asset-changed",
      filename: "changed.jpg",
      sha256: "c".repeat(64),
      byteSize: changedBytes.byteLength,
    })
    const requests: Request[] = []
    let uploadNumber = 0
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching, changed], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        return envelopeResponseCreate(deletionEligibilityCreate(sourceRevisionId))
      }
      if (url.pathname.endsWith("/uploads/intent")) {
        uploadNumber += 1
        const uploadId = `upload-${uploadNumber}`
        return envelopeResponseCreate({
          uploadId,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${uploadId}`,
            key: `private/staging/${uploadId}`,
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "0", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: Number(request.body ? JSON.parse(await request.text()).byteSize : 0),
          },
        })
      }
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.includes("/uploads/upload-1/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-1",
          assetId: "asset-new-changed",
          sourceRevisionId: "source-changed",
          workflowId: "workflow-changed",
          status: "accepted",
        })
      return envelopeResponseCreate({
        uploadId: "upload-2",
        assetId: "asset-new",
        sourceRevisionId: "source-new",
        workflowId: "workflow-new",
        status: "accepted",
      })
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "GET",
      "GET",
      "POST",
      "PUT",
      "POST",
      "POST",
      "PUT",
      "POST",
    ])
    expect(
      requests
        .filter((request) => request.url.includes("upload.example.test"))
        .every((request) => request.headers.get("authorization") === null),
    ).toBe(true)
    expect(new Uint8Array(await requests[4]!.arrayBuffer())).toEqual(changedBytes)
    expect(new Uint8Array(await requests[7]!.arrayBuffer())).toEqual(newBytes)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      ok: true,
      data: {
        delete: false,
        dryRun: false,
        environment: "development",
        altUpdated: 0,
        altUpdatesPending: 0,
        defaultReconciled: 0,
        defaultReconciliationsPending: 0,
        root,
        wait: false,
        entries: [
          {
            action: "uploaded",
            assetId: "asset-new-changed",
            class: "image",
            logicalPath: "changed.jpg",
            sourcePath: "images/changed.jpg",
            sourceRevisionId: "source-changed",
            status: "changed",
            uploadId: "upload-1",
            workflowId: "workflow-changed",
          },
          {
            action: "skipped",
            class: "image",
            logicalPath: "matching.jpg",
            sourcePath: "images/matching.jpg",
            status: "matching",
          },
          {
            action: "uploaded",
            assetId: "asset-new",
            class: "image",
            logicalPath: "new.jpg",
            sourcePath: "images/new.jpg",
            sourceRevisionId: "source-new",
            status: "new",
            uploadId: "upload-2",
            workflowId: "workflow-new",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all repairs a stale canonical image default without uploading bytes and preserves other definitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-default-repair-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("matching")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    const remote = {
      ...assetCreate({
        id: "asset-default-repair",
        filename: "hero.jpg",
        sha256: contentSha256Create(bytes),
        byteSize: bytes.byteLength,
      }),
      outputHistory: [
        {
          definition: {
            id: "output-asset-default-repair-default",
            assetId: "asset-default-repair",
            kind: "image" as const,
            key: "default",
            width: 1280,
            height: 720,
            format: "webp" as const,
            quality: 60,
            showAiLabel: true,
          },
          versions: [],
        },
        {
          definition: {
            id: "output-asset-default-repair-mobile",
            assetId: "asset-default-repair",
            kind: "image" as const,
            key: "mobile",
            width: 640,
            height: 360,
            format: "png" as const,
            quality: 70,
            showAiLabel: false,
          },
          versions: [],
        },
      ],
    }
    const requests: Request[] = []
    const outputBodies: unknown[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("asset-default-repair"))
      if (url.pathname.endsWith("/outputs")) {
        const body = await request.json()
        outputBodies.push(body)
        return envelopeResponseCreate({
          outputs: (body as { outputs: Record<string, unknown>[] }).outputs.map((output) => ({
            ...output,
            assetId: "asset-default-repair",
            id: remote.outputHistory.find((history) => history.definition.key === output.key)?.definition.id,
          })),
          workflowId: "workflow-repair",
        })
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "PUT"])
    expect(
      requests.some((request) => request.url.includes("/uploads/") || request.url.includes("upload.example.test")),
    ).toBe(false)
    expect(outputBodies).toEqual([
      {
        outputs: [
          {
            kind: "image",
            key: "default",
            width: 1920,
            height: 1080,
            format: "avif",
            quality: 80,
          },
          {
            kind: "image",
            key: "mobile",
            width: 640,
            height: 360,
            format: "png",
            quality: 70,
            showAiLabel: false,
          },
        ],
      },
    ])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        defaultReconciled: 1,
        defaultReconciliationsPending: 1,
        entries: [
          {
            action: "skipped",
            defaultReconciled: true,
            status: "matching",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all skips current and noncanonical image defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-default-skip-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const currentBytes = new TextEncoder().encode("current")
    const noncanonicalBytes = new TextEncoder().encode("noncanonical")
    await writeFile(join(root, "images", "current.jpg"), currentBytes)
    await writeFile(join(root, "images", "noncanonical.jpg"), noncanonicalBytes)
    const current = {
      ...assetCreate({
        id: "asset-current-default",
        filename: "current.jpg",
        sha256: contentSha256Create(currentBytes),
        byteSize: currentBytes.byteLength,
      }),
      outputHistory: [
        {
          definition: {
            id: "output-asset-current-default-default",
            assetId: "asset-current-default",
            kind: "image" as const,
            key: "default",
            width: 1920,
            height: 1080,
            format: "avif" as const,
            quality: 80,
          },
          versions: [],
        },
      ],
    }
    const noncanonical = {
      ...assetCreate({
        id: "asset-noncanonical-default",
        filename: "noncanonical.jpg",
        sha256: contentSha256Create(noncanonicalBytes),
        byteSize: noncanonicalBytes.byteLength,
      }),
      outputHistory: [
        {
          definition: {
            id: "output-asset-noncanonical-default-default-legacy",
            assetId: "asset-noncanonical-default",
            kind: "image" as const,
            key: "default",
            width: 1280,
            height: 720,
            format: "webp" as const,
            quality: 60,
          },
          versions: [],
        },
      ],
    }
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [current, noncanonical], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        return envelopeResponseCreate(deletionEligibilityCreate(sourceRevisionId))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        defaultReconciled: 0,
        defaultReconciliationsPending: 0,
        entries: [
          { action: "skipped", status: "matching" },
          { action: "skipped", status: "matching" },
        ],
      },
    })
    expect(
      JSON.parse(output[0] ?? "").data.entries.every(
        (entry: { defaultReconciled?: boolean }) => entry.defaultReconciled !== true,
      ),
    ).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all dry-run reports stale canonical default reconciliation without mutating", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-default-dry-run-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("dry run")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    const remote = {
      ...assetCreate({
        id: "asset-default-dry-run",
        filename: "hero.jpg",
        sha256: contentSha256Create(bytes),
        byteSize: bytes.byteLength,
      }),
      outputHistory: [
        {
          definition: {
            id: "output-asset-default-dry-run-default",
            assetId: "asset-default-dry-run",
            kind: "image" as const,
            key: "default",
            width: 100,
            height: 100,
            format: "png" as const,
            quality: 50,
          },
          versions: [],
        },
      ],
    }
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("asset-default-dry-run"))
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--dry-run", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        defaultReconciled: 0,
        defaultReconciliationsPending: 1,
        dryRun: true,
        entries: [
          {
            action: "planned",
            defaultReconciliationPlanned: true,
            status: "matching",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all uploads a new image, then applies its markdown sidecar alt to the created asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-new-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("new image")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "  Hero alt  \n")
    await writeFile(join(root, "images", "hero.txt"), "Fallback alt")
    const requests: Request[] = []
    const metadataBodies: unknown[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-new-alt",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-new-alt",
            key: "private/staging/upload-new-alt",
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": String(bytes.byteLength), "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: bytes.byteLength,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-new-alt/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-new-alt",
          assetId: "asset-new-alt",
          sourceRevisionId: "source-new-alt",
          workflowId: "workflow-new-alt",
          status: "accepted",
        })
      if (url.pathname.endsWith("/assets/asset-new-alt/metadata")) {
        metadataBodies.push(await request.json())
        const detail = assetCreate({
          id: "asset-new-alt",
          filename: "hero.jpg",
          sha256: contentSha256Create(bytes),
          byteSize: bytes.byteLength,
          sourceRevisionId: "source-new-alt",
          alt: "Hero alt",
        })
        const { outputCount: _outputCount, ...assetDetail } = detail
        return envelopeResponseCreate(assetDetail)
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "PUT", "POST", "PATCH"])
    expect(new Uint8Array(await requests[2]!.arrayBuffer())).toEqual(bytes)
    expect(metadataBodies).toEqual([{ alt: "Hero alt" }])
    expect(requests.filter((request) => request.url.includes("/uploads/intent"))).toHaveLength(1)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 1,
        altUpdatesPending: 1,
        entries: [
          {
            action: "uploaded",
            altChanged: true,
            altUpdated: true,
            assetId: "asset-new-alt",
            localAlt: "Hero alt",
            remoteAlt: null,
            sourcePath: "images/hero.jpg",
            status: "new",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all updates metadata-only drift without uploading matching bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-metadata-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("hero")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "Local alt")
    const remote = assetCreate({
      id: "asset-metadata",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Remote alt",
    })
    const requests: Request[] = []
    const metadataBodies: unknown[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("asset-metadata"))
      if (url.pathname.endsWith("/assets/asset-metadata/metadata")) {
        metadataBodies.push(await request.json())
        const { outputCount: _outputCount, ...assetDetail } = remote
        return envelopeResponseCreate({
          ...assetDetail,
          metadata: { ...remote.metadata, metadata: { ...remote.metadata!.metadata, alt: "Local alt" } },
        })
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "PATCH"])
    expect(metadataBodies).toEqual([{ alt: "Local alt" }])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 1,
        altUpdatesPending: 1,
        entries: [
          {
            action: "skipped",
            altChanged: true,
            altUpdated: true,
            localAlt: "Local alt",
            remoteAlt: "Remote alt",
            status: "metadata",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all does not update metadata when the sidecar alt already matches", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-matching-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("hero")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "Same alt")
    const remote = assetCreate({
      id: "asset-matching-alt",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Same alt",
    })
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("asset-matching-alt"))
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 0,
        altUpdatesPending: 0,
        entries: [{ action: "skipped", status: "matching" }],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all dry-run reports pending alt metadata without mutating the service", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-dry-run-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("hero")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    await writeFile(join(root, "images", "hero.md"), "Local alt")
    const remote = assetCreate({
      id: "asset-dry-run-alt",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Remote alt",
    })
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("asset-dry-run-alt"))
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--dry-run", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        altUpdated: 0,
        altUpdatesPending: 1,
        dryRun: true,
        entries: [
          {
            action: "planned",
            altChanged: true,
            altUpdatePlanned: true,
            localAlt: "Local alt",
            remoteAlt: "Remote alt",
            status: "metadata",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all dry-run is read-only and delete rejects no-wait", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-dry-run-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "new.jpg"), "new")
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
    }
    const output: string[] = []
    const dryRunExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--dry-run", "--json"],
      {
        env: cliEnvironment,
        fetcher,
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )
    expect(dryRunExitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: { dryRun: true, entries: [{ action: "planned", status: "new" }] },
    })

    const invalidOutput: string[] = []
    const invalidExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--no-wait", "--json"],
      {
        env: cliEnvironment,
        fetcher: async () => {
          throw new Error("network should not be reached")
        },
        stdout: (text) => invalidOutput.push(text),
        stderr: () => undefined,
      },
    )
    expect(invalidExitCode).toBe(1)
    expect(JSON.parse(invalidOutput[0] ?? "")).toMatchObject({
      ok: false,
      error: { message: "--delete requires waiting and cannot be used with --no-wait" },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all delete implies waiting and checks exact revisions before unlinking", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-delete-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const matchingBytes = new TextEncoder().encode("matching")
    await writeFile(join(root, "images", "matching.jpg"), matchingBytes)
    await writeFile(join(root, "images", "new.jpg"), "new")
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(matchingBytes),
      byteSize: matchingBytes.byteLength,
    })
    const requests: Request[] = []
    const eligibilityRevisionIds: string[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-new",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-new",
            key: "private/staging/upload-new",
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "3", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 3,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-new/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-new",
          assetId: "asset-new",
          sourceRevisionId: "source-new",
          workflowId: "workflow-new",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-new/status"))
        return envelopeResponseCreate({
          id: "workflow-new",
          projectId: "project-1",
          assetId: "asset-new",
          sourceRevisionId: "source-new",
          kind: "asset_processing",
          status: "succeeded",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        eligibilityRevisionIds.push(sourceRevisionId)
        return envelopeResponseCreate(deletionEligibilityCreate(sourceRevisionId))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--delete", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(eligibilityRevisionIds).toEqual(["asset-matching", "source-new"])
    expect(
      requests
        .filter((request) => request.url.includes("/deletion-eligibility"))
        .map((request) => new URL(request.url).search),
    ).toEqual(["?environment=development", "?environment=development"])
    expect(
      requests.filter((request) => request.url.includes("upload.example.test"))[0]?.headers.get("authorization"),
    ).toBeNull()
    expect(await Bun.file(join(root, "images", "matching.jpg")).exists()).toBe(false)
    expect(await Bun.file(join(root, "images", "new.jpg")).exists()).toBe(false)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        delete: true,
        wait: true,
        entries: [
          { action: "skipped", deleted: true, eligible: true, status: "matching" },
          { action: "uploaded", deleted: true, eligible: true, status: "new", workflowStatus: "succeeded" },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all blocks the complete set on preflight failure and retains every local entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-preflight-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "valid.jpg"), "valid")
    await writeFile(join(root, "images", "unsupported.bin"), "unsupported")
    const requests: Request[] = []
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests.map((request) => request.method)).toEqual(["GET"])
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { action: "failed", sourcePath: "images/unsupported.bin", status: "unsupported" },
          { action: "skipped", sourcePath: "images/valid.jpg", status: "new" },
        ],
      },
    })
    expect(await Bun.file(join(root, "images", "valid.jpg")).exists()).toBe(true)
    expect(await Bun.file(join(root, "images", "unsupported.bin")).exists()).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all rejects a replacement after preflight without blocking later uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-replacement-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const replacedPath = join(root, "images", "a.jpg")
    const replacementPath = join(root, "a-replacement.jpg")
    await writeFile(replacedPath, "a")
    await writeFile(join(root, "images", "b.jpg"), "b")
    const requests: Request[] = []
    let replaced = false
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets")) {
        if (!replaced) {
          replaced = true
          await writeFile(replacementPath, "a")
          await rename(replacementPath, replacedPath)
        }
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      }
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-b",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-b",
            key: "private/staging/upload-b",
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "1", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 1,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      return envelopeResponseCreate({
        uploadId: "upload-b",
        assetId: "asset-b",
        sourceRevisionId: "source-b",
        workflowId: "workflow-b",
        status: "accepted",
      })
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "PUT", "POST"])
    expect(new Uint8Array(await requests[2]!.arrayBuffer())).toEqual(new Uint8Array([0x62]))
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { action: "failed", sourcePath: "images/a.jpg", status: "new" },
          { action: "uploaded", sourcePath: "images/b.jpg", status: "new", assetId: "asset-b" },
        ],
      },
    })
    expect(await Bun.file(replacedPath).exists()).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all reports workflow results per entry and only cleans up succeeded uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-workflow-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "failed.jpg"), "f")
    await writeFile(join(root, "images", "succeeded.jpg"), "s")
    const requests: Request[] = []
    let uploadNumber = 0
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        uploadNumber += 1
        const uploadId = `upload-${uploadNumber}`
        return envelopeResponseCreate({
          uploadId,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${uploadId}`,
            key: `private/staging/${uploadId}`,
            expiresAt: "2026-08-17T12:10:00.000Z",
            headers: { "content-length": "1", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 1,
          },
        })
      }
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-1/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-1",
          assetId: "asset-failed",
          sourceRevisionId: "source-failed",
          workflowId: "workflow-failed",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-failed/status"))
        return envelopeResponseCreate({
          id: "workflow-failed",
          projectId: "project-1",
          assetId: "asset-failed",
          sourceRevisionId: "source-failed",
          kind: "asset_processing",
          status: "failed",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      if (url.pathname.endsWith("/uploads/upload-2/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-2",
          assetId: "asset-succeeded",
          sourceRevisionId: "source-succeeded",
          workflowId: "workflow-succeeded",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-succeeded/status"))
        return envelopeResponseCreate({
          id: "workflow-succeeded",
          projectId: "project-1",
          assetId: "asset-succeeded",
          sourceRevisionId: "source-succeeded",
          kind: "asset_processing",
          status: "succeeded",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("source-succeeded"))
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--delete", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests.some((request) => request.url.includes("source-failed/deletion-eligibility"))).toBe(false)
    expect(await Bun.file(join(root, "images", "failed.jpg")).exists()).toBe(true)
    expect(await Bun.file(join(root, "images", "succeeded.jpg")).exists()).toBe(false)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { action: "failed", status: "new", workflowStatus: "failed" },
          { action: "uploaded", status: "new", workflowStatus: "succeeded", deleted: true },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all continues after mixed upload failures and keeps nonzero output deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-mixed-results-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    for (const filename of ["a.jpg", "b.jpg", "c.jpg", "d.jpg"])
      await writeFile(join(root, "images", filename), filename)
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        const body = (await request.json()) as { originalFilename: string }
        if (body.originalFilename === "a.jpg") return failureResponseCreate("intent failed", 400)
        return envelopeResponseCreate({
          uploadId: `upload-${body.originalFilename[0]}`,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${body.originalFilename[0]}`,
            key: `private/staging/${body.originalFilename[0]}`,
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": "5", "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: 5,
          },
        })
      }
      if (url.hostname === "upload.example.test") {
        if (url.pathname.endsWith("/b")) return new Response(null, { status: 502 })
        return new Response(null, { status: 200 })
      }
      if (url.pathname.endsWith("/uploads/upload-c/complete")) return failureResponseCreate("completion failed", 500)
      const uploadId = url.pathname.split("/").at(-2) ?? ""
      return envelopeResponseCreate({
        uploadId,
        assetId: `asset-${uploadId.at(-1)}`,
        sourceRevisionId: `source-${uploadId.at(-1)}`,
        workflowId: `workflow-${uploadId.at(-1)}`,
        status: "accepted",
      })
    }

    const output: string[] = []
    const firstExitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    const secondExitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(firstExitCode).toBe(1)
    expect(secondExitCode).toBe(1)
    expect(output[0]).toBe(output[1])
    const value = JSON.parse(output[0] ?? "{}") as { data?: { entries?: Array<Record<string, unknown>> } }
    expect(value.data?.entries?.map((entry) => [entry.sourcePath, entry.action, entry.error])).toEqual([
      ["images/a.jpg", "failed", "intent failed"],
      ["images/b.jpg", "failed", "The direct upload was rejected (502): "],
      ["images/c.jpg", "failed", "completion failed"],
      ["images/d.jpg", "uploaded", undefined],
    ])
    expect(value.data?.entries?.find((entry) => entry.sourcePath === "images/d.jpg")).toMatchObject({
      assetId: "asset-d",
      sourceRevisionId: "source-d",
      uploadId: "upload-d",
    })
    expect(requests.filter((request) => request.url.endsWith("/uploads/intent"))).toHaveLength(8)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all keeps an interrupted upload for a rerun that cleans up the matching revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-rerun-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("retry")
    const filePath = join(root, "images", "retry.jpg")
    await writeFile(filePath, bytes)
    const matching = assetCreate({
      id: "asset-retry",
      filename: "retry.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      sourceRevisionId: "source-retry",
      sourcePath: "retry.jpg",
    })
    const requests: Request[] = []
    let manifestRead = 0
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets")) {
        manifestRead += 1
        return envelopeResponseCreate({
          assets: manifestRead === 1 ? [] : [matching],
          page: { limit: 100, nextCursor: null },
        })
      }
      if (url.pathname.endsWith("/uploads/intent"))
        return envelopeResponseCreate({
          uploadId: "upload-retry",
          status: "pending",
          intent: {
            method: "PUT",
            url: "https://upload.example.test/staging/upload-retry",
            key: "private/staging/upload-retry",
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": String(bytes.byteLength), "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: bytes.byteLength,
          },
        })
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-retry/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-retry",
          assetId: "asset-retry",
          sourceRevisionId: "source-retry",
          workflowId: "workflow-retry",
          status: "accepted",
        })
      if (url.pathname.endsWith("/workflows/workflow-retry/status"))
        return failureResponseCreate("workflow polling was interrupted", 503)
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate("source-retry"))
      throw new Error(`Unexpected request ${request.url}`)
    }

    const firstOutput: string[] = []
    const firstExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => firstOutput.push(text), stderr: () => undefined },
    )
    expect(firstExitCode).toBe(1)
    expect(await Bun.file(filePath).exists()).toBe(true)
    expect(JSON.parse(firstOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: { entries: [{ action: "failed", status: "new", sourceRevisionId: "source-retry" }] },
    })

    const secondOutput: string[] = []
    const secondExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => secondOutput.push(text), stderr: () => undefined },
    )
    expect(secondExitCode).toBe(0)
    expect(await Bun.file(filePath).exists()).toBe(false)
    expect(JSON.parse(secondOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: { entries: [{ action: "skipped", deleted: true, eligible: true, status: "matching" }] },
    })
    expect(requests.filter((request) => request.url.endsWith("/uploads/intent"))).toHaveLength(1)
    expect(requests.filter((request) => request.url.includes("/deletion-eligibility"))).toHaveLength(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all retries matching cleanup after an unlink failure without deleting directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-cleanup-retry-"))
  const imagesPath = join(root, "images")
  try {
    const nestedPath = join(imagesPath, "nested")
    const filePath = join(nestedPath, "keep.jpg")
    await mkdir(nestedPath, { recursive: true })
    const bytes = new TextEncoder().encode("keep")
    await writeFile(filePath, bytes)
    const matching = assetCreate({
      id: "asset-cleanup",
      filename: "keep.jpg",
      folders: ["nested"],
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      sourceRevisionId: "source-cleanup",
      sourcePath: "nested/keep.jpg",
    })
    let eligibilityCalls = 0
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility")) {
        eligibilityCalls += 1
        await chmod(nestedPath, eligibilityCalls === 1 ? 0o500 : 0o755)
        return envelopeResponseCreate(deletionEligibilityCreate("source-cleanup"))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }

    const firstOutput: string[] = []
    const firstExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => firstOutput.push(text), stderr: () => undefined },
    )
    expect(firstExitCode).toBe(1)
    expect(await Bun.file(filePath).exists()).toBe(true)
    expect(JSON.parse(firstOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: {
        entries: [
          {
            action: "failed",
            deleted: false,
            eligible: true,
            error: `Could not delete the local file: ${filePath}`,
            status: "matching",
          },
        ],
      },
    })

    const secondOutput: string[] = []
    const secondExitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => secondOutput.push(text), stderr: () => undefined },
    )
    expect(secondExitCode).toBe(0)
    expect(await Bun.file(filePath).exists()).toBe(false)
    expect((await stat(nestedPath)).isDirectory()).toBe(true)
    expect(JSON.parse(secondOutput[0] ?? "{}")).toMatchObject({
      ok: true,
      data: {
        entries: [{ action: "skipped", deleted: true, eligible: true, status: "matching" }],
      },
    })
    expect(eligibilityCalls).toBe(2)
    expect(requests.filter((request) => request.url.endsWith("/uploads/intent"))).toHaveLength(0)
  } finally {
    await chmod(join(imagesPath, "nested"), 0o755).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all retains a file changed after eligibility is granted", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-changed-delete-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const filePath = join(root, "images", "changed.jpg")
    const original = new TextEncoder().encode("original")
    await writeFile(filePath, original)
    const matching = assetCreate({
      id: "asset-changed-delete",
      filename: "changed.jpg",
      sha256: contentSha256Create(original),
      byteSize: original.byteLength,
      sourceRevisionId: "source-changed-delete",
    })
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [matching], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility")) {
        await writeFile(filePath, "changed after eligibility")
        return envelopeResponseCreate(deletionEligibilityCreate("source-changed-delete"))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--delete", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(await Bun.file(filePath).exists()).toBe(true)
    expect(await readFile(filePath, "utf8")).toBe("changed after eligibility")
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      ok: true,
      data: {
        entries: [
          {
            action: "failed",
            deleted: false,
            eligible: true,
            error: `The local file changed before deletion: ${filePath}`,
            status: "matching",
          },
        ],
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all retains files for failed, cancelled, and polling-error workflows", async () => {
  const cases = [
    { name: "failed", kind: "status" as const, status: "failed" as const },
    { name: "cancelled", kind: "status" as const, status: "cancelled" as const },
    { name: "polling-error", kind: "polling-error" as const },
    { name: "polling-timeout", kind: "polling-timeout" as const },
  ] as const

  for (const outcome of cases) {
    const root = await mkdtemp(join(tmpdir(), `assets-cli-upload-all-${outcome.name}-`))
    try {
      await mkdir(join(root, "images"), { recursive: true })
      const filePath = join(root, "images", "workflow.jpg")
      await writeFile(filePath, "workflow")
      const requests: Request[] = []
      let pollCount = 0
      const fetcher = async (input: string | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        const url = new URL(request.url)
        if (url.pathname.endsWith("/assets"))
          return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
        if (url.pathname.endsWith("/uploads/intent"))
          return envelopeResponseCreate({
            uploadId: `upload-${outcome.name}`,
            status: "pending",
            intent: {
              method: "PUT",
              url: `https://upload.example.test/staging/${outcome.name}`,
              key: `private/staging/${outcome.name}`,
              expiresAt: "2026-08-18T00:10:00.000Z",
              headers: { "content-length": "8", "content-type": "image/jpeg" },
              mediaType: "image/jpeg",
              byteSize: 8,
            },
          })
        if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
        if (url.pathname.endsWith(`/uploads/upload-${outcome.name}/complete`))
          return envelopeResponseCreate({
            uploadId: `upload-${outcome.name}`,
            assetId: `asset-${outcome.name}`,
            sourceRevisionId: `source-${outcome.name}`,
            workflowId: `workflow-${outcome.name}`,
            status: "accepted",
          })
        if (url.pathname.endsWith(`/workflows/workflow-${outcome.name}/status`)) {
          pollCount += 1
          if (outcome.kind === "polling-error") return failureResponseCreate("workflow polling failed", 503)
          if (outcome.kind === "polling-timeout")
            return envelopeResponseCreate({
              id: `workflow-${outcome.name}`,
              projectId: "project-1",
              assetId: `asset-${outcome.name}`,
              sourceRevisionId: `source-${outcome.name}`,
              kind: "asset_processing",
              status: "running",
              createdAt: "2026-08-18T00:00:00.000Z",
              updatedAt: "2026-08-18T00:00:00.000Z",
            })
          return envelopeResponseCreate({
            id: `workflow-${outcome.name}`,
            projectId: "project-1",
            assetId: `asset-${outcome.name}`,
            sourceRevisionId: `source-${outcome.name}`,
            kind: "asset_processing",
            status: outcome.status,
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
          })
        }
        throw new Error(`Unexpected request ${request.url}`)
      }
      const output: string[] = []
      const exitCode = await assetsCliMain(
        ["upload-all", root, "--integration-note", "bulk", "--delete", "--poll-interval", "0", "--json"],
        {
          env: cliEnvironment,
          fetcher,
          sleep: async () => undefined,
          stdout: (text) => output.push(text),
          stderr: () => undefined,
        },
      )
      const entry = (JSON.parse(output[0] ?? "{}").data?.entries ?? [])[0] as Record<string, unknown> | undefined

      expect(exitCode).toBe(1)
      expect(await Bun.file(filePath).exists()).toBe(true)
      expect(requests.filter((request) => request.url.includes("/deletion-eligibility"))).toHaveLength(0)
      expect(entry).toMatchObject({ action: "failed", status: "new" })
      if (outcome.kind === "status") expect(entry?.workflowStatus).toBe(outcome.status)
      if (outcome.kind === "polling-error") expect(entry?.error).toBe("workflow polling failed")
      if (outcome.kind === "polling-timeout")
        expect(entry?.error).toBe("The workflow did not finish before the polling limit")
      if (outcome.kind === "polling-timeout") expect(pollCount).toBe(60)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test("upload-all retains uploads when exact deletion revision eligibility is ineligible or mismatched", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-eligibility-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "mismatch.jpg"), "mismatch")
    await writeFile(join(root, "images", "ineligible.jpg"), "ineligible")
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      if (url.pathname.endsWith("/uploads/intent")) {
        const body = (await request.json()) as { originalFilename: string }
        const key = body.originalFilename.startsWith("mismatch") ? "mismatch" : "ineligible"
        return envelopeResponseCreate({
          uploadId: `upload-${key}`,
          status: "pending",
          intent: {
            method: "PUT",
            url: `https://upload.example.test/staging/${key}`,
            key: `private/staging/${key}`,
            expiresAt: "2026-08-18T00:10:00.000Z",
            headers: { "content-length": String(body.originalFilename.length), "content-type": "image/jpeg" },
            mediaType: "image/jpeg",
            byteSize: body.originalFilename === "mismatch.jpg" ? 8 : 10,
          },
        })
      }
      if (url.hostname === "upload.example.test") return new Response(null, { status: 200 })
      if (url.pathname.endsWith("/uploads/upload-mismatch/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-mismatch",
          assetId: "asset-mismatch",
          sourceRevisionId: "source-mismatch",
          workflowId: "workflow-mismatch",
          status: "accepted",
        })
      if (url.pathname.endsWith("/uploads/upload-ineligible/complete"))
        return envelopeResponseCreate({
          uploadId: "upload-ineligible",
          assetId: "asset-ineligible",
          sourceRevisionId: "source-ineligible",
          workflowId: "workflow-ineligible",
          status: "accepted",
        })
      if (url.pathname.includes("/workflows/")) {
        const workflowId = url.pathname.split("/").at(-2) ?? ""
        const key = workflowId.replace("workflow-", "")
        return envelopeResponseCreate({
          id: workflowId,
          projectId: "project-1",
          assetId: `asset-${key}`,
          sourceRevisionId: `source-${key}`,
          kind: "asset_processing",
          status: "succeeded",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        })
      }
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        return envelopeResponseCreate(
          sourceRevisionId === "source-mismatch"
            ? deletionEligibilityCreate("different-source")
            : deletionEligibilityCreate(sourceRevisionId, false),
        )
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(
      ["upload-all", root, "--integration-note", "bulk", "--environment", "production", "--delete", "--json"],
      { env: cliEnvironment, fetcher, stdout: (text) => output.push(text), stderr: () => undefined },
    )
    const value = JSON.parse(output[0] ?? "{}") as { data?: { entries?: Array<Record<string, unknown>> } }

    expect(exitCode).toBe(1)
    expect(await Bun.file(join(root, "images", "mismatch.jpg")).exists()).toBe(true)
    expect(await Bun.file(join(root, "images", "ineligible.jpg")).exists()).toBe(true)
    expect(value.data?.entries?.map((entry) => [entry.sourcePath, entry.eligible, entry.error])).toEqual([
      ["images/ineligible.jpg", false, "The source revision was not eligible for local deletion"],
      ["images/mismatch.jpg", false, "The deletion eligibility revision did not match"],
    ])
    expect(
      requests
        .filter((request) => request.url.includes("/deletion-eligibility"))
        .map((request) => new URL(request.url).search),
    ).toEqual(["?environment=production", "?environment=production"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all rejects symlinked source directories and file-valued roots before network mutations", async () => {
  const symlinkRoot = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-symlink-"))
  const target = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-symlink-target-"))
  const fileRoot = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-file-root-"))
  try {
    await writeFile(join(target, "card.jpg"), "card")
    await symlink(target, join(symlinkRoot, "images"))
    const symlinkRequests: Request[] = []
    const symlinkOutput: string[] = []
    const symlinkExitCode = await assetsCliMain(["upload-all", symlinkRoot, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        symlinkRequests.push(new Request(input, init))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => symlinkOutput.push(text),
      stderr: () => undefined,
    })

    await writeFile(join(fileRoot, "image-source"), "not a directory")
    await writeFile(join(fileRoot, "assets.config.json"), JSON.stringify({ image: "image-source" }))
    const fileRootRequests: Request[] = []
    const fileRootOutput: string[] = []
    const fileRootExitCode = await assetsCliMain(["upload-all", fileRoot, "--integration-note", "bulk", "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        fileRootRequests.push(new Request(input, init))
        return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
      },
      stdout: (text) => fileRootOutput.push(text),
      stderr: () => undefined,
    })

    expect(symlinkExitCode).toBe(1)
    expect(fileRootExitCode).toBe(1)
    expect(symlinkRequests).toHaveLength(0)
    expect(fileRootRequests).toHaveLength(0)
    expect(JSON.parse(symlinkOutput[0] ?? "{}")).toMatchObject({ ok: false })
    expect(JSON.parse(fileRootOutput[0] ?? "{}")).toMatchObject({ ok: false })
  } finally {
    await rm(symlinkRoot, { recursive: true, force: true })
    await rm(target, { recursive: true, force: true })
    await rm(fileRoot, { recursive: true, force: true })
  }
})

test("upload-all human output keeps deterministic entry ordering", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-human-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "z.jpg"), "z")
    await writeFile(join(root, "images", "a.jpg"), "a")
    const output: string[] = []
    const exitCode = await assetsCliMain(["upload-all", root, "--integration-note", "bulk", "--dry-run"], {
      env: cliEnvironment,
      fetcher: async () => envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } }),
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(0)
    expect(output[0]).toBe(
      `Root: ${root}\nEnvironment: development\nWait: no\nDelete: no\nDry run: yes\n` +
        "new image images/a.jpg planned\nnew image images/z.jpg planned\n" +
        "Summary: uploaded=0 skipped=0 planned=2 failed=0 alt-updated=0 alt-updates-pending=0 default-reconciled=0 default-reconciliations-pending=0\n",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("remote errors stay remote and return a failure envelope with a nonzero exit", async () => {
  const output: string[] = []
  const exitCode = await assetsCliMain(["list", "--json"], {
    env: cliEnvironment,
    fetcher: async () => {
      throw new Error("service offline")
    },
    stdout: (text) => output.push(text),
    stderr: () => undefined,
  })

  expect(exitCode).toBe(1)
  expect(JSON.parse(output[0] ?? "")).toEqual({
    error: {
      code: "service_unavailable",
      message: "The assets service could not be reached",
      retryable: true,
    },
    ok: false,
  })
})

test("diff preserves missing authentication behavior without exposing credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-auth-"))
  try {
    const { ASSETS_TOKEN: _token, ...missingAuthEnvironment } = cliEnvironment
    const requests: Request[] = []
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root, "--json"], {
      env: missingAuthEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return failureResponseCreate("Authentication is required")
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(requests[0]?.headers.get("authorization")).toBeNull()
    expect(output[0]).toBe(
      '{"error":{"code":"unauthorized","message":"Authentication is required","retryable":false},"ok":false,"requestId":"request-auth"}\n',
    )
    expect(output[0]).not.toContain("service-token")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("remote lists writes all four deterministic files by default", async () => {
  const directory = await mkdtemp(join(tmpdir(), "assets-cli-lists-write-"))
  try {
    const output: string[] = []
    const exitCode = await assetsCliMain(["lists", "--dir", directory, "--json"], {
      env: cliEnvironment,
      fetcher: async () =>
        envelopeResponseCreate({
          imageList: "image\n",
          videoList: "video\n",
          fontList: "font\n",
          documentList: "document\n",
          digest: "0".repeat(64),
        }),
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    expect(exitCode).toBe(0)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({ ok: true, data: { written: true } })
    expect(await readFile(join(directory, "imageList.ts"), "utf8")).toBe("image\n")
    expect(await readFile(join(directory, "videoList.ts"), "utf8")).toBe("video\n")
    expect(await readFile(join(directory, "fontList.ts"), "utf8")).toBe("font\n")
    expect(await readFile(join(directory, "documentList.ts"), "utf8")).toBe("document\n")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("diff integrates authenticated paginated history, categories, exact eligibility, and stable JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "matching.jpg"), "matching")
    await writeFile(join(root, "images", "changed.jpg"), "changed locally")
    await writeFile(join(root, "images", "new.jpg"), "new")
    await writeFile(join(root, "images", "unsupported.bin"), "unsupported")
    const matchingBytes = new TextEncoder().encode("matching")
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(matchingBytes),
      byteSize: matchingBytes.byteLength,
    })
    const changed = assetCreate({ id: "asset-changed", filename: "changed.jpg", sha256: "c".repeat(64), byteSize: 7 })
    const remoteOnly = assetCreate({
      id: "asset-remote",
      filename: "remote-only.jpg",
      sha256: "d".repeat(64),
      byteSize: 1,
    })
    const requests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets")) {
        return envelopeResponseCreate(
          url.searchParams.has("cursor")
            ? { assets: [remoteOnly], page: { limit: 100, nextCursor: null } }
            : { assets: [changed, matching], page: { limit: 100, nextCursor: "1" } },
        )
      }
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        return envelopeResponseCreate(deletionEligibilityCreate(sourceRevisionId))
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const environment = { ...cliEnvironment, ASSETS_ENVIRONMENT: "development" }
    const output: string[] = []
    const args = ["diff", root, "--environment", "production", "--json"]
    const firstExitCode = await assetsCliMain(args, {
      env: environment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    const firstJson = output[0]
    expect(firstExitCode).toBe(1)
    expect(output).toHaveLength(1)
    expect(firstJson).toBeDefined()
    expect(JSON.parse(firstJson ?? "")).toEqual({
      ok: true,
      data: {
        altUpdatesPending: 0,
        entries: [
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "changed.jpg",
            reason: "The source fingerprint differs",
            sourcePath: "images/changed.jpg",
            status: "changed",
          },
          {
            class: "image",
            deletionEligible: true,
            logicalPath: "matching.jpg",
            sourcePath: "images/matching.jpg",
            status: "matching",
          },
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "new.jpg",
            sourcePath: "images/new.jpg",
            status: "new",
          },
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "remote-only.jpg",
            sourcePath: "remote-only.jpg",
            status: "remote-only",
          },
          {
            class: "image",
            deletionEligible: false,
            logicalPath: "unsupported.bin",
            reason: "The image file extension is not supported: unsupported.bin",
            sourcePath: "images/unsupported.bin",
            status: "unsupported",
          },
        ],
        environment: "production",
        root,
      },
    })
    expect(output[0]).toBe(firstJson)
    const assetsRequests = requests.filter((request) => new URL(request.url).pathname.endsWith("/assets"))
    expect(assetsRequests.map((request) => new URL(request.url).search)).toEqual([
      "?include=history%2Cmetadata&limit=100",
      "?cursor=1&include=history%2Cmetadata&limit=100",
    ])
    const eligibilityRequests = requests.filter((request) => request.url.includes("deletion-eligibility"))
    expect(eligibilityRequests).toHaveLength(3)
    expect(eligibilityRequests.map((request) => new URL(request.url).search)).toEqual([
      "?environment=production",
      "?environment=production",
      "?environment=production",
    ])
    expect(requests.every((request) => request.headers.get("authorization") === "Bearer service-token")).toBe(true)

    const secondOutput: string[] = []
    const secondExitCode = await assetsCliMain(args, {
      env: environment,
      fetcher,
      stdout: (text) => secondOutput.push(text),
      stderr: () => undefined,
    })
    expect(secondExitCode).toBe(1)
    expect(secondOutput).toEqual(output)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff reports local sidecar alt drift separately from byte changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-alt-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "hero.jpg"), "hero")
    await writeFile(join(root, "images", "hero.md"), "Local alt")
    const bytes = new TextEncoder().encode("hero")
    const remote = assetCreate({
      id: "asset-hero",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
      alt: "Remote alt",
    })
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root, "--json"], {
      env: cliEnvironment,
      fetcher: async (input) => {
        const url = new URL(input)
        if (url.pathname.endsWith("/assets"))
          return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
        if (url.pathname.includes("/deletion-eligibility"))
          return envelopeResponseCreate(deletionEligibilityCreate("asset-hero"))
        throw new Error(`Unexpected request ${input}`)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(JSON.parse(output[0] ?? "")).toEqual({
      ok: true,
      data: {
        altUpdatesPending: 1,
        entries: [
          {
            altChanged: true,
            class: "image",
            deletionEligible: false,
            localAlt: "Local alt",
            logicalPath: "hero.jpg",
            reason: "The local sidecar alt differs from remote metadata",
            remoteAlt: "Remote alt",
            sourcePath: "images/hero.jpg",
            status: "metadata",
          },
        ],
        environment: "development",
        root,
      },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff uses the selected environment when workflow or catalog inclusion is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-environment-processing-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const workflowBytes = new TextEncoder().encode("workflow")
    const catalogBytes = new TextEncoder().encode("catalog")
    await writeFile(join(root, "images", "workflow-missing.jpg"), workflowBytes)
    await writeFile(join(root, "images", "catalog-missing.jpg"), catalogBytes)
    const workflowAsset = assetCreate({
      id: "asset-workflow-missing",
      filename: "workflow-missing.jpg",
      sha256: contentSha256Create(workflowBytes),
      byteSize: workflowBytes.byteLength,
    })
    const catalogAsset = assetCreate({
      id: "asset-catalog-missing",
      filename: "catalog-missing.jpg",
      sha256: contentSha256Create(catalogBytes),
      byteSize: catalogBytes.byteLength,
    })
    const eligibilityRequests: Array<{ environment: string; sourceRevisionId: string }> = []
    const fetcher = async (input: string | URL) => {
      const url = new URL(input)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({
          assets: [workflowAsset, catalogAsset],
          page: { limit: 100, nextCursor: null },
        })
      if (url.pathname.includes("/deletion-eligibility")) {
        const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
        const environment = url.searchParams.get("environment") ?? ""
        eligibilityRequests.push({ environment, sourceRevisionId })
        const base = deletionEligibilityCreate(sourceRevisionId, environment === "development")
        return envelopeResponseCreate({
          ...base,
          checks: {
            ...base.checks,
            successfulWorkflow: sourceRevisionId !== "asset-workflow-missing" || environment === "development",
            currentCatalogInclusion: sourceRevisionId !== "asset-catalog-missing" || environment === "development",
          },
        })
      }
      throw new Error(`Unexpected request ${input}`)
    }
    const run = async (environment: "development" | "production") => {
      const output: string[] = []
      const exitCode = await assetsCliMain(["diff", root, "--environment", environment, "--json"], {
        env: cliEnvironment,
        fetcher,
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      })
      return { exitCode, value: JSON.parse(output[0] ?? "{}") as { data?: { entries?: unknown[] } } }
    }

    const development = await run("development")
    const production = await run("production")

    expect(development.exitCode).toBe(0)
    expect(development.value.data?.entries).toMatchObject([
      { sourcePath: "images/catalog-missing.jpg", status: "matching" },
      { sourcePath: "images/workflow-missing.jpg", status: "matching" },
    ])
    expect(production.exitCode).toBe(1)
    expect(production.value.data?.entries).toMatchObject([
      {
        reason: "The asset needs successful processing and current catalog inclusion in the selected environment",
        sourcePath: "images/catalog-missing.jpg",
        status: "needs-processing",
      },
      {
        reason: "The asset needs successful processing and current catalog inclusion in the selected environment",
        sourcePath: "images/workflow-missing.jpg",
        status: "needs-processing",
      },
    ])
    expect(eligibilityRequests).toEqual([
      { environment: "development", sourceRevisionId: "asset-workflow-missing" },
      { environment: "development", sourceRevisionId: "asset-catalog-missing" },
      { environment: "production", sourceRevisionId: "asset-workflow-missing" },
      { environment: "production", sourceRevisionId: "asset-catalog-missing" },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("upload-all reprocesses without uploading bytes, waits optionally, and matches after processing", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-upload-all-reprocess-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    const bytes = new TextEncoder().encode("needs processing")
    await writeFile(join(root, "images", "hero.jpg"), bytes)
    const remote = assetCreate({
      id: "asset-reprocess-bulk",
      filename: "hero.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
    })
    const { outputCount: _outputCount, ...assetDetail } = remote
    const workflow = {
      id: "workflow-reprocess-bulk",
      projectId: "project-1",
      assetId: remote.id,
      sourceRevisionId: remote.currentSourceRevisionId,
      kind: "asset_processing" as const,
      status: "succeeded" as const,
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:01.000Z",
    }
    let processed = false
    const requests: Request[] = []
    const reprocessBodies: unknown[] = []
    const uploadRequests: Request[] = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(String(input), init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({ assets: [remote], page: { limit: 100, nextCursor: null } })
      if (url.pathname.includes("/deletion-eligibility"))
        return envelopeResponseCreate(deletionEligibilityCreate(remote.currentSourceRevisionId, processed))
      if (url.pathname.endsWith("/environments"))
        return envelopeResponseCreate({
          environments: [
            {
              id: "environment-production",
              projectId: "project-1",
              name: "production",
              r2Bucket: "assets-production",
              r2Prefix: "production",
              publicBaseUrl: "https://assets.example.test",
              createdAt: "2026-08-17T00:00:00.000Z",
              updatedAt: "2026-08-17T00:00:00.000Z",
            },
          ],
        })
      if (url.pathname.endsWith("/assets/asset-reprocess-bulk/reprocess")) {
        reprocessBodies.push(await request.json())
        return envelopeResponseCreate({ asset: { ...assetDetail, metadata: null }, workflowId: workflow.id }, 202)
      }
      if (url.pathname.endsWith("/workflows/workflow-reprocess-bulk/status")) {
        processed = true
        return envelopeResponseCreate(workflow)
      }
      if (url.hostname === "upload.example.test" || url.pathname.includes("/uploads/")) {
        uploadRequests.push(request)
        return failureResponseCreate("upload should not be called", 500)
      }
      throw new Error(`Unexpected request ${request.url}`)
    }
    const uploadAllRun = async (wait: boolean, deleteLocal = false) => {
      const output: string[] = []
      const args = ["upload-all", root, "--integration-note", "bulk", "--environment", "production"]
      if (deleteLocal) args.push("--delete")
      if (wait) args.push("--wait")
      args.push("--json")
      const exitCode = await assetsCliMain(args, {
        env: cliEnvironment,
        fetcher,
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      })
      return { exitCode, value: JSON.parse(output[0] ?? "{}") as { data?: { entries?: unknown[] } } }
    }

    const withoutWait = await uploadAllRun(false)
    expect(withoutWait.exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "POST"])
    expect(requests[2]?.url).toBe("https://assets.example.test/api/v1/projects/project-1/environments")
    expect(withoutWait.value.data?.entries).toMatchObject([
      { action: "skipped", reprocessed: true, status: "needs-processing", workflowId: workflow.id },
    ])
    expect(reprocessBodies).toEqual([{ environmentId: "environment-production" }])
    expect(requests.some((request) => request.url.includes("/workflows/"))).toBe(false)

    requests.length = 0
    const withWait = await uploadAllRun(true)
    expect(withWait.exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "POST", "GET"])
    expect(withWait.value.data?.entries).toMatchObject([
      {
        action: "skipped",
        reprocessed: true,
        status: "needs-processing",
        workflowId: workflow.id,
        workflowStatus: "succeeded",
      },
    ])
    expect(reprocessBodies).toEqual([
      { environmentId: "environment-production" },
      { environmentId: "environment-production" },
    ])
    expect(requests.some((request) => request.url.includes("/workflows/"))).toBe(true)
    expect(uploadRequests).toHaveLength(0)

    requests.length = 0
    const diffOutput: string[] = []
    const diffExitCode = await assetsCliMain(["diff", root, "--environment", "production", "--json"], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => diffOutput.push(text),
      stderr: () => undefined,
    })
    expect(diffExitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET"])
    expect(JSON.parse(diffOutput[0] ?? "{}")).toMatchObject({
      data: { entries: [{ sourcePath: "images/hero.jpg", status: "matching" }] },
      ok: true,
    })

    processed = false
    requests.length = 0
    const deleteRun = await uploadAllRun(false, true)
    expect(deleteRun.exitCode).toBe(0)
    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "POST", "GET", "GET"])
    expect(deleteRun.value.data?.entries).toMatchObject([
      {
        action: "skipped",
        deleted: true,
        eligible: true,
        reprocessed: true,
        status: "needs-processing",
        workflowStatus: "succeeded",
      },
    ])
    expect(await Bun.file(join(root, "images", "hero.jpg")).exists()).toBe(false)
    expect(reprocessBodies).toHaveLength(3)
    expect(uploadRequests).toHaveLength(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff applies configured source roots and command-line directory overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-flags-"))
  try {
    await mkdir(join(root, "configured-images"), { recursive: true })
    await mkdir(join(root, "override-images"), { recursive: true })
    await mkdir(join(root, "documents"), { recursive: true })
    await mkdir(join(root, "custom-fonts"), { recursive: true })
    await writeFile(
      join(root, "assets.config.json"),
      JSON.stringify({ image: "configured-images", document: "documents" }),
    )
    await writeFile(join(root, "configured-images", "ignored.jpg"), "ignored")
    await writeFile(join(root, "override-images", "used.jpg"), "used")
    await writeFile(join(root, "documents", "ignored.txt"), "ignored")
    await writeFile(join(root, "custom-fonts", "used.woff2"), "font")
    const output: string[] = []
    const exitCode = await assetsCliMain(
      [
        "diff",
        root,
        "--image-dir",
        "override-images",
        "--no-video-dir",
        "--no-document-dir",
        "--font-dir",
        "custom-fonts",
        "--json",
      ],
      {
        env: cliEnvironment,
        fetcher: async (input) => {
          if (!new URL(input).pathname.endsWith("/assets")) throw new Error(`Unexpected request ${input}`)
          return envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
        },
        stdout: (text) => output.push(text),
        stderr: () => undefined,
      },
    )
    expect(exitCode).toBe(1)
    expect(JSON.parse(output[0] ?? "")).toMatchObject({
      ok: true,
      data: {
        entries: [
          { class: "font", logicalPath: "used.woff2", sourcePath: "custom-fonts/used.woff2", status: "new" },
          { class: "image", logicalPath: "used.jpg", sourcePath: "override-images/used.jpg", status: "new" },
        ],
      },
    })
    expect(JSON.parse(output[0] ?? "").data.entries).toHaveLength(2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff scans configured roots for every class and honors override and disable flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-roots-"))
  try {
    const configured = {
      image: "configured-images",
      video: "configured-videos",
      document: "configured-documents",
      font: "configured-fonts",
    }
    for (const directory of Object.values(configured)) await mkdir(join(root, directory), { recursive: true })
    await mkdir(join(root, "override-images"), { recursive: true })
    await mkdir(join(root, "override-documents"), { recursive: true })
    await writeFile(join(root, "assets.config.json"), JSON.stringify(configured))
    await writeFile(join(root, configured.image, "image.jpg"), "image")
    await writeFile(join(root, configured.video, "video.mp4"), "video")
    await writeFile(join(root, configured.document, "document.txt"), "document")
    await writeFile(join(root, configured.font, "font.woff2"), "font")
    await writeFile(join(root, "override-images", "override.jpg"), "override")
    await writeFile(join(root, "override-documents", "override.txt"), "override")

    const fetcher = async () => envelopeResponseCreate({ assets: [], page: { limit: 100, nextCursor: null } })
    const configuredOutput: string[] = []
    expect(
      await assetsCliMain(["diff", root, "--json"], {
        env: cliEnvironment,
        fetcher,
        stdout: (text) => configuredOutput.push(text),
        stderr: () => undefined,
      }),
    ).toBe(1)
    expect(JSON.parse(configuredOutput[0] ?? "").data.entries).toEqual([
      {
        class: "document",
        deletionEligible: false,
        logicalPath: "document.txt",
        sourcePath: "configured-documents/document.txt",
        status: "new",
      },
      {
        class: "font",
        deletionEligible: false,
        logicalPath: "font.woff2",
        sourcePath: "configured-fonts/font.woff2",
        status: "new",
      },
      {
        class: "image",
        deletionEligible: false,
        logicalPath: "image.jpg",
        sourcePath: "configured-images/image.jpg",
        status: "new",
      },
      {
        class: "video",
        deletionEligible: false,
        logicalPath: "video.mp4",
        sourcePath: "configured-videos/video.mp4",
        status: "new",
      },
    ])

    const overrideOutput: string[] = []
    expect(
      await assetsCliMain(
        [
          "diff",
          root,
          "--image-dir",
          "override-images",
          "--no-video-dir",
          "--document-dir",
          "override-documents",
          "--no-font-dir",
          "--json",
        ],
        {
          env: cliEnvironment,
          fetcher,
          stdout: (text) => overrideOutput.push(text),
          stderr: () => undefined,
        },
      ),
    ).toBe(1)
    expect(JSON.parse(overrideOutput[0] ?? "").data.entries).toEqual([
      {
        class: "document",
        deletionEligible: false,
        logicalPath: "override.txt",
        sourcePath: "override-documents/override.txt",
        status: "new",
      },
      {
        class: "image",
        deletionEligible: false,
        logicalPath: "override.jpg",
        sourcePath: "override-images/override.jpg",
        status: "new",
      },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("diff returns deterministic human output and succeeds for matching and empty results", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-clean-"))
  const emptyRoot = await mkdtemp(join(tmpdir(), "assets-cli-diff-empty-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await writeFile(join(root, "images", "matching.jpg"), "matching")
    const bytes = new TextEncoder().encode("matching")
    const matching = assetCreate({
      id: "asset-matching",
      filename: "matching.jpg",
      sha256: contentSha256Create(bytes),
      byteSize: bytes.byteLength,
    })
    const fetcher = async (input: string | URL) => {
      const url = new URL(input)
      if (url.pathname.endsWith("/assets"))
        return envelopeResponseCreate({
          assets: url.pathname.endsWith("/assets") ? [matching] : [],
          page: { limit: 100, nextCursor: null },
        })
      return envelopeResponseCreate(deletionEligibilityCreate("asset-matching"))
    }
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root], {
      env: cliEnvironment,
      fetcher,
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })
    expect(exitCode).toBe(0)
    expect(output[0]).toBe(
      `Root: ${root}\nEnvironment: development\nmatching image images/matching.jpg deletion-eligible\nSummary: new=0 changed=0 matching=1 needs-processing=0 remote-only=0 unsupported=0 conflict=0 metadata=0 alt-updates-pending=0\n`,
    )

    const emptyOutput: string[] = []
    const emptyRequests: Request[] = []
    const emptyExitCode = await assetsCliMain(["diff", emptyRoot, "--json"], {
      env: cliEnvironment,
      fetcher: async (input, init) => {
        const request = new Request(input, init)
        emptyRequests.push(request)
        return envelopeResponseCreate(
          new URL(request.url).searchParams.has("cursor")
            ? { assets: [], page: { limit: 100, nextCursor: null } }
            : { assets: [], page: { limit: 100, nextCursor: "1" } },
        )
      },
      stdout: (text) => emptyOutput.push(text),
      stderr: () => undefined,
    })
    expect(emptyExitCode).toBe(0)
    expect(emptyRequests.map((request) => new URL(request.url).search)).toEqual([
      "?include=history%2Cmetadata&limit=100",
      "?cursor=1&include=history%2Cmetadata&limit=100",
    ])
    expect(JSON.parse(emptyOutput[0] ?? "")).toEqual({
      ok: true,
      data: { entries: [], environment: "development", root: emptyRoot, altUpdatesPending: 0 },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(emptyRoot, { recursive: true, force: true })
  }
})

test("diff human output reports changed, conflict, unsupported, and remote-only entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "assets-cli-diff-human-"))
  try {
    await mkdir(join(root, "images"), { recursive: true })
    await mkdir(join(root, "documents"), { recursive: true })
    await mkdir(join(root, "fonts"), { recursive: true })
    await writeFile(join(root, "images", "changed.jpg"), "changed")
    await writeFile(join(root, "documents", "unsupported.bin"), "unsupported")
    await writeFile(join(root, "fonts", "same.woff"), "same")
    await writeFile(join(root, "fonts", "same.woff2"), "same")
    const remoteChanged = assetCreate({
      id: "asset-changed-human",
      filename: "changed.jpg",
      sha256: "c".repeat(64),
      byteSize: 7,
    })
    const remoteOnly = assetCreate({
      id: "asset-remote-video",
      filename: "remote.mp4",
      class: "video",
      mediaType: "video/mp4",
      sha256: "d".repeat(64),
      byteSize: 1,
    })
    const output: string[] = []
    const exitCode = await assetsCliMain(["diff", root], {
      env: cliEnvironment,
      fetcher: async (input) => {
        const url = new URL(input)
        if (url.pathname.endsWith("/assets"))
          return envelopeResponseCreate({ assets: [remoteChanged, remoteOnly], page: { limit: 100, nextCursor: null } })
        if (url.pathname.includes("/deletion-eligibility")) {
          const sourceRevisionId = url.pathname.split("/").at(-2) ?? ""
          return envelopeResponseCreate(deletionEligibilityCreate(sourceRevisionId))
        }
        throw new Error(`Unexpected request ${input}`)
      },
      stdout: (text) => output.push(text),
      stderr: () => undefined,
    })

    expect(exitCode).toBe(1)
    expect(output[0]).toBe(
      `Root: ${root}
Environment: development
unsupported document documents/unsupported.bin The document file extension is not supported: unsupported.bin
conflict font fonts/same.woff Multiple local files target the same normalized asset
conflict font fonts/same.woff2 Multiple local files target the same normalized asset
changed image images/changed.jpg The source fingerprint differs
remote-only video remote.mp4
Summary: new=0 changed=1 matching=0 needs-processing=0 remote-only=1 unsupported=1 conflict=2 metadata=0 alt-updates-pending=0
`,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("uploads list displays recent uploads with ISO 8601 dates and filters by days and limit", async () => {
  const recentUploadDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const secondRecentUploadDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const uploadsData = [
    {
      id: "upload-1",
      projectId: "project-1",
      environmentId: "env-1",
      originalFilename: "logo.png",
      folders: ["branding"],
      integrationNote: "test upload",
      byteSize: 1234,
      status: "accepted" as const,
      createdAt: recentUploadDate,
      updatedAt: recentUploadDate,
    },
    {
      id: "upload-2",
      projectId: "project-1",
      environmentId: "env-1",
      originalFilename: "banner.jpg",
      folders: [],
      integrationNote: "test upload 2",
      byteSize: 5678,
      status: "verified" as const,
      createdAt: secondRecentUploadDate,
      updatedAt: secondRecentUploadDate,
    },
    {
      id: "upload-old",
      projectId: "project-1",
      environmentId: "env-1",
      originalFilename: "old.png",
      folders: [],
      integrationNote: "old",
      byteSize: 999,
      status: "accepted" as const,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  ]

  const outputJson: string[] = []
  const exitCodeJson = await assetsCliMain(["uploads", "list", "--days", "5", "--limit", "2", "--json"], {
    env: cliEnvironment,
    fetcher: async (input) => {
      const url = new URL(input)
      if (url.pathname.endsWith("/uploads")) {
        return envelopeResponseCreate({
          uploads: uploadsData,
          page: { limit: 100, nextCursor: null },
        })
      }
      throw new Error(`Unexpected request ${input}`)
    },
    stdout: (text) => outputJson.push(text),
    stderr: () => undefined,
  })

  expect(exitCodeJson).toBe(0)
  const parsedJson = JSON.parse(outputJson[0] ?? "")
  expect(parsedJson.ok).toBe(true)
  expect(parsedJson.data.uploads).toHaveLength(2)
  expect(parsedJson.data.uploads[0].id).toBe("upload-1")
  expect(parsedJson.data.uploads[0].createdAt).toBe(recentUploadDate)
  expect(parsedJson.data.uploads[1].id).toBe("upload-2")
  expect(parsedJson.data.uploads[1].createdAt).toBe(secondRecentUploadDate)

  const outputHuman: string[] = []
  const exitCodeHuman = await assetsCliMain(["uploads", "list", "--limit", "1"], {
    env: cliEnvironment,
    fetcher: async (input) => {
      const url = new URL(input)
      if (url.pathname.endsWith("/uploads")) {
        return envelopeResponseCreate({
          uploads: uploadsData,
          page: { limit: 100, nextCursor: null },
        })
      }
      throw new Error(`Unexpected request ${input}`)
    },
    stdout: (text) => outputHuman.push(text),
    stderr: () => undefined,
  })

  expect(exitCodeHuman).toBe(0)
  expect(outputHuman[0]).toBe(`- upload-1 [accepted] branding/logo.png (1234 bytes, ${recentUploadDate})\n`)
})
