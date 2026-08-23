import { mock } from "bun:test"

/**
 * Resolves `solid-js` to its browser build for the whole test run.
 *
 * Bun applies the `node` export condition, which yields Solid's server build.
 * There `onMount` never runs and reactivity is inert, so UI code that depends on
 * mount timing cannot be tested. The mock has to be installed before any test
 * file imports `solid-js`, because the first import is cached for the run —
 * hence a preload rather than a per-file `mock.module`.
 */
const solidBrowser: typeof import("solid-js") = await import("solid-js/dist/dev.js" as string)

mock.module("solid-js", () => solidBrowser)
