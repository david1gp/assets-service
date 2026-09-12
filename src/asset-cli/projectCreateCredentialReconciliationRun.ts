import type { R2BucketCredentialCreateInput } from "../r2/r2BucketCredentialCreateInputSchema.js"
import type { CloudflareRequestCredentials } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareR2BucketCredentialCreate } from "../cloudflare/cloudflareR2BucketCredentialCreate.js"
import { cloudflareR2BucketCredentialRevoke } from "../cloudflare/cloudflareR2BucketCredentialRevoke.js"
import { cloudflareSecretRedact } from "../cloudflare/cloudflareSecretRedact.js"
import type { R2BucketCredentialRegisterResponse } from "../api-client/r2BucketCredentialRegisterResponseSchema.js"
import type { R2BucketCredentialStatusResponse } from "../api-client/r2BucketCredentialStatusResponseSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { EnvironmentName } from "../schemas/environmentNameSchema.js"

type ProjectCreateCredentialClient = {
  r2BucketCredentialStatusRead: (
    projectId: string,
    environment: EnvironmentName,
  ) => Promise<Result<R2BucketCredentialStatusResponse>>
  r2BucketCredentialRegister: (
    projectId: string,
    environment: EnvironmentName,
    input: R2BucketCredentialCreateInput,
  ) => Promise<Result<R2BucketCredentialRegisterResponse>>
}

type ProjectCreateCredentialEnvironment = {
  name: EnvironmentName
  r2Bucket: string
}

type ProjectCreateCredentialReconciliationInput = {
  client: ProjectCreateCredentialClient
  projectId: string
  environments: readonly ProjectCreateCredentialEnvironment[]
  cloudflareCredentialsRead: () => Result<CloudflareRequestCredentials>
  cloudflareCredentialCreate?: typeof cloudflareR2BucketCredentialCreate
  cloudflareCredentialRevoke?: typeof cloudflareR2BucketCredentialRevoke
}

const operation = "assetsCliProjectCreateCredentialReconciliation"

const resultFailure = (message: string): Result<never> => resultErrorCreate(operation, message)

const statusReadAll = async (
  input: ProjectCreateCredentialReconciliationInput,
): Promise<Result<readonly R2BucketCredentialStatusResponse[]>> => {
  const statuses: R2BucketCredentialStatusResponse[] = []
  for (const environment of input.environments) {
    const status = await input.client.r2BucketCredentialStatusRead(input.projectId, environment.name)
    if (!status.success) return status
    if (status.data.bucket !== environment.r2Bucket)
      return resultFailure(`The R2 credential status did not match the ${environment.name} bucket`)
    statuses.push(status.data)
  }
  return { success: true, data: statuses }
}

const errorMessageRedactedRead = (
  result: Extract<Result<unknown>, { success: false }>,
  secrets: readonly (string | null | undefined)[],
): string => cloudflareSecretRedact(result.errorMessage, secrets)

const projectCreateCredentialReconciliationRun = async (
  input: ProjectCreateCredentialReconciliationInput,
): Promise<Result<undefined>> => {
  const initialStatuses = await statusReadAll(input)
  if (!initialStatuses.success) return initialStatuses

  const registeredBuckets = new Set(
    initialStatuses.data.filter((status) => status.registered).map((status) => status.bucket),
  )
  const environmentByBucket = new Map<string, EnvironmentName>()
  for (const environment of input.environments) {
    if (!environmentByBucket.has(environment.r2Bucket)) environmentByBucket.set(environment.r2Bucket, environment.name)
  }
  const missingBuckets = [...new Set(input.environments.map((environment) => environment.r2Bucket))].filter(
    (bucket) => !registeredBuckets.has(bucket),
  )

  if (missingBuckets.length > 0) {
    const cloudflareCredentials = input.cloudflareCredentialsRead()
    if (!cloudflareCredentials.success) return cloudflareCredentials
    const credentialCreate = input.cloudflareCredentialCreate ?? cloudflareR2BucketCredentialCreate
    const credentialRevoke = input.cloudflareCredentialRevoke ?? cloudflareR2BucketCredentialRevoke

    for (const bucket of missingBuckets) {
      const environment = environmentByBucket.get(bucket)
      if (environment === undefined) return resultFailure(`The R2 bucket ${bucket} had no associated environment`)

      const created = await credentialCreate({
        accountId: cloudflareCredentials.data.accountId,
        apiToken: cloudflareCredentials.data.apiToken,
        bucket,
      })
      if (!created.success)
        return resultFailure(
          `Could not create the scoped R2 credential for ${bucket}: ${errorMessageRedactedRead(created, [cloudflareCredentials.data.apiToken])}`,
        )

      const registered = await input.client.r2BucketCredentialRegister(input.projectId, environment, created.data)
      if (!registered.success) {
        const credentialSecrets = [
          cloudflareCredentials.data.apiToken,
          created.data.accessKeyId,
          created.data.secretAccessKey,
          created.data.revocationId,
        ]
        const registrationError = errorMessageRedactedRead(registered, credentialSecrets)
        if (created.data.revocationId !== null) {
          const revoked = await credentialRevoke({
            accountId: cloudflareCredentials.data.accountId,
            apiToken: cloudflareCredentials.data.apiToken,
            revocationId: created.data.revocationId,
          })
          if (!revoked.success) {
            const cleanupError = errorMessageRedactedRead(revoked, credentialSecrets)
            return resultFailure(
              `Could not register the scoped R2 credential for ${bucket}: ${registrationError}; cleanup failed: ${cleanupError}`,
            )
          }
        }
        return resultFailure(`Could not register the scoped R2 credential for ${bucket}: ${registrationError}`)
      }
    }
  }

  const verifiedStatuses = await statusReadAll(input)
  if (!verifiedStatuses.success) return verifiedStatuses
  const unregistered = verifiedStatuses.data.find((status) => !status.registered)
  if (unregistered !== undefined)
    return resultFailure(`The scoped R2 credential for ${unregistered.bucket} was not registered`)
  return { success: true, data: undefined }
}

export { projectCreateCredentialReconciliationRun }
