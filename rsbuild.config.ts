import { defineConfig } from "@rsbuild/core"
import { pluginBabel } from "@rsbuild/plugin-babel"
import { pluginSolid } from "@rsbuild/plugin-solid"
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss"

const apiTarget = process.env.ASSETS_UI_API_URL ?? "https://assets-server.david-siewert.de"

export default defineConfig({
  server: {
    port: 3010,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  html: {
    template: "./index.html",
  },
  source: {
    entry: {
      index: "./src/ui/main.tsx",
    },
  },
  plugins: [pluginBabel({ include: /\.(?:jsx|tsx)$/ }), pluginSolid(), pluginTailwindcss()],
  output: {
    distPath: {
      root: "dist/ui",
      html: "",
      js: "assets",
      css: "assets",
      assets: "assets",
      media: "assets",
    },
    target: "web",
    filename: {
      js: "[name].[contenthash:8].js",
    },
  },
})
