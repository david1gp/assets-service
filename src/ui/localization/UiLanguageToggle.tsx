import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { mdiTranslate } from "@adaptive-ds/mdi/mdiTranslate.js"
import { uiLanguageToggleStateCreate } from "./uiLanguageToggleStateCreate.js"

/** Compact control for switching the customer interface between English and German. */
export function UiLanguageToggle() {
  const state = uiLanguageToggleStateCreate()

  return (
    <ButtonIcon
      type="button"
      icon={mdiTranslate}
      variant="outline"
      title={state.title()}
      aria-label={state.title()}
      onClick={state.toggle}
    >
      {state.shortLabel()}
    </ButtonIcon>
  )
}
