# Goal
- Make sign-in prominent and optionally automatic without endless redirects.

# Decisions
- Use a primary/contrast Anmelden button and a subtle Sitzung prüfen button.
- Add an Automatisch anmelden checkbox below the login actions; share its browser-local preference with signed-in configuration.
- Automatic sign-in invokes the same action as Anmelden, with at most three attempts persisted across redirects. Manual sign-in remains available.
- Reuse existing UI components and dependencies; keep ./ui read-only.

# Approach
- Inspect login/session lifecycle and implement persisted bounded automatic sign-in and configuration control.
- Verify behavior and appearance, then commit/push using the commits skill and deploy using repository commands.

# Tasks
- [x] 1. Implement login styling, automatic sign-in preference and bounded redirects, and signed-in configuration toggle; run focused checks.
- [x] 2. Browser verification and remaining repository checks.
- [ ] 3. Luna agent executes commits skill, then deploy and verify deployment.
