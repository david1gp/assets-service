import { canonicalJsonStringify } from "../catalog/canonicalJsonStringify.js"

export const jsonEnvelopeStringify = (envelope: unknown) => `${canonicalJsonStringify(envelope)}\n`
