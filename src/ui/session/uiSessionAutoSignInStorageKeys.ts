/** Storage keys for automatic sign-in preference and bounded attempt tracking. */
export const uiSessionAutoSignInStorageKeys = {
  preference: "assets-service:ui:auth:auto-sign-in",
  attempts: "assets-service:ui:auth:auto-sign-in-attempts",
} as const
