import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliOutputsSetFlags = AssetsCliGlobalFlags & {
  file: string
}

export const cliOutputsSetCommand = buildCommand({
  docs: {
    brief: "Set all output definitions for an asset from a JSON file",
    fullDescription: "Replaces the entire set of output definitions for an asset using JSON supplied in a file.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      file: {
        kind: "parsed",
        parse: String,
        brief: "Path to JSON file containing output definitions array",
      },
    },
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
  func(_flags: CliOutputsSetFlags, _assetKey: string) {},
})
