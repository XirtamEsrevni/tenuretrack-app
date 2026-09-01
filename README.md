<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/sp8rks/tenuretrack/blob/main/assets/tenuretrack-logo-source.png?raw=true">
    <img src="https://github.com/sp8rks/tenuretrack/blob/main/assets/tenuretrack-logo-source.png?raw=true" alt="tenuretrack" width="340">
  </picture>
</p>

# TenureTrack

[![Continuous integration](https://github.com/sp8rks/tenuretrack/actions/workflows/ci.yml/badge.svg)](https://github.com/sp8rks/tenuretrack/actions/workflows/ci.yml)

TenureTrack is a Vite-powered React application for exploring academic career outcomes.

## Development

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Run the checks used in continuous integration:

```bash
npm run lint
npm run build
```

## Releases

The app version in `package.json` follows the release tag. Push a tag such as
`v0.0.1` to build the app, validate it, and create a GitHub release with a
compressed production bundle attached.

```bash
git tag v0.0.1
git push origin v0.0.1
```

The **Release** workflow can also be run manually for an existing tag. Its
release notes are generated from the commits since the previous release.
