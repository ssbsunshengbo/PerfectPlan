# Contributing to PerfectPlan

Thank you for contributing.

## Before opening a pull request

1. Read the product and task-model documents in [`docs/`](./docs).
2. Keep changes small and focused; discuss scope-changing work in an issue first.
3. Run `pnpm check` and, when Rust code changes, `cargo fmt --check` from `src-tauri/`.
4. Include tests for changed business rules whenever practical.

## Product principles

- Core personal planning remains free.
- User data stays local by default.
- Offline behaviour is a first-class requirement.
- New permissions, network access, or changes to the data model require a decision record.

## Reporting security issues

Do not report security vulnerabilities in public issues. Until a dedicated disclosure channel exists, contact the maintainers privately through the repository contact information.
