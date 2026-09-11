import { ErrorPage } from "#ui/static/pages/ErrorPage.jsx"
import { SetPageTitle } from "#ui/static/meta/SetPageTitle.jsx"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { ttc } from "../localization/ttc.js"
import { uiPaths } from "../routing/uiPaths.js"

/** Fallback view for unknown routes. */
export function UiNotFoundPage() {
  return (
    <>
      <SetPageTitle title={ttc("Page not found · Assets service", "Seite nicht gefunden · Medien-Service")} />
      <ErrorPage
        title={ttc("Page not found", "Seite nicht gefunden")}
        subtitle={ttc(
          "This link does not point to an available page.",
          "Dieser Link führt zu keiner verfügbaren Seite.",
        )}
      >
        <UiLinkButton class="mt-4" href={uiPaths.projects}>
          {ttc("Back to projects", "Zurück zu den Projekten")}
        </UiLinkButton>
      </ErrorPage>
    </>
  )
}
