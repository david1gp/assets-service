import { expect, test } from "bun:test"

import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"

const envelopeResponseCreate = (data: unknown): Response =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } })

test("assets API client reads the safe R2 credential status response", async () => {
  let request: Request | undefined
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test/api/v1",
    accessToken: "admin-token",
    fetcher: async (input, init) => {
      request = new Request(String(input), init)
      return envelopeResponseCreate({
        projectId: "project:1",
        environment: "production",
        bucket: "assets-production",
        registered: true,
      })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const status = await clientResult.data.r2BucketCredentialStatusRead("project:1", "production")

  expect(status).toEqual({
    success: true,
    data: {
      projectId: "project:1",
      environment: "production",
      bucket: "assets-production",
      registered: true,
    },
  })
  expect(request?.method).toBe("GET")
  expect(request?.url).toBe(
    "https://assets.example.test/api/v1/projects/project%3A1/environments/production/r2-credential/status",
  )
  expect(request?.headers.get("authorization")).toBe("Bearer admin-token")
})
