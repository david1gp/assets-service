import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"
import solid from "vite-plugin-solid"

const solidUiRoot = resolve(import.meta.dirname, "ui")

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, import.meta.dirname, ["ASSETS_", "VITE_"])
  const apiTarget = environment.ASSETS_UI_API_URL ?? process.env.ASSETS_UI_API_URL ?? "http://127.0.0.1:3011"

  return {
    plugins: [solid(), tailwindcss()],
    resolve: {
      alias: [{ find: "#ui", replacement: solidUiRoot }],
    },
    server: {
      port: 3010,
      strictPort: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: false },
      },
    },
    build: {
      outDir: "dist/ui",
      emptyOutDir: false,
    },
  }
})
