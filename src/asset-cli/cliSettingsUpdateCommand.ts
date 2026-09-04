import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliSettingsUpdateFlags = AssetsCliGlobalFlags & {
  r2Bucket?: string
  r2Prefix?: string
  publicBaseUrl?: string
}

export const cliSettingsUpdateCommand = buildCommand({
  docs: {
    brief: "Update project storage settings",
    fullDescription: "Modifies R2 storage bucket, prefix, or public base URL settings for the project environment.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      r2Bucket: {
        kind: "parsed",
        parse: String,
        brief: "New R2 bucket name",
        optional: true,
      },
      r2Prefix: {
        kind: "parsed",
        parse: String,
        brief: "New R2 key prefix",
        optional: true,
      },
      publicBaseUrl: {
        kind: "parsed",
        parse: String,
        brief: "New public base URL",
        optional: true,
      },
    },
  },
  func(_flags: CliSettingsUpdateFlags) {},
})
