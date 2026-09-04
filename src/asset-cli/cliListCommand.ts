import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliListFlags = AssetsCliGlobalFlags & {
  class?: string
  kind?: string
  include?: string
  search?: string
  folder?: string
}

export const cliListCommand = buildCommand({
  docs: {
    brief: "List assets stored for the project",
    fullDescription:
      "Lists assets in the project, optionally filtering by class, search query, or folder, and optionally including outputs, metadata, and history.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      class: {
        kind: "parsed",
        parse: String,
        brief: "Filter by asset class (image, video, font, document)",
        optional: true,
      },
      kind: {
        kind: "parsed",
        parse: String,
        brief: "Alias for --class",
        optional: true,
      },
      include: {
        kind: "parsed",
        parse: String,
        brief: "Comma-separated inclusions (outputs, metadata, history)",
        optional: true,
      },
      search: {
        kind: "parsed",
        parse: String,
        brief: "Search substring in asset path",
        optional: true,
      },
      folder: {
        kind: "parsed",
        parse: String,
        brief: "Filter by folder prefix",
        optional: true,
      },
    },
  },
  func(_flags) {},
})
