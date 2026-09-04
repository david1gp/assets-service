import { buildRouteMap } from "@stricli/core"
import { cliAuthLoginCommand } from "./cliAuthLoginCommand.js"
import { cliCatalogsRebuildCommand } from "./cliCatalogsRebuildCommand.js"
import { cliConfigShowCommand } from "./cliConfigShowCommand.js"
import { cliDeleteCommand } from "./cliDeleteCommand.js"
import { cliDiffCommand } from "./cliDiffCommand.js"
import { cliDoctorCommand } from "./cliDoctorCommand.js"
import { cliListCommand } from "./cliListCommand.js"
import { cliListsCommand } from "./cliListsCommand.js"
import { cliMetadataSetCommand } from "./cliMetadataSetCommand.js"
import { cliMetadataUnsetCommand } from "./cliMetadataUnsetCommand.js"
import { cliMoveCommand } from "./cliMoveCommand.js"
import { cliOutputsAddCommand } from "./cliOutputsAddCommand.js"
import { cliOutputsListCommand } from "./cliOutputsListCommand.js"
import { cliOutputsRemoveCommand } from "./cliOutputsRemoveCommand.js"
import { cliOutputsSetCommand } from "./cliOutputsSetCommand.js"
import { cliProjectsCreateCommand } from "./cliProjectsCreateCommand.js"
import { cliReprocessCommand } from "./cliReprocessCommand.js"
import { cliSettingsMigrateCommand } from "./cliSettingsMigrateCommand.js"
import { cliSettingsReadCommand } from "./cliSettingsReadCommand.js"
import { cliSettingsUpdateCommand } from "./cliSettingsUpdateCommand.js"
import { cliShowCommand } from "./cliShowCommand.js"
import { cliUploadAllCommand } from "./cliUploadAllCommand.js"
import { cliUploadCommand } from "./cliUploadCommand.js"
import { cliUploadsListCommand } from "./cliUploadsListCommand.js"

export const assetsCliRouteMap = buildRouteMap({
  docs: {
    brief: "Assets Service CLI",
  },
  routes: {
    auth: buildRouteMap({
      docs: { brief: "Authentication commands" },
      routes: {
        login: cliAuthLoginCommand,
      },
    }),
    projects: buildRouteMap({
      docs: { brief: "Project administration commands" },
      routes: {
        create: cliProjectsCreateCommand,
      },
    }),
    config: buildRouteMap({
      docs: { brief: "Configuration inspection commands" },
      routes: {
        show: cliConfigShowCommand,
      },
    }),
    doctor: cliDoctorCommand,
    diff: cliDiffCommand,
    uploads: buildRouteMap({
      docs: { brief: "Upload audit commands" },
      routes: {
        list: cliUploadsListCommand,
      },
    }),
    "upload-all": cliUploadAllCommand,
    upload: cliUploadCommand,
    reprocess: cliReprocessCommand,
    list: cliListCommand,
    show: cliShowCommand,
    outputs: buildRouteMap({
      docs: { brief: "Asset output definition commands" },
      routes: {
        list: cliOutputsListCommand,
        add: cliOutputsAddCommand,
        remove: cliOutputsRemoveCommand,
        set: cliOutputsSetCommand,
      },
    }),
    metadata: buildRouteMap({
      docs: { brief: "Asset metadata commands" },
      routes: {
        set: cliMetadataSetCommand,
        unset: cliMetadataUnsetCommand,
      },
    }),
    settings: buildRouteMap({
      docs: { brief: "Project storage settings commands" },
      routes: {
        read: cliSettingsReadCommand,
        update: cliSettingsUpdateCommand,
        migrate: cliSettingsMigrateCommand,
      },
    }),
    catalogs: buildRouteMap({
      docs: { brief: "Catalog management commands" },
      routes: {
        rebuild: cliCatalogsRebuildCommand,
      },
    }),
    move: cliMoveCommand,
    delete: cliDeleteCommand,
    lists: cliListsCommand,
  },
})
