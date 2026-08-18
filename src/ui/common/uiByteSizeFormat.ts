const units = ["B", "kB", "MB", "GB", "TB"] as const

/** Formats a byte count as a short human readable size. */
export const uiByteSizeFormat = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown"
  let value = bytes
  let unitIndex = 0
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000
    unitIndex += 1
  }
  const rounded = unitIndex === 0 ? String(value) : value.toFixed(value < 10 ? 1 : 0)
  return `${rounded} ${units[unitIndex]}`
}
