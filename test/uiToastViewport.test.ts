import { readFile } from "node:fs/promises"

import { beforeEach, describe, expect, test } from "bun:test"

import { uiToastAdd } from "../src/ui/toast/uiToastAdd.js"
import { uiToastDismiss } from "../src/ui/toast/uiToastDismiss.js"
import { uiToastLimit } from "../src/ui/toast/uiToastLimit.js"
import { uiToastStore } from "../src/ui/toast/uiToastStore.js"

beforeEach(() => uiToastStore.set([]))

describe("uiToastAdd", () => {
  test("queues a toast with the requested tone and text", () => {
    const id = uiToastAdd({ tone: "negative", title: "Move failed", description: "The folder was locked" })
    expect(uiToastStore.get()).toEqual([
      { id, tone: "negative", title: "Move failed", description: "The folder was locked" },
    ])
  })

  test("omits the description key when none was given", () => {
    uiToastAdd({ tone: "positive", title: "Saved" })
    expect(uiToastStore.get()[0]).not.toHaveProperty("description")
  })

  test("drops the oldest toast past the limit", () => {
    for (let index = 0; index <= uiToastLimit; index += 1) uiToastAdd({ tone: "positive", title: `Toast ${index}` })
    expect(uiToastStore.get()).toHaveLength(uiToastLimit)
    expect(uiToastStore.get()[0]?.title).toBe("Toast 1")
  })

  test("dismisses one toast and ignores unknown identifiers", () => {
    const id = uiToastAdd({ tone: "positive", title: "Saved" })
    uiToastDismiss("toast-missing")
    expect(uiToastStore.get()).toHaveLength(1)
    uiToastDismiss(id)
    expect(uiToastStore.get()).toEqual([])
  })
})

describe("UiToastViewport DOM", () => {
  test("keeps the live region off the list items so every ul child stays a listitem", async () => {
    const source = await readFile("src/ui/toast/UiToastViewport.tsx", "utf8")
    const list = source.slice(source.indexOf("<ul"), source.indexOf("</ul>"))

    // axe `list`: a `<ul>` may only have children with the `listitem` role. The
    // read-only library toast puts `role="status"` on each `<li>`, which
    // overrides that role and fails the rule.
    expect(list).not.toContain("role=")
    expect(list).not.toContain("aria-live")

    // axe `aria-prohibited-attr`: `aria-label` needs a role that supports a
    // name. `log` is the appending live region, so it carries both.
    const wrapper = source.slice(0, source.indexOf("<ul"))
    expect(wrapper).toContain('role="log"')
    expect(wrapper).toContain('aria-label="Notifications"')
  })

  test("labels the dismiss control per toast", async () => {
    const source = await readFile("src/ui/toast/UiToastViewport.tsx", "utf8")
    expect(source).toContain("title={`Dismiss ${toast.title}`}")
  })
})
