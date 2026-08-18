import { serviceRuntimeConfigRead } from "../config/serviceRuntimeConfigRead.js"
import { doctorAdaptersProductionCreate } from "../doctor/doctorAdaptersProductionCreate.js"
import { doctorReportStringify } from "../doctor/doctorReportStringify.js"
import { doctorRunnerCreate } from "../doctor/doctorRunnerCreate.js"
import { zitadelJwksClientCreate } from "../infrastructure/zitadel/zitadelJwksClientCreate.js"
import { zitadelOidcClientCreate } from "../infrastructure/zitadel/zitadelOidcClientCreate.js"

export const doctorMain = async (): Promise<number> => {
  const config = serviceRuntimeConfigRead()
  if (!config.success) return operationFailure(config.errorMessage)

  const oidcClient = zitadelOidcClientCreate({ config: config.data.zitadel })
  const jwksClient = zitadelJwksClientCreate({ ttlSeconds: config.data.zitadel.jwksCacheTtlSeconds })
  const adapters = doctorAdaptersProductionCreate({
    config: config.data.service,
    zitadel: {
      config: config.data.zitadel,
      oidcClient,
      jwksClient,
    },
  })
  const report = await doctorRunnerCreate(adapters).run()
  process.stdout.write(doctorReportStringify(report))
  return report.status === "pass" ? 0 : 1
}

function operationFailure(message: string): number {
  process.stderr.write(`${message}\n`)
  return 1
}

if (import.meta.main) process.exit(await doctorMain())
