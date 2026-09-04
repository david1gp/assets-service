import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"
import type { CliWaitFlags } from "./cliWaitFlags.js"
import { cliWaitFlags } from "./cliWaitFlags.js"

export type CliReprocessFlags = AssetsCliGlobalFlags & CliWaitFlags

export const cliReprocessCommand = buildCommand({
  docs: {
    brief: "Trigger reprocessing workflows for an existing asset",
    fullDescription: "Enqueues reprocessing for the specified asset key or asset ID in the selected environment.",
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
          brief: "Asset logical key or asset ID",
        },
      ],
    },
  },
  func(_flags: CliReprocessFlags, _assetKeyOrId: string) {},
})
