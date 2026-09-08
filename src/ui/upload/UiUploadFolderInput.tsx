import { For } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Label } from "#ui/input/label/Label.jsx"

export type UiUploadFolderInputProps = {
  id: string
  label: string
  value: string
  disabled: boolean
  options: () => string[]
  valueSet: (value: string) => void
}

/** Canonical folder segment input with datalist suggestions from existing asset folders. */
export function UiUploadFolderInput(p: UiUploadFolderInputProps) {
  const listId = () => `${p.id}-options`

  return (
    <div class="flex-1">
      <Label for={p.id}>{p.label}</Label>
      <Input
        id={p.id}
        type="text"
        list={listId()}
        value={p.value}
        disabled={p.disabled}
        onChange={(event) => p.valueSet(event.currentTarget.value)}
      />
      <datalist id={listId()}>
        <For each={p.options()}>{(option) => <option value={option} />}</For>
      </datalist>
    </div>
  )
}
