import path from "path";
import * as vscode from "vscode";
import { CompilerService } from "../services/compiler.service";
import { FileService } from "../services/file.service";
import { ResourceCompilerService } from "../services/resource-compiler.service";

export const COMPILE_RESOURCE_COMMAND = "mta-compile-scripts.run-from-meta";
export const COMPILE_SELECTION_COMMAND = "mta-compile-scripts.run-from-lua";

type CompilationGroup = {
  resourceRoot: string;
  selectedPaths: Set<string>;
  compileWholeResource: boolean;
};

export function registerCompileCommands(
  context: vscode.ExtensionContext,
  resourceCompiler?: ResourceCompilerService,
  fileService = new FileService(),
): void {
  const compiler = resourceCompiler ?? new ResourceCompilerService(fileService, new CompilerService(getBundledCompilerPath(context.extensionPath)));
  const output = vscode.window.createOutputChannel("MTA Script Compiler");

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand(COMPILE_RESOURCE_COMMAND, (...args: unknown[]) =>
      compileTargets(args, true, compiler, fileService, output),
    ),
    vscode.commands.registerCommand(COMPILE_SELECTION_COMMAND, (...args: unknown[]) =>
      compileTargets(args, false, compiler, fileService, output),
    ),
  );
}

function getBundledCompilerPath(extensionPath: string): string | undefined {
  if (process.platform === "win32") {
    return path.join(extensionPath, "bin", "win32", "luac_mta.exe");
  }

  if (process.platform === "linux") {
    const architecture = process.arch === "x64" ? "x64" : process.arch === "ia32" ? "x86" : undefined;
    return architecture ? path.join(extensionPath, "bin", `linux-${architecture}`, "luac_mta") : undefined;
  }

  return undefined;
}

async function compileTargets(
  args: unknown[],
  allowWholeResource: boolean,
  resourceCompiler: ResourceCompilerService,
  fileService: FileService,
  output: vscode.OutputChannel,
): Promise<void> {
  const targets = extractUris(args);
  if (targets.length === 0) {
    await showError("Select a resource, folder, or Lua file to compile.", output);
    return;
  }

  try {
    const groups = await groupTargets(targets, allowWholeResource, fileService);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Compiling MTA scripts",
        cancellable: false,
      },
      async (progress) => {
        let completedGroups = 0;
        let reportedProgress = 0;

        for (const group of groups) {
          const selectedPaths = group.compileWholeResource ? undefined : [...group.selectedPaths];
          await resourceCompiler.compileResource(group.resourceRoot, selectedPaths, (message, completed, total) => {
            const groupProgress = total === 0 ? 0 : completed / total;
            const overallProgress = ((completedGroups + groupProgress) / groups.length) * 100;
            progress.report({
              message: `${path.basename(group.resourceRoot)}: ${message}`,
              increment: Math.max(0, overallProgress - reportedProgress),
            });
            reportedProgress = overallProgress;
          });
          completedGroups += 1;
        }
      },
    );

    const count = groups.length === 1 ? "resource" : "resources";
    vscode.window.showInformationMessage(`Compilation completed for ${groups.length} ${count}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    output.appendLine(message);
    await showError(`${message} (Check the MTA Script Compiler output for details.)`, output);
  }
}

async function groupTargets(
  targets: vscode.Uri[],
  allowWholeResource: boolean,
  fileService: FileService,
): Promise<CompilationGroup[]> {
  const groups = new Map<string, CompilationGroup>();

  for (const target of targets) {
    if (target.scheme !== "file") {
      throw new Error("Only files on the local file system can be compiled.");
    }

    const targetPath = target.fsPath;
    const isDirectory = await fileService.isDirectory(targetPath);
    const resourceRoot = await findResourceRoot(targetPath, isDirectory, fileService);
    const normalizedRoot = path.resolve(resourceRoot);
    const group = groups.get(normalizedRoot) ?? {
      resourceRoot: normalizedRoot,
      selectedPaths: new Set<string>(),
      compileWholeResource: false,
    };

    const isMetaFile = !isDirectory && path.basename(targetPath).toLowerCase() === "meta.xml";
    const isResourceDirectory = isDirectory && (await fileService.exists(path.join(targetPath, "meta.xml")));

    if (allowWholeResource && (isMetaFile || isResourceDirectory)) {
      group.compileWholeResource = true;
      group.selectedPaths.clear();
    } else if (!group.compileWholeResource) {
      group.selectedPaths.add(path.resolve(targetPath));
    }

    groups.set(normalizedRoot, group);
  }

  return [...groups.values()];
}

async function findResourceRoot(targetPath: string, isDirectory: boolean, fileService: FileService): Promise<string> {
  let current = path.resolve(isDirectory ? targetPath : path.dirname(targetPath));

  while (true) {
    if (await fileService.exists(path.join(current, "meta.xml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error(`Could not find a resource meta.xml for ${targetPath}.`);
}

function extractUris(args: unknown[]): vscode.Uri[] {
  const uris: vscode.Uri[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value instanceof vscode.Uri || (value && typeof value === "object" && "scheme" in value && "fsPath" in value)) {
      uris.push(value as vscode.Uri);
      return;
    }

    if (value && typeof value === "object" && "resourceUri" in value) {
      visit((value as { resourceUri: unknown }).resourceUri);
    }
  };

  args.forEach(visit);
  return uris;
}

async function showError(message: string, output: vscode.OutputChannel): Promise<void> {
  const action = await vscode.window.showErrorMessage(message, "Open Output", "Close");
  if (action === "Open Output") {
    output.show(true);
  }
}

