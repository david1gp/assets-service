# Contributor navigation

## Goal
- Simplify contributor navigation and use Medien instead of Assets throughout German UI text.

## Decisions
- Replace the contributor sidebar with compact links between existing upload and media listing/editing pages.
- Simplify the contributor header and place technical information subtly at the bottom.
- Preserve admin navigation, existing permissions, and English terminology.
- Reuse existing libraries and generic components; leave ui/ unchanged.

## Approach
- Update the contributor shell and German translations, then browser-verify the result.
- Use the commits skill through a fresh luna agent and deploy using existing project tooling.

## Tasks
- [x] 1. Implement contributor navigation, subtle technical footer, and German terminology.
- [x] 2. Verify UI and relevant automated checks; correct any issues.
- [x] 3. Commit and push via luna commits skill, then deploy.
