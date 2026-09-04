import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliListsFlags = AssetsCliGlobalFlags & {
  check?: boolean
  write?: boolean
  dir?: string
  outputDir?: string
  imageList?: string
  videoList?: string
  fontList?: string
  documentList?: string
}

export const cliListsCommand = buildCommand({
  docs: {
    brief: "Generate or verify typed catalog asset list TypeScript files",
    fullDescription:
      "Generates imageList.ts, videoList.ts, fontList.ts, and documentList.ts, or checks them against the remote catalog with --check.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      check: {
        kind: "boolean",
        brief: "Check that local generated list files match the remote catalog without writing",
        optional: true,
      },
      write: {
        kind: "boolean",
        brief: "Write list files (default behavior when not checking)",
        optional: true,
      },
      dir: {
        kind: "parsed",
        parse: String,
        brief: "Directory to write list files (defaults to src/app/assets)",
        optional: true,
      },
      outputDir: {
        kind: "parsed",
        parse: String,
        brief: "Alias for --dir",
        optional: true,
      },
      imageList: {
        kind: "parsed",
        parse: String,
        brief: "Explicit path for image list output file",
        optional: true,
      },
      videoList: {
        kind: "parsed",
        parse: String,
        brief: "Explicit path for video list output file",
        optional: true,
      },
      fontList: {
        kind: "parsed",
        parse: String,
        brief: "Explicit path for font list output file",
        optional: true,
      },
      documentList: {
        kind: "parsed",
        parse: String,
        brief: "Explicit path for document list output file",
        optional: true,
      },
    },
  },
  func(_flags: CliListsFlags) {},
})
