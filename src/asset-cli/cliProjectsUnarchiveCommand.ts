import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliProjectsUnarchiveFlags = AssetsCliGlobalFlags

export const cliProjectsUnarchiveCommand = buildCommand({
  docs: {
    brief: "Unarchive a project and restore its R2 objects and optimized assets",
    fullDescription:
      "Requires administrator access. Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the selected environment; credentials are request-scoped and never persisted.",
  },
  parameters: {
    flags: cliGlobalFlags,
  },
  func(_flags: CliProjectsUnarchiveFlags) {},
})
