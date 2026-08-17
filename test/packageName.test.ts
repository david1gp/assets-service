import { expect, test } from "bun:test"
import { packageName } from "../src/library.js"

test("packageName is the published scope", () => {
  expect(packageName).toBe("@adaptive-ds/assets-service")
})
