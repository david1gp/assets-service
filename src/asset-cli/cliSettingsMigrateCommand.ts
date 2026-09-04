import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"
import type { CliWaitFlags } from "./cliWaitFlags.js"
import { cliWaitFlags } from "./cliWaitFlags.js"

export type CliSettingsMigrateFlags = AssetsCliGlobalFlags &
  CliWaitFlags & {
    r2Bucket?: string
    r2Prefix?: string
    publicBaseUrl?: string
    createBucket?: boolean
    customDomain?: string
    zoneId?: string
    wranglerProfile?: string
    apply?: boolean
  }

export const cliSettingsMigrateCommand = buildCommand({
  docs: {
    brief: "Plan or execute an R2 storage migration",
    fullDescription:
      "Plans a storage migration to new R2 bucket/prefix settings, provisions Cloudflare resources via Wrangler when needed, and executes the migration workflow when --apply is passed.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      ...cliWaitFlags,
      r2Bucket: {
        kind: "parsed",
        parse: String,
        brief: "Destination R2 bucket name",
        optional: true,
      },
      r2Prefix: {
        kind: "parsed",
        parse: String,
        brief: "Destination R2 key prefix",
        optional: true,
      },
      publicBaseUrl: {
        kind: "parsed",
        parse: String,
        brief: "Destination public base URL",
        optional: true,
      },
      createBucket: {
        kind: "boolean",
        brief: "Provision the destination R2 bucket if it does not exist",
        optional: true,
      },
      customDomain: {
        kind: "parsed",
        parse: String,
        brief: "Custom domain hostname to attach to the R2 bucket",
        optional: true,
      },
      zoneId: {
        kind: "parsed",
        parse: String,
        brief: "Cloudflare zone ID for the custom domain",
        optional: true,
      },
      wranglerProfile: {
        kind: "parsed",
        parse: String,
        brief: "Wrangler configuration profile to use for Cloudflare provisioning",
        optional: true,
      },
      apply: {
        kind: "boolean",
        brief: "Apply the migration (otherwise dry-run plan only)",
        optional: true,
      },
    },
  },
  func(_flags: CliSettingsMigrateFlags) {},
})
