import { assetMetadataTable } from "./assetMetadataTable.js"
import { assetTable } from "./assetTable.js"
import { auditEventTable } from "./auditEventTable.js"
import { backupReceiptTable } from "./backupReceiptTable.js"
import { blobTable } from "./blobTable.js"
import { catalogGenerationTable } from "./catalogGenerationTable.js"
import { catalogOutputTable } from "./catalogOutputTable.js"
import { catalogTable } from "./catalogTable.js"
import { deletionStateTable } from "./deletionStateTable.js"
import { environmentTable } from "./environmentTable.js"
import { jobDependencyTable } from "./jobDependencyTable.js"
import { jobTable } from "./jobTable.js"
import { legacyImportTable } from "./legacyImportTable.js"
import { manifestTable } from "./manifestTable.js"
import { organizationTable } from "./organizationTable.js"
import { outboxEventTable } from "./outboxEventTable.js"
import { outputDefinitionTable } from "./outputDefinitionTable.js"
import { outputVersionTable } from "./outputVersionTable.js"
import { projectBindingTable } from "./projectBindingTable.js"
import { projectGrantTable } from "./projectGrantTable.js"
import { projectTable } from "./projectTable.js"
import { reconciliationRunTable } from "./reconciliationRunTable.js"
import { sourceRevisionTable } from "./sourceRevisionTable.js"
import { uploadTable } from "./uploadTable.js"
import { workflowTable } from "./workflowTable.js"

export const databaseSchema = {
  assetMetadataTable,
  assetTable,
  auditEventTable,
  backupReceiptTable,
  blobTable,
  catalogGenerationTable,
  catalogOutputTable,
  catalogTable,
  deletionStateTable,
  environmentTable,
  jobDependencyTable,
  jobTable,
  legacyImportTable,
  manifestTable,
  organizationTable,
  outboxEventTable,
  outputDefinitionTable,
  outputVersionTable,
  projectBindingTable,
  projectGrantTable,
  projectTable,
  reconciliationRunTable,
  sourceRevisionTable,
  uploadTable,
  workflowTable,
}
