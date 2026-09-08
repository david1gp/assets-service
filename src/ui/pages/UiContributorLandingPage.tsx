import { CardWrapper } from "#ui/static/card/CardWrapper.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { mdiArrowRight } from "@adaptive-ds/mdi/mdiArrowRight.js"
import { mdiCloudUploadOutline } from "@adaptive-ds/mdi/mdiCloudUploadOutline.js"
import { mdiImageEditOutline } from "@adaptive-ds/mdi/mdiImageEditOutline.js"
import { A } from "@solidjs/router"
import { UiPageHeading } from "../common/UiPageHeading.jsx"
import { ttc } from "../localization/ttc.js"
import { uiContributorLandingPageStateCreate } from "./uiContributorLandingPageStateCreate.js"

/** Welcomes contributors with the two clear asset operations available to them. */
export function UiContributorLandingPage() {
  const state = uiContributorLandingPageStateCreate()

  return (
    <>
      <UiPageHeading
        title={ttc("What would you like to do?", "Was möchten Sie tun?")}
        subtitle={ttc(
          "Add something new or choose an existing asset to update.",
          "Fügen Sie etwas Neues hinzu oder wählen Sie ein bestehendes Asset zur Bearbeitung aus.",
        )}
      />

      <div class="grid gap-5 md:grid-cols-2">
        <A
          href={state.uploadPath()}
          class="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <CardWrapper class="h-full overflow-hidden border border-slate-200 bg-white p-0 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-blue-300 group-hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:group-hover:border-blue-700">
            <div class="h-1.5 bg-linear-to-r from-blue-500 to-cyan-400" />
            <div class="p-6 sm:p-8">
              <div class="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Icon path={mdiCloudUploadOutline} class="size-6" />
              </div>
              <h2 class="mt-6 text-xl font-semibold">{ttc("Upload new", "Neu hochladen")}</h2>
              <p class="mt-2 text-sm leading-6 text-muted-foreground">
                {ttc(
                  "Upload an image, video, font, or document and prepare it for use.",
                  "Laden Sie ein Bild, Video, eine Schrift oder ein Dokument hoch und bereiten Sie es zur Nutzung vor.",
                )}
              </p>
              <span class="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                {ttc("Start upload", "Upload starten")}
                <Icon path={mdiArrowRight} class="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </CardWrapper>
        </A>

        <A
          href={state.assetsPath()}
          class="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <CardWrapper class="h-full overflow-hidden border border-slate-200 bg-white p-0 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:border-violet-300 group-hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:group-hover:border-violet-700">
            <div class="h-1.5 bg-linear-to-r from-violet-500 to-fuchsia-400" />
            <div class="p-6 sm:p-8">
              <div class="flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <Icon path={mdiImageEditOutline} class="size-6" />
              </div>
              <h2 class="mt-6 text-xl font-semibold">{ttc("View/edit existing", "Bestehende ansehen/bearbeiten")}</h2>
              <p class="mt-2 text-sm leading-6 text-muted-foreground">
                {ttc(
                  "Browse your existing assets, preview them, and update their customer-facing details.",
                  "Durchsuchen Sie bestehende Assets, zeigen Sie Vorschauen an und bearbeiten Sie sichtbare Angaben.",
                )}
              </p>
              <span class="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                {ttc("Choose an asset", "Asset auswählen")}
                <Icon path={mdiArrowRight} class="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </CardWrapper>
        </A>
      </div>
    </>
  )
}
