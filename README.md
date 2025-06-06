# PHPDoc Generator VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/hiteshgeek.phpdoc-generator-hiteshgeek.svg)](https://marketplace.visualstudio.com/items?itemName=hiteshgeek.phpdoc-generator-hiteshgeek)
[![GitHub Issues](https://img.shields.io/github/issues/hiteshgeek/phpdoc_generator.svg)](https://github.com/hiteshgeek/phpdoc_generator/issues)

## Overview

**PHPDoc Generator** is a powerful Visual Studio Code extension that intelligently generates and updates PHPDoc blocks for your PHP code. It supports advanced features such as PHP parsing, docblock preservation, custom `@settings` integration, MySQL/cached settings, and robust error handling. The extension is designed for real-world PHP projects and is available on the VS Code Marketplace.

---

## What's New

See the [CHANGELOG.md](./CHANGELOG.md) for full details.

**Latest Highlights:**

- Automatic synchronization of `@throws` tags in the docblock—new exception types are added when detected in the function, and obsolete tags are removed if the corresponding throw statement is commented out or deleted.
- The default docblock structure is now:

  ```
  @param

  @throws

  @return
  ```

- Parameter and return types are always provided in the docblock, even when not explicitly mentioned in the code (defaults to `mixed` or `void`).
- **Project-wide docblock generation:** Command: `Generate PHPDoc for Entire Project`, Shortcut: `Ctrl+Alt+2`.
- **Exclude patterns:** The `phpdoc-generator-hiteshgeek.exclude` setting allows you to specify folders and files to skip during project-wide docblock generation. The default exclude list is:
  - `**/node_modules/**`
  - `**/vendor/**`
  - `**/.git/**`
- All improvements apply to both single-block, file, and entire-project docblock generation.

---

## Features

- **Intelligent PHPDoc Generation**

  - Parses PHP code for accurate block detection.
  - Generates and updates PHPDoc blocks for functions, methods, and classes.
  - Preserves user-written docblock content, including multi-line summaries and descriptions.
  - Robust handling of edge cases and formatting.

- **Custom `@settings` Block Integration** _(for Accrete Globus Technology only)_

  - Detects `getSettings("...")` calls in PHP code.
  - Fetches setting descriptions from a MySQL database or local cache.
  - Only prints the setting key if no description is available, ensuring clean docblocks.
  - **Note:** The `@settings` block is developed and applicable for Accrete Globus Technology (AGT) only.

- **Cache Management** _(for Accrete Globus Technology only)_

  - Automatically creates and populates `settings_cache.json` if missing or empty.
  - Command to manually refresh the settings cache from the database.
  - **Note:** Settings cache management is developed and applicable for Accrete Globus Technology (AGT) only.

- **VS Code Integration**

  - Command palette and keyboard shortcuts for:
    - Generating/updating PHPDoc for the current block (`Ctrl+Alt+0`)
    - Generating/updating PHPDoc for all blocks in the file (`Ctrl+Alt+1`)
    - Generating/updating PHPDoc for the entire project (`Ctrl+Alt+2`)
    - Refreshing the settings cache (`Ctrl+Alt+7`) _(for Accrete Globus Technology only)_
  - Status bar integration for quick access.

- **Error Handling**
  - Docblock generation works even if the DB or cache is unavailable.
  - All file and DB operations are robust and fail gracefully.

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
