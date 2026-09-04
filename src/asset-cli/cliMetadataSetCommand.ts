import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliMetadataSetFlags = AssetsCliGlobalFlags & {
  alt: string
}

export const cliMetadataSetCommand = buildCommand({
  docs: {
    brief: "Set metadata properties on an asset",
    fullDescription: "Updates asset metadata fields such as alt text.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      alt: {
        kind: "parsed",
        parse: String,
        brief: "Alternative text description for accessibility",
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
  func(_flags: CliMetadataSetFlags, _assetKey: string) {},
})
