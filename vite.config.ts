import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, import.meta.dirname, ["ASSETS_", "VITE_"])
  const apiTarget =
    environment.ASSETS_UI_API_URL ?? process.env.ASSETS_UI_API_URL ?? "https://assets-server.david-siewert.de"

  return {
    plugins: [solid(), tailwindcss()],
    server: {
      port: 3010,
      strictPort: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist/ui",
      emptyOutDir: false,
    },
  }
})
