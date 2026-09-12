import * as v from "valibot"

import { cloudflareRequestCredentialsSchema } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { WranglerCommandRunner } from "./wranglerCommandRunner.js"

const bunInstallPath = process.env.BUN_INSTALL ?? `${process.env.HOME ?? "."}/.bun`
const wranglerEntryPath = `${bunInstallPath}/install/global/node_modules/wrangler/bin/wrangler.js`

export const wranglerCommandRunnerProduction: WranglerCommandRunner = async (
  request,
): Promise<
  Result<{
    exitCode: number
    stdout: string
    stderr: string
  }>
> => {
  const op = "wranglerCommandRunnerProduction"
  const hasCredentials = request.accountId !== undefined || request.apiToken !== undefined
  const credentials = hasCredentials
    ? v.safeParse(cloudflareRequestCredentialsSchema, {
        accountId: request.accountId,
        apiToken: request.apiToken,
      })
    : undefined
  if (credentials !== undefined && !credentials.success)
    return resultErrorCreate(op, "Cloudflare request credentials are invalid")

  const apiToken = credentials?.success ? credentials.output.apiToken : process.env.CLOUDFLARE_API_TOKEN
  try {
    const child = Bun.spawn([process.execPath, wranglerEntryPath, ...request.args], {
      env: {
        ...process.env,
        ...(credentials?.success
          ? {
              CLOUDFLARE_ACCOUNT_ID: credentials.output.accountId,
              CLOUDFLARE_API_TOKEN: credentials.output.apiToken,
            }
          : {}),
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [rawStdout, rawStderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return {
      success: true,
      data: {
        exitCode,
        stdout: cloudflareSecretRedact(rawStdout, [apiToken]),
        stderr: cloudflareSecretRedact(rawStderr, [apiToken]),
      },
    }
  } catch {
    return resultErrorCreate(op, "Wrangler could not be started")
  }
}
