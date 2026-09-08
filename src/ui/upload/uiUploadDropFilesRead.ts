/** Reads every file from a native drag data transfer, ignoring non-file drags. */
export const uiUploadDropFilesRead = (dataTransfer: DataTransfer | null | undefined): File[] => {
  if (!dataTransfer) return []

  const direct: File[] = []
  const directFiles = dataTransfer.files
  for (let index = 0; index < (directFiles?.length ?? 0); index += 1) {
    const file = directFiles?.item(index)
    if (file) direct.push(file)
  }
  if (direct.length > 0) return direct

  const items = dataTransfer.items
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}
