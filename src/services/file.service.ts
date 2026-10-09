import * as vscode from "vscode";

export class FileService {
  async exists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
      return false;
    }
  }

  async readText(filePath: string): Promise<string> {
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return Buffer.from(content).toString("utf8");
  }

  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);
  }

  async createDirectory(directoryPath: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(directoryPath));
  }

  async remove(filePath: string): Promise<void> {
    if (await this.exists(filePath)) {
      await vscode.workspace.fs.delete(vscode.Uri.file(filePath), {
        recursive: true,
        useTrash: false,
      });
    }
  }
}
