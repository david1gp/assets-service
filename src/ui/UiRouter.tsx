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

        <Route
          path="/orgs/:orgSlug/projects/:projectSlug"
          component={() => (
            <UiModeRoute mode="admin">
              <Navigate href="admin/assets" />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin"
          component={() => (
            <UiModeRoute mode="admin">
              <Navigate href="assets" />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/settings"
          component={() => (
            <UiModeRoute mode="admin">
              <UiProjectSettingsPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/assets"
          component={() => (
            <UiModeRoute mode="admin">
              <UiAssetListPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/assets/:assetId"
          component={() => (
            <UiModeRoute mode="admin">
              <UiAssetDetailPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/upload"
          component={() => (
            <UiModeRoute mode="admin">
              <UiUploadPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/jobs"
          component={() => (
            <UiModeRoute mode="admin">
              <UiJobsPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/backups"
          component={() => (
            <UiModeRoute mode="admin">
              <UiBackupsPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/catalog"
          component={() => (
            <UiModeRoute mode="admin">
              <UiCatalogPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/admin/audit"
          component={() => (
            <UiModeRoute mode="admin">
              <UiAuditPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/contributor"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiContributorLandingPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/contributor/assets"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiContributorAssetListPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/contributor/assets/:assetId"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiContributorAssetDetailPage />
            </UiModeRoute>
          )}
        />
        <Route
          path="/orgs/:orgSlug/projects/:projectSlug/contributor/upload"
          component={() => (
            <UiModeRoute mode="contributor">
              <UiUploadPage />
            </UiModeRoute>
          )}
        />

        <Route path="/projects/:projectId" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/settings" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/assets" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/assets/:assetId" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/upload" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/jobs" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/backups" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/catalog" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/audit" component={UiLegacyRouteRedirect} />

        <Route path="/projects/:projectId/admin" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/settings" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/assets" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/assets/:assetId" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/upload" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/jobs" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/backups" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/catalog" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/admin/audit" component={UiLegacyRouteRedirect} />

        <Route path="/projects/:projectId/contributor" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/contributor/assets" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/contributor/assets/:assetId" component={UiLegacyRouteRedirect} />
        <Route path="/projects/:projectId/contributor/upload" component={UiLegacyRouteRedirect} />
        <Route path="*" component={UiNotFoundPage} />
      </Router>
      <UiToastViewport />
    </>
  )
}
