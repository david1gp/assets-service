import { describe, expect, test } from "bun:test"

import { apiProjectAuthorizationReadBySlugs } from "../src/api/apiProjectAuthorizationReadBySlugs.js"
import type { RequestAuthentication } from "../src/authentication/requestAuthenticationSchema.js"
import type { ProjectRepository } from "../src/project/projectRepository.js"

const organization = {
  id: "organization-1",
  name: "Example",
  slug: "example",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
}
const project = {
  id: "project-1",
  organizationId: organization.id,
  name: "Example project",
  slug: "site",
  defaultEnvironment: "development" as const,
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt,
}
const binding = {
  id: "binding-1",
  projectId: project.id,
  organizationId: organization.id,
  zitadelProjectId: "zitadel-project-1",
  serviceProjectId: "service-project-1",
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt,
}
const authentication = {
  principal: {
    subjectId: "subject-1",
    organizationId: organization.id,
    mode: "admin" as const,
    organizationAdmin: false,
    method: "human_session" as const,
    grants: [{ projectId: binding.zitadelProjectId, roles: ["contributor" as const] }],
    issuedAt: 1,
    expiresAt: 2,
  },
} satisfies RequestAuthentication

const projectRepository = {
  organizationReadBySlug: (slug: string) => ({
    success: true as const,
    data: slug === organization.slug ? organization : null,
  }),
  projectReadByOrganizationIdAndSlug: (organizationId: string, slug: string) => ({
    success: true as const,
    data: organizationId === organization.id && slug === project.slug ? project : null,
  }),
  projectBindingRead: (identifier: string) => ({
    success: true as const,
    data: identifier === project.id ? binding : null,
  }),
  projectRead: (identifier: string) => ({ success: true as const, data: identifier === project.id ? project : null }),
} as ProjectRepository

describe("apiProjectAuthorizationReadBySlugs", () => {
  test("resolves slugs before applying ID-based authorization", () => {
    const result = apiProjectAuthorizationReadBySlugs(
      organization.slug,
      project.slug,
      authentication,
      projectRepository,
      "contributor",
    )

    expect(result).toMatchObject({
      success: true,
      data: { project: { id: project.id }, binding: { projectId: project.id } },
    })
  })

  test("does not resolve a project slug outside its organization", () => {
    const result = apiProjectAuthorizationReadBySlugs(
      organization.slug,
      "missing",
      authentication,
      projectRepository,
      "contributor",
    )

    expect(result).toEqual({
      success: false,
      op: "apiProjectAuthorizationReadBySlugs",
      errorMessage: "The project was not found",
    })
  })

  test("authorizes the selected organization when project slugs repeat across organizations", () => {
    const otherOrganization = { ...organization, id: "organization-2", name: "Other", slug: "other" }
    const otherProject = { ...project, id: "project-2", organizationId: otherOrganization.id }
    const otherBinding = {
      ...binding,
      id: "binding-2",
      projectId: otherProject.id,
      organizationId: otherOrganization.id,
      zitadelProjectId: "zitadel-project-2",
      serviceProjectId: "service-project-2",
    }
    const repository = {
      ...projectRepository,
      organizationReadBySlug: (slug: string) => ({
        success: true as const,
        data: slug === organization.slug ? organization : slug === otherOrganization.slug ? otherOrganization : null,
      }),
      projectReadByOrganizationIdAndSlug: (organizationId: string, slug: string) => ({
        success: true as const,
        data:
          slug !== project.slug
            ? null
            : organizationId === organization.id
              ? project
              : organizationId === otherOrganization.id
                ? otherProject
                : null,
      }),
      projectBindingRead: (identifier: string) => ({
        success: true as const,
        data: identifier === project.id ? binding : identifier === otherProject.id ? otherBinding : null,
      }),
      projectRead: (identifier: string) => ({
        success: true as const,
        data: identifier === project.id ? project : identifier === otherProject.id ? otherProject : null,
      }),
    } as ProjectRepository

    const selectedOrganization = apiProjectAuthorizationReadBySlugs(
      otherOrganization.slug,
      otherProject.slug,
      authentication,
      repository,
      "contributor",
    )
    expect(selectedOrganization).toMatchObject({
      success: false,
      errorMessage: "The organization grant was invalid",
    })

    const otherAuthentication = {
      ...authentication,
      principal: {
        ...authentication.principal,
        organizationId: otherOrganization.id,
        grants: [{ projectId: otherBinding.zitadelProjectId, roles: ["contributor" as const] }],
      },
    }
    expect(
      apiProjectAuthorizationReadBySlugs(
        otherOrganization.slug,
        otherProject.slug,
        otherAuthentication,
        repository,
        "contributor",
      ),
    ).toMatchObject({ success: true, data: { project: { id: otherProject.id } } })
    expect(
      apiProjectAuthorizationReadBySlugs(
        otherOrganization.slug,
        otherProject.slug,
        otherAuthentication,
        repository,
        "admin",
      ),
    ).toMatchObject({ success: false, errorMessage: "The admin role was required" })
  })
})
