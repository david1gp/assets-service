import * as v from "valibot"

export const projectArchiveStateSchema = v.picklist(["active", "archiving", "archived", "unarchiving"])

export type ProjectArchiveState = v.InferOutput<typeof projectArchiveStateSchema>
