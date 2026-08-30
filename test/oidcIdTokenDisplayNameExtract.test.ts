import { describe, expect, test } from "bun:test"

import { oidcIdTokenDisplayNameExtract } from "../src/authentication/oidcIdTokenDisplayNameExtract.js"

describe("OIDC ID token display-name extraction", () => {
  test("uses claims in display-name precedence order", () => {
    expect(
      oidcIdTokenDisplayNameExtract({
        name: "Ada Lovelace",
        given_name: "Grace",
        family_name: "Hopper",
        preferred_username: "ada",
        nickname: "countess",
        email: "ada@example.test",
      }),
    ).toBe("Ada Lovelace")
    expect(
      oidcIdTokenDisplayNameExtract({ given_name: "Grace", family_name: "Hopper", preferred_username: "grace" }),
    ).toBe("Grace Hopper")
    expect(
      oidcIdTokenDisplayNameExtract({ preferred_username: "grace", nickname: "countess", email: "grace@example.test" }),
    ).toBe("grace")
    expect(oidcIdTokenDisplayNameExtract({ nickname: "countess", email: "grace@example.test" })).toBe("countess")
    expect(oidcIdTokenDisplayNameExtract({ email: "grace@example.test" })).toBe("grace@example.test")
  })

  test("falls back past unusable claims and returns no name when none are usable", () => {
    expect(
      oidcIdTokenDisplayNameExtract({
        name: " ",
        given_name: 42,
        family_name: "",
        preferred_username: " user ",
      }),
    ).toBe("user")
    expect(
      oidcIdTokenDisplayNameExtract({
        name: "x".repeat(257),
        given_name: "g".repeat(256),
        family_name: "f".repeat(256),
        preferred_username: [],
        nickname: null,
        email: "",
      }),
    ).toBeUndefined()
    expect(oidcIdTokenDisplayNameExtract({})).toBeUndefined()
  })
})
