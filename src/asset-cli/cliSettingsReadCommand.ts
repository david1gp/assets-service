import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliSettingsReadFlags = AssetsCliGlobalFlags

export const cliSettingsReadCommand = buildCommand({
  docs: {
    brief: "Read project storage settings",
    fullDescription: "Reads R2 storage bucket, prefix, and public base URL configurations for the project.",
  },
  parameters: {
    flags: cliGlobalFlags,
  },
  func(_flags) {},
})
