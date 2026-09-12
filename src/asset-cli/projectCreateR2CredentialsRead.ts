import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type ProjectCreateR2Credentials = {
  accessKeyId: string
  secretAccessKey: string
}

type CredentialPair =
  | { status: "absent" }
  | { status: "complete"; accessKeyId: string; secretAccessKey: string }
  | { status: "incomplete" }

const credentialPairRead = (
  environment: NodeJS.ProcessEnv,
  accessKeyName: string,
  secretAccessKeyName: string,
): CredentialPair => {
  const accessKeyId = environment[accessKeyName]
  const secretAccessKey = environment[secretAccessKeyName]
  const accessKeyPresent = accessKeyId !== undefined
  const secretAccessKeyPresent = secretAccessKey !== undefined
  if (!accessKeyPresent && !secretAccessKeyPresent) return { status: "absent" }
  if (
    !accessKeyPresent ||
    !secretAccessKeyPresent ||
    accessKeyId.trim().length === 0 ||
    secretAccessKey.trim().length === 0
  )
    return { status: "incomplete" }
  return { status: "complete", accessKeyId, secretAccessKey }
}

export const projectCreateR2CredentialsRead = (
  environment: NodeJS.ProcessEnv = process.env,
): Result<ProjectCreateR2Credentials | null> => {
  const op = "assetsCliProjectCreateR2CredentialsRead"
  const primary = credentialPairRead(environment, "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
  const compatibility = credentialPairRead(
    environment,
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  )
  if (primary.status === "incomplete" || compatibility.status === "incomplete")
    return resultErrorCreate(
      op,
      "R2 credentials require a complete matching R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY pair or compatibility CLOUDFLARE_R2_ACCESS_KEY_ID/CLOUDFLARE_R2_SECRET_ACCESS_KEY pair",
    )
  if (primary.status === "complete")
    return { success: true, data: { accessKeyId: primary.accessKeyId, secretAccessKey: primary.secretAccessKey } }
  if (compatibility.status === "complete")
    return {
      success: true,
      data: { accessKeyId: compatibility.accessKeyId, secretAccessKey: compatibility.secretAccessKey },
    }
  return { success: true, data: null }
}
