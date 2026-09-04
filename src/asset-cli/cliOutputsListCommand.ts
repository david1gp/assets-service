import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliOutputsListFlags = AssetsCliGlobalFlags

export const cliOutputsListCommand = buildCommand({
  docs: {
    brief: "List output definitions configured for an asset",
    fullDescription: "Returns all derivative output definitions generated for the specified asset.",
  },
  parameters: {
    flags: cliGlobalFlags,
    positional: {
      kind: "tuple",
      parameters: [
        {
          parse: String,
          brief: "Asset logical key or ID",
        },
      ],
    },
  },
  func(_flags: CliOutputsListFlags, _assetKey: string) {},
})
