import { rm } from "node:fs/promises"
import { resolve } from "node:path"
import * as v from "valibot"

import { authenticationModeSchema } from "../authentication/authenticationModeSchema.js"
import { fixtureServerCreate } from "../fixture/fixtureServerCreate.js"
import type { FixtureAccessibleProjectCount } from "../fixture/fixtureAccessibleProjectCount.js"
import { uiStaticHandlerCreate } from "./uiStaticHandlerCreate.js"

/**
 * Serves the built SPA and a seeded API from one origin for browser
 * verification. It uses an isolated database file, a local-only session
 * adapter, and no production credentials, so it must never be deployed.
 */
export const fixtureServerMain = async (): Promise<number> => {
  const port = Number(process.env.ASSETS_FIXTURE_PORT ?? "3021")
  const databasePath = process.env.ASSETS_FIXTURE_DATABASE_PATH ?? resolve(process.cwd(), "data/fixture-server.sqlite")
  const origin = `http://127.0.0.1:${port}`
  const sessionModeValue = process.env.ASSETS_FIXTURE_SESSION_MODE
  const sessionMode =
    sessionModeValue === undefined ? undefined : v.safeParse(authenticationModeSchema, sessionModeValue)
  if (sessionMode !== undefined && !sessionMode.success) {
    process.stderr.write("ASSETS_FIXTURE_SESSION_MODE must be admin or contributor\n")
    return 1
  }
  const accessibleProjectCountValue = process.env.ASSETS_FIXTURE_PROJECTS ?? "one"
  const accessibleProjectCount: FixtureAccessibleProjectCount | undefined =
    accessibleProjectCountValue === "zero" ||
    accessibleProjectCountValue === "one" ||
    accessibleProjectCountValue === "multiple"
      ? accessibleProjectCountValue
      : undefined
  if (accessibleProjectCount === undefined) {
    process.stderr.write("ASSETS_FIXTURE_PROJECTS must be zero, one, or multiple\n")
    return 1
  }

  await rm(databasePath, { force: true })
  await rm(`${databasePath}-wal`, { force: true })
  await rm(`${databasePath}-shm`, { force: true })

  const server = fixtureServerCreate({
    databasePath,
    origin,
    sessionMode: sessionMode?.output,
    accessibleProjectCount,
  })
  if (!server.success) {
    process.stderr.write(`${server.errorMessage}\n`)
    return 1
  }

  const uiHandle = uiStaticHandlerCreate({
    rootDirectory: process.env.ASSETS_UI_DIRECTORY ?? resolve(process.cwd(), "dist/ui"),
  })

  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: async (request: Request) => {
      const apiResponse = await server.data.fetch(request)
      if (apiResponse.status !== 404) return apiResponse
      const uiResponse = await uiHandle(request)
      return uiResponse ?? apiResponse
    },
  })

  process.stdout.write(`fixture server on ${origin} (project ${server.data.seed.serviceProjectId})\n`)
  return 0
}

if (import.meta.main) {
  const code = await fixtureServerMain()
  if (code !== 0) process.exit(code)
}
