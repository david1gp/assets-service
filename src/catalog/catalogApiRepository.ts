import type { Catalog } from "./catalogSchema.js"
import type { GeneratedLists } from "./generatedListsSchema.js"
import type { Manifest } from "./manifestSchema.js"
import type { Result } from "../schemas/resultSchema.js"

type CatalogSnapshot = {
  id: string
  generationId: string
  current: boolean
  catalog: Catalog
}
type CatalogPage = { items: readonly CatalogSnapshot[]; nextCursor: number | null }
type ManifestPage = { items: readonly Manifest[]; nextCursor: number | null }
type CatalogListOptions = { cursor?: number; limit?: number; generationId?: string }
type ManifestListOptions = {
  cursor?: number
  limit?: number
  assetId?: string
  generationId?: string
  kind?: Manifest["kind"]
}

export type CatalogApiRepository = {
  catalogCurrentRead: (projectId: string, environment: Catalog["environment"]) => Result<CatalogSnapshot | null>
  catalogsRead: (
    projectId: string,
    environment: Catalog["environment"],
    options: CatalogListOptions,
  ) => Result<CatalogPage>
  catalogRead: (projectId: string, generationId: string) => Result<CatalogSnapshot | null>
  catalogListsRead: (
    projectId: string,
    environment: Catalog["environment"],
    options: CatalogListOptions,
  ) => Result<GeneratedLists | null>
  manifestsRead: (projectId: string, options: ManifestListOptions) => Result<ManifestPage>
  manifestRead: (projectId: string, manifestId: string) => Result<Manifest | null>
}
