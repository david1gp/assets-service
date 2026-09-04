import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliMoveFlags = AssetsCliGlobalFlags & {
  to: string
}

export const cliMoveCommand = buildCommand({
  docs: {
    brief: "Move an asset to a new logical target path",
    fullDescription: "Renames or relocates an asset to a new destination folder/filename.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      to: {
        kind: "parsed",
        parse: String,
        brief: "Destination logical asset path",
      },
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          parse: String,
          brief: "Asset logical key or ID to move",
        },
      ],
    },
  },
  func(_flags: CliMoveFlags, _assetKey: string) {},
})
