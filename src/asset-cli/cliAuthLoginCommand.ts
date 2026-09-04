import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliAuthLoginFlags = AssetsCliGlobalFlags & {
  tokenStdin?: boolean
  token?: string
}

export const cliAuthLoginCommand = buildCommand({
  docs: {
    brief: "Authenticate with Zitadel or store a bearer session token",
    fullDescription:
      "Initiates the browser PKCE authorization flow, or reads a bearer access token from standard input when --token-stdin is provided.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      tokenStdin: {
        kind: "boolean",
        brief: "Read the bearer access token from stdin",
        optional: true,
      },
      token: {
        kind: "parsed",
        parse: String,
        brief: "Bearer token (rejected when passed via CLI argument)",
        optional: true,
      },
    },
  },
  func(_flags: CliAuthLoginFlags) {},
})
