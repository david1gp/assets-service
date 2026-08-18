import { buttonCva2 } from "#ui/interactive/button/buttonCva.js"
import type { ButtonCvaProps } from "#ui/interactive/button/buttonCva.js"
import { buttonIconCva } from "#ui/interactive/button/buttonIconCva.js"
import { classesButtonClickAnimation } from "#ui/interactive/button/classesButtonClickAnimation.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { A } from "@solidjs/router"
import type { JSXElement } from "solid-js"
import { Show } from "solid-js"

export type UiLinkButtonProps = ButtonCvaProps & {
  href: string
  icon?: string
  class?: string
  children: JSXElement
}

/** Button-styled internal router link for this SPA. */
export function UiLinkButton(p: UiLinkButtonProps) {
  return (
    <A href={p.href} class={buttonCva2(p.variant, p.size, classesButtonClickAnimation, p.class)}>
      <Show when={p.icon}>
        <Icon path={p.icon ?? ""} class={buttonIconCva(p.variant, "mr-2")} />
      </Show>
      {p.children}
    </A>
  )
}
