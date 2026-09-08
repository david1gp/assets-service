import { Navigate, Route, Router } from "@solidjs/router"
import { UiAssetDetailPage } from "./pages/UiAssetDetailPage.jsx"
import { UiAssetListPage } from "./pages/UiAssetListPage.jsx"
import { UiAuditPage } from "./pages/UiAuditPage.jsx"
import { UiBackupsPage } from "./pages/UiBackupsPage.jsx"
import { UiCatalogPage } from "./pages/UiCatalogPage.jsx"
import { UiContributorAssetDetailPage } from "./pages/UiContributorAssetDetailPage.jsx"
import { UiContributorAssetListPage } from "./pages/UiContributorAssetListPage.jsx"
import { UiContributorLandingPage } from "./pages/UiContributorLandingPage.jsx"
import { UiJobsPage } from "./pages/UiJobsPage.jsx"
import { UiLoginPage } from "./pages/UiLoginPage.jsx"
import { UiNotFoundPage } from "./pages/UiNotFoundPage.jsx"
import { UiProjectListPage } from "./pages/UiProjectListPage.jsx"
import { UiProjectSettingsPage } from "./pages/UiProjectSettingsPage.jsx"
import { UiUploadPage } from "./pages/UiUploadPage.jsx"
import { UiLegacyRouteRedirect } from "./routing/UiLegacyRouteRedirect.jsx"
import { UiModeRoute } from "./routing/UiModeRoute.jsx"
import { UiShell } from "./shell/UiShell.jsx"
import { UiToastViewport } from "./toast/UiToastViewport.jsx"

/** Routes every authenticated admin and contributor view inside the shared shell. */
export function UiRouter() {
  return (
    <>
      <Router root={UiShell}>
        <Route path="/" component={UiProjectListPage} />
        <Route path="/login" component={UiLoginPage} />

        <Route path="/projects/:projectId" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/settings" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/assets" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/assets/:assetId" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/upload" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/jobs" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/backups" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/catalog" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/audit" component={UiLegacyRouteRedirect} />

        <Route
          path="/projects/:projectId/admin"
          component={() => (
            <UiModeRoute mode="admin">
              <Navigate href="assets" />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/settings"
          component={() => (
            <UiModeRoute mode="admin">
              <UiProjectSettingsPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/assets"
          component={() => (
            <UiModeRoute mode="admin">
              <UiAssetListPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/assets/:assetId"
          component={() => (
            <UiModeRoute mode="admin">
              <UiAssetDetailPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/upload"
          component={() => (
            <UiModeRoute mode="admin">
              <UiUploadPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/jobs"
          component={() => (
            <UiModeRoute mode="admin">
              <UiJobsPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/backups"
          component={() => (
            <UiModeRoute mode="admin">
              <UiBackupsPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/catalog"
          component={() => (
            <UiModeRoute mode="admin">
              <UiCatalogPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/admin/audit"
          component={() => (
            <UiModeRoute mode="admin">
              <UiAuditPage />
            </UiModeRoute>
          )}
        />

        <Route
          path="/projects/:projectId/contributor"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiContributorLandingPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/contributor/assets"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiContributorAssetListPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/contributor/assets/:assetId"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiContributorAssetDetailPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/projects/:projectId/contributor/upload"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiUploadPage />
            </UiModeRoute>
          )}
        />
        <Route path="*" component={UiNotFoundPage} />
      </Router>
      <UiToastViewport />
    </>
  )
}
