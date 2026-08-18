import { expect, test } from "bun:test"

import { assetsApiClientCreate } from "../src/api-client/assetsApiClientCreate.js"

const envelopeResponseCreate = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ ok: true, data }), { status, headers: { "content-type": "application/json" } })

test("assets API client sends authenticated JSON requests and validates responses", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "secret-token",
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return envelopeResponseCreate({ status: "ok" })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const health = await clientResult.data.healthRead()
  expect(health).toEqual({ success: true, data: { status: "ok" } })
  expect(requests[0]?.url).toBe("https://assets.example.test/api/v1/health")
  expect(requests[0]?.headers.get("authorization")).toBeNull()

  const ready = await clientResult.data.readyRead()
  expect(ready.success).toBe(true)
  expect(requests[1]?.headers.get("authorization")).toBeNull()
})

test("assets API client validates upload intent before fetching", async () => {
  let fetchCount = 0
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    fetcher: async () => {
      fetchCount += 1
      return envelopeResponseCreate({})
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const intent = await clientResult.data.uploadIntentCreate("project-1", { originalFilename: "hero.jpg" })
  expect(intent.success).toBe(false)
  expect(fetchCount).toBe(0)
})

test("direct uploads use the signed intent without the service bearer", async () => {
  const requests: Request[] = []
  const clientResult = assetsApiClientCreate({
    apiUrl: "https://assets.example.test",
    accessToken: "service-token",
    fetcher: async (input, init) => {
      requests.push(new Request(String(input), init))
      return new Response(null, { status: 200 })
    },
  })

  expect(clientResult.success).toBe(true)
  if (!clientResult.success) return

  const uploaded = await clientResult.data.uploadObjectPut(
    {
      method: "PUT",
      url: "https://upload.example.test/staging/object",
      key: "staging/object",
      expiresAt: "2026-08-17T12:00:00.000Z",
      headers: { "content-type": "image/jpeg" },
      mediaType: "image/jpeg",
      byteSize: 3,
    },
    new Uint8Array([1, 2, 3]),
  )
  expect(uploaded).toEqual({ success: true, data: true })
  expect(requests[0]?.url).toBe("https://upload.example.test/staging/object")
  expect(requests[0]?.headers.get("authorization")).toBeNull()
})
