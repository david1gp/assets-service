import { projectCreateR2CredentialsRead } from "./projectCreateR2CredentialsRead.js"
import type { Result } from "../schemas/resultSchema.js"

export const r2CredentialsRead = (
  environment: NodeJS.ProcessEnv = process.env,
): Result<{
  accessKeyId: string
  secretAccessKey: string
}> => {
  const credentials = projectCreateR2CredentialsRead(environment)
  if (!credentials.success)
    return {
      ...credentials,
      op: "assetsCliR2CredentialsRead",
    }
  if (credentials.data !== null) return { success: true, data: credentials.data }
  return {
    success: false,
    op: "assetsCliR2CredentialsRead",
    errorMessage:
      "R2 credential registration requires R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY or their compatibility aliases",
  }
}
