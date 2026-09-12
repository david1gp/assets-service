export const rcloneBackupRemotePathValidate = (path: string): boolean => {
  if (!path.startsWith("gdrive_beta:backups/")) return false
  const remainder = path.slice("gdrive_beta:backups/".length)
  return (
    remainder.length > 0 &&
    !/\p{Cc}/u.test(path) &&
    !remainder.includes("\\") &&
    !remainder.includes(":") &&
    remainder.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  )
}
