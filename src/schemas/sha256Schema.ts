import * as v from "valibot"

export const sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))

export type Sha256 = v.InferOutput<typeof sha256Schema>
