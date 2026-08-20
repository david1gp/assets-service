const idleCallbackTimeoutMilliseconds = 1000

/** Schedules background work during browser idle time, with an asynchronous fallback. */
export const uiIdleCallbackSchedule = (task: () => void): (() => void) => {
  if (typeof globalThis.requestIdleCallback === "function") {
    const idleCallbackId = globalThis.requestIdleCallback(() => task(), {
      timeout: idleCallbackTimeoutMilliseconds,
    })
    return () => globalThis.cancelIdleCallback(idleCallbackId)
  }

  const timeoutId = globalThis.setTimeout(task, 0)
  return () => globalThis.clearTimeout(timeoutId)
}
