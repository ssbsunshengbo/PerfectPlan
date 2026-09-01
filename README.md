# PerfectPlan

PerfectPlan is a free, local-first personal planning desktop app. It helps people capture tasks, plan their day and arrange work into real time—without an account or a server.

## Current status

The project is in its engineering-foundation stage. Product decisions and implementation milestones are documented in [`docs/`](./docs).

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

## Documentation

- [MVP product requirements](./docs/MVP_PRD.md)
- [Task model](./docs/TASK_MODEL.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)

## License

[MIT](./LICENSE)
