export type ServicePatPrincipalValidateOptions = {
  issuer: string
  organizationId: string
  allowedOrganizationIds?: readonly string[]
  projectId?: string
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
  now?: () => number
  projectProvisionerSubjectId?: string
  projectProvisionerSubjectIds?: readonly string[]
}
