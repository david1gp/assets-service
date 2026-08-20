import { useParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { environmentSchema } from "../../project/environmentSchema.js"
import { projectBindingSchema } from "../../project/projectBindingSchema.js"
import { projectSchema } from "../../project/projectSchema.js"
import { type ProjectSettings, projectSettingsSchema } from "../../project/projectSettingsSchema.js"
import { projectSettingsUpdateSchema } from "../../project/projectSettingsUpdateSchema.js"
import { type EnvironmentName, environmentNameSchema } from "../../schemas/environmentNameSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiFormDraftKeyCreate } from "../storage/uiFormDraftKeyCreate.js"
import { uiFormDraftPersistenceCreate } from "../storage/uiFormDraftPersistenceCreate.js"
import { uiToastAdd } from "../toast/uiToastAdd.js"

export type UiEnvironmentDraft = {
  name: EnvironmentName
  r2Bucket: string
  r2Prefix: string
  publicBaseUrl: string
}

const environmentNames: readonly EnvironmentName[] = ["development", "production"]

const projectSettingsDraftSchema = v.strictObject({
  name: v.union([v.literal(""), projectSchema.entries.name]),
  defaultEnvironment: environmentNameSchema,
  binding: v.strictObject({
    zitadelProjectId: v.union([v.literal(""), projectBindingSchema.entries.zitadelProjectId]),
    serviceProjectId: v.union([v.literal(""), projectBindingSchema.entries.serviceProjectId]),
  }),
  environments: v.pipe(
    v.array(
      v.strictObject({
        name: environmentSchema.entries.name,
        r2Bucket: v.union([v.literal(""), environmentSchema.entries.r2Bucket]),
        r2Prefix: v.union([v.literal(""), environmentSchema.entries.r2Prefix]),
        publicBaseUrl: v.union([v.literal(""), environmentSchema.entries.publicBaseUrl]),
      }),
    ),
    v.minLength(1),
    v.maxLength(2),
  ),
})

type UiProjectSettingsDraft = v.InferOutput<typeof projectSettingsDraftSchema>

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
  const defaultEnvironment = createSignalObject<EnvironmentName>("development")
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

  const draft = uiFormDraftPersistenceCreate<UiProjectSettingsDraft>(
    () => uiFormDraftKeyCreate("project", projectId(), "settings"),
    projectSettingsDraftSchema,
    () => ({
      name: name.get(),
      defaultEnvironment: defaultEnvironment.get(),
      binding: {
        zitadelProjectId: zitadelProjectId.get(),
        serviceProjectId: serviceProjectId.get(),
      },
      environments: [...environments.get()],
    }),
  )
  let draftActive = false
  const hydratedDraft = draft.hydrate()
  if (hydratedDraft.success && hydratedDraft.data !== undefined) {
    draftActive = true
    name.set(hydratedDraft.data.name)
    defaultEnvironment.set(hydratedDraft.data.defaultEnvironment)
    zitadelProjectId.set(hydratedDraft.data.binding.zitadelProjectId)
    serviceProjectId.set(hydratedDraft.data.binding.serviceProjectId)
    environments.set(hydratedDraft.data.environments)
  }
  const draftChanged = () => {
    draftActive = true
    void draft.persist()
  }
  const nameDraft = draft.signalCreate(name, () => {
    draftActive = true
  })
  const defaultEnvironmentDraft = {
    get: defaultEnvironment.get,
    set: (value: string) => {
      const parsed = v.safeParse(environmentNameSchema, value)
      if (!parsed.success) return
      defaultEnvironment.set(parsed.output)
      draftActive = true
      void draft.persist()
    },
  }
  const zitadelProjectIdDraft = draft.signalCreate(zitadelProjectId, () => {
    draftActive = true
  })
  const serviceProjectIdDraft = draft.signalCreate(serviceProjectId, () => {
    draftActive = true
  })

  const query = uiQueryCreate<ProjectSettings>(
    async () => {
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiProjectSettingsPageRead", client.errorMessage)
      return client.data.projectSettingsRead(projectId())
    },
    {
      cacheKey: () => uiQueryCacheKeyCreate("project-settings", projectId()),
      cacheSchema: projectSettingsSchema,
    },
  )

  createEffect(() => {
    const settings = query.data()
    if (settings && !draftActive) draftsLoad(settings)
  })

  const environmentSet = (environmentName: EnvironmentName, field: keyof UiEnvironmentDraft, value: string) => {
    environments.set(
      environments.get().map((draft) => (draft.name === environmentName ? { ...draft, [field]: value } : draft)),
    )
    draftChanged()
  }

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
    await draft.clear()
    uiToastAdd({ tone: "positive", title: "Settings saved" })
    query.reload()
  }

  return {
    projectId,
    query,
    name: nameDraft,
    defaultEnvironment: defaultEnvironmentDraft,
    zitadelProjectId: zitadelProjectIdDraft,
    serviceProjectId: serviceProjectIdDraft,
    environments: environments.get,
    environmentSet,
    isSaving: saving.get,
    formError: formError.get,
    environmentNames,
    save,
    reset: () => {
      const settings = query.data()
      if (settings) {
        draftsLoad(settings)
        draftChanged()
      }
      formError.set(null)
    },
  }
}
