import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import axios from "axios";

const executeFile = promisify(execFile);

export class CompilerService {
  constructor(private readonly localCompilerPath?: string) {}

  async compile(source: string): Promise<Buffer> {
    if (this.localCompilerPath && (await fileExists(this.localCompilerPath))) {
      return this.compileLocally(source);
    }

    return this.compileThroughApi(source);
  }

  private async compileLocally(source: string): Promise<Buffer> {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mta-compiler-"));
    const sourcePath = path.join(temporaryDirectory, "source.lua");
    const outputPath = path.join(temporaryDirectory, "compiled.luac");

    try {
      if (process.platform !== "win32") {
        await fs.chmod(this.localCompilerPath!, 0o755);
      }

      await fs.writeFile(sourcePath, source, "utf8");
      await executeFile(this.localCompilerPath!, ["-e3", "-o", outputPath, sourcePath], {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });

      return await fs.readFile(outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      throw new Error(`Local Lua compilation failed: ${message}`);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async compileThroughApi(source: string): Promise<Buffer> {
    try {
      const response = await axios.post("https://luac.mtasa.com", source, {
        params: {
          compile: 1,
          debug: 0,
          obfuscate: 3,
        },
        responseType: "arraybuffer",
      });

      return Buffer.from(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred";
      throw new Error(`Lua compilation failed: ${message}`);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
