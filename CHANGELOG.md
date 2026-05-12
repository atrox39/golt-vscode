# Change Log

All notable changes to the "golt-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Activation on `workspaceContains:golt.json` to automatically enable Golt support in Golt projects.
- TypeScript Server Plugin contribution (`golt-ts-plugin`) to inject global Golt typings into the workspace TypeScript language service.
- Global typings injection via `getExternalFiles()` when `golt.json` is present in the TypeScript project directory.
- Initial global API typings for:
  - `Golt` namespace (`Golt.App()`, `Golt.db`, `Golt.fs`, `Golt.crypto`, `Golt.jwt`, `Golt.logger`, `Golt.env`)
  - Global `fetch()` (typed options and response surface)

### Changed

- Documentation refreshed to match current project structure, behavior, and injected API surface.
