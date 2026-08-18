import { resolve } from "node:path"

const openDatabasePaths = new Set<string>()

export const databaseOpenPathRegistry = {
  has: (databasePath: string): boolean => openDatabasePaths.has(resolve(databasePath)),
  register: (databasePath: string): void => {
    openDatabasePaths.add(resolve(databasePath))
  },
  unregister: (databasePath: string): void => {
    openDatabasePaths.delete(resolve(databasePath))
  },
}
