export const apiSuccessEnvelopeCreate = <T>(data: T, requestId?: string) => ({
  ok: true as const,
  data,
  ...(requestId === undefined ? {} : { requestId }),
})
