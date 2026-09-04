import { render } from "solid-js/web"
import { languageSignal } from "./localization/languageSignal.js"
import { UiRouter } from "./UiRouter.js"
import "./styles.css"

languageSignal.initialize()

const root = document.getElementById("app")

if (!root) {
  throw new Error("Missing application root")
}

render(() => <UiRouter />, root)
