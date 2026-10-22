# Changelog

All notable changes to the TrendLoom Instagram Downloader extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project structure with source code separation (src/ directory)
- Build infrastructure with Webpack
- TypeScript configuration and type definitions
- ESLint and Prettier for code quality
- Storage utility module with a single source of truth for the history limit
- Download history panel with live status, error details and a "No download buttons
  found" diagnostic for when Instagram's markup changes
- Improved error handling and user feedback
- Full accessibility support (ARIA labels, keyboard navigation)
- Content Security Policy in manifest
- README with installation and development instructions
- MIT License
- Git configuration (.gitignore)

### Changed
- Renamed `bulk-history-improved.js` to `bulk-history.js` (it is now the only
  implementation) and dropped the webpack output-name mapping
- Download history now tracks every download control the extension injects
  (hover, post, reels, story and account buttons)
- Lint, format and coverage scripts now target the hand-written sources only
- Better code organization and modularity
- Enhanced error messages and status indicators

### Removed
- Per-post "Select" checkboxes and the post-scanning observers that injected them
- Checkbox-driven bulk selection and the "Download selected" queue trigger
- Unused `downloadQueue.js`, `messaging.js` and `dom.js` utilities and their tests
- Stale root `js/` and `css/` bundles that duplicated the build output
- Unused `extension-improved.css` and `options-improved.html`
- Options-page settings that do not exist in the shipped options page
  (`downloadQuality`, `includeCaption`, `filenamePattern`, `autoDownload`,
  `showNotifications`, `maxHistoryItems`, `enableRetry`, `maxRetries`)

### Security
- Added Content Security Policy to manifest
- Improved input validation
- Better security practices in code

## [4.12.16] - 2024-10-22

### Current Features
- Download Instagram photos, videos, carousel media
- Download Stories and Highlights
- Bulk download with selection
- Download history tracking
- Chrome/Edge Manifest V3 support
- Sentry error tracking

### Known Issues
- Most JavaScript files are minified (source not available)
- No build configuration
- No documentation
- No accessibility features
- No retry mechanism
- Limited error handling

## [Previous Versions]

Version history for versions prior to 4.12.16 is not available.

---

## Version Format

- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes

## Categories

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerability fixes
