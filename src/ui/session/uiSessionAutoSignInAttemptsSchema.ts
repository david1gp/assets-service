import * as v from "valibot"

/** Schema validating the persisted automatic sign-in attempt counter. */
export const uiSessionAutoSignInAttemptsSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
export type UiSessionAutoSignInAttempts = v.InferOutput<typeof uiSessionAutoSignInAttemptsSchema>
