import * as v from "valibot"

const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export const storageMigrationProgressSchema = v.pipe(
  v.strictObject({
    phase: v.picklist(["discovering", "copying", "verifying", "cutting_over", "completed"]),
    totalObjects: nonNegativeIntegerSchema,
    discoveredObjects: nonNegativeIntegerSchema,
    copiedObjects: nonNegativeIntegerSchema,
    verifiedObjects: nonNegativeIntegerSchema,
    totalBytes: nonNegativeIntegerSchema,
    copiedBytes: nonNegativeIntegerSchema,
    currentObjectKey: v.nullable(v.pipe(v.string(), v.minLength(1))),
  }),
  v.check(
    (input) =>
      input.discoveredObjects <= input.totalObjects &&
      input.copiedObjects <= input.discoveredObjects &&
      input.verifiedObjects <= input.copiedObjects &&
      input.copiedBytes <= input.totalBytes,
    "Migration progress counters are inconsistent",
  ),
)

export type StorageMigrationProgress = v.InferOutput<typeof storageMigrationProgressSchema>
