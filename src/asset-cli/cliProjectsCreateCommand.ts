import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliProjectsCreateFlags = AssetsCliGlobalFlags & {
  name: string
  slug: string
  defaultEnvironment: string
  serviceProjectId: string
  zitadelProjectId?: string
  developmentR2Bucket: string
  developmentR2Prefix: string
  developmentPublicBaseUrl: string
  productionR2Bucket: string
  productionR2Prefix: string
  productionPublicBaseUrl: string
  token?: string
}

export const cliProjectsCreateCommand = buildCommand({
  docs: {
    brief: "Register a new project in the asset service, optionally creating its Zitadel project",
    fullDescription:
      "Registers a new project including Zitadel project bindings and R2 storage bucket settings. When --zitadel-project-id is omitted, the CLI creates a Zitadel project using ZITADEL_BASE_URL and ZITADEL_TOKEN from the project-create environment.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      name: {
        kind: "parsed",
        parse: String,
        brief: "Display name of the project",
      },
      slug: {
        kind: "parsed",
        parse: String,
        brief: "URL slug of the project",
      },
      defaultEnvironment: {
        kind: "parsed",
        parse: String,
        brief: "Default environment (development or production)",
      },
      serviceProjectId: {
        kind: "parsed",
        parse: String,
        brief: "Service project UUID",
      },
      zitadelProjectId: {
        kind: "parsed",
        parse: String,
        brief: "Existing Zitadel project ID; creates one when omitted",
        optional: true,
      },
      developmentR2Bucket: {
        kind: "parsed",
        parse: String,
        brief: "Development R2 bucket name",
      },
      developmentR2Prefix: {
        kind: "parsed",
        parse: String,
        brief: "Development R2 key prefix",
      },
      developmentPublicBaseUrl: {
        kind: "parsed",
        parse: String,
        brief: "Development public base URL",
      },
      productionR2Bucket: {
        kind: "parsed",
        parse: String,
        brief: "Production R2 bucket name",
      },
      productionR2Prefix: {
        kind: "parsed",
        parse: String,
        brief: "Production R2 key prefix",
      },
      productionPublicBaseUrl: {
        kind: "parsed",
        parse: String,
        brief: "Production public base URL",
      },
      token: {
        kind: "parsed",
        parse: String,
        brief: "Bearer token (rejected as CLI argument)",
        optional: true,
      },
    },
  },
  func(_flags: CliProjectsCreateFlags) {},
})
