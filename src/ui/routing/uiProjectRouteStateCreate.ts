import { useLocation, useParams } from "@solidjs/router"
import { createEffect, createMemo } from "solid-js"
import * as v from "valibot"
import { createSignalObject } from "#ui/utils/createSignalObject.js"
import { type Project, projectSchema } from "../../project/projectSchema.js"
import { resultErrorCreate } from "../../schemas/resultErrorCreate.js"
import { uiApiClientRead } from "../client/uiApiClientRead.js"
import { uiQueryCacheKeyCreate } from "../query/uiQueryCacheKeyCreate.js"
import { uiQueryCreate } from "../query/uiQueryCreate.js"
import { uiSessionStore } from "../session/uiSessionStore.js"
import { uiProjectIdFromPathnameRead } from "../shell/uiProjectIdFromPathnameRead.js"
import { uiProjectRouteStore } from "./uiProjectRouteStore.js"

/** Resolves canonical route slugs to the existing ID-based project API context. */
export const uiProjectRouteStateCreate = () => {
  const params = useParams<{ orgSlug?: string; projectSlug?: string; projectId?: string }>()
  const location = useLocation()
  const routeOrganizationSlug = createMemo(() => params.orgSlug ?? "")
  const routeProjectSlug = createMemo(() => params.projectSlug ?? "")
  const legacyProjectId = createMemo(() => params.projectId ?? uiProjectIdFromPathnameRead(location.pathname) ?? "")
  const resolvedOrganizationSlug = createSignalObject("")

  const projectQuery = uiQueryCreate<Project | null>(
    async () => {
      if (uiSessionStore.get().status !== "authenticated") return { success: true, data: null }
      const client = uiApiClientRead()
      if (!client.success) return resultErrorCreate("uiProjectRouteRead", client.errorMessage)
      if (legacyProjectId() !== "") {
        if (typeof client.data.projectRead !== "function") return { success: true, data: null }
        const project = await client.data.projectRead(legacyProjectId())
        if (!project.success || project.data === null) return project
        if (typeof client.data.authOrganizationsRead !== "function") return project
        const organizations = await client.data.authOrganizationsRead()
        if (organizations.success) {
          resolvedOrganizationSlug.set(
            organizations.data.organizations.find((item) => item.id === project.data?.organizationId)?.slug ?? "",
          )
        }
        if (resolvedOrganizationSlug.get() === "" && typeof client.data.projectsReadAll === "function") {
          const projects = await client.data.projectsReadAll()
          if (projects.success) {
            resolvedOrganizationSlug.set(
              projects.data.find((item) => item.id === project.data.id)?.organizationSlug ?? "",
            )
          }
        }
        return project
      }
      if (routeOrganizationSlug() === "" || routeProjectSlug() === "") return { success: true, data: null }

      if (typeof client.data.projectsReadAll !== "function") return { success: true, data: null }
      const projects = await client.data.projectsReadAll({ includeArchived: true })
      if (!projects.success) return projects
      const project = projects.data.find(
        (item) => item.slug === routeProjectSlug() && item.organizationSlug === routeOrganizationSlug(),
      )
      return {
        success: true,
        data:
          project === undefined
            ? null
            : {
                id: project.id,
                organizationId: project.organizationId,
                name: project.name,
                slug: project.slug,
                defaultEnvironment: project.defaultEnvironment,
                ...(project.archiveState === undefined ? {} : { archiveState: project.archiveState }),
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              },
      }
    },
    {
      cacheKey: () =>
        uiSessionStore.get().status !== "authenticated"
          ? undefined
          : uiQueryCacheKeyCreate(
              "project-route",
              `${routeOrganizationSlug()}:${routeProjectSlug()}:${legacyProjectId()}`,
            ),
      cacheSchema: v.nullable(projectSchema),
    },
  )

  const projectId = createMemo(() => projectQuery.data()?.id ?? legacyProjectId())
  const organizationSlug = createMemo(
    () =>
      routeOrganizationSlug() || resolvedOrganizationSlug.get() || uiProjectRouteStore.get()?.organizationSlug || "",
  )
  const projectSlug = createMemo(() => projectQuery.data()?.slug ?? routeProjectSlug())

  createEffect(() => {
    const project = projectQuery.data()
    if (project === null || organizationSlug() === "") return
    uiProjectRouteStore.set({ organizationSlug: organizationSlug(), projectSlug: project.slug, projectId: project.id })
  })

  return { projectQuery, projectId, organizationSlug, projectSlug }
}
