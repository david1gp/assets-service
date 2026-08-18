import { generatedListsSchema } from "../catalog/generatedListsSchema.js"

export const generatedListsResponseSchema = generatedListsSchema

export type GeneratedListsResponse = import("../catalog/generatedListsSchema.js").GeneratedLists
