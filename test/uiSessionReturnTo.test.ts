import { describe, expect, test } from "bun:test"
import * as v from "valibot"

import { pkceLoginRequestSchema } from "../src/authentication/pkceLoginRequestSchema.js"
import { uiSessionReturnToRead } from "../src/ui/session/uiSessionReturnToRead.js"

describe("uiSessionReturnToRead", () => {
  test("keeps the full deep-link path and query", () => {
    expect(uiSessionReturnToRead("/projects/contentoren/assets?dialog=move&cursor=40")).toBe(
      "/projects/contentoren/assets?dialog=move&cursor=40",
    )
    expect(uiSessionReturnToRead("/projects/contentoren/assets/asset-hero?dialog=outputs")).toBe(
      "/projects/contentoren/assets/asset-hero?dialog=outputs",
    )
  })

  test("sends the login page itself back to the project list", () => {
    expect(uiSessionReturnToRead("/login")).toBe("/")
    expect(uiSessionReturnToRead("/login?next=/projects")).toBe("/")
  })

  test("refuses off-origin and malformed targets", () => {
    expect(uiSessionReturnToRead("//evil.example/steal")).toBe("/")
    expect(uiSessionReturnToRead("https://evil.example/steal")).toBe("/")
    expect(uiSessionReturnToRead("/projects\\..\\admin")).toBe("/")
    expect(uiSessionReturnToRead(`/${"a".repeat(2048)}`)).toBe("/")
  })

  test("produces values the service login schema accepts", () => {
    for (const candidate of [
      "/projects/contentoren/jobs?tab=jobs",
      "//evil.example",
      "https://evil.example",
      "/login",
    ]) {
      const parsed = v.safeParse(pkceLoginRequestSchema, { returnTo: uiSessionReturnToRead(candidate) })
      expect(parsed.success).toBe(true)
    }
  })
})
