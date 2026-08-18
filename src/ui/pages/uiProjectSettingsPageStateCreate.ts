import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as v from "valibot"
import type { ProjectSettings } from "../../project/projectSettingsSchema.js"
import { projectSettingsUpdateSchema } from "../../project/projectSettingsUpdateSchema.js"
import type { EnvironmentName } from "../../schemas/environmentNameSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

export type UiEnvironmentDraft = {
  name: EnvironmentName
  r2Bucket: string
  r2Prefix: string
  publicBaseUrl: string
}

const environmentNames: readonly EnvironmentName[] = ["development", "production"]

const environmentDraftsRead = (settings: ProjectSettings): UiEnvironmentDraft[] =>
  environmentNames.map((name) => {
    const existing = settings.environments.find((environment) => environment.name === name)
    return {
      name,
      r2Bucket: existing?.r2Bucket ?? "",
      r2Prefix: existing?.r2Prefix ?? "",
      publicBaseUrl: existing?.publicBaseUrl ?? "",
    }
  })

/** Loads the project settings and drives the editable binding form. */
export const uiProjectSettingsPageStateCreate = () => {
  const params = useParams<{ projectId: string }>()
  const projectId = createMemo(() => params.projectId)

  const name = createSignalObject("")
  const defaultEnvironment = createSignalObject<string>("development")
  const zitadelProjectId = createSignalObject("")
  const serviceProjectId = createSignalObject("")
  const environments = createSignalObject<readonly UiEnvironmentDraft[]>([])
  const saving = createSignalObject(false)
  const formError = createSignalObject<string | null>(null)

  const draftsLoad = (settings: ProjectSettings) => {
    name.set(settings.project.name)
    defaultEnvironment.set(settings.project.defaultEnvironment)
    zitadelProjectId.set(settings.binding?.zitadelProjectId ?? "")
    serviceProjectId.set(settings.binding?.serviceProjectId ?? "")
    environments.set(environmentDraftsRead(settings))
  }

  const query = uiQueryCreate<ProjectSettings>(async () => {
    const client = uiApiClientRead()
    if (!client.success) return resultErrorCreate("uiProjectSettingsPageRead", client.errorMessage)
    const settings = await client.data.projectSettingsRead(projectId())
    if (settings.success) draftsLoad(settings.data)
    return settings
  })

  const environmentSet = (environmentName: EnvironmentName, field: keyof UiEnvironmentDraft, value: string) =>
    environments.set(
      environments.get().map((draft) => (draft.name === environmentName ? { ...draft, [field]: value } : draft)),
    )

  const updateRead = () =>
    v.safeParse(projectSettingsUpdateSchema, {
      name: name.get().trim(),
      defaultEnvironment: defaultEnvironment.get(),
      binding: { zitadelProjectId: zitadelProjectId.get().trim(), serviceProjectId: serviceProjectId.get().trim() },
      environments: environments
        .get()
        .filter((draft) => draft.r2Bucket.trim().length > 0)
        .map((draft) => ({
          name: draft.name,
          r2Bucket: draft.r2Bucket.trim(),
          r2Prefix: draft.r2Prefix.trim(),
          publicBaseUrl: draft.publicBaseUrl.trim(),
        })),
    })

  const save = async () => {
    const update = updateRead()
    if (!update.success) {
      formError.set(v.summarize(update.issues))
      return
    }
    const client = uiApiClientRead()
    if (!client.success) {
      formError.set(client.errorMessage)
      return
    }
    formError.set(null)
    saving.set(true)
    const written = await client.data.projectSettingsWrite(projectId(), update.output)
    saving.set(false)
    if (!written.success) {
      formError.set(written.errorMessage)
      uiToastAdd({ tone: "negative", title: "Settings not saved", description: written.errorMessage })
      return
    }
    draftsLoad(written.data)
    uiToastAdd({ tone: "positive", title: "Settings saved" })
    query.reload()
  }

  return {
    projectId,
    query,
    name,
    defaultEnvironment,
    zitadelProjectId,
    serviceProjectId,
    environments: environments.get,
    environmentSet,
    isSaving: saving.get,
    formError: formError.get,
    environmentNames,
    save,
    reset: () => {
      const settings = query.data()
      if (settings) draftsLoad(settings)
      formError.set(null)
    },
  }
}
