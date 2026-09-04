import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"
import type { CliSourceDirectoryFlags } from "./cliSourceDirectoryFlags.js"
import { cliSourceDirectoryFlags } from "./cliSourceDirectoryFlags.js"

export type CliDiffFlags = AssetsCliGlobalFlags & CliSourceDirectoryFlags

export const cliDiffCommand = buildCommand({
  docs: {
    brief: "Compare local asset manifests with remote asset history",
    fullDescription:
      "Scans local source directories and compares each file against the remote asset manifest for the selected project and environment.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      ...cliSourceDirectoryFlags,
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          parse: String,
          brief: "Project root directory (defaults to .)",
          optional: true,
        },
      ],
    },
  },
  func(_flags: CliDiffFlags, _root?: string) {},
})
