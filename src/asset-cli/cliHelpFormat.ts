import { type CliCommandHelp } from "./cliCommandHelp.js"

export const cliHelpFormat = (help: CliCommandHelp): string => {
  const lines: string[] = ["Usage:", "  assets <command> [options]\n", "Commands:"]
  for (const cmd of help.commands) {
    lines.push(`  ${cmd}`)
  }
  lines.push("\nGlobal Options:")
  for (const opt of help.globalOptions) {
    lines.push(`  ${opt}`)
  }
  lines.push("\nSubcommand Options:")
  for (const [subcmd, opts] of Object.entries(help.subcommands)) {
    if (opts.length > 0) {
      lines.push(`  ${subcmd}:`)
      for (const opt of opts) {
        lines.push(`    ${opt}`)
      }
    }
  }
  return `${lines.join("\n")}\n`
}
