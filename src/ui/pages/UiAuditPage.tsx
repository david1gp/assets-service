import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { CheckMultiple } from "#ui/input/check/CheckMultiple.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import type { TableColumnDef } from "#ui/table/shared/TableColumnDef.js"
import { Table1R } from "#ui/table/table1/Table1R.jsx"
import type { AuditEvent } from "../../audit/auditEventSchema.js"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { UiPager } from "../common/UiPager.jsx"
import { UiQueryView } from "../common/UiQueryView.jsx"
import { ttc } from "../localization/ttc.js"
import { uiTableDesktopClassesRead } from "../table/uiTableDesktopClassesRead.js"
import { uiTableMobileClassesRead } from "../table/uiTableMobileClassesRead.js"
import { uiAuditPageStateCreate } from "./uiAuditPageStateCreate.js"

const auditActionLabelRead = (action: string): string => {
  if (action === "asset.created") return ttc("Asset created", "Asset erstellt")
  if (action === "asset.deletion_requested") return ttc("Asset deletion requested", "Asset-Löschung angefordert")
  if (action === "asset.deleted") return ttc("Asset deleted", "Asset gelöscht")
  return action
}

const columns = (): TableColumnDef<AuditEvent>[] => [
  {
    id: "createdAt",
    name: ttc("When", "Wann"),
    data: (event) => event.createdAt,
    cell: (event) => <time datetime={event.createdAt}>{event.createdAt.slice(0, 19).replace("T", " ")}</time>,
  },
  {
    id: "action",
    name: ttc("Action", "Aktion"),
    data: (event) => event.action,
    cell: (event) => auditActionLabelRead(event.action),
  },
  {
    id: "resource",
    name: ttc("Resource", "Ressource"),
    data: (event) => `${event.resourceType}/${event.resourceId}`,
    cell: (event) => (
      <span class="wrap-anywhere font-mono text-sm">
        {event.resourceType}/{event.resourceId}
      </span>
    ),
  },
  { id: "actorId", name: ttc("Actor", "Akteur"), data: (event) => event.actorId, cell: (event) => event.actorId },
]

/** Shows the audit trail of privileged operations in one project. */
export function UiAuditPage() {
  const state = uiAuditPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("Audit", "Audit")}
        subtitle={ttc("Who changed what, and when.", "Wer hat wann was geändert?")}
      />

      <CardWrapper class="mb-6 p-4 sm:p-5">
        <form
          class="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            state.applyFilter()
          }}
        >
          <div class="min-w-60 flex-1">
            <Label for="audit-action">{ttc("Action", "Aktion")}</Label>
            <CheckMultiple
              id="audit-action"
              valueSignal={state.actionDraft}
              getOptions={state.actionOptions}
              valueText={(value) =>
                value === "all" ? ttc("All actions", "Alle Aktionen") : auditActionLabelRead(value)
              }
              innerClass="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4"
            />
          </div>
          <ButtonIcon type="submit" icon={mdiMagnify}>
            {ttc("Filter", "Filtern")}
          </ButtonIcon>
          <ButtonIcon
            type="button"
            icon={mdiClose}
            variant="outline"
            disabled={!state.hasFilter()}
            onClick={state.clearFilter}
          >
            {ttc("Clear", "Leeren")}
          </ButtonIcon>
        </form>
      </CardWrapper>

      <UiQueryView
        query={state.query}
        loadingItem={ttc("audit events", "Audit-Ereignisse")}
        emptyMessage={ttc("No audit events matched this filter.", "Keine Audit-Ereignisse entsprechen diesem Filter.")}
        isEmpty={(data) => data.events.length === 0}
      >
        {(data) => (
          <div class="flex flex-col gap-4">
            <CardWrapper class="overflow-hidden p-0">
              <Table1R
                rows={[...data.events]}
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
