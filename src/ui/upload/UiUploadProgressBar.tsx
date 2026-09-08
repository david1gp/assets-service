export type UiUploadProgressBarProps = {
  labelId: string
  label: string
  percent: number
  hasFailed: boolean
}

/** Labelled progress bar shared by the upload page and the replacement upload. */
export function UiUploadProgressBar(p: UiUploadProgressBarProps) {
  return (
    <div>
      <p id={p.labelId} class="text-xs text-muted-foreground">
        {p.label}
      </p>
      <div
        role="progressbar"
        aria-labelledby={p.labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          class={`h-full transition-all ${p.hasFailed ? "bg-red-700" : "bg-blue-600"}`}
          style={{ width: `${p.percent}%` }}
        />
      </div>
    </div>
  )
}
