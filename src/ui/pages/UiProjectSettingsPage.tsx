import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
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
import { ttc } from "../localization/ttc.js"

/** Edits the project identity, its Zitadel binding, and the storage bindings. */
export function UiProjectSettingsPage() {
  const state = uiProjectSettingsPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("Project settings", "Projekteinstellungen")}
        subtitle={ttc(
          "Project identity, authorization binding, and storage targets.",
          "Projektidentität, Autorisierungsbindung und Speicherziele.",
        )}
      />
      <UiQueryView query={state.query} loadingItem={ttc("project settings", "Projekteinstellungen")}>
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
              <h2 class="text-lg font-semibold">{ttc("Project", "Projekt")}</h2>
              <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label for="settings-name">{ttc("Name", "Name")}</Label>
                  <InputS id="settings-name" required valueSignal={state.name} disabled={state.isSaving()} />
                </div>
                <div>
                  <Label for="settings-default-environment">{ttc("Default environment", "Standardumgebung")}</Label>
                  <SelectSingleNative
                    id="settings-default-environment"
                    valueSignal={state.defaultEnvironment}
                    getOptions={() => [...state.environmentNames]}
                    disabled={state.isSaving()}
                  />
                </div>
                <div>
                  <Label for="settings-slug">{ttc("Slug", "Slug")}</Label>
                  <Input id="settings-slug" value={data.project.slug} readOnly disabled />
                </div>
                <div>
                  <Label for="settings-id">{ttc("Identifier", "Kennung")}</Label>
                  <Input id="settings-id" value={data.project.id} readOnly disabled class="font-mono" />
                </div>
              </div>
            </CardWrapper>

            <CardWrapper class="p-4">
              <h2 class="text-lg font-semibold">{ttc("Authorization binding", "Autorisierungsbindung")}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {ttc(
                  "Maps this project to its Zitadel project and to the identifier used in object keys.",
                  "Ordnet dieses Projekt seinem Zitadel-Projekt und der Kennung in Objektschlüsseln zu.",
                )}
              </p>
              <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label for="settings-zitadel-project">{ttc("Zitadel project ID", "Zitadel-Projekt-ID")}</Label>
                  <InputS
                    id="settings-zitadel-project"
                    required
                    valueSignal={state.zitadelProjectId}
                    disabled={state.isSaving()}
                  />
                </div>
                <div>
                  <Label for="settings-service-project">{ttc("Service project ID", "Service-Projekt-ID")}</Label>
                  <InputS
                    id="settings-service-project"
                    required
                    valueSignal={state.serviceProjectId}
                    disabled={state.isSaving()}
                  />
                </div>
              </div>
            </CardWrapper>

            <CardWrapper class="p-4">
              <h2 class="text-lg font-semibold">{ttc("Sign-in", "Anmeldung")}</h2>
              <p class="mt-1 text-sm text-muted-foreground">
                {ttc(
                  "Configure automatic sign-in for this browser.",
                  "Konfigurieren Sie die automatische Anmeldung für diesen Browser.",
                )}
              </p>
              <div class="mt-3">
                <Checkbox id="settings-auto-sign-in" checked={state.autoSignIn()} onChange={state.autoSignInSet}>
                  <span class="text-sm font-medium">{ttc("Sign in automatically", "Automatisch anmelden")}</span>
                </Checkbox>
              </div>
            </CardWrapper>

            <fieldset class="flex flex-col gap-4">
              <legend class="text-lg font-semibold">{ttc("Environment bindings", "Umgebungsbindungen")}</legend>
              <p class="text-sm text-muted-foreground">
                {ttc(
                  "Leave the bucket empty to skip an environment. The default environment must be configured.",
                  "Lasse den Bucket leer, um eine Umgebung zu überspringen. Die Standardumgebung muss konfiguriert sein.",
                )}
              </p>
              <For each={state.environments()}>
                {(environment) => (
                  <CardWrapper class="p-4">
                    <h3 class="font-semibold capitalize">{environment.name}</h3>
                    <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <Label for={`settings-${environment.name}-bucket`}>{ttc("R2 bucket", "R2-Bucket")}</Label>
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
                        <Label for={`settings-${environment.name}-prefix`}>
                          {ttc("Object key prefix (optional)", "Objektschlüsselpräfix (optional)")}
                        </Label>
                        <Input
                          id={`settings-${environment.name}-prefix`}
                          value={environment.r2Prefix}
                          placeholder={ttc("Leave empty for dedicated bucket", "Für einen eigenen Bucket leer lassen")}
                          aria-describedby={`settings-${environment.name}-prefix-hint`}
                          disabled={state.isSaving()}
                          onInput={(event) =>
                            state.environmentSet(environment.name, "r2Prefix", event.currentTarget.value)
                          }
                        />
                        <p id={`settings-${environment.name}-prefix-hint`} class="mt-1 text-xs text-muted-foreground">
                          {ttc(
                            "Leave empty for a dedicated bucket. Set a prefix only to namespace shared buckets.",
                            "Für einen eigenen Bucket leer lassen. Ein Präfix nur zum Namensraum gemeinsamer Buckets setzen.",
                          )}
                        </p>
                      </div>
                      <div>
                        <Label for={`settings-${environment.name}-url`}>
                          {ttc("Public base URL", "Öffentliche Basis-URL")}
                        </Label>
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
                {ttc("Save settings", "Einstellungen speichern")}
              </ButtonIcon>
              <ButtonIcon
                type="button"
                icon={mdiRestore}
                variant="outline"
                disabled={state.isSaving()}
                onClick={state.reset}
              >
                {ttc("Discard changes", "Änderungen verwerfen")}
              </ButtonIcon>
            </div>
          </form>
        )}
      </UiQueryView>
    </>
  )
}
