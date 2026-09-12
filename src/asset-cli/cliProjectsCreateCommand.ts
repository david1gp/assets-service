import { buildCommand } from "@stricli/core"
import type { AssetsCliGlobalFlags } from "./cliGlobalFlags.js"
import { cliGlobalFlags } from "./cliGlobalFlags.js"

export type CliProjectsCreateFlags = AssetsCliGlobalFlags & {
  name: string
  slug: string
  defaultEnvironment: string
  serviceProjectId: string
  zitadelProjectId?: string
  developmentR2Bucket: string
  developmentR2Prefix: string
  developmentPublicBaseUrl: string
  productionR2Bucket: string
  productionR2Prefix: string
  productionPublicBaseUrl: string
  createBuckets?: boolean
  wranglerProfile?: string
  token?: string
}

export const cliProjectsCreateCommand = buildCommand({
  docs: {
    brief: "Register a new project in the asset service, optionally creating its Zitadel project",
    fullDescription:
      "Registers a new project including Zitadel bindings and R2 settings. With --create-buckets, it provisions missing buckets through Wrangler, checks credential status first, then registers either the preferred complete R2 S3 pair with no revocation identifier or a newly created bucket-scoped Cloudflare R2 credential with a revocation identifier. CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for the fallback, and a newly created credential is revoked when registration definitively fails; secrets and credential identifiers are never displayed. R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY take precedence over their CLOUDFLARE_R2_* compatibility aliases. When --zitadel-project-id is omitted, the CLI creates a Zitadel project using ZITADEL_BASE_URL and ZITADEL_TOKEN from the project-create environment.",
  },
  parameters: {
    flags: {
      ...cliGlobalFlags,
      name: {
        kind: "parsed",
        parse: String,
        brief: "Display name of the project",
      },
      slug: {
        kind: "parsed",
        parse: String,
        brief: "URL slug of the project",
      },
      defaultEnvironment: {
        kind: "parsed",
        parse: String,
        brief: "Default environment (development or production)",
      },
      serviceProjectId: {
        kind: "parsed",
        parse: String,
        brief: "Service project UUID",
      },
      zitadelProjectId: {
        kind: "parsed",
        parse: String,
        brief: "Existing Zitadel project ID; creates one when omitted",
        optional: true,
      },
      developmentR2Bucket: {
        kind: "parsed",
        parse: String,
        brief: "Development R2 bucket name",
      },
      developmentR2Prefix: {
        kind: "parsed",
        parse: String,
        brief: "Development R2 key prefix",
      },
      developmentPublicBaseUrl: {
        kind: "parsed",
        parse: String,
        brief: "Development public base URL",
      },
      productionR2Bucket: {
        kind: "parsed",
        parse: String,
        brief: "Production R2 bucket name",
      },
      productionR2Prefix: {
        kind: "parsed",
        parse: String,
        brief: "Production R2 key prefix",
      },
      productionPublicBaseUrl: {
        kind: "parsed",
        parse: String,
        brief: "Production public base URL",
      },
      createBuckets: {
        kind: "boolean",
        brief: "Provision the configured R2 buckets if they do not exist",
        optional: true,
      },
      wranglerProfile: {
        kind: "parsed",
        parse: String,
        brief: "Wrangler configuration profile to use for R2 provisioning",
        optional: true,
      },
      token: {
        kind: "parsed",
        parse: String,
        brief: "Bearer token (rejected as CLI argument)",
        optional: true,
      },
    },
  },
  func(_flags: CliProjectsCreateFlags) {},
})
