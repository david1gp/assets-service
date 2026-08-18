export const nfcLexicalCompare = (left: string, right: string): number => {
  const normalizedLeft = left.normalize("NFC")
  const normalizedRight = right.normalize("NFC")
  if (normalizedLeft !== normalizedRight) return normalizedLeft < normalizedRight ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}
