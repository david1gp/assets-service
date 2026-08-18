import { ErrorPage } from "#ui/static/pages/ErrorPage.jsx"
import { SetPageTitle } from "#ui/static/meta/SetPageTitle.jsx"
import { UiLinkButton } from "../common/UiLinkButton.jsx"
import { uiPaths } from "../routing/uiPaths.js"

/** Fallback view for unknown routes. */
export function UiNotFoundPage() {
  return (
    <>
      <SetPageTitle title="Page not found · Assets service" />
      <ErrorPage title="Page not found" subtitle="This link does not point at a view of the assets admin.">
        <UiLinkButton class="mt-4" href={uiPaths.projects}>
          Back to projects
        </UiLinkButton>
      </ErrorPage>
    </>
  )
}
