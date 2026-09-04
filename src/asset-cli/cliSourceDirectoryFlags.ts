import type { CommandContext, FlagParametersForType } from "@stricli/core"

export type CliSourceDirectoryFlags = {
  imageDir?: string
  videoDir?: string
  documentDir?: string
  fontDir?: string
  noImageDir?: boolean
  noVideoDir?: boolean
  noDocumentDir?: boolean
  noFontDir?: boolean
}

export const cliSourceDirectoryFlags: FlagParametersForType<CliSourceDirectoryFlags, CommandContext> = {
  imageDir: {
    kind: "parsed",
    parse: String,
    brief: "Directory path for image assets",
    optional: true,
  },
  videoDir: {
    kind: "parsed",
    parse: String,
    brief: "Directory path for video assets",
    optional: true,
  },
  documentDir: {
    kind: "parsed",
    parse: String,
    brief: "Directory path for document assets",
    optional: true,
  },
  fontDir: {
    kind: "parsed",
    parse: String,
    brief: "Directory path for font assets",
    optional: true,
  },
  noImageDir: {
    kind: "boolean",
    brief: "Disable image directory scanning",
    optional: true,
  },
  noVideoDir: {
    kind: "boolean",
    brief: "Disable video directory scanning",
    optional: true,
  },
  noDocumentDir: {
    kind: "boolean",
    brief: "Disable document directory scanning",
    optional: true,
  },
  noFontDir: {
    kind: "boolean",
    brief: "Disable font directory scanning",
    optional: true,
  },
}
