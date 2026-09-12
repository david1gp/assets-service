import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliProjectsArchiveFlags = AssetsCliGlobalFlags

export const cliProjectsArchiveCommand = buildCommand({
  docs: {
    brief: "Archive a project and remove its R2 objects and dedicated buckets",
  },
  parameters: {
    flags: cliGlobalFlags,
  },
  func(_flags: CliProjectsArchiveFlags) {},
})
