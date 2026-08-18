import type { Folders } from "../asset/foldersSchema.js"
import type { AssetClass } from "../schemas/assetClassSchema.js"

export const outputRemoteObjectKeyCreate = (input: {
  assetClass: AssetClass
  folders: Folders
  basename: string
  outputKey: string
  version: number
  extension: string
}): string => {
  const directory = [input.assetClass === "image" ? "images" : `${input.assetClass}s`, ...input.folders].map((part) =>
    part.normalize("NFC"),
  )
  const basename = input.basename.normalize("NFC")
  const outputKey = input.outputKey.normalize("NFC")
  const extension = input.extension.normalize("NFC")
  const outputStem = input.assetClass === "video" && outputKey === "default" ? basename : `${basename}_${outputKey}`
  return [...directory, `${outputStem}_v${input.version}.${extension}`].join("/")
}
