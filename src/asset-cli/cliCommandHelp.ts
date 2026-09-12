export type CliCommandHelp = {
  commands: readonly string[]
  globalOptions: readonly string[]
  subcommands: Record<string, readonly string[]>
  options: readonly string[]
  diff: {
    root: string
    sourceDirectories: readonly string[]
  }
  config: {
    root: string
    output: string
  }
  projectResolution: string
  organizationResolution: string
  environmentFile: string
}

const commands: readonly string[] = [
  "auth login",
  "projects create --organization <key|id|slug> --name <name> --slug <slug> --default-environment <development|production> --service-project-id <id> [--zitadel-project-id <id>] --development-r2-bucket <bucket> --development-r2-prefix <prefix> --development-public-base-url <url> --production-r2-bucket <bucket> --production-r2-prefix <prefix> --production-public-base-url <url> [--create-buckets] [--wrangler-profile <name>]",
  "projects create --create-buckets: provisions missing buckets, skips registered buckets, and registers imported R2 credentials or creates bucket-scoped Cloudflare credentials without displaying credential material",
  "projects archive --project <id-or-name>",
  "projects unarchive --project <id-or-name>",
  "r2 credentials backfill [--dry-run|--apply]",
  "r2 credentials repair --apply",
  "config show [root]",
  "doctor --environment <development|production>",
  "diff [root]",
  "uploads list [--today] [--days <number>] [--limit <number>] [--status <status>]",
  "upload-all [root] --integration-note <text>",
  "upload <file> --path <folder/file> --integration-note <text>",
  "reprocess <asset-key-or-id> --environment <development|production> [--wait]",
  "list",
  "show <asset-key>",
  "outputs list|add|remove|set <asset-key>",
  "metadata set|unset <asset-key>",
  "settings read [--project <id-or-name>] [--environment <development|production>]",
  "settings update [--project <id-or-name>] --environment <development|production> [--r2-bucket <bucket>] [--r2-prefix <prefix>] [--public-base-url <url>]",
  "settings migrate [--project <id-or-name>] --environment <development|production> [--r2-bucket <bucket>] [--r2-prefix <prefix>] [--public-base-url <url>] [--create-bucket] [--custom-domain <hostname>] [--zone-id <id>] [--wrangler-profile <name>] [--apply] [--wait] [--no-wait] [--poll-interval <milliseconds>]",
  "catalogs rebuild --project <id-or-name> --environment production",
  "move <asset-key> --to <path>",
  "delete <asset-key>",
  "lists [--check] [--dir <directory>]",
]

const globalOptions: readonly string[] = [
  "--api-url",
  "--organization",
  "--project",
  "--environment",
  "--env-file",
  "--config",
  "--session",
  "--json",
  "--help",
  "--version",
]

const subcommands: Record<string, readonly string[]> = {
  "auth login": ["--token-stdin", "--token"],
  "projects create": [
    "--organization",
    "--name",
    "--slug",
    "--default-environment",
    "--service-project-id",
    "--zitadel-project-id",
    "--development-r2-bucket",
    "--development-r2-prefix",
    "--development-public-base-url",
    "--production-r2-bucket",
    "--production-r2-prefix",
    "--production-public-base-url",
    "--create-buckets",
    "--wrangler-profile",
  ],
  "projects archive": ["--project"],
  "projects unarchive": ["--project"],
  "r2 credentials backfill": ["--dry-run", "--apply"],
  "r2 credentials repair": ["--apply"],
  "config show": [],
  doctor: ["--environment"],
  diff: [
    "--image-dir",
    "--video-dir",
    "--document-dir",
    "--font-dir",
    "--no-image-dir",
    "--no-video-dir",
    "--no-document-dir",
    "--no-font-dir",
  ],
  "uploads list": ["--today", "--days", "--limit", "--status"],
  "upload-all": ["--integration-note", "--wait", "--no-wait", "--poll-interval", "--delete", "--dry-run"],
  upload: ["--path", "--integration-note", "--note", "--wait", "--no-wait", "--poll-interval"],
  reprocess: ["--environment", "--wait", "--no-wait", "--poll-interval"],
  list: ["--class", "--kind", "--include", "--search", "--folder"],
  show: [],
  "outputs list": [],
  "outputs add": ["--kind", "--key", "--width", "--height", "--format", "--quality", "--show-ai-label"],
  "outputs set": ["--kind", "--key", "--width", "--height", "--format", "--quality", "--show-ai-label", "--file"],
  "outputs remove": [],
  "metadata set": ["--alt"],
  "metadata unset": ["--alt"],
  "settings read": ["--project", "--environment"],
  "settings update": ["--project", "--environment", "--r2-bucket", "--r2-prefix", "--public-base-url"],
  "settings migrate": [
    "--project",
    "--environment",
    "--r2-bucket",
    "--r2-prefix",
    "--public-base-url",
    "--create-bucket",
    "--custom-domain",
    "--zone-id",
    "--wrangler-profile",
    "--apply",
    "--wait",
    "--no-wait",
    "--poll-interval",
  ],
  "catalogs rebuild": ["--project", "--environment"],
  move: ["--to"],
  delete: ["--wait", "--no-wait", "--poll-interval"],
  lists: [
    "--check",
    "--write",
    "--dir",
    "--output-dir",
    "--image-list",
    "--video-list",
    "--font-list",
    "--document-list",
  ],
}

const allOptions = (): readonly string[] => {
  const set = new Set(globalOptions)
  for (const flags of Object.values(subcommands)) {
    for (const flag of flags) set.add(flag)
  }
  return Array.from(set)
}

export const cliCommandHelp: CliCommandHelp = {
  commands,
  globalOptions,
  subcommands,
  get options(): readonly string[] {
    return allOptions()
  },
  diff: {
    root: "Default: .",
    sourceDirectories: [
      "image: ./images, --image-dir <directory>, --no-image-dir",
      "video: ./videos, --video-dir <directory>, --no-video-dir",
      "document: ./documents, --document-dir <directory>, --no-document-dir",
      "font: ./fonts, --font-dir <directory>, --no-font-dir",
    ],
  },
  config: {
    root: "Default: .",
    output: "Reports resolved local configuration and sources without displaying credentials or session secrets.",
  },
  projectResolution:
    "Project selection: --project, ASSETS_PROJECT (or ASSETS_PROJECT_ID), saved CLI config, package.json.name for bulk roots, or the sole accessible project; name, package name, and sole-project selection are scoped by the resolved organization, while explicit project IDs remain authoritative.",
  organizationResolution:
    "Organization selection: --organization, selected .env ASSETS_ORGANIZATION, process ASSETS_ORGANIZATION, global directory mapping, or unrestricted resolution.",
  environmentFile:
    "Environment file selection: --env-file, ASSETS_ENV_FILE, <command-root>/.env, or $PWD/.env; ancestor directories are not searched. For projects create only, ~/.config/assets-service/project-create.env is loaded automatically when neither --env-file nor ASSETS_ENV_FILE is set, taking precedence over project and working directory .env discovery. When --zitadel-project-id is omitted, ZITADEL_BASE_URL and ZITADEL_TOKEN from the selected environment create the Zitadel project.",
}
