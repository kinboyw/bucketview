# BucketView

[![CI](https://github.com/kinboyw/bucketview/actions/workflows/ci.yml/badge.svg)](https://github.com/kinboyw/bucketview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

BucketView is a cross-platform desktop client for browsing and managing S3-compatible object storage.

The application is built with Electron, Vue 3, TypeScript, Ant Design Vue, and the AWS SDK for JavaScript.

## Features

- Manage multiple S3-compatible storage connections
- Browse buckets and objects with list and thumbnail views
- Upload, download, copy, move, rename, and delete objects
- Preview images, video, audio, PDF, Office documents, 3D models, and text files
- Edit and save text objects online
- Mount buckets or prefixes as local drives with rclone
- Transfer queue, progress tracking, and operation audit log
- Light and dark themes
- Independent themed preview windows

## Supported storage services

BucketView targets the standard S3 API and can work with AWS S3, MinIO, and other S3-compatible providers. Provider-specific behavior may vary, especially around path-style access, regions, and permissions.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Windows 10/11 for the complete drive-mount workflow

macOS and Linux builds are supported by the Electron application, but some platform-specific features may require additional validation or bundled helper binaries.

## Development

```bash
npm ci
npm run dev
```

## Build

Build the renderer, main process, and preload scripts without packaging:

```bash
npm run build:app
```

Create a packaged application for the current platform:

```bash
npm run build
```

Platform-specific packaging commands are also available:

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

## Security

Do not commit access keys, secret keys, exported connection profiles, application databases, logs, or generated mount configuration files. See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

BucketView is licensed under the [MIT License](LICENSE). Bundled third-party tools and dependencies remain subject to their respective licenses.
