import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"
import type { CliWaitFlags } from "./cliWaitFlags.js"
import { cliWaitFlags } from "./cliWaitFlags.js"

export type CliDeleteFlags = AssetsCliGlobalFlags & CliWaitFlags

export const cliDeleteCommand = buildCommand({
  docs: {
    brief: "Delete an asset and initiate its purge workflow",
    fullDescription: "Requests deletion of the specified asset from the catalog and remote storage.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      ...cliWaitFlags,
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          parse: String,
          brief: "Asset logical key or ID to delete",
        },
      ],
    },
  },
  func(_flags: CliDeleteFlags, _assetKey: string) {},
})
