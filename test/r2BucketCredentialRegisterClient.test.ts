import { expect, test } from "bun:test"

import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"

const input = {
  bucket: "assets-production",
  accessKeyId: "access-key-secret",
  secretAccessKey: "secret-access-key-secret",
  revocationId: "revocation-secret",
}

test("assets API client registers an R2 credential with an encoded project and environment", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test/api/v1",
    accessToken: "admin-token",
    fetcher: async (target, init) => {
      request = new Request(String(target), init)
      return new Response(
        JSON.stringify({
          ok: true,
          data: { projectId: "project:1", environment: "production", bucket: "assets-production", registered: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const result = await clientResult.data.r2BucketCredentialRegister("project:1", "production", input)

  expect(result).toEqual({
    success: true,
    data: { projectId: "project:1", environment: "production", bucket: "assets-production", registered: true },
  })
  expect(request?.method).toBe("PUT")
  expect(request?.url).toBe(
    "https://assets.example.test/api/v1/projects/project%3A1/environments/production/r2-credential",
  )
  expect(await request?.clone().json()).toEqual(input)
  expect(request?.headers.get("authorization")).toBe("Bearer admin-token")
})

test("assets API client redacts R2 credential secrets from request failures and invalid responses", async () => {
  const failure = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () => {
      throw new Error(`request failed with ${input.secretAccessKey}`)
    },
  })
  expect(failure.success).toBe(true)
  if (!failure.success) return
  const network = await failure.data.r2BucketCredentialRegister("project", "production", input)
  expect(network.success).toBe(false)
  expect(JSON.stringify(network)).not.toContain(input.accessKeyId)
  expect(JSON.stringify(network)).not.toContain(input.secretAccessKey)
  expect(JSON.stringify(network)).not.toContain(input.revocationId)

  const invalidResponseClient = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            projectId: "project",
            environment: "production",
            bucket: "assets-production",
            registered: false,
            secretAccessKey: input.secretAccessKey,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  })
  expect(invalidResponseClient.success).toBe(true)
  if (!invalidResponseClient.success) return
  const invalid = await invalidResponseClient.data.r2BucketCredentialRegister("project", "production", input)
  expect(invalid.success).toBe(false)
  expect(JSON.stringify(invalid)).not.toContain(input.accessKeyId)
  expect(JSON.stringify(invalid)).not.toContain(input.secretAccessKey)
  expect(JSON.stringify(invalid)).not.toContain(input.revocationId)
})

test("assets API client sends imported credentials without a revocation ID and keeps responses secret-free", async () => {
  const importedInput = { ...input, revocationId: null }
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async (target, init) => {
      request = new Request(String(target), init)
      return new Response(
        JSON.stringify({
          ok: true,
          data: { projectId: "project", environment: "production", bucket: importedInput.bucket, registered: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return
  const result = await clientResult.data.r2BucketCredentialRegister("project", "production", importedInput)

  expect(result).toMatchObject({ success: true })
  expect(await request?.clone().json()).toEqual(importedInput)
  expect(JSON.stringify(result)).not.toContain(importedInput.accessKeyId)
  expect(JSON.stringify(result)).not.toContain(importedInput.secretAccessKey)
})
