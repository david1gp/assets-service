import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliUploadsListFlags = AssetsCliGlobalFlags & {
  today?: boolean
  days?: string
  limit?: string
  status?: string
}

export const cliUploadsListCommand = buildCommand({
  docs: {
    brief: "List recent upload attempts and their processing status",
    fullDescription: "Queries the uploads audit log, filterable by date range, limit, or upload status.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      today: {
        kind: "boolean",
        brief: "Filter uploads to today UTC",
        optional: true,
      },
      days: {
        kind: "parsed",
        parse: String,
        brief: "Filter uploads to the last N days",
        optional: true,
      },
      limit: {
        kind: "parsed",
        parse: String,
        brief: "Maximum number of upload entries to return",
        optional: true,
      },
      status: {
        kind: "parsed",
        parse: String,
        brief: "Filter by upload status (pending, accepted, completed, failed)",
        optional: true,
      },
    },
  },
  func(_flags) {},
})
