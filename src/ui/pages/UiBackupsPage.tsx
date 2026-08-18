import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { BackupReceipt } from "../../backup/backupReceiptSchema.js"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiBackupsPageStateCreate } from "./uiBackupsPageStateCreate.js"

const columns: TableColumnDef<BackupReceipt>[] = [
  {
    id: "remotePath",
    name: "Remote path",
    data: (receipt) => receipt.remotePath,
    cell: (receipt) => <span class="wrap-anywhere font-mono text-sm">{receipt.remotePath}</span>,
  },
  {
    id: "checkResult",
    name: "Verification",
    data: (receipt) => receipt.checkResult,
    cell: (receipt) => (
      <UiStatusBadge tone={receipt.checkResult === "verified" ? "positive" : "negative"}>
        {receipt.checkResult}
      </UiStatusBadge>
    ),
  },
  {
    id: "byteSize",
    name: "Size",
    data: (receipt) => receipt.byteSize,
    cell: (receipt) => uiByteSizeFormat(receipt.byteSize),
  },
  {
    id: "completedAt",
    name: "Completed",
    data: (receipt) => receipt.completedAt,
    cell: (receipt) => <time datetime={receipt.completedAt}>{receipt.completedAt.slice(0, 19).replace("T", " ")}</time>,
  },
]

/** Lists the backup receipts recorded before publication. */
export function UiBackupsPage() {
  const state = uiBackupsPageStateCreate()

  return (
    <>
      <UiPageHeading title="Backups" subtitle="Verified copies written before any asset was published." />
      <UiQueryView
        query={state.query}
        loadingItem="backups"
        emptyMessage="No backup receipts were recorded yet."
        isEmpty={(data) => data.receipts.length === 0}
      >
        {(data) => (
          <>
            <Table1R rows={[...data.receipts]} columns={columns} />
            <UiPager
              isFirstPage={state.isFirstPage()}
              nextCursor={state.nextCursor()}
              onFirstPage={state.goToFirstPage}
              onNextPage={state.goToNextPage}
            />
          </>
        )}
      </UiQueryView>
    </>
  )
}
