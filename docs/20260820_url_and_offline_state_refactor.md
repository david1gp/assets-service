# URL and Offline State Refactor

## Goal

Make UI state reload-safe and validated: signal objects for reactive state, URL-backed tabs/dialogs/search, and validated idle local persistence for remote data and unfinished forms.

## Decisions

- Keep `./ui` read-only; application changes belong under `src/ui`.
- Use the existing `#ui/utils/createSignalObject` and entity Valibot schemas.
- Use `history.replaceState` for search typing and other high-frequency URL writes.
- Debounce browser persistence and URL writes, perform them asynchronously, and schedule them with `requestIdleCallback` with a fallback.
- Cache remote reads by subject because this application has no zero-sync/offline data layer.
- Use distinct URL keys for independent dialog types or instances.

## Approach

- Add small browser persistence and URL-state primitives first.
- Refactor one state area at a time onto those primitives.
- Add validated per-subject response caches and validated form drafts without changing server APIs.
- Finish with focused tests, typecheck, lint, and a repository-wide compliance audit.

## Tasks

- [x] 1. Add validated, debounced, asynchronous idle scheduling primitives for localStorage and URL replacement.
- [x] 2. Refactor tabs, dialogs, and search to validated URL-owned state and whole signal-object props.
- [x] 3. Add validated per-subject localStorage caching for remote reads and immediate cached rendering.
- [x] 4. Persist validated form drafts until successful submission, then clear them.
- [x] 5. Run tests, typecheck, lint, and audit all requested patterns; fix remaining application-owned violations.

## Paths

- `src/ui/search/`
- `src/ui/storage/`
- `src/ui/client/`
- `src/ui/pages/`
- `src/ui/session/`
- `src/domain/`
- `docs/20260820_url_and_offline_state_refactor.md`
