import type { Result } from "../schemas/resultSchema.js"
import type { FontMetadataProbeResult } from "./fontMetadataProbeResult.js"

export type FontMetadataProbeAdapter = (sourceBytes: Uint8Array, sourceName?: string) => Result<FontMetadataProbeResult>
