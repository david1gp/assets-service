import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliShowFlags = AssetsCliGlobalFlags

export const cliShowCommand = buildCommand({
  docs: {
    brief: "Show detailed information about a single asset",
    fullDescription: "Fetches full metadata, output definitions, and source revision details for the given asset key.",
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
  func(_flags: CliShowFlags, _assetKey: string) {},
})
