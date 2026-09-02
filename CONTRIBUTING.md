# Contributing to PerfectPlan

Thank you for contributing to a free, local-first personal planning tool.

## Ways to help

- Report reproducible bugs or suggest a focused improvement in GitHub Issues.
- Improve product copy, translations, documentation, accessibility, or tests.
- Open a pull request for a scoped fix after checking for an existing issue.

Please do not include real task data, database files, certificates, access tokens, or other private material in issues, screenshots, commits, or pull requests.

## Before opening a pull request

1. Read the product and task-model documents in [`docs/`](./docs).
2. Keep changes small and focused; discuss scope-changing work in an issue first.
3. Run `pnpm check` and, when Rust code changes, `cargo fmt --check` from `src-tauri/`.
4. Include tests for changed business rules whenever practical.
5. Explain any user-visible behavior change and update documentation when it affects installation, privacy, or local data.

## Product principles

- Core personal planning remains free.
- User data stays local by default; no feature may upload it without an explicit product decision and documentation update.
- Offline behaviour is a first-class requirement.
- New permissions, network access, or changes to the data model require a decision record.

## Reporting security issues

Do not report security vulnerabilities in public issues. Until a dedicated disclosure channel exists, contact the maintainers privately through the repository contact information.
