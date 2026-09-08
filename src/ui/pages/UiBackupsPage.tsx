import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { BackupReceipt } from "../../backup/backupReceiptSchema.js"
import { uiByteSizeFormat } from "../common/uiByteSizeFormat.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { ttc } from "../localization/ttc.js"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { UiStatusBadge } from "../common/UiStatusBadge.jsx"
import { uiBackupsPageStateCreate } from "./uiBackupsPageStateCreate.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"

const columns = (): TableColumnDef<BackupReceipt>[] => [
  {
    id: "remotePath",
    name: ttc("Remote path", "Remote-Pfad"),
    data: (receipt) => receipt.remotePath,
    cell: (receipt) => <span class="wrap-anywhere font-mono text-sm">{receipt.remotePath}</span>,
  },
  {
    id: "checkResult",
    name: ttc("Verification", "Verifizierung"),
    data: (receipt) => receipt.checkResult,
    cell: (receipt) => (
      <UiStatusBadge tone={receipt.checkResult === "verified" ? "positive" : "negative"}>
        {receipt.checkResult === "verified" ? ttc("verified", "verifiziert") : ttc("failed", "fehlgeschlagen")}
      </UiStatusBadge>
    ),
  },
  {
    id: "byteSize",
    name: ttc("Size", "Größe"),
    data: (receipt) => receipt.byteSize,
    cell: (receipt) => uiByteSizeFormat(receipt.byteSize),
  },
  {
    id: "completedAt",
    name: ttc("Completed", "Abgeschlossen"),
    data: (receipt) => receipt.completedAt,
    cell: (receipt) => <time datetime={receipt.completedAt}>{receipt.completedAt.slice(0, 19).replace("T", " ")}</time>,
  },
]

/** Lists the backup receipts recorded before publication. */
export function UiBackupsPage() {
  const state = uiBackupsPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("Backups", "Sicherungen")}
        subtitle={ttc(
          "Verified copies written before any asset was published.",
          "Verifizierte Kopien, die vor der Veröffentlichung eines Assets geschrieben wurden.",
        )}
      />
      <UiQueryView
        query={state.query}
        loadingItem={ttc("backups", "Sicherungen")}
        emptyMessage={ttc("No backup receipts were recorded yet.", "Es wurden noch keine Sicherungsbelege erfasst.")}
        isEmpty={(data) => data.receipts.length === 0}
      >
        {(data) => (
          <div class="flex flex-col gap-4">
            <CardWrapper class="overflow-hidden p-0">
              <Table1R
                rows={[...data.receipts]}
                columns={columns()}
                desktopClasses={uiTableDesktopClassesRead()}
                mobileClasses={uiTableMobileClassesRead()}
              />
            </CardWrapper>
            <UiPager
              isFirstPage={state.isFirstPage()}
              nextCursor={state.nextCursor()}
              onFirstPage={state.goToFirstPage}
              onNextPage={state.goToNextPage}
            />
          </div>
        )}
      </UiQueryView>
    </>
  )
}
