import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"
import type { CliSourceDirectoryFlags } from "./cliSourceDirectoryFlags.js"
import { cliSourceDirectoryFlags } from "./cliSourceDirectoryFlags.js"
import type { CliWaitFlags } from "./cliWaitFlags.js"
import { cliWaitFlags } from "./cliWaitFlags.js"

export type CliUploadAllFlags = AssetsCliGlobalFlags &
  CliSourceDirectoryFlags &
  CliWaitFlags & {
    integrationNote: string
    delete?: boolean
    dryRun?: boolean
  }

export const cliUploadAllCommand = buildCommand({
  docs: {
    brief: "Reconcile all local asset differences with the remote project",
    fullDescription:
      "Uploads new and changed assets, repairs outdated default outputs, reconciles sidecar alt metadata, and optionally deletes eligible local files.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      ...cliSourceDirectoryFlags,
      ...cliWaitFlags,
      integrationNote: {
        kind: "parsed",
        parse: String,
        brief: "Audit note describing this integration/batch upload",
      },
      delete: {
        kind: "boolean",
        brief: "Delete local files after successful upload and verification (implies --wait)",
        optional: true,
      },
      dryRun: {
        kind: "boolean",
        brief: "Simulate upload actions without uploading files or making mutations",
        optional: true,
      },
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
  func(_flags: CliUploadAllFlags, _root?: string) {},
})
