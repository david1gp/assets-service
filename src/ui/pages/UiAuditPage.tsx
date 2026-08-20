import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { InputS } from "#ui/input/input/InputS.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import { mdiClose, mdiMagnify } from "@mdi/js"
import type { AuditEvent } from "../../audit/auditEventSchema.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { uiAuditPageStateCreate } from "./uiAuditPageStateCreate.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"

const columns: TableColumnDef<AuditEvent>[] = [
  {
    id: "createdAt",
    name: "When",
    data: (event) => event.createdAt,
    cell: (event) => <time datetime={event.createdAt}>{event.createdAt.slice(0, 19).replace("T", " ")}</time>,
  },
  { id: "action", name: "Action", data: (event) => event.action, cell: (event) => event.action },
  {
    id: "resource",
    name: "Resource",
    data: (event) => `${event.resourceType}/${event.resourceId}`,
    cell: (event) => (
      <span class="wrap-anywhere font-mono text-sm">
        {event.resourceType}/{event.resourceId}
      </span>
    ),
  },
  { id: "actorId", name: "Actor", data: (event) => event.actorId, cell: (event) => event.actorId },
]

/** Shows the audit trail of privileged operations in one project. */
export function UiAuditPage() {
  const state = uiAuditPageStateCreate()

  return (
    <>
      <UiPageHeading title="Audit" subtitle="Who changed what, and when." />

      <CardWrapper class="mb-6 p-4 sm:p-5">
        <form
          class="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            state.applyFilter()
          }}
        >
          <div class="min-w-60 flex-1">
            <Label for="audit-action">Action</Label>
            <InputS id="audit-action" type="search" valueSignal={state.actionDraft} placeholder="asset.deleted" />
          </div>
          <ButtonIcon type="submit" icon={mdiMagnify}>
            Filter
          </ButtonIcon>
          <ButtonIcon
            type="button"
            icon={mdiClose}
            variant="outline"
            disabled={!state.hasFilter()}
            onClick={state.clearFilter}
          >
            Clear
          </ButtonIcon>
        </form>
      </CardWrapper>

      <UiQueryView
        query={state.query}
        loadingItem="audit events"
        emptyMessage="No audit events matched this filter."
        isEmpty={(data) => data.events.length === 0}
      >
        {(data) => (
          <div class="flex flex-col gap-4">
            <CardWrapper class="overflow-hidden p-0">
              <Table1R
                rows={[...data.events]}
                columns={columns}
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
