const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/

export const apiRequestIdCreate = (request: Request): string => {
  const supplied = request.headers.get("x-request-id")?.trim()
  if (supplied && requestIdPattern.test(supplied)) return supplied
  return crypto.randomUUID()
}
