import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliConfigShowFlags = AssetsCliGlobalFlags

export const cliConfigShowCommand = buildCommand({
  docs: {
    brief: "Show resolved local configuration and discovered paths",
    fullDescription:
      "Reports effective organization, project, environment, API URL, and discovered directory mappings without exposing secrets.",
  },
  parameters: {
    flags: cliGlobalFlags,
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
  func(_flags: CliConfigShowFlags, _root?: string) {},
})
