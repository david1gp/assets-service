import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import type { Result } from "../../schemas/resultSchema.js"
import { documentExtensionMediaTypes } from "../../document/documentExtensionMediaTypes.js"
import type { DocumentMediaType } from "../../document/documentMediaTypeSchema.js"
import { uploadMediaTypeCheck } from "../../upload/uploadMediaTypeCheck.js"
import { type UploadSupportedMediaType, uploadSupportedMediaTypes } from "../../upload/uploadSupportedMediaTypes.js"
import { uiUploadExtensionMediaTypes } from "./uiUploadExtensionMediaTypes.js"
import { ttc } from "../localization/ttc.js"

/**
 * Resolves the media type of a selected file and checks it against the same
 * allowlist the API enforces, so an unsupported file is refused in the form
 * before an upload intent is requested.
 */
export const uiUploadMediaTypeRead = (file: File): Result<UploadSupportedMediaType> => {
  const declared = file.type.trim()
  if (declared.length > 0) {
    const checked = uploadMediaTypeCheck(declared)
    if (!checked.success) {
      const normalized = declared.toLowerCase().split(";")[0]?.trim() ?? ""
      return resultErrorCreate(
        "uiUploadMediaTypeRead",
        ttc(
          `The media type ${normalized} is not allowed. Upload one of ${uploadSupportedMediaTypes.join(", ")}.`,
          `Der Medientyp ${normalized} ist nicht erlaubt. Lade einen von ${uploadSupportedMediaTypes.join(", ")} hoch.`,
        ),
        { filename: file.name },
      )
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
    const documentMediaType = documentExtensionMediaTypes[extension]
    if (
      Object.values(documentExtensionMediaTypes).includes(checked.data as DocumentMediaType) &&
      documentMediaType !== checked.data
    )
      return resultErrorCreate(
        "uiUploadMediaTypeRead",
        ttc(
          "The document media type does not match its filename extension",
          "Der Dokument-Medientyp stimmt nicht mit der Dateierweiterung überein",
        ),
        {
          filename: file.name,
        },
      )
    return checked
  }
  const segments = file.name.split(".")
  const extension = segments.length > 1 ? (segments.pop()?.toLowerCase() ?? "") : ""
  const guessed = uiUploadExtensionMediaTypes[extension]
  if (guessed !== undefined) return { success: true, data: guessed }
  return resultErrorCreate(
    "uiUploadMediaTypeRead",
    extension.length === 0
      ? ttc(
          "This file has no extension, so its type is unknown. Rename it or pick a supported file.",
          "Diese Datei hat keine Erweiterung, daher ist ihr Typ unbekannt. Benenne sie um oder wähle eine unterstützte Datei.",
        )
      : ttc(
          `Files ending in .${extension} are not supported. Pick a JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, document, or font file.`,
          `Dateien mit der Endung .${extension} werden nicht unterstützt. Wähle eine JPEG-, PNG-, WebP-, AVIF-, GIF-, MP4-, WebM-, Dokument- oder Schriftdatei.`,
        ),
    { filename: file.name },
  )
}
