import { buildCommand } from "@stricli/core"

import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliR2CredentialsRepairFlags = AssetsCliGlobalFlags & {
  apply?: boolean
}

export const cliR2CredentialsRepairCommand = buildCommand({
  docs: {
    brief: "Repair unusable bucket-scoped R2 credentials",
    fullDescription:
      "Requires organization administrator access and --apply. Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the selected environment, verifies replacements through persisted credentials, and revokes obsolete Cloudflare credentials only after verification.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      apply: {
        kind: "boolean",
        brief: "Create, verify, persist, and revoke corrected credentials",
        optional: true,
      },
    },
  },
  func(_flags: CliR2CredentialsRepairFlags) {},
})
