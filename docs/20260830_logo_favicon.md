# Logo and favicon

## Goal

Use the navbar's rounded-square `mdiFolderMultipleOutline` mark as `public/logo.svg`, generate a favicon from it, configure the website to display the favicon, then commit, push, and deploy the completed change.

## Decisions

- Preserve the navbar's current slate rounded-square and white folder artwork.
- Keep the navbar component unchanged; static brand assets will reproduce its existing mark.
- Add explicit favicon metadata in `index.html`.
- Use the repository's existing build, commit, and deployment conventions.

## Approach

- Recreate the existing 24×24 MDI folder path inside a standalone rounded-square SVG.
- Generate browser favicon asset(s) from `public/logo.svg` with existing project tooling where possible.
- Add the favicon link to the document head and verify both build output and browser rendering.
- Use the commits skill to create and push conventional commit(s), then run the established production deployment flow.

## Tasks

- [x] 1. Add `public/logo.svg`, generate favicon asset(s), and configure `index.html`.
- [x] 2. Verify the build and favicon/logo behavior in a browser.
- [x] 3. Use the commits skill to commit and push the changes, then deploy.
