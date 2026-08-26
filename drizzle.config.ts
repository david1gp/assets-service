import { defineConfig } from "drizzle-kit"

const databaseUrl = process.env.ASSETS_DATABASE_PATH ?? "./data/assets.sqlite"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/infrastructure/db/schema/*.ts", "./src/migration/backupRemotePathMigrationRunTable.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
})
