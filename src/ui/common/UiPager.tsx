import { ButtonIcon } from "#ui/interactive/button/ButtonIcon.jsx"
import { mdiChevronRight, mdiPageFirst } from "@mdi/js"

export type UiPagerProps = {
  isFirstPage: boolean
  nextCursor: string | null
  onFirstPage: () => void
  onNextPage: () => void
}

/** Cursor pagination controls for list views. */
export function UiPager(p: UiPagerProps) {
  return (
    <nav aria-label="Pagination" class="mt-4 flex items-center gap-2">
      <ButtonIcon icon={mdiPageFirst} variant="outline" size="sm" disabled={p.isFirstPage} onClick={p.onFirstPage}>
        First page
      </ButtonIcon>
      <ButtonIcon
        iconRight={mdiChevronRight}
        variant="outline"
        size="sm"
        disabled={p.nextCursor === null}
        onClick={p.onNextPage}
      >
        Next page
      </ButtonIcon>
    </nav>
  )
}
