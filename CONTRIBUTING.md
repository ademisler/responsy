# Contributing

Thanks for your interest in contributing to Responsy.

## Before You Start

- Read the [Code of Conduct](./CODE_OF_CONDUCT.md)
- Check open issues before starting overlapping work
- Use focused pull requests instead of bundling unrelated changes together

## Local Setup

```bash
npm install
npm run check
npm start
```

## Development Expectations

- Keep the UI minimal and intentional
- Preserve the live preview behavior
- Avoid introducing extra chrome around the preview area
- Prefer small, reviewable changes
- Update docs when user-facing behavior changes

## Pull Requests

Please include:

- A short description of the change
- Why the change is needed
- Any screenshots or short notes for UI changes
- Verification steps you ran locally

Before opening a pull request, run:

```bash
npm run check
```

If your change affects packaging, also test the relevant build command:

```bash
npm run pack:mac
npm run pack:win
```

## Versioning and Tags

Responsy uses semantic versioning and release tags in the `vX.Y.Z` format.

Examples:

- `v1.0.0`
- `v1.2.3`

See [RELEASING.md](./RELEASING.md) for the full release flow.
