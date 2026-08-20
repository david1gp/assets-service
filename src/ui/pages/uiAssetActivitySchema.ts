import * as v from "valibot"

import { backupReceiptSchema } from "../../backup/backupReceiptSchema.js"
import { deletionStateSchema } from "../../deletion/deletionStateSchema.js"
import { environmentSchema } from "../../project/environmentSchema.js"
import { workflowSchema } from "../../workflow/workflowSchema.js"

export const uiAssetActivitySchema = v.strictObject({
  environment: v.nullable(environmentSchema),
  workflows: v.array(workflowSchema),
  backups: v.array(backupReceiptSchema),
  deletion: v.nullable(deletionStateSchema),
})

export type UiAssetActivity = v.InferOutput<typeof uiAssetActivitySchema>
