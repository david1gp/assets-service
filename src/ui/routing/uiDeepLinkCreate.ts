/** Builds an absolute, shareable link for a route path of this SPA. */
export const uiDeepLinkCreate = (path: string): string => new URL(path, window.location.origin).toString()
