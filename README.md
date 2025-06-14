# PHPDoc Generator VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/hiteshgeek.phpdoc-generator-hiteshgeek.svg)](https://marketplace.visualstudio.com/items?itemName=hiteshgeek.phpdoc-generator-hiteshgeek)
[![GitHub Issues](https://img.shields.io/github/issues/hiteshgeek/phpdoc_generator.svg)](https://github.com/hiteshgeek/phpdoc_generator/issues)

## Overview

**PHPDoc Generator** is a powerful Visual Studio Code extension that intelligently generates and updates PHPDoc blocks for your PHP code. It supports advanced features such as PHP parsing, docblock preservation, custom `@settings` integration, MySQL/cached settings, and robust error handling. The extension is designed for real-world PHP projects and is available on the VS Code Marketplace.

---

## What's New

See the [CHANGELOG.md](./CHANGELOG.md) for full details.

**Latest Highlights:**

- **Improved PHP 8 Union Return Type Support**: Extension now correctly handles functions with union return types (`int|string`, `array|bool`, etc.), generating accurate docblocks and properly updating existing ones.
- Automatic synchronization of `@throws` tags in the docblock—new exception types are added when detected in the function, and obsolete tags are removed if the corresponding throw statement is commented out or deleted.
- The default docblock structure is now:

  ```
  @param

  @throws

  @return
  ```

- Parameter and return types are always provided in the docblock, even when not explicitly mentioned in the code (defaults to `mixed` or `void`).
- **Project-wide docblock generation:** Command: `Generate PHPDoc for Entire Project`, Shortcut: `Ctrl+Alt+2`.
- **Exclude patterns:** Provided setting to specify folders and files to skip during project-wide docblock generation. The default exclude list is:
  - `**/node_modules/**`
  - `**/vendor/**`
  - `**/.git/**`
- **New setting: `showStatusBarToggle`** (default: true). Controls whether the status bar toggle for Generate/Update on Save is visible. If set to false, the status bar toggle will be hidden.
- All improvements apply to both single-block, file, and entire-project docblock generation.

---

## Features

- **Intelligent PHPDoc Generation**

  - Parses PHP code for accurate block detection.
  - Generates and updates PHPDoc blocks for functions, methods, and classes.
  - Preserves user-written docblock content, including multi-line summaries and descriptions.
  - Robust handling of edge cases and formatting.
  - Full support for PHP 8 union return types and parameter types.

- **Custom `@settings` Block Integration** _(for Accrete Globus Technology only)_

  - Detects `getSettings("...")` calls in PHP code.
  - Fetches setting descriptions from a MySQL database or local cache.
  - Only prints the setting key if no description is available, ensuring clean docblocks.
  - **Note:** The `@settings` block is developed and applicable for Accrete Globus Technology (AGT) only.

- **Cache Management** _(for Accrete Globus Technology only)_

  - Automatically populates settings cache if empty.
  - Command to manually refresh the settings cache from the database.
  - **Note:** Settings cache management is developed and applicable for Accrete Globus Technology (AGT) only.

- **Error Handling**

  - Docblock generation works even if the DB or cache is unavailable.
  - All file and DB operations are robust and fail gracefully.

- Status bar integration for quick access.

---

## Commands & Shortcuts

You can use the following commands via keyboard shortcuts or by searching in the Command Palette (Ctrl+Shift+P):

| Command Description                        | Shortcut   | Command Palette Name                   |
| ------------------------------------------ | ---------- | -------------------------------------- |
| Generate/update PHPDoc for current block   | Ctrl+Alt+0 | PHPDoc: Generate for Current Block     |
| Generate/update PHPDoc for all blocks/file | Ctrl+Alt+1 | PHPDoc: Generate for File              |
| Generate/update PHPDoc for entire project  | Ctrl+Alt+2 | PHPDoc: Generate for Entire Project    |
| Collapse all docblocks in file             | Ctrl+Alt+5 | PHPDoc: Collapse All Docblocks         |
| Expand all docblocks in file               | Ctrl+Alt+6 | PHPDoc: Expand All Docblocks           |
| Refresh the settings cache                 | Ctrl+Alt+7 | PHPDoc: Refresh Settings Cache         |
| Toggle Generate/Update on Save             | Ctrl+Alt+9 | PHPDoc: Toggle Generate/Update on Save |

---

## Getting Started

1. **Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hiteshgeek.phpdoc-generator-hiteshgeek).**
2. Open a PHP file and use the command palette or keyboard shortcuts to generate or update PHPDoc blocks.
3. (Optional, for Accrete Globus Technology only) Configure your MySQL credentials and settings cache as described in the extension settings for advanced features.

---

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hiteshgeek.phpdoc-generator-hiteshgeek)
- [GitHub Repository](https://github.com/hiteshgeek/phpdoc_generator)
- [Report Issues](https://github.com/hiteshgeek/phpdoc_generator/issues)

---

## License

MIT

---

## Author

- Hitesh Vaghela ([hiteshgeek](https://github.com/hiteshgeek))

---
