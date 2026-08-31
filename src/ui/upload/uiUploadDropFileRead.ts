/** Reads the first dropped file from a native drag data transfer, ignoring non-file drags. */
export const uiUploadDropFileRead = (dataTransfer: DataTransfer | null | undefined): File | null => {
  if (!dataTransfer) return null

  const direct = dataTransfer.files?.item(0)
  if (direct) return direct

  const items = dataTransfer.items
  if (!items) return null
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}
