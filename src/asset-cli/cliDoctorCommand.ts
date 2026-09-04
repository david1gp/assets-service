import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliDoctorFlags = AssetsCliGlobalFlags

export const cliDoctorCommand = buildCommand({
  docs: {
    brief: "Run diagnostic health and readiness checks",
    fullDescription:
      "Checks API service health, readiness, and target environment database connectivity, outputting diagnostic results.",
  },
  parameters: {
    flags: cliGlobalFlags,
  },
  func(_flags) {},
})
