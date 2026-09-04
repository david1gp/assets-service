import { buildApplication } from "@stricli/core"
import { packageVersion } from "../packageVersion.js"
import { assetsCliRouteMap } from "./assetsCliRouteMap.js"

export const assetsCliApplication = buildApplication(assetsCliRouteMap, {
  name: "assets",
  versionInfo: {
    currentVersion: packageVersion,
  },
  scanner: {
    caseStyle: "allow-kebab-for-camel",
  },
})
