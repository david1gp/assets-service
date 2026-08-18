import { resolve } from "node:path"
import { defineConfig } from "@rsbuild/core"
import { pluginBabel } from "@rsbuild/plugin-babel"
import { pluginSolid } from "@rsbuild/plugin-solid"
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss"

const solidUiRoot = resolve(import.meta.dirname, "ui")

export default defineConfig({
  server: {
    port: 3010,
    strictPort: true,
  },
  html: {
    template: "./index.html",
  },
  source: {
    entry: {
      index: "./src/ui/main.tsx",
    },
  },
  resolve: {
    alias: {
      "#ui": solidUiRoot,
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
