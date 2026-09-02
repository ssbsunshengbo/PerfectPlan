# PerfectPlan

PerfectPlan is a free, local-first personal planning desktop app. It helps people capture tasks, plan their day and arrange work into real time—without an account or a server.

## Current status

The core offline planning experience is ready for public-test preparation: task capture, projects and tags, daily planning, calendar scheduling, local reminders, accessibility improvements, and reliability checks. Product decisions and implementation milestones are documented in [`docs/`](./docs).

## Development

Prerequisites: Node.js 22+, pnpm 11+, Rust stable, and the platform prerequisites required by [Tauri](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm tauri dev
```

Useful checks:

```bash
pnpm check
pnpm tauri build
```

## Releases

Releases are built for macOS and Windows from the manually triggered GitHub Actions workflow. It verifies that all application version files agree, builds a draft GitHub Release, and uploads the installers only after both platform builds succeed.

See [the release guide](./docs/RELEASING.md) for versioning, signing, notarization, and the exact pre-release checklist.

## Documentation

- [MVP product requirements](./docs/MVP_PRD.md)
- [Task model](./docs/TASK_MODEL.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Release guide](./docs/RELEASING.md)
- [Installation and backup guide](./docs/INSTALLATION.md)
- [Privacy policy](./docs/PRIVACY.md)
- [Frequently asked questions](./docs/FAQ.md)
- [Issue triage and release blockers](./docs/ISSUE_TRIAGE.md)
- [Changelog](./CHANGELOG.md)

## License

[MIT](./LICENSE)
