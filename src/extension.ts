import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const GOLT_TYPES_RELATIVE_DIR = path.join(".golt", "types", "golt");
const GOLT_TYPES_FILE = "index.d.ts";

export async function activate(context: vscode.ExtensionContext) {
  console.log("[Golt] Extension activated");

  context.subscriptions.push(
    vscode.commands.registerCommand("golt.enableWorkspace", async () => {
      console.log("[Golt] Enable Workspace command executed");
      await enableGoltWorkspace(context, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("golt.disableWorkspace", async () => {
      console.log("[Golt] Disable Workspace command executed");
      await disableGoltWorkspace();
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/golt.json");

  watcher.onDidCreate(async () => {
    await enableGoltWorkspace(context, false);
  });

  watcher.onDidDelete(async () => {
    vscode.window.showInformationMessage(
      "golt.json was removed. Run 'Golt: Disable Workspace' if you want to remove Golt typings from tsconfig/jsconfig.",
    );
  });

  context.subscriptions.push(watcher);

  await autoEnableIfGoltConfigExists(context);
}

async function autoEnableIfGoltConfigExists(context: vscode.ExtensionContext) {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    return;
  }

  for (const folder of folders) {
    const goltConfigPath = path.join(folder.uri.fsPath, "golt.json");

    if (fs.existsSync(goltConfigPath)) {
      await setupWorkspaceFolder(context, folder);
    }
  }
}

async function enableGoltWorkspace(
  context: vscode.ExtensionContext,
  createConfigIfMissing: boolean,
) {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("Open a workspace folder before enabling Golt.");
    return;
  }

  let enabled = false;

  for (const folder of folders) {
    const goltConfigPath = path.join(folder.uri.fsPath, "golt.json");

    if (!fs.existsSync(goltConfigPath)) {
      if (!createConfigIfMissing) {
        continue;
      }

      fs.writeFileSync(
        goltConfigPath,
        JSON.stringify(
          {
            runtime: "golt",
            types: true,
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    await setupWorkspaceFolder(context, folder);
    enabled = true;
  }

  if (!enabled) {
    vscode.window.showWarningMessage("No golt.json file was found in the current workspace.");
    return;
  }

  await restartTypeScriptServer();

  vscode.window.showInformationMessage("Golt typings enabled for this workspace.");
}

async function setupWorkspaceFolder(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
) {
  copyGoltTypes(context, folder);
  ensureTypeScriptConfig(folder);
}

function copyGoltTypes(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
) {
  const sourceDtsPath = path.join(
    context.extensionPath,
    "resources",
    "types",
    "golt.d.ts",
  );

  const targetTypesDir = path.join(folder.uri.fsPath, GOLT_TYPES_RELATIVE_DIR);
  const targetDtsPath = path.join(targetTypesDir, GOLT_TYPES_FILE);

  if (!fs.existsSync(sourceDtsPath)) {
    throw new Error(`Missing bundled Golt types: ${sourceDtsPath}`);
  }

  fs.mkdirSync(targetTypesDir, { recursive: true });
  fs.copyFileSync(sourceDtsPath, targetDtsPath);
}

function ensureTypeScriptConfig(folder: vscode.WorkspaceFolder) {
  const tsconfigPath = path.join(folder.uri.fsPath, "tsconfig.json");
  const jsconfigPath = path.join(folder.uri.fsPath, "jsconfig.json");

  if (fs.existsSync(tsconfigPath)) {
    patchConfigFile(tsconfigPath);
    return;
  }

  if (fs.existsSync(jsconfigPath)) {
    patchConfigFile(jsconfigPath);
    return;
  }

  createDefaultTsConfig(tsconfigPath);
}

function createDefaultTsConfig(tsconfigPath: string) {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      typeRoots: ["./node_modules/@types", "./.golt/types"],
    },
    include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", ".golt/types/**/*.d.ts"],
    exclude: ["node_modules"],
  };

  writeJsonFile(tsconfigPath, config);
}

function patchConfigFile(configPath: string) {
  const config = readJsonLikeFile(configPath);

  if (!config) {
    vscode.window.showWarningMessage(
      `Could not update ${path.basename(configPath)} because it contains invalid JSON.`,
    );
    return;
  }

  if (!config.compilerOptions || typeof config.compilerOptions !== "object") {
    config.compilerOptions = {};
  }

  const compilerOptions = config.compilerOptions as Record<string, unknown>;

  const currentTypeRoots = Array.isArray(compilerOptions.typeRoots)
    ? compilerOptions.typeRoots.filter((item): item is string => typeof item === "string")
    : [];

  compilerOptions.typeRoots = addUniqueValues(currentTypeRoots, [
    "./node_modules/@types",
    "./.golt/types",
  ]);

  const currentInclude = Array.isArray(config.include)
    ? config.include.filter((item): item is string => typeof item === "string")
    : ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];

  config.include = addUniqueValues(currentInclude, [".golt/types/**/*.d.ts"]);

  writeJsonFile(configPath, config);
}

function addUniqueValues(current: string[], values: string[]) {
  const normalized = new Set(current);

  for (const value of values) {
    normalized.add(value);
  }

  return Array.from(normalized);
}

async function disableGoltWorkspace() {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("Open a workspace folder before disabling Golt.");
    return;
  }

  for (const folder of folders) {
    const tsconfigPath = path.join(folder.uri.fsPath, "tsconfig.json");
    const jsconfigPath = path.join(folder.uri.fsPath, "jsconfig.json");

    if (fs.existsSync(tsconfigPath)) {
      removeGoltFromConfig(tsconfigPath);
    }

    if (fs.existsSync(jsconfigPath)) {
      removeGoltFromConfig(jsconfigPath);
    }
  }

  await restartTypeScriptServer();

  vscode.window.showInformationMessage("Golt typings disabled for this workspace.");
}

function removeGoltFromConfig(configPath: string) {
  const config = readJsonLikeFile(configPath);

  if (!config) {
    return;
  }

  if (
    config.compilerOptions &&
    typeof config.compilerOptions === "object" &&
    Array.isArray(config.compilerOptions.typeRoots)
  ) {
    config.compilerOptions.typeRoots = config.compilerOptions.typeRoots.filter(
      (item: unknown) => item !== "./.golt/types",
    );
  }

  if (Array.isArray(config.include)) {
    config.include = config.include.filter(
      (item: unknown) => item !== ".golt/types/**/*.d.ts",
    );
  }

  writeJsonFile(configPath, config);
}

function readJsonLikeFile(filePath: string): Record<string, any> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const clean = stripJsonCommentsAndTrailingCommas(raw);
    const parsed = JSON.parse(clean);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stripJsonCommentsAndTrailingCommas(input: string): string {
  let output = "";
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const current = input[i];
    const next = input[i + 1];

    if (inString) {
      output += current;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (current === "\\") {
        escaped = true;
        continue;
      }

      if (current === stringQuote) {
        inString = false;
        stringQuote = "";
      }

      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      stringQuote = current;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") {
        i++;
      }

      output += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      i += 2;

      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
        i++;
      }

      i++;
      continue;
    }

    output += current;
  }

  return output.replace(/,\s*([}\]])/g, "$1");
}

async function restartTypeScriptServer() {
  try {
    await vscode.commands.executeCommand("typescript.restartTsServer");
  } catch {
    // TypeScript server may not be active yet.
  }
}

export function deactivate() {}
