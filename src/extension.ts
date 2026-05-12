import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  applyEdits,
  modify,
  parse,
  ParseError,
} from "jsonc-parser";

const GOLT_TYPES_RELATIVE_DIR = path.join(".golt", "types", "golt");
const GOLT_TYPES_FILE = "index.d.ts";

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("golt.enableWorkspace", async () => {
      await enableGoltWorkspace(context, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("golt.disableWorkspace", async () => {
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

  fs.writeFileSync(tsconfigPath, JSON.stringify(config, null, 2), "utf8");
}

function patchConfigFile(configPath: string) {
  const originalText = fs.readFileSync(configPath, "utf8");

  const errors: ParseError[] = [];
  const config = parse(originalText, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0 || !config || typeof config !== "object") {
    vscode.window.showWarningMessage(
      `Could not update ${path.basename(configPath)} because it contains invalid JSON.`,
    );
    return;
  }

  let updatedText = originalText;

  const currentCompilerOptions = config.compilerOptions ?? {};
  const currentTypeRoots: string[] = Array.isArray(currentCompilerOptions.typeRoots)
    ? currentCompilerOptions.typeRoots
    : [];

  const nextTypeRoots = addUniqueValues(currentTypeRoots, [
    "./node_modules/@types",
    "./.golt/types",
  ]);

  updatedText = applyJsoncEdit(updatedText, ["compilerOptions", "typeRoots"], nextTypeRoots);

  const currentInclude: string[] = Array.isArray(config.include)
    ? config.include
    : ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];

  const nextInclude = addUniqueValues(currentInclude, [".golt/types/**/*.d.ts"]);

  updatedText = applyJsoncEdit(updatedText, ["include"], nextInclude);

  fs.writeFileSync(configPath, updatedText, "utf8");
}

function applyJsoncEdit(
  text: string,
  pathSegments: (string | number)[],
  value: unknown,
): string {
  const edits = modify(text, pathSegments, value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
    },
  });

  return applyEdits(text, edits);
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
  const originalText = fs.readFileSync(configPath, "utf8");

  const errors: ParseError[] = [];
  const config = parse(originalText, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0 || !config || typeof config !== "object") {
    return;
  }

  let updatedText = originalText;

  if (Array.isArray(config.compilerOptions?.typeRoots)) {
    const nextTypeRoots = config.compilerOptions.typeRoots.filter(
      (item: string) => item !== "./.golt/types",
    );

    updatedText = applyJsoncEdit(
      updatedText,
      ["compilerOptions", "typeRoots"],
      nextTypeRoots,
    );
  }

  if (Array.isArray(config.include)) {
    const nextInclude = config.include.filter(
      (item: string) => item !== ".golt/types/**/*.d.ts",
    );

    updatedText = applyJsoncEdit(updatedText, ["include"], nextInclude);
  }

  fs.writeFileSync(configPath, updatedText, "utf8");
}

async function restartTypeScriptServer() {
  try {
    await vscode.commands.executeCommand("typescript.restartTsServer");
  } catch {
  }
}

export function deactivate() {}
