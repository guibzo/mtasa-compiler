# MTA Resource Lua Compiler

MTA Resource Lua Compiler compiles Lua scripts declared by an MTA resource using the official [MTA Lua compilation API](https://wiki.multitheftauto.com/wiki/Lua_compilation_API). It works in Visual Studio Code and Cursor.

## What it does

- Creates a clean `_compiled` directory at the resource root.
- Compiles only active Lua scripts declared in `meta.xml`.
- Expands wildcard entries such as `**/*` and ignores XML comments.
- Writes every compiled script and a converted `meta.xml` directly inside `_compiled`.
- Supports compiling an entire resource, a folder, or one or more selected Lua files.
- Uses the bundled MTA compiler locally on Windows and Linux to avoid one network request per file. The online API is used as a fallback on unsupported platforms.

Compiled files keep their original file name and use the `.luac` extension. If source files have the same name, the relative path is added to the output name to prevent collisions.

## Usage

### Compile a resource

1. Right-click a resource folder or its `meta.xml`.
2. Select **Compile resource**.

### Compile selected scripts or a folder

1. Select one or more Lua files in the Explorer (or a folder inside a resource).
2. Select **Compile selected script(s)**, or **Compile resource or folder** for a folder.

The generated `_compiled` directory is recreated on each run, so it never contains artifacts from a previous compilation.

## Installation

Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/search?term=MTA%20Resource%20Lua%20Compiler&target=VS&vsVersion=vs2022). Cursor supports the same VS Code extension format.

## Disclaimer

On supported platforms, source files are compiled locally with the bundled MTA compiler. Unsupported platforms use the MTA API as a fallback. Review the [source code](https://github.com/guibzo/mtasa-compiler) before use.
