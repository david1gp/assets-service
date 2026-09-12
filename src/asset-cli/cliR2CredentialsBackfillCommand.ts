import { buildCommand } from "@stricli/core"

import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliR2CredentialsBackfillFlags = AssetsCliGlobalFlags & {
  dryRun?: boolean
  apply?: boolean
}

export const cliR2CredentialsBackfillCommand = buildCommand({
  docs: {
    brief: "Backfill encrypted bucket-scoped R2 credentials",
    fullDescription:
      "Requires organization administrator access. Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the selected environment. The default is a dry run; use --apply to persist credentials.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      dryRun: {
        kind: "boolean",
        brief: "Show missing credentials without creating or persisting anything",
        optional: true,
      },
      apply: {
        kind: "boolean",
        brief: "Create and persist missing bucket credentials",
        optional: true,
      },
    },
  },
  func(_flags: CliR2CredentialsBackfillFlags) {},
})
