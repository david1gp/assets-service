# Jobs asset links

## Goal
Make assets associated with jobs clickable on the jobs page, navigating to asset details.

## Decisions
- Use the parent workflow's asset association and existing admin asset route.
- Jobs without an associated asset have no asset link.
- Reuse existing libraries and UI components; leave `ui` unchanged.

## Approach
Expose the associated asset ID in job list data, then render an asset link and verify navigation.

## Tasks
1. Complete: expose the workflow asset ID in job list data and verify backend behavior.
2. Complete: add asset navigation to job rows using existing UI conventions.
3. Complete: verify navigation in the browser.
