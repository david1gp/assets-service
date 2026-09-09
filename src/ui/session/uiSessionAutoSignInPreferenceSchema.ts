import * as v from "valibot"

/** Schema validating the browser-local preference for automatic sign-in. */
export const uiSessionAutoSignInPreferenceSchema = v.boolean()
export type UiSessionAutoSignInPreference = v.InferOutput<typeof uiSessionAutoSignInPreferenceSchema>
