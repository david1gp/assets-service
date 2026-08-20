# Sessions New Project

## Goal

Make `/sessions` → `New Session` → `New project` open project creation and rename the primary action to `New Project`.

## Decisions

- Reuse the existing session flow and UI components.
- Keep project creation within the current sessions experience unless the existing route structure requires a dedicated page.

## Approach

- Trace the `/sessions` new-session menu and project creation state/action.
- Implement the missing project creation view and update the primary button label.
- Verify the interaction in a browser and run the relevant checks.

## Tasks

- [x] Locate the session flow and existing project form/components.
- [ ] Fix the New project transition, button label, and creation UI.
- [ ] Verify behavior and tests.
