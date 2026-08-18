import type { DeletionState } from "../../deletion/deletionStateSchema.js"

/**
 * The worker records four fixed steps (`plan:remote-objects`, `database:catalog`,
 * `database:records`, `database:asset`) plus one `remote:<token>` step per
 * object, so the object count is not derivable from the step count.
 */
const fixedStepTotal = 4

const remoteStepCount = (state: DeletionState): number =>
  state.completedSteps.filter((step) => step.startsWith("remote:")).length

const fixedStepCount = (state: DeletionState): number =>
  Math.min(state.completedSteps.length - remoteStepCount(state), fixedStepTotal)

const objectPhrase = (count: number): string => `${count} remote object${count === 1 ? "" : "s"}`

export type UiDeletionProgress = {
  percent: number
  completedSteps: number
  totalSteps: number
  removedObjects: number
  pendingObjects: number
  label: string
}

/**
 * Turns a deletion state into a percentage and a sentence that names the step
 * count and the remote-object count separately. Both totals grow with the
 * planned objects, so the bar never sits at 100 percent while objects remain.
 */
export const uiDeletionProgressRead = (state: DeletionState): UiDeletionProgress => {
  const removedObjects = remoteStepCount(state)
  const pendingObjects = state.pendingRemoteObjects.length
  const totalSteps = fixedStepTotal + removedObjects + pendingObjects
  const completedSteps = fixedStepCount(state) + removedObjects
  const stepPhrase = `${completedSteps} of ${totalSteps} steps done`
  const objectPart = `${removedObjects} of ${removedObjects + pendingObjects} remote objects removed`

  if (state.status === "succeeded")
    return {
      percent: 100,
      completedSteps: totalSteps,
      totalSteps,
      removedObjects,
      pendingObjects: 0,
      label: `${totalSteps} of ${totalSteps} steps done. All objects, revisions, and catalog entries are removed.`,
    }

  if (state.status === "requested")
    return {
      percent: 0,
      completedSteps: 0,
      totalSteps,
      removedObjects: 0,
      pendingObjects,
      label: `0 of ${totalSteps} steps done. Queued, so the asset and its objects are still in place until the workflow runs.`,
    }

  if (state.status === "failed")
    return {
      percent: 0,
      completedSteps,
      totalSteps,
      removedObjects,
      pendingObjects,
      label: `Deletion stopped after ${stepPhrase}, with ${objectPhrase(pendingObjects)} left. Retry it from the jobs page.`,
    }

  const suffix = state.status === "retryable" ? " Retrying after a failure." : ""
  return {
    percent: totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
    completedSteps,
    totalSteps,
    removedObjects,
    pendingObjects,
    label: `${stepPhrase}, ${objectPart}, ${objectPhrase(pendingObjects)} left.${suffix}`,
  }
}
