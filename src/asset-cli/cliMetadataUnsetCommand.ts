import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliMetadataUnsetFlags = AssetsCliGlobalFlags & {
  alt?: boolean
}

export const cliMetadataUnsetCommand = buildCommand({
  docs: {
    brief: "Unset metadata properties from an asset",
    fullDescription: "Removes asset metadata fields such as alt text.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      alt: {
        kind: "boolean",
        brief: "Remove the alt text metadata",
        optional: true,
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
  func(_flags: CliMetadataUnsetFlags, _assetKey: string) {},
})
