import { join, normalize } from "node:path"

export type UiStaticHandlerOptions = {
  rootDirectory: string
  fileRead?: (path: string) => { exists: () => Promise<boolean>; bytes: () => Promise<Uint8Array>; type: string }
}

const mediaTypes: Readonly<Record<string, string>> = {
  css: "text/css; charset=UTF-8",
  html: "text/html; charset=UTF-8",
  ico: "image/x-icon",
  js: "text/javascript; charset=UTF-8",
  json: "application/json; charset=UTF-8",
  map: "application/json; charset=UTF-8",
  svg: "image/svg+xml",
  webp: "image/webp",
  woff2: "font/woff2",
}

const mediaTypeRead = (path: string): string =>
  mediaTypes[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream"

/**
 * Serves the built admin SPA. API and health paths are never handled here, so a
 * missing build can not shadow an API route; unknown app paths fall back to the
 * SPA entry document so deep links keep working after a reload.
 */
export const uiStaticHandlerCreate = (options: UiStaticHandlerOptions) => {
  const fileRead = options.fileRead ?? ((path: string) => Bun.file(path))

  const responseCreate = async (path: string): Promise<Response | null> => {
    const file = fileRead(path)
    if (!(await file.exists())) return null
    const bytes = await file.bytes()
    return new Response(bytes as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "content-type": mediaTypeRead(path),
        "cache-control": path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      },
    })
  }

  return async (request: Request): Promise<Response | null> => {
    if (request.method !== "GET" && request.method !== "HEAD") return null
    const pathname = new URL(request.url).pathname
    if (pathname.startsWith("/api/")) return null

    const relative = normalize(pathname)
      .replace(/^(\.\.[/\\])+/u, "")
      .replace(/^[/\\]+/u, "")
    if (relative.length > 0 && !relative.startsWith("..")) {
      const asset = await responseCreate(join(options.rootDirectory, relative))
      if (asset) return asset
    }
    return responseCreate(join(options.rootDirectory, "index.html"))
  }
}
