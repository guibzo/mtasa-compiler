import path from "path";
import { glob } from "glob";
import { Element, js2xml, xml2js } from "xml-js";
import { FileService } from "./file.service";

export type ScriptEntry = {
  element: Element;
  source: string;
};

export type ResolvedScript = ScriptEntry & {
  sourcePath: string;
};

export type CompiledScript = {
  sourcePath: string;
  outputName: string;
};

export class MetaXmlService {
  constructor(private readonly fileService = new FileService()) {}

  async parse(filePath: string): Promise<Element> {
    const content = await this.fileService.readText(filePath);
    return xml2js(content, { compact: false }) as Element;
  }

  getScriptEntries(meta: Element): ScriptEntry[] {
    const root = meta.elements?.[0];

    if (!root?.elements) {
      return [];
    }

    return root.elements.flatMap((element) => {
      if (element.type !== "element" || element.name !== "script") {
        return [];
      }

      const source = element.attributes?.src;
      if (typeof source !== "string" || source.length === 0) {
        return [];
      }

      return [{ element, source }];
    });
  }

  async resolveScripts(meta: Element, resourceRoot: string): Promise<ResolvedScript[]> {
    const resolved: ResolvedScript[] = [];

    for (const entry of this.getScriptEntries(meta)) {
      const sourcePattern = entry.source.replace(/\\/g, "/");
      const sourcePath = sourcePattern.toLowerCase().endsWith(".luac")
        ? `${sourcePattern.slice(0, -5)}.lua`
        : sourcePattern;

      const matches = await this.resolvePattern(sourcePath, resourceRoot);
      resolved.push(
        ...matches.map((match) => ({
          ...entry,
          sourcePath: match,
        })),
      );
    }

    return this.deduplicate(resolved);
  }

  renderCompiledMeta(meta: Element, scripts: ResolvedScript[], compiledScripts: CompiledScript[]): string {
    const outputBySource = new Map(compiledScripts.map((script) => [normalize(script.sourcePath), script.outputName]));
    const scriptsByElement = new Map<Element, ResolvedScript[]>();

    for (const script of scripts) {
      const elementScripts = scriptsByElement.get(script.element) ?? [];
      elementScripts.push(script);
      scriptsByElement.set(script.element, elementScripts);
    }

    const root = meta.elements?.[0];
    if (!root?.elements) {
      return js2xml(meta, { spaces: "\t" });
    }

    const emittedScripts = new Set<string>();
    root.elements = root.elements.flatMap((element) => {
      if (element.type !== "element" || element.name !== "script") {
        return [element];
      }

      const elementScripts = scriptsByElement.get(element);
      if (!elementScripts) {
        return [element];
      }

      return elementScripts.flatMap((script) => {
        const outputName = outputBySource.get(normalize(script.sourcePath));
        if (!outputName) {
          return [];
        }

        const scriptKey = `${normalize(script.sourcePath)}:${String(element.attributes?.type ?? "")}`;
        if (emittedScripts.has(scriptKey)) {
          return [];
        }
        emittedScripts.add(scriptKey);

        return [
          {
            ...element,
            attributes: {
              ...element.attributes,
              src: outputName,
            },
          },
        ];
      });
    });

    return js2xml(meta, { spaces: "\t" });
  }

  private async resolvePattern(pattern: string, resourceRoot: string): Promise<string[]> {
    const normalizedPattern = pattern.replace(/\\/g, "/");
    const absolutePattern = path.resolve(resourceRoot, normalizedPattern);

    if (!isInside(resourceRoot, absolutePattern)) {
      throw new Error(`The meta.xml references a file outside the resource: ${pattern}`);
    }

    const matches = await glob(normalizedPattern, {
      cwd: resourceRoot,
      dot: true,
      nodir: true,
      ignore: ["_compiled/**"],
    });

    const luaFiles = matches
      .filter((match) => path.extname(match).toLowerCase() === ".lua")
      .map((match) => path.resolve(resourceRoot, match));

    if (luaFiles.length === 0 && !hasMagic(normalizedPattern) && path.extname(normalizedPattern).toLowerCase() === ".lua") {
      throw new Error(`File listed in meta.xml was not found: ${normalizedPattern}`);
    }

    return luaFiles;
  }

  private deduplicate(scripts: ResolvedScript[]): ResolvedScript[] {
    const seenByElement = new Map<Element, Set<string>>();

    return scripts.filter((script) => {
      const seenSources = seenByElement.get(script.element) ?? new Set<string>();
      const source = normalize(script.sourcePath);

      if (seenSources.has(source)) {
        return false;
      }

      seenSources.add(source);
      seenByElement.set(script.element, seenSources);
      return true;
    });
  }
}

export function normalize(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

export function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function hasMagic(value: string): boolean {
  return /[*?[\]{}()!]/.test(value);
}
