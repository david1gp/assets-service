export type ServicePatPrincipalValidateOptions = {
  issuer: string
  organizationId: string
  projectId?: string
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
  now?: () => number
}
