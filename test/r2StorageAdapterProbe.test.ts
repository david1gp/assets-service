import { describe, expect, test } from "bun:test"

import { r2StorageAdapterCreate } from "../src/infrastructure/storage/r2StorageAdapter.js"
import { contentSha256Create } from "../src/schemas/contentSha256Create.js"

type ProbeRequest = {
  body: Uint8Array
  headers: Headers
  method: string
  url: URL
}

const accessKeyId = "probe-access"
const secretAccessKey = "probe-secret"

describe("R2 credential probes", () => {
  test("writes, verifies, and removes a unique private sentinel with the supplied credential", async () => {
    const requests: ProbeRequest[] = []
    const adapter = adapterCreate(async (input, init) => {
      const request = new Request(input, init)
      requests.push({
        body: new Uint8Array(await request.arrayBuffer()),
        headers: request.headers,
        method: request.method,
        url: new URL(request.url),
      })
      return new Response(null, { status: request.method === "DELETE" ? 204 : 200 })
    })

    const result = await adapter.probeCredentials("probe-bucket")

    expect(result).toEqual({ success: true, data: { reachable: true, status: 200 } })
    expect(requests.map(({ method }) => method)).toEqual(["PUT", "HEAD", "DELETE"])
    const [probeRequest] = requests
    if (probeRequest === undefined) return
    expect(requests.map(({ url }) => url.pathname)).toEqual([
      probeRequest.url.pathname,
      probeRequest.url.pathname,
      probeRequest.url.pathname,
    ])
    expect(probeRequest.url.pathname).toMatch(/^\/probe-bucket\/_assets-service-probes\/[0-9a-f-]{36}$/u)
    expect(requests[0]?.body).toEqual(new Uint8Array([0x61]))
    expect(probeRequest.headers.get("x-amz-content-sha256")).toBe(contentSha256Create(probeRequest.body))
    expect(probeRequest.headers.get("authorization")).toContain("x-amz-content-sha256")
    expect(requests.every(({ headers }) => headers.get("authorization")?.includes(`Credential=${accessKeyId}/`))).toBe(
      true,
    )
  })

  test("does not delete when the sentinel PUT fails", async () => {
    const methods: string[] = []
    const adapter = adapterCreate(async (input, init) => {
      const request = new Request(input, init)
      methods.push(request.method)
      return new Response(null, { status: request.method === "PUT" ? 403 : 200 })
    })

    const result = await adapter.probeCredentials("probe-bucket")

    expect(result).toMatchObject({
      success: false,
      errorMessage: "R2 credential probe put failed",
      diagnostics: { status: 403 },
    })
    expect(methods).toEqual(["PUT"])
  })

  test("cleans up when HEAD verification fails", async () => {
    const methods: string[] = []
    const adapter = adapterCreate(async (input, init) => {
      const request = new Request(input, init)
      methods.push(request.method)
      return new Response(null, { status: request.method === "HEAD" ? 500 : request.method === "DELETE" ? 204 : 200 })
    })

    const result = await adapter.probeCredentials("probe-bucket")

    expect(result).toMatchObject({
      success: false,
      errorMessage: "R2 credential probe head failed",
      diagnostics: { status: 500 },
    })
    expect(methods).toEqual(["PUT", "HEAD", "DELETE"])
  })

  test("returns a cleanup failure after a successful PUT and HEAD", async () => {
    const methods: string[] = []
    const adapter = adapterCreate(async (input, init) => {
      const request = new Request(input, init)
      methods.push(request.method)
      return new Response(null, { status: request.method === "DELETE" ? 500 : 200 })
    })

    const result = await adapter.probeCredentials("probe-bucket")

    expect(result).toMatchObject({
      success: false,
      errorMessage: "R2 credential probe cleanup failed",
      diagnostics: { status: 500 },
    })
    expect(methods).toEqual(["PUT", "HEAD", "DELETE"])
  })

  test("redacts probe and credential details from cleanup failures", async () => {
    let probeUrl = ""
    let probeKey = ""
    const adapter = adapterCreate(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === "PUT") {
        probeUrl = request.url
        probeKey = new URL(request.url).pathname
        return new Response(null, { status: 200 })
      }
      if (request.method === "HEAD") return new Response(null, { status: 200 })
      throw new Error(`${probeUrl} ${probeKey} ${accessKeyId} ${secretAccessKey}`)
    })

    const result = await adapter.probeCredentials("probe-bucket")
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({ success: false, errorMessage: "R2 credential probe cleanup failed" })
    expect(serialized).not.toContain(probeUrl)
    expect(serialized).not.toContain(probeKey)
    expect(serialized).not.toContain(accessKeyId)
    expect(serialized).not.toContain(secretAccessKey)
  })
})

function adapterCreate(fetchImplementation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  return r2StorageAdapterCreate({
    accountId: "account",
    accessKeyId,
    endpoint: "https://account.r2.cloudflarestorage.com",
    fetchImplementation,
    secretAccessKey,
  })
}
