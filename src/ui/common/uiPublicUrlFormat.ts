/** Joins a public base URL and a stored object key into one browsable URL. */
export const uiPublicUrlFormat = (publicBaseUrl: string, objectKey: string): string =>
  `${publicBaseUrl.replace(/\/+$/u, "")}/${objectKey.replace(/^\/+/u, "")}`
