import type { CommandContext, FlagParametersForType } from "@stricli/core"

export type AssetsCliGlobalFlags = {
  apiUrl?: string
  organization?: string
  project?: string
  environment?: string
  envFile?: string
  config?: string
  session?: string
  json?: boolean
}

export const cliGlobalFlags: FlagParametersForType<AssetsCliGlobalFlags, CommandContext> = {
  apiUrl: {
    kind: "parsed",
    parse: String,
    brief: "Assets service API URL",
    optional: true,
  },
  organization: {
    kind: "parsed",
    parse: String,
    brief: "Organization key, ID, or slug",
    optional: true,
  },
  project: {
    kind: "parsed",
    parse: String,
    brief: "Project ID or name",
    optional: true,
  },
  environment: {
    kind: "parsed",
    parse: String,
    brief: "Target environment (development or production)",
    optional: true,
  },
  envFile: {
    kind: "parsed",
    parse: String,
    brief: "Path to .env configuration file",
    optional: true,
  },
  config: {
    kind: "parsed",
    parse: String,
    brief: "Path to assets CLI config JSON file",
    optional: true,
  },
  session: {
    kind: "parsed",
    parse: String,
    brief: "Path to assets CLI session JSON file",
    optional: true,
  },
  json: {
    kind: "boolean",
    brief: "Output JSON envelope format",
    optional: true,
  },
}
