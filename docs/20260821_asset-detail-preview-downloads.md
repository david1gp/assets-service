# Asset detail preview and downloads

## Goal

Show an image preview on the asset detail page and provide usable download/direct links for every original revision and optimized output variant.

## Decisions

- Keep original source objects private.
- Serve original previews and downloads through an authenticated asset API route.
- Keep optimized outputs on their existing public R2 URLs.
- Preview the latest original only when its media type is an image.
- Do not change the asset listing page.

## Approach

- Add an authorized source-revision content endpoint that validates project, asset, and revision ownership before streaming private storage content with appropriate response headers.
- Add API-client URL construction for source content.
- Extend asset-detail state with preview and link values while keeping TSX view-only.
- Render the preview below the asset details, source download links, and optimized variant open/download links using existing UI components.
- Add focused API/helper tests and browser-verify the fixture-backed detail page.

## Tasks

- [x] 1. Implement and test the authenticated original-content API route.
- [x] 2. Add asset-detail state and UI for the latest-image preview and all original/output links.
- [x] 3. Run focused checks and browser verification.

## Paths

- `src/api/apiAppCreate.ts`
- `src/api-client/assetsApiClientCreate.ts`
- `src/api-client/`
- `src/ui/pages/UiAssetDetailPage.tsx`
- `src/ui/pages/uiAssetDetailPageStateCreate.ts`
- `src/ui/common/uiPublicUrlFormat.ts`
- `test/apiAssetRoutes.test.ts`
- `test/uiState.test.ts`
- `test/uiBrowserDefects.test.ts`
