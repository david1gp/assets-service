import { expect, test } from "bun:test"

import { wranglerCommandRunnerProduction } from "../src/wrangler/wranglerCommandRunnerProduction.js"

test("runs the globally installed Wrangler through Bun without PATH", async () => {
  const moduleUrl = new URL("../src/wrangler/wranglerCommandRunnerProduction.ts", import.meta.url).href
  const script = [
    `import { wranglerCommandRunnerProduction } from ${JSON.stringify(moduleUrl)}`,
    `const result = await wranglerCommandRunnerProduction({ args: ["--version"] })`,
    "console.log(JSON.stringify(result))",
  ].join("\n")
  const child = Bun.spawn([process.execPath, "--eval", script], {
    env: { ...process.env, PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  expect(exitCode).toBe(0)
  expect(stderr).toBe("")
  expect(JSON.parse(stdout.trim())).toEqual({
    success: true,
    data: { exitCode: 0, stdout: "4.131.1\n", stderr: "" },
  })
})

test("preserves the startup failure result when Wrangler cannot be spawned", async () => {
  const result = await wranglerCommandRunnerProduction({ args: ["\u0000"] })

  expect(result).toEqual({
    success: false,
    op: "wranglerCommandRunnerProduction",
    errorMessage: "Wrangler could not be started",
  })
})
