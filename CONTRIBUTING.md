# Contributing

Thanks for contributing.

## Local Development

1. Install dependencies: `pnpm install`
2. Run tests: `pnpm test`
3. Run type checks: `pnpm typecheck`
4. Build: `pnpm build`

## Pull Requests

- Keep changes focused and small.
- Add or update tests for behavior changes.
- Update `README.md` when user-facing behavior changes.
- Use clear commit messages (Conventional Commits preferred).

## Release Notes

If your change affects users, include a short changelog-style summary in the PR description.

## Releasing

Maintainers release in two steps, because `main` is protected:

1. On an up-to-date `main`, run `pnpm release prepare <patch|minor|major>`. The command opens a release PR.
2. Merge the PR. Then run `git pull` and `pnpm release publish` on `main`.

The publish step releases to npm, pushes the tag, creates the GitHub release (this builds the Docker image) and updates the MCP registry. Add `--dry-run` to see the steps first.
