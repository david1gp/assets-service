import * as v from "valibot"

export const documentExtensionSchema = v.picklist([
  "pdf",
  "json",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "xlsm",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "csv",
  "txt",
])

export type DocumentExtension = v.InferOutput<typeof documentExtensionSchema>
