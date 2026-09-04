import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"
import type { CliWaitFlags } from "./cliWaitFlags.js"
import { cliWaitFlags } from "./cliWaitFlags.js"

export type CliUploadFlags = AssetsCliGlobalFlags &
  CliWaitFlags & {
    path: string
    integrationNote?: string
    note?: string
  }

export const cliUploadCommand = buildCommand({
  docs: {
    brief: "Upload a single asset file",
    fullDescription: "Uploads an asset file directly to the specified target path within the selected project.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      ...cliWaitFlags,
      path: {
        kind: "parsed",
        parse: String,
        brief: "Target folder/filename in the asset service (e.g. hero/image.jpg)",
      },
      integrationNote: {
        kind: "parsed",
        parse: String,
        brief: "Integration or audit note describing the upload",
        optional: true,
      },
      note: {
        kind: "parsed",
        parse: String,
        brief: "Alias for --integration-note",
        optional: true,
      },
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          parse: String,
          brief: "Local file path to upload",
        },
      ],
    },
  },
  func(_flags: CliUploadFlags, _file: string) {},
})
