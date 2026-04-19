[![CI](https://github.com/ademisler/Responsy/actions/workflows/ci.yml/badge.svg)](https://github.com/ademisler/Responsy/actions/workflows/ci.yml)
[![Release](https://github.com/ademisler/Responsy/actions/workflows/release.yml/badge.svg)](https://github.com/ademisler/Responsy/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0b0f0e.svg)](./LICENSE)

# Responsy

Responsy is a minimal Electron desktop app for opening live website previews in phone, tablet, and desktop widths with as little surrounding chrome as possible.

It is designed for quick responsive checks, lightweight client reviews, and instant screenshots without switching back and forth between browser devtools, resized windows, and external capture tools.

## Highlights

- Live, clickable previews instead of static captures
- Slim right-side control rail that stays out of the way when collapsed
- Dedicated phone, tablet, and desktop viewport modes
- Lightweight loading overlay that disappears as soon as the page is ready
- Visible-area and full-page screenshot capture
- Automatic clipboard copy plus silent saving to the system `Downloads` folder
- macOS and Windows packaging with GitHub Actions release automation

## How It Works

1. Open the slim three-dot rail on the right.
2. Paste a URL and load the page.
3. Switch between `Phone`, `Tablet`, and `Desktop` modes.
4. Capture a screenshot when needed.

## Keyboard Shortcuts

- `Command+L` on macOS or `Ctrl+L` on Windows: focus the address field
- `Esc`: close the control panel

## Local Development

### Requirements

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Run

```bash
npm start
```

### Basic Project Check

```bash
npm run check
```

## Build Commands

Build a macOS `.app` bundle:

```bash
npm run pack:mac
```

Build macOS distributables (`.dmg` and `.zip`):

```bash
npm run dist:mac
```

Build an unpacked Windows app directory:

```bash
npm run pack:win
```

Build a Windows NSIS installer:

```bash
npm run dist:win
```

All build artifacts are written to `dist/`.

## Release Strategy

Responsy uses semantic versioning and GitHub tag-based releases.

- Release tags must use the `vX.Y.Z` format
- Example: `v1.0.0`
- Tag pushes matching that format trigger the release workflow
- The release workflow builds macOS and Windows artifacts and attaches them to the GitHub Release

See [RELEASING.md](./RELEASING.md) for the full process.

## Repository Standards

- MIT licensed
- Community and contribution files included for public collaboration
- CI workflow for repository checks
- Release workflow for tagged builds
- Issue and pull request templates for cleaner public maintenance

## Security

If you find a security issue, please read [SECURITY.md](./SECURITY.md) before opening an issue.

## License

This project is released under the [MIT License](./LICENSE).
