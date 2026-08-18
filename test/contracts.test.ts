import { expect, test } from "bun:test"
import * as v from "valibot"

import { apiSuccessEnvelopeCreate } from "../src/api/apiSuccessEnvelopeCreate.js"
import { jsonEnvelopeStringify } from "../src/api/jsonEnvelopeStringify.js"
import { foldersSchema } from "../src/asset/foldersSchema.js"
import { serviceConfigRead } from "../src/config/serviceConfigRead.js"
import { serviceConfigR2BindingResolve } from "../src/config/serviceConfigR2BindingResolve.js"
import { imageMetadataSchema } from "../src/metadata/imageMetadataSchema.js"

test("serviceConfigRead validates environment contracts", () => {
  const valid = serviceConfigRead({
    ASSETS_ENVIRONMENT: "production",
    ASSETS_API_HOST: "https://api.example.test",
    ASSETS_API_PORT: "8787",
    ASSETS_DATABASE_PATH: "./data/assets.sqlite",
    CLOUDFLARE_ACCOUNT_ID: "account",
    R2_ACCESS_KEY_ID: "access",
    R2_SECRET_ACCESS_KEY: "secret",
    ASSETS_R2_BUCKET: "assets",
    ASSETS_R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    ASSETS_R2_PUBLIC_BASE_URL: "https://assets.example.test",
    ASSETS_WORKER_ID: "worker-1",
  })
  expect(valid.success).toBe(true)
  if (valid.success) expect(valid.data.environment).toBe("production")
  if (valid.success) {
    const separate = serviceConfigRead({
      ASSETS_ENVIRONMENT: "production",
      ASSETS_API_HOST: "https://api.example.test",
      ASSETS_API_PORT: "8787",
      ASSETS_DATABASE_PATH: "./data/assets.sqlite",
      CLOUDFLARE_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      ASSETS_R2_DEVELOPMENT_BUCKET: "assets-development",
      ASSETS_R2_PRODUCTION_BUCKET: "assets-production",
      ASSETS_R2_DEVELOPMENT_PUBLIC_BASE_URL: "https://dev.assets.example.test",
      ASSETS_R2_PRODUCTION_PUBLIC_BASE_URL: "https://assets.example.test",
      ASSETS_R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      ASSETS_WORKER_ID: "worker-1",
    })
    expect(separate.success).toBe(true)
    if (separate.success) {
      expect(serviceConfigR2BindingResolve(separate.data)).toMatchObject({
        success: true,
        data: { privateBucket: "assets-production", publicBucket: "assets-production" },
      })
    }
  }

  const invalid = serviceConfigRead({ ASSETS_ENVIRONMENT: "staging" })
  expect(invalid.success).toBe(false)
})

test("folders reject traversal and normalize segments to NFC", () => {
  expect(v.safeParse(foldersSchema, ["home", "hero"]).success).toBe(true)
  expect(v.safeParse(foldersSchema, ["home", "../hero"]).success).toBe(false)
  expect(v.safeParse(foldersSchema, ["e\u0301"])).toMatchObject({ success: true, output: ["é"] })
})

test("media schemas reject fields from another media class", () => {
  const valid = {
    kind: "image",
    width: 100,
    height: 50,
    format: "webp",
    colorSpace: "srgb",
    alpha: false,
    orientationApplied: true,
    frameCount: 1,
    animated: false,
    alt: null,
    aiProvenance: null,
  }
  expect(v.safeParse(imageMetadataSchema, valid).success).toBe(true)
  expect(v.safeParse(imageMetadataSchema, { ...valid, durationSeconds: 1 }).success).toBe(false)
})

test("JSON envelopes have stable sorted output", () => {
  const envelope = apiSuccessEnvelopeCreate({ z: 1, a: { y: true, b: 2 } }, "request-1")
  expect(jsonEnvelopeStringify(envelope)).toBe(
    '{"data":{"a":{"b":2,"y":true},"z":1},"ok":true,"requestId":"request-1"}\n',
  )
})
