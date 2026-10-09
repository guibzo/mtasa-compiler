import path from "path";
import { CompilerService } from "./compiler.service";
import { FileService } from "./file.service";
import { CompiledScript, MetaXmlService, normalize, ResolvedScript } from "./meta-xml.service";

export type CompileProgress = (message: string, completed: number, total: number) => void;

export class ResourceCompilerService {
  constructor(
    private readonly fileService = new FileService(),
    private readonly compilerService = new CompilerService(),
    private readonly metaXmlService = new MetaXmlService(),
  ) {}

  async compileResource(resourceRoot: string, selectedPaths?: string[], onProgress?: CompileProgress): Promise<number> {
    const metaPath = path.join(resourceRoot, "meta.xml");
    if (!(await this.fileService.exists(metaPath))) {
      throw new Error(`Resource meta.xml was not found in ${resourceRoot}`);
    }

    const meta = await this.metaXmlService.parse(metaPath);
    const resolvedScripts = await this.metaXmlService.resolveScripts(meta, resourceRoot);
    const scripts = selectedPaths
      ? resolvedScripts.filter((script) => selectedPaths.some((selectedPath) => isSelected(script.sourcePath, selectedPath)))
      : resolvedScripts;

    if (scripts.length === 0) {
      throw new Error("No Lua scripts from meta.xml matched the selected resources.");
    }

    const compiledScripts = this.createCompiledScripts(resourceRoot, scripts);
    const outputDirectory = path.join(resourceRoot, "_compiled");

    await this.fileService.remove(outputDirectory);
    await this.fileService.createDirectory(outputDirectory);

    let nextScriptIndex = 0;
    let completedScripts = 0;
    const workerCount = this.compilerService.usesLocalCompiler ? Math.min(4, compiledScripts.length) : 1;

    const compileNextScript = async (): Promise<void> => {
      while (nextScriptIndex < compiledScripts.length) {
        const script = compiledScripts[nextScriptIndex];
        nextScriptIndex += 1;

        const source = await this.fileService.readText(script.sourcePath);
        const compiled = await this.compilerService.compile(source);
        await this.fileService.writeFile(path.join(outputDirectory, script.outputName), compiled);

        completedScripts += 1;
        onProgress?.(`Compiled ${path.basename(script.sourcePath)}`, completedScripts, compiledScripts.length);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => compileNextScript()));

    const compiledMeta = this.metaXmlService.renderCompiledMeta(meta, resolvedScripts, compiledScripts);
    await this.fileService.writeFile(path.join(outputDirectory, "meta.xml"), Buffer.from(compiledMeta, "utf8"));

    onProgress?.("Done", compiledScripts.length, compiledScripts.length);
    return compiledScripts.length;
  }

  private createCompiledScripts(resourceRoot: string, scripts: ResolvedScript[]): CompiledScript[] {
    const uniqueScripts = new Map<string, ResolvedScript>();
    for (const script of scripts) {
      uniqueScripts.set(normalize(script.sourcePath), script);
    }

    const usedOutputNames = new Set<string>();
    const compiledScripts: CompiledScript[] = [];

    for (const script of uniqueScripts.values()) {
      const outputName = createOutputName(resourceRoot, script.sourcePath, usedOutputNames);
      usedOutputNames.add(outputName.toLowerCase());
      compiledScripts.push({
        sourcePath: script.sourcePath,
        outputName,
      });
    }

    return compiledScripts;
  }
}

function createOutputName(resourceRoot: string, sourcePath: string, usedOutputNames: Set<string>): string {
  const extension = path.extname(sourcePath);
  const baseName = `${path.basename(sourcePath, extension)}.luac`;

  if (!usedOutputNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  const relativePath = path.relative(resourceRoot, sourcePath).slice(0, -extension.length);
  const flattenedPath = relativePath.replace(/[\\/]+/g, "_").replace(/[<>:"|?*]/g, "_");
  let outputName = `${flattenedPath}.luac`;
  let suffix = 2;

  while (usedOutputNames.has(outputName.toLowerCase())) {
    outputName = `${flattenedPath}-${suffix}.luac`;
    suffix += 1;
  }

  return outputName;
}

function isSelected(sourcePath: string, selectedPath: string): boolean {
  const source = normalize(sourcePath);
  const selection = normalize(selectedPath);
  return source === selection || source.startsWith(`${selection}${path.sep}`);
}
