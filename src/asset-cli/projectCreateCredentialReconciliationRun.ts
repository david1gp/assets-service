import type { R2BucketCredentialRegisterResponse } from "../api-client/r2BucketCredentialRegisterResponseSchema.js"
import type { R2BucketCredentialStatusResponse } from "../api-client/r2BucketCredentialStatusResponseSchema.js"
import type { CloudflareRequestCredentials } from "../cloudflare/cloudflareRequestCredentialsSchema.js"
import { cloudflareR2BucketCredentialCreate as cloudflareR2BucketCredentialCreateDefault } from "../cloudflare/cloudflareR2BucketCredentialCreate.js"
import { cloudflareR2BucketCredentialRevoke as cloudflareR2BucketCredentialRevokeDefault } from "../cloudflare/cloudflareR2BucketCredentialRevoke.js"
import type { R2BucketCredentialCreateInput } from "../r2/r2BucketCredentialCreateInputSchema.js"
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
  projectCreateR2CredentialsRead: () => Result<{ accessKeyId: string; secretAccessKey: string } | null>
  cloudflareCredentialsRead?: () => Result<CloudflareRequestCredentials>
  cloudflareR2BucketCredentialCreate?: (input: {
    accountId: string
    apiToken: string
    bucket: string
    name?: string
  }) => Promise<Result<R2BucketCredentialCreateInput>>
  cloudflareR2BucketCredentialRevoke?: (input: {
    accountId: string
    apiToken: string
    revocationId: string
  }) => Promise<Result<boolean>>
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

const registrationFailure = (bucket: string): Result<never> =>
  resultFailure(`Could not register the scoped R2 credential for ${bucket}`)

const generatedCredentialCreate = async (
  input: ProjectCreateCredentialReconciliationInput,
  credentials: CloudflareRequestCredentials,
  bucket: string,
): Promise<Result<R2BucketCredentialCreateInput>> => {
  const create = input.cloudflareR2BucketCredentialCreate ?? cloudflareR2BucketCredentialCreateDefault
  try {
    return await create({ ...credentials, bucket })
  } catch {
    return resultFailure(`Could not create the scoped R2 credential for ${bucket}`)
  }
}

const generatedCredentialRevoke = async (
  input: ProjectCreateCredentialReconciliationInput,
  credentials: CloudflareRequestCredentials,
  revocationId: string,
): Promise<Result<boolean>> => {
  const revoke = input.cloudflareR2BucketCredentialRevoke ?? cloudflareR2BucketCredentialRevokeDefault
  try {
    return await revoke({ ...credentials, revocationId })
  } catch {
    return resultFailure("Could not revoke the generated R2 credential")
  }
}

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
    const importedCredentials = input.projectCreateR2CredentialsRead()
    if (!importedCredentials.success) return importedCredentials

    let cloudflareCredentials: CloudflareRequestCredentials | undefined
    if (importedCredentials.data === null) {
      if (input.cloudflareCredentialsRead === undefined)
        return resultFailure("R2 credential registration requires Cloudflare credentials when no R2 pair is configured")
      const credentials = input.cloudflareCredentialsRead()
      if (!credentials.success) return credentials
      cloudflareCredentials = credentials.data
    }

    for (const bucket of missingBuckets) {
      const environment = environmentByBucket.get(bucket)
      if (environment === undefined) return resultFailure(`The R2 bucket ${bucket} had no associated environment`)

      let credential: R2BucketCredentialCreateInput
      if (importedCredentials.data !== null) {
        credential = {
          bucket,
          accessKeyId: importedCredentials.data.accessKeyId,
          secretAccessKey: importedCredentials.data.secretAccessKey,
          revocationId: null,
        }
      } else {
        if (cloudflareCredentials === undefined) return resultFailure("Cloudflare credentials were unavailable")
        const created = await generatedCredentialCreate(input, cloudflareCredentials, bucket)
        if (!created.success) return resultFailure(`Could not create the scoped R2 credential for ${bucket}`)
        if (created.data.bucket !== bucket || created.data.revocationId === null)
          return resultFailure(`Could not create the scoped R2 credential for ${bucket}`)
        credential = created.data
      }

      let registered: Result<R2BucketCredentialRegisterResponse>
      try {
        registered = await input.client.r2BucketCredentialRegister(input.projectId, environment, credential)
      } catch {
        registered = registrationFailure(bucket)
      }
      if (!registered.success) {
        if (
          importedCredentials.data === null &&
          cloudflareCredentials !== undefined &&
          credential.revocationId !== null
        ) {
          const revoked = await generatedCredentialRevoke(input, cloudflareCredentials, credential.revocationId)
          if (!revoked.success)
            return resultFailure(
              `Could not register the scoped R2 credential for ${bucket}; the generated credential could not be revoked`,
            )
        }
        return registrationFailure(bucket)
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
