import type { Result } from "../../schemas/resultSchema.js"
import type { RcloneCommandOutput } from "./rcloneCommandOutput.js"
import type { RcloneCommandRequest } from "./rcloneCommandRequest.js"

export type RcloneCommandRunner = (request: RcloneCommandRequest) => Promise<Result<RcloneCommandOutput>>
