import axios from "axios";

export class CompilerService {
  async compile(source: string): Promise<Buffer> {
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
