import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { mdiContentSave } from "@adaptive-ds/mdi/mdiContentSave.js"
import { mdiRestore } from "@adaptive-ds/mdi/mdiRestore.js"
import { For, Show } from "solid-js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiProjectSettingsPageStateCreate } from "./uiProjectSettingsPageStateCreate.js"
import { UiNotice } from "../common/UiNotice.jsx"

/** Edits the project identity, its Zitadel binding, and the storage bindings. */
export function UiProjectSettingsPage() {
  const state = uiProjectSettingsPageStateCreate()

  return (
    <>
      <UiPageHeading
        title="Project settings"
        subtitle="Project identity, authorization binding, and storage targets."
      />
      <UiQueryView query={state.query} loadingItem="project settings">
        {(data) => (
          <form
            class="flex max-w-3xl flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              void state.save()
            }}
          >
            <Show when={state.formError()}>
              {(message) => (
                <UiNotice tone="negative" role="alert">
                  {message()}
                </UiNotice>
              )}
            </Show>

            <CardWrapper class="p-4">
              <h2 class="text-lg font-semibold">Project</h2>
              <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label for="settings-name">Name</Label>
                  <InputS id="settings-name" required valueSignal={state.name} disabled={state.isSaving()} />
                </div>
                <div>
                  <Label for="settings-default-environment">Default environment</Label>
                  <SelectSingleNative
                    id="settings-default-environment"
                    valueSignal={state.defaultEnvironment}
                    getOptions={() => [...state.environmentNames]}
                    disabled={state.isSaving()}
                  />
                </div>
                <div>
                  <Label for="settings-slug">Slug</Label>
                  <Input id="settings-slug" value={data.project.slug} readOnly disabled />
                </div>
                <div>
                  <Label for="settings-id">Identifier</Label>
                  <Input id="settings-id" value={data.project.id} readOnly disabled class="font-mono" />
                </div>
              </div>
            </CardWrapper>

            <CardWrapper class="p-4">
              <h2 class="text-lg font-semibold">Authorization binding</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                Maps this project to its Zitadel project and to the identifier used in object keys.
              </p>
              <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label for="settings-zitadel-project">Zitadel project ID</Label>
                  <InputS
                    id="settings-zitadel-project"
                    required
                    valueSignal={state.zitadelProjectId}
                    disabled={state.isSaving()}
                  />
                </div>
                <div>
                  <Label for="settings-service-project">Service project ID</Label>
                  <InputS
                    id="settings-service-project"
                    required
                    valueSignal={state.serviceProjectId}
                    disabled={state.isSaving()}
                  />
                </div>
              </div>
            </CardWrapper>

            <fieldset class="flex flex-col gap-4">
              <legend class="text-lg font-semibold">Environment bindings</legend>
              <p class="text-sm text-muted-foreground">
                Leave the bucket empty to skip an environment. The default environment must be configured.
              </p>
              <For each={state.environments()}>
                {(environment) => (
                  <CardWrapper class="p-4">
                    <h3 class="font-semibold capitalize">{environment.name}</h3>
                    <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <Label for={`settings-${environment.name}-bucket`}>R2 bucket</Label>
                        <Input
                          id={`settings-${environment.name}-bucket`}
                          value={environment.r2Bucket}
                          disabled={state.isSaving()}
                          onInput={(event) =>
                            state.environmentSet(environment.name, "r2Bucket", event.currentTarget.value)
                          }
                        />
                      </div>
                      <div>
                        <Label for={`settings-${environment.name}-prefix`}>Object key prefix</Label>
                        <Input
                          id={`settings-${environment.name}-prefix`}
                          value={environment.r2Prefix}
                          disabled={state.isSaving()}
                          onInput={(event) =>
                            state.environmentSet(environment.name, "r2Prefix", event.currentTarget.value)
                          }
                        />
                      </div>
                      <div>
                        <Label for={`settings-${environment.name}-url`}>Public base URL</Label>
                        <Input
                          id={`settings-${environment.name}-url`}
                          type="url"
                          value={environment.publicBaseUrl}
                          disabled={state.isSaving()}
                          onInput={(event) =>
                            state.environmentSet(environment.name, "publicBaseUrl", event.currentTarget.value)
                          }
                        />
                      </div>
                    </div>
                  </CardWrapper>
                )}
              </For>
            </fieldset>

            <div class="flex flex-wrap gap-2">
              <ButtonIcon type="submit" icon={mdiContentSave} isLoading={state.isSaving()}>
                Save settings
              </ButtonIcon>
              <ButtonIcon
                type="button"
                icon={mdiRestore}
                variant="outline"
                disabled={state.isSaving()}
                onClick={state.reset}
              >
                Discard changes
              </ButtonIcon>
            </div>
          </form>
        )}
      </UiQueryView>
    </>
  )
}
