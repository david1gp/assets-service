import { createSignal, onCleanup, onMount } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import type { ThemeButtonText } from "#ui/interactive/theme/ThemeButtonText.js"
import { themeButtonTextDefault } from "#ui/interactive/theme/ThemeButtonText.js"
import { themeInit, themeRotate, themeSignal } from "#ui/interactive/theme/themeSignal.js"
import { themeIcon } from "#ui/interactive/theme/themeVariant.js"
import { classMerge } from "#ui/utils/classMerge.js"
import type { MayHaveClass } from "#ui/utils/MayHaveClass.js"

export interface ThemeButtonProps extends MayHaveClass {
  showText?: boolean
  texts?: ThemeButtonText
}

/** Button cycling through the color theme. */
export function ThemeButton(p: ThemeButtonProps) {
  const navigate = (to: string) => {}
  const handleGlobalKeyDown = createGlobalKeyHandler(navigate)

  const texts = p.texts ?? themeButtonTextDefault
  // SSR always starts as `os` ("Operation system"). Showing that label then
  // swapping to Light/Dark after themeInit shifts the navbar. Wait until the
  // stored theme is applied before rendering the label.
  const [themeReady, setThemeReady] = createSignal(false)

  onMount(() => {
    themeInit()
    setThemeReady(true)
    window.addEventListener("keydown", handleGlobalKeyDown)
    onCleanup(() => window.removeEventListener("keydown", handleGlobalKeyDown))
  })

  return (
    <ButtonIconOnly
      title={texts.currentTheme(texts[themeSignal.get()])}
      icon={themeIcon(themeSignal.get())}
      variant={buttonVariant.ghost}
      class={classMerge(p.showText && "min-w-24", p.class)}
      onClick={themeRotate}
    >
      {p.showText && themeReady() && texts[themeSignal.get()]}
    </ButtonIconOnly>
  )
}

function createGlobalKeyHandler(navigate: (to: string) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "s" && e.altKey) {
      e.preventDefault()
      themeRotate()
    } else if (e.key === "d" && e.altKey) {
      e.preventDefault()
      navigate("/demos")
    }
  }
}
