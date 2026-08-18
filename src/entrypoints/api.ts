import { resolve } from "node:path"
import { serviceRuntimeConfigRead } from "../config/serviceRuntimeConfigRead.js"
import { apiCompositionCreate } from "./apiCompositionCreate.js"
import { uiStaticHandlerCreate } from "./uiStaticHandlerCreate.js"

export const apiMain = () => {
  const config = serviceRuntimeConfigRead()
  if (!config.success) {
    process.stderr.write(`${config.errorMessage}\n`)
    return 1
  }

  const composition = apiCompositionCreate(config.data)
  if (!composition.success) {
    process.stderr.write(`${composition.errorMessage}\n`)
    return 1
  }

  const uiHandle = uiStaticHandlerCreate({
    rootDirectory: process.env.ASSETS_UI_DIRECTORY ?? resolve(process.cwd(), "dist/ui"),
  })

  Bun.serve({
    fetch: async (request: Request) => {
      const apiResponse = await composition.data.app.fetch(request)
      if (apiResponse.status !== 404) return apiResponse
      const uiResponse = await uiHandle(request)
      return uiResponse ?? apiResponse
    },
    hostname: process.env.ASSETS_API_BIND || "127.0.0.1",
    port: config.data.service.apiPort,
  })
  return 0
}

if (import.meta.main) {
  const code = apiMain()
  if (code !== 0) process.exit(code)
}
