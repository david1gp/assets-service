import { expect, test } from "bun:test"

import { r2CredentialsRead } from "../src/asset-cli/r2CredentialsRead.js"
import { projectCreateR2CredentialsRead } from "../src/asset-cli/projectCreateR2CredentialsRead.js"

test("prefers the complete primary R2 credential pair", () => {
  expect(
    r2CredentialsRead({
      R2_ACCESS_KEY_ID: "primary-access",
      R2_SECRET_ACCESS_KEY: "primary-secret",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "compatibility-access",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "compatibility-secret",
    }),
  ).toEqual({ success: true, data: { accessKeyId: "primary-access", secretAccessKey: "primary-secret" } })
})

test("reads the complete compatibility R2 credential pair", () => {
  expect(
    r2CredentialsRead({
      CLOUDFLARE_R2_ACCESS_KEY_ID: "compatibility-access",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "compatibility-secret",
    }),
  ).toEqual({
    success: true,
    data: { accessKeyId: "compatibility-access", secretAccessKey: "compatibility-secret" },
  })
})

test("reports no imported pair so project creation can use its Cloudflare fallback", () => {
  expect(projectCreateR2CredentialsRead({})).toEqual({ success: true, data: null })
})

test("rejects incomplete credential pairs", () => {
  for (const environment of [
    { R2_ACCESS_KEY_ID: "primary-access" },
    { R2_SECRET_ACCESS_KEY: "primary-secret" },
    { CLOUDFLARE_R2_ACCESS_KEY_ID: "compatibility-access" },
    { CLOUDFLARE_R2_SECRET_ACCESS_KEY: "compatibility-secret" },
  ]) {
    const result = r2CredentialsRead(environment)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).not.toContain("primary-secret")
  }
})

test("rejects mixed primary and compatibility credential pairs", () => {
  const result = r2CredentialsRead({
    R2_ACCESS_KEY_ID: "primary-access",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "compatibility-secret",
  })

  expect(result).toMatchObject({ success: false, op: "assetsCliR2CredentialsRead" })
  expect(result.success ? "" : result.errorMessage).not.toContain("compatibility-secret")
})

test("rejects empty credential values", () => {
  const result = r2CredentialsRead({ R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "primary-secret" })

  expect(result).toMatchObject({ success: false, op: "assetsCliR2CredentialsRead" })
})
