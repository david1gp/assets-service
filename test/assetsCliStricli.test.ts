import { expect, test } from "bun:test"
import { run } from "@stricli/core"
import {
  assetsCliApplication,
  assetsCliRouteMap,
  cliAuthLoginCommand,
  cliCatalogsRebuildCommand,
  cliConfigShowCommand,
  cliDeleteCommand,
  cliDiffCommand,
  cliDoctorCommand,
  cliGlobalFlags,
  cliListCommand,
  cliListsCommand,
  cliMetadataSetCommand,
  cliMetadataUnsetCommand,
  cliMoveCommand,
  cliOutputsAddCommand,
  cliOutputsListCommand,
  cliOutputsRemoveCommand,
  cliOutputsSetCommand,
  cliProjectsCreateCommand,
  cliReprocessCommand,
  cliSettingsMigrateCommand,
  cliSettingsReadCommand,
  cliSettingsUpdateCommand,
  cliShowCommand,
  cliSourceDirectoryFlags,
  cliUploadAllCommand,
  cliUploadCommand,
  cliUploadsListCommand,
  cliWaitFlags,
} from "../src/library.js"

test("assetsCliApplication is built and prints help using stricli runner", async () => {
  const output: string[] = []
  const proc = {
    stdout: { write: (text: string) => output.push(text) },
    stderr: { write: () => undefined },
  }

  await run(assetsCliApplication, ["--help"], { process: proc })

  const helpText = output.join("")
  expect(helpText).toContain("Assets Service CLI")
  expect(helpText).toContain("auth")
  expect(helpText).toContain("projects")
  expect(helpText).toContain("config")
  expect(helpText).toContain("doctor")
  expect(helpText).toContain("diff")
  expect(helpText).toContain("upload-all")
  expect(helpText).toContain("upload")
  expect(helpText).toContain("settings")
})

test("assetsCliRouteMap routes and subroutes are defined", () => {
  expect(assetsCliRouteMap).toBeDefined()
  expect(cliGlobalFlags).toBeDefined()
  expect(cliSourceDirectoryFlags).toBeDefined()
  expect(cliWaitFlags).toBeDefined()
})

test("command definitions have parameters, documentation, and camelCase flags", () => {
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("defaultEnvironment")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("serviceProjectId")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("zitadelProjectId")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("developmentR2Bucket")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("developmentR2Prefix")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("developmentPublicBaseUrl")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("productionR2Bucket")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("productionR2Prefix")
  expect(cliProjectsCreateCommand.parameters.flags).toHaveProperty("productionPublicBaseUrl")

  expect(cliUploadAllCommand.parameters.flags).toHaveProperty("integrationNote")
  expect(cliUploadAllCommand.parameters.flags).toHaveProperty("dryRun")
  expect(cliUploadCommand.parameters.flags).toHaveProperty("integrationNote")
  expect(cliSettingsMigrateCommand.parameters.flags).toHaveProperty("r2Bucket")
  expect(cliSettingsMigrateCommand.parameters.flags).toHaveProperty("customDomain")
  expect(cliSettingsMigrateCommand.parameters.flags).toHaveProperty("wranglerProfile")
  expect(cliListsCommand.parameters.flags).toHaveProperty("outputDir")
  expect(cliListsCommand.parameters.flags).toHaveProperty("imageList")

  expect(cliAuthLoginCommand.brief).toBeTruthy()
  expect(cliCatalogsRebuildCommand.brief).toBeTruthy()
  expect(cliConfigShowCommand.brief).toBeTruthy()
  expect(cliDeleteCommand.brief).toBeTruthy()
  expect(cliDiffCommand.brief).toBeTruthy()
  expect(cliDoctorCommand.brief).toBeTruthy()
  expect(cliListCommand.brief).toBeTruthy()
  expect(cliMetadataSetCommand.brief).toBeTruthy()
  expect(cliMetadataUnsetCommand.brief).toBeTruthy()
  expect(cliMoveCommand.brief).toBeTruthy()
  expect(cliOutputsAddCommand.brief).toBeTruthy()
  expect(cliOutputsListCommand.brief).toBeTruthy()
  expect(cliOutputsRemoveCommand.brief).toBeTruthy()
  expect(cliOutputsSetCommand.brief).toBeTruthy()
  expect(cliReprocessCommand.brief).toBeTruthy()
  expect(cliSettingsReadCommand.brief).toBeTruthy()
  expect(cliSettingsUpdateCommand.brief).toBeTruthy()
  expect(cliShowCommand.brief).toBeTruthy()
  expect(cliUploadsListCommand.brief).toBeTruthy()
})
