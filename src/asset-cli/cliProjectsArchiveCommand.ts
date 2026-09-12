import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliProjectsArchiveFlags = AssetsCliGlobalFlags

export const cliProjectsArchiveCommand = buildCommand({
  docs: {
    brief: "Archive a project and remove its R2 objects and dedicated buckets",
    fullDescription:
      "Requires administrator access. Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the selected environment; credentials are request-scoped and never persisted.",
  },
  parameters: {
    flags: cliGlobalFlags,
  },
  func(_flags: CliProjectsArchiveFlags) {},
})
