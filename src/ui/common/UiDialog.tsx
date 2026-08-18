import Dialog from "@corvu/dialog"
import { mdiClose } from "@mdi/js"
import { buttonCvaIconOnly, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { buttonIconCva } from "#ui/interactive/button/buttonIconCva.js"
import { classesDialogContentMerge, classesDialogOverlayMerge } from "#ui/interactive/dialog/classesDialogContent.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { JSXElement } from "solid-js"
import { Show } from "solid-js"

export type UiDialogProps = {
  title: string
  description?: string
  open: boolean
  onClose: () => void
  children: JSXElement
}

/**
 * Modal dialog opened from URL state instead of a trigger button. The library
 * `CorvuDialog` always renders its own trigger, whose `aria-controls` points at
 * a dialog id that is absent while the dialog is closed, and a visually hidden
 * trigger adds a second, confusing tab stop. `./ui` is read-only, so this app
 * component composes the same corvu primitives without a trigger.
 */
export function UiDialog(p: UiDialogProps) {
  return (
    <Dialog open={p.open} onOpenChange={(open) => (open ? undefined : p.onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay class={classesDialogOverlayMerge()} />
        <Dialog.Content class={classesDialogContentMerge()}>
          <div class="mb-4 flex items-center justify-between gap-2">
            <div>
              <Dialog.Label class="text-lg font-semibold">{p.title}</Dialog.Label>
              <Show when={p.description}>
                {(description) => (
                  <Dialog.Description class="text-muted-foreground">{description()}</Dialog.Description>
                )}
              </Show>
            </div>
            <Dialog.Close class={buttonCvaIconOnly(buttonVariant.outline, false, false)} title="Close dialog">
              <Icon path={mdiClose} class={buttonIconCva(buttonVariant.outline, "")} />
            </Dialog.Close>
          </div>
          {p.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
