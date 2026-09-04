import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliCatalogsRebuildFlags = AssetsCliGlobalFlags

export const cliCatalogsRebuildCommand = buildCommand({
  docs: {
    brief: "Rebuild production catalog index lists",
    fullDescription: "Triggers synchronous re-indexing and catalog compilation for the production environment.",
  },
  parameters: {
    flags: cliGlobalFlags,
  },
  func(_flags) {},
})
