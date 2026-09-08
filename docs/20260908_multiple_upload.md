# Multiple upload redesign

## Goal
Redesign `/upload` with one large multi-file chooser/drop area, immediate uploads, and a file list with editable folders. No captions.

## Decisions
- Reuse existing upload pipeline, drop behavior, and generic UI components; keep `ui/` read-only.
- Upload each file independently and show per-file progress, completion, and errors.
- Use existing canonical folder move API after upload.
- Use input+datalist folder suggestions; show level 2 only when level 1 is nonempty, and level 3 only when level 2 is nonempty.
- Preserve single-file replacement uploads.
- Required integration notes default to `Upload <filename>`; no caption editing.

## Approach
Inspect required upload defaults, implement multi-file state and shared behavior, then redesign the page and verify it in a browser.

## Tasks
1. Complete: Implement and test multi-file immediate-upload state and per-file folder editing, reusing existing helpers.
2. Complete: Redesign upload page using shared drop area and progress components. Folder controls reuse generic Input with native datalist; existing replacement behavior stays single-file.
3. Complete: Run focused checks and browser verification with mocked API responses.
