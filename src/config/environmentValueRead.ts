export const environmentValueRead = (
  sourceEnvironment: NodeJS.ProcessEnv,
  fileEnvironment: Readonly<Record<string, string>>,
  aliases: readonly string[],
) => {
  for (const alias of aliases) {
    const value = sourceEnvironment[alias]
    if (value !== undefined) return { value, source: "process-environment" as const }
  }
  for (const alias of aliases) {
    const value = fileEnvironment[alias]
    if (value !== undefined) return { value, source: "env-file" as const }
  }
  return { value: undefined, source: "unresolved" as const }
}
