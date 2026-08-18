import { projectSourceConfigurationDefaults } from "./projectSourceConfigurationDefaults.js"
import type { ProjectSourceConfigurationInput } from "./projectSourceConfigurationInputSchema.js"
import type { ProjectSourceConfiguration } from "./projectSourceConfigurationSchema.js"

export const projectSourceConfigurationMerge = (
  configuration: ProjectSourceConfigurationInput,
  overrides: ProjectSourceConfigurationInput = {},
): ProjectSourceConfiguration => ({
  ...projectSourceConfigurationDefaults,
  ...configuration,
  ...overrides,
})
