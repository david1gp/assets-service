export const assetBasenameCreate = (filename: string): string => {
  const extensionSeparator = filename.lastIndexOf(".")
  if (extensionSeparator <= 0) return filename.normalize("NFC")
  return filename.slice(0, extensionSeparator).normalize("NFC")
}
