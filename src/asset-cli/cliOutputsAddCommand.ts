import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliOutputsAddFlags = AssetsCliGlobalFlags & {
  kind?: string
  key?: string
  width?: string
  height?: string
  format?: string
  quality?: string
  showAiLabel?: boolean
}

export const cliOutputsAddCommand = buildCommand({
  docs: {
    brief: "Add an output definition to an asset",
    fullDescription: "Creates an additional transformed or converted output variant for the asset.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      kind: {
        kind: "parsed",
        parse: String,
        brief: "Asset class for output (image, video, font, document; default image)",
        optional: true,
      },
      key: {
        kind: "parsed",
        parse: String,
        brief: "Output identifier key",
        optional: true,
      },
      width: {
        kind: "parsed",
        parse: String,
        brief: "Target width in pixels for image outputs",
        optional: true,
      },
      height: {
        kind: "parsed",
        parse: String,
        brief: "Target height in pixels for image outputs",
        optional: true,
      },
      format: {
        kind: "parsed",
        parse: String,
        brief: "Target file format (avif, webp, jpeg, png, woff2)",
        optional: true,
      },
      quality: {
        kind: "parsed",
        parse: String,
        brief: "Compression quality (1-100)",
        optional: true,
      },
      showAiLabel: {
        kind: "boolean",
        brief: "Embed AI provenance indicator on output",
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
  func(_flags: CliOutputsAddFlags, _assetKey: string) {},
})
