import { Navigate, Route, Router } from "@solidjs/router"
import { UiAssetDetailPage } from "./pages/UiAssetDetailPage.jsx"
import { UiAssetListPage } from "./pages/UiAssetListPage.jsx"
import { UiAuditPage } from "./pages/UiAuditPage.jsx"
import { UiBackupsPage } from "./pages/UiBackupsPage.jsx"
import { UiCatalogPage } from "./pages/UiCatalogPage.jsx"
import { UiImportsPage } from "./pages/UiImportsPage.jsx"
import { UiJobsPage } from "./pages/UiJobsPage.jsx"
import { UiLoginPage } from "./pages/UiLoginPage.jsx"
import { UiNotFoundPage } from "./pages/UiNotFoundPage.jsx"
import { UiProjectListPage } from "./pages/UiProjectListPage.jsx"
import { UiProjectSettingsPage } from "./pages/UiProjectSettingsPage.jsx"
import { UiUploadPage } from "./pages/UiUploadPage.jsx"
import { UiShell } from "./shell/UiShell.jsx"
import { UiToastViewport } from "./toast/UiToastViewport.jsx"

/** Routes every admin view inside the authenticated shell. */
export function UiRouter() {
  return (
    <>
      <Router root={UiShell}>
        <Route path="/" component={UiProjectListPage} />
        <Route path="/login" component={UiLoginPage} />
        <Route path="/projects/:projectId" component={() => <Navigate href="assets" />} />
        <Route path="/projects/:projectId/settings" component={UiProjectSettingsPage} />
        <Route path="/projects/:projectId/assets" component={UiAssetListPage} />
        <Route path="/projects/:projectId/assets/:assetId" component={UiAssetDetailPage} />
        <Route path="/projects/:projectId/upload" component={UiUploadPage} />
        <Route path="/projects/:projectId/jobs" component={UiJobsPage} />
        <Route path="/projects/:projectId/backups" component={UiBackupsPage} />
        <Route path="/projects/:projectId/catalog" component={UiCatalogPage} />
        <Route path="/projects/:projectId/imports" component={UiImportsPage} />
        <Route path="/projects/:projectId/audit" component={UiAuditPage} />
        <Route path="*" component={UiNotFoundPage} />
      </Router>
      <UiToastViewport />
    </>
  )
}
