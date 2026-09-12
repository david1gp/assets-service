import { expect, test } from "bun:test"
import * as v from "valibot"

import { r2BucketCredentialRegisterRequestSchema } from "../src/api-client/r2BucketCredentialRegisterRequestSchema.js"
import { r2BucketCredentialCreateInputSchema } from "../src/r2/r2BucketCredentialCreateInputSchema.js"
import { r2BucketCredentialSchema } from "../src/r2/r2BucketCredentialSchema.js"

const credential = {
  bucket: "imported-assets",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  revocationId: null,
}

test("R2 bucket credential schemas accept imported credentials without a revocation ID", () => {
  expect(v.safeParse(r2BucketCredentialCreateInputSchema, credential).success).toBe(true)
  expect(v.safeParse(r2BucketCredentialRegisterRequestSchema, credential).success).toBe(true)
  expect(
    v.safeParse(r2BucketCredentialSchema, {
      ...credential,
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    }).success,
  ).toBe(true)
})

test("R2 bucket credential schemas continue rejecting an empty revocation ID", () => {
  expect(v.safeParse(r2BucketCredentialCreateInputSchema, { ...credential, revocationId: "" }).success).toBe(false)
})
