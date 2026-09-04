import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliOutputsRemoveFlags = AssetsCliGlobalFlags

export const cliOutputsRemoveCommand = buildCommand({
  docs: {
    brief: "Remove an output definition from an asset",
    fullDescription: "Deletes a specific output variant definition by key from the asset.",
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
        {
          parse: String,
          brief: "Output key to remove",
        },
      ],
    },
  },
  func(_flags: CliOutputsRemoveFlags, _assetKey: string, _outputKey: string) {},
})
