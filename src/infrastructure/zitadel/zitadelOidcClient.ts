import type { PkceLoginRequest } from "../../authentication/pkceLoginRequestSchema.js"
import type { TokenResponse } from "../../authentication/tokenResponseSchema.js"
import type { Result } from "../../schemas/resultSchema.js"
import type { ZitadelOidcDiscovery } from "./zitadelOidcDiscoverySchema.js"
import type { ZitadelOrganizationMembership } from "./zitadelOrganizationMembershipSchema.js"
import type { ZitadelUserGrant } from "./zitadelUserGrantSchema.js"

export type ZitadelOidcClient = {
  discoveryRead: () => Promise<Result<ZitadelOidcDiscovery>>
  authorizationUrlCreate: (
    input: PkceLoginRequest & { state: string; codeChallenge: string; nonce: string },
  ) => Promise<Result<string>>
  authorizationCodeExchange: (code: string, codeVerifier: string) => Promise<Result<TokenResponse>>
  organizationMembershipRead: (
    accessToken: string,
    organizationId: string,
  ) => Promise<Result<ZitadelOrganizationMembership>>
  userGrantsRead?: (accessToken: string) => Promise<Result<readonly ZitadelUserGrant[]>>
}
