import type { CommandContext, FlagParametersForType } from "@stricli/core"

export type CliWaitFlags = {
  wait?: boolean
  noWait?: boolean
  pollInterval?: string
}

export const cliWaitFlags: FlagParametersForType<CliWaitFlags, CommandContext> = {
  wait: {
    kind: "boolean",
    brief: "Wait for background workflow completion",
    optional: true,
  },
  noWait: {
    kind: "boolean",
    brief: "Do not wait for workflow completion",
    optional: true,
  },
  pollInterval: {
    kind: "parsed",
    parse: String,
    brief: "Polling interval in milliseconds",
    optional: true,
  },
}
