import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"

import type { AuthenticationMode } from "../src/authentication/authenticationModeSchema.js"
import type { FixtureAccessibleProjectCount } from "../src/fixture/fixtureAccessibleProjectCount.js"
import { fixtureServerCreate } from "../src/fixture/fixtureServerCreate.js"
import type { FixtureServer } from "../src/fixture/fixtureServerCreate.js"

const origin = "http://127.0.0.1:3021"
const servers: { databasePath: string; server: FixtureServer }[] = []

const fixtureServerRead = async (options: {
  sessionMode?: AuthenticationMode
  accessibleProjectCount?: FixtureAccessibleProjectCount
}) => {
  const databasePath = `data/fixture-auth-${crypto.randomUUID()}.sqlite`
  await mkdir("data", { recursive: true })
  const created = fixtureServerCreate({ databasePath, origin, ...options })
  if (!created.success) throw new Error(created.errorMessage)
  servers.push({ databasePath, server: created.data })
  const session = await created.data.sessionCookieRead()
  if (!session.success) throw new Error(session.errorMessage)
  return { cookie: session.data.split(";")[0] ?? "", server: created.data }
}

const sessionRead = async (server: FixtureServer, cookie: string) => {
  const response = await server.fetch(new Request(`${origin}/api/v1/auth/session`, { headers: { cookie } }))
  expect(response.status).toBe(200)
  return (await response.json()) as {
    data: {
      authenticated: boolean
      principal: { mode: AuthenticationMode; organizationId: string; grants: { projectId: string; roles: string[] }[] }
    }
  }
}

const projectListRead = async (server: FixtureServer, cookie: string) => {
  const response = await server.fetch(new Request(`${origin}/api/v1/projects`, { headers: { cookie } }))
  expect(response.status).toBe(200)
  return (await response.json()) as { data: { projects: { id: string }[] } }
}

afterEach(async () => {
  for (const { databasePath, server } of servers.splice(0)) {
    server.close()
    await rm(databasePath, { force: true })
    await rm(`${databasePath}-wal`, { force: true })
    await rm(`${databasePath}-shm`, { force: true })
  }
})

describe("fixture authentication modes", () => {
  test("keeps the existing default as an admin with one accessible project", async () => {
    const fixture = await fixtureServerRead({})
    const session = await sessionRead(fixture.server, fixture.cookie)
    expect(session.data.authenticated).toBe(true)
    expect(session.data.principal).toMatchObject({ mode: "admin", organizationId: "org-fixture" })
    expect(session.data.principal.grants).toEqual([
      { projectId: fixture.server.seed.zitadelProjectId, roles: ["contributor", "admin"] },
    ])
    expect((await projectListRead(fixture.server, fixture.cookie)).data.projects).toHaveLength(1)
  })

  test("issues a customer contributor session with one accessible project", async () => {
    const fixture = await fixtureServerRead({ sessionMode: "contributor", accessibleProjectCount: "one" })
    const session = await sessionRead(fixture.server, fixture.cookie)
    expect(session.data.principal).toMatchObject({ mode: "contributor", organizationId: "org-fixture-customers" })
    expect(session.data.principal.grants).toEqual([
      { projectId: fixture.server.seed.zitadelProjectId, roles: ["contributor"] },
    ])
    expect((await projectListRead(fixture.server, fixture.cookie)).data.projects).toHaveLength(1)
    const settings = await fixture.server.fetch(
      new Request(`${origin}/api/v1/projects/${fixture.server.seed.serviceProjectId}/settings`, {
        headers: { cookie: fixture.cookie },
      }),
    )
    expect(settings.status).toBe(403)
  })

  test.each([
    ["zero", 0],
    ["multiple", 2],
  ] as const)("supports a contributor project result with %s accessible projects", async (count, expected) => {
    const fixture = await fixtureServerRead({ sessionMode: "contributor", accessibleProjectCount: count })
    const session = await sessionRead(fixture.server, fixture.cookie)
    expect(session.data.principal.grants).toHaveLength(expected)
    expect((await projectListRead(fixture.server, fixture.cookie)).data.projects).toHaveLength(expected)
  })
})
