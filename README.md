# Golt Runtime for VS Code

<img src="images/icon.jpg" width="128" alt="Golt icon" />

Official Visual Studio Code extension that wires up a TypeScript language-service plugin to inject Golt Runtime typings into your workspace when a `golt.json` file is present.

Repository: https://github.com/atrox39/golt-vscode

## What this extension does

- Activates when VS Code detects `golt.json` in the workspace.
- Registers a TypeScript Server Plugin named `golt-ts-plugin` (enabled for workspace TypeScript versions).
- When a Golt project is detected, injects the global typings file [golt.d.ts](golt-ts-plugin/golt.d.ts) into the TypeScript language service so you get IntelliSense without imports.

## How it works (implementation details)

This repo contains two parts:

- VS Code extension entrypoint: [extension.ts](src/extension.ts)
  - On activation, it currently only logs:
    - `[Golt] Languaje Server Plugin Injected successfully.`
- TypeScript Server Plugin: [golt-ts-plugin/index.js](golt-ts-plugin/index.js)
  - `create(info)` logs initialization and returns the existing `languageService` unchanged.
  - `getExternalFiles(project)` checks whether `golt.json` exists in `project.getCurrentDirectory()`.
    - If present, it returns the resolved path to [golt.d.ts](golt-ts-plugin/golt.d.ts), causing TypeScript to include those global types in the project.
    - If not present, it returns an empty list (no types injected).

## Installation

### From VS Code Marketplace

1. Open VS Code.
2. Go to Extensions (`Ctrl+Shift+X`).
3. Search for `golt-vscode` (or `Golt Runtime` if published under that name).
4. Install the extension.

### Local development install (this repository)

1. Install dependencies:

```bash
pnpm install
```

2. Build the extension:

```bash
pnpm run compile
```

3. Run the extension in the VS Code Extension Development Host:
   - Open this repo in VS Code
   - Press `F5`

## Usage

1. Add a `golt.json` file to the directory TypeScript considers the project root for your workspace (commonly the workspace root).
2. Open any `.ts` / `.js` file in that project.
3. Use the global `Golt` namespace (no imports required).

If IntelliSense does not appear immediately, run “Developer: Reload Window” and retry.

## Configuration

No user-facing settings are currently defined. Project detection is file-based:

- Required: `golt.json` in the TypeScript project directory (`project.getCurrentDirectory()`).

## API typings provided

All types are injected globally from [golt.d.ts](golt-ts-plugin/golt.d.ts). The most important surfaces are summarized here.

### Global `fetch`

```ts
function fetch(url: string, options?: {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
}>;
```

### `Golt` namespace

- `Golt.env: Record<string, string | undefined>`
- `Golt.App(): Golt.AppInstance`
- `Golt.db: Golt.Database`
- `Golt.fs: Golt.Fs`
- `Golt.crypto: Golt.Crypto`
- `Golt.jwt: Golt.Jwt`
- `Golt.logger(config?): Golt.Middleware`

### App and routing

`Golt.AppInstance` supports:

- `use(middleware)`
- `get(path, handler)`, `post(...)`, `put(...)`, `delete(...)`
- `static(prefix, dirPath, spa?)`
- `notFound(handler)`
- `serve(port)`

Handlers receive a `Golt.Context` with helpers like:

- `Method()`, `Url()`, `Param(name)`, `Query(key)`
- `GetHeader(key)`, `SetHeader(key, value)`
- `Status(code)`, `Send(body)`, `Json(data)`
- `ValidateBody(schema)` (simple schema inference for `"string" | "number" | "boolean"`)

### Database

```ts
type DbDialect = "sqlite" | "postgres" | "mysql" | "sqlserver";

const client = Golt.db.connect("postgres", "postgres://user:pass@host:5432/db");
const rows = await client.query<{ id: number }>("select id from users where id = $1", 1);
client.close();
```

## Examples

### Basic server

```ts
const app = Golt.App();

app.get("/", (c) => {
  c.Json({ message: "Hello from Golt!" });
});

app.serve(3000);
```

### Middleware

```ts
const app = Golt.App();

app.use(Golt.logger({ format: "dev" }));

app.get("/health", (c) => {
  c.Status(200).Send("ok");
});
```

### `fetch` typing

```ts
const res = await fetch("https://example.com/api", { method: "GET", timeout: 5000 });
const data = await res.json<{ ok: boolean }>();
```

## Troubleshooting

- No `Golt` IntelliSense:
  - Ensure `golt.json` exists in the TypeScript project directory (often the workspace root).
  - Reload the window.
  - Make sure you are editing a file handled by TypeScript/JavaScript language features.
- Confirm plugin loaded:
  - Open “TypeScript: Open TS Server Log”.
  - Look for messages starting with `[Golt Plugin]`, such as:
    - `Initializing Golt Runtime Support...`
    - `Golt project detected. Injecting global types: ...golt.d.ts`

## Project layout

- [src/extension.ts](src/extension.ts): VS Code extension activation entrypoint
- [golt-ts-plugin/index.js](golt-ts-plugin/index.js): TypeScript Server Plugin (project detection + external typings)
- [golt-ts-plugin/golt.d.ts](golt-ts-plugin/golt.d.ts): injected global typings
- [package.json](package.json): activates on `workspaceContains:golt.json` and contributes the TS server plugin
