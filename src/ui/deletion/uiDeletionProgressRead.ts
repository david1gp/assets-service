import type { DeletionState } from "../../deletion/deletionStateSchema.js"
import { ttc } from "../localization/ttc.js"

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

const objectPhrase = (count: number): string =>
  `${count} ${ttc(count === 1 ? "remote object" : "remote objects", count === 1 ? "Remote-Objekt" : "Remote-Objekte")}`

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
  const stepPhrase = `${completedSteps} ${ttc("of", "von")} ${totalSteps} ${ttc("steps done", "Schritte abgeschlossen")}`
  const objectPart = `${removedObjects} ${ttc("of", "von")} ${removedObjects + pendingObjects} ${ttc("remote objects removed", "Remote-Objekte entfernt")}`

  if (state.status === "succeeded")
    return {
      percent: 100,
      completedSteps: totalSteps,
      totalSteps,
      removedObjects,
      pendingObjects: 0,
      label: `${totalSteps} ${ttc("of", "von")} ${totalSteps} ${ttc("steps done", "Schritte abgeschlossen")}. ${ttc("All objects, revisions, and catalog entries are removed.", "Alle Objekte, Revisionen und Katalogeinträge wurden entfernt.")}`,
    }

  if (state.status === "requested")
    return {
      percent: 0,
      completedSteps: 0,
      totalSteps,
      removedObjects: 0,
      pendingObjects,
      label: `0 ${ttc("of", "von")} ${totalSteps} ${ttc("steps done", "Schritte abgeschlossen")}. ${ttc("Queued, so the asset and its objects are still in place until the workflow runs.", "Eingereiht; das Medium und seine Objekte bleiben bestehen, bis der Workflow ausgeführt wird.")}`,
    }

  if (state.status === "failed")
    return {
      percent: 0,
      completedSteps,
      totalSteps,
      removedObjects,
      pendingObjects,
      label: `${ttc("Deletion stopped after", "Löschung angehalten nach")} ${stepPhrase}, ${ttc("with", "mit")} ${objectPhrase(pendingObjects)} ${ttc("left", "verbleibend")}. ${ttc("Retry it from the jobs page.", "Wiederhole sie auf der Job-Seite.")}`,
    }

  const suffix =
    state.status === "retryable" ? ` ${ttc("Retrying after a failure.", "Wiederholung nach einem Fehler.")}` : ""
  return {
    percent: totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
    completedSteps,
    totalSteps,
    removedObjects,
    pendingObjects,
    label: `${stepPhrase}, ${objectPart}, ${objectPhrase(pendingObjects)} left.${suffix}`,
  }
}
