# PHPDoc Generator VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/hiteshgeek.phpdoc-generator-hiteshgeek.svg)](https://marketplace.visualstudio.com/items?itemName=hiteshgeek.phpdoc-generator-hiteshgeek)
[![GitHub Issues](https://img.shields.io/github/issues/hiteshgeek/phpdoc_generator.svg)](https://github.com/hiteshgeek/phpdoc_generator/issues)

## Overview

**PHPDoc Generator** is a powerful Visual Studio Code extension that intelligently generates and updates PHPDoc blocks for your PHP code. It supports advanced features such as parsing PHP with `php-parser`, preserving user docblock content, and integrating custom settings descriptions fetched from a MySQL database. The extension is designed for robust, real-world PHP projects and is ready for publishing.

---

## Features

- **Intelligent PHPDoc Generation**

  - Parses PHP code using [`php-parser`](https://www.npmjs.com/package/php-parser) for accurate block detection.
  - Generates and updates PHPDoc blocks for functions, methods, and classes.
  - Preserves user-written docblock content, including multi-line summaries and descriptions.
  - Robust handling of edge cases and formatting.

- **Custom `@settings` Block Integration**

  - Automatically detects `getSettings("...")` calls in PHP code.
  - Fetches setting descriptions from a MySQL database (using credentials from a `.env` file).
  - Caches all settings in a local `settings_cache.json` file to avoid repeated DB access.
  - Gracefully degrades to use the cache if the DB is unavailable.
  - Only prints the setting key if no description is available, ensuring clean docblocks.

- **Cache Management**

  - Automatically creates and populates `settings_cache.json` if missing or empty.
  - Command to manually refresh the settings cache from the database.

- **VS Code Integration**

  - Command palette and keyboard shortcuts for:
    - Generating/updating PHPDoc for the current block (`Ctrl+Alt+0`)
    - Generating/updating PHPDoc for all blocks in the file (`Ctrl+Alt+1`)
    - Refreshing the settings cache (`Ctrl+Alt+7`)
  - Status bar integration for quick access.

- **Error Handling**

  - Docblock generation works even if the DB or cache is unavailable.
  - All file and DB operations are robust and fail gracefully.

- **Testing & Quality**

  - Includes unit tests for docblock formatting and edge cases.
  - Linting and build scripts for high code quality.

- **Ready for Publishing**
  - Complete `package.json` metadata, `.gitignore`, and security best practices.

---

## Getting Started

### Prerequisites

- Visual Studio Code (v1.100.0 or later)
- Node.js & npm
- MySQL database with the required tables and data

### Installation

1. Clone this repository:
   ```sh
   git clone https://github.com/hiteshgeek/phpdoc_generator.git
   cd phpdoc_generator
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the root directory (see `.env.example` for required variables):
   ```env
   DB_HOST=your-db-host
   DB_PORT=3306
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   DB_NAME=your-db-name
   LICID=your-licid
   ```
4. Build the extension:
   ```sh
   npm run compile
   ```
5. Launch the extension in VS Code (F5 or `Run Extension` task).

---

## Usage

- **Generate/Update PHPDoc for Current Block:**
  - Command Palette: `Generate PHPDoc`
  - Shortcut: `Ctrl+Alt+0`
- **Generate/Update PHPDoc for All Blocks:**
  - Command Palette: `Generate PHPDoc for All Blocks`
  - Shortcut: `Ctrl+Alt+1`
- **Refresh Settings Cache:**
  - Command Palette: `Refresh Settings Cache`
  - Shortcut: `Ctrl+Alt+7`

> The extension will automatically create and update `settings_cache.json` as needed.

---

## Configuration

- **.env File:**
  - Store your MySQL credentials and `LICID` here. This file is gitignored for security.
- **settings_cache.json:**
  - Local cache of all settings and their descriptions. Automatically managed by the extension.

---

## Development

- **Build:** `npm run compile`
- **Test:** `npm test`
- **Lint:** `npm run lint`
- **Watch:** `npm run watch`

---

## Contributing

Pull requests and issues are welcome! Please open an issue to discuss your ideas or report bugs.

---

## License

MIT

---

## Author

- Hitesh Vaghela ([hiteshgeek](https://github.com/hiteshgeek))

---

## Links

- [Marketplace Listing (coming soon)](https://marketplace.visualstudio.com/items?itemName=your-publisher-id.phpdoc-generator)
- [GitHub Repository](https://github.com/hiteshgeek/phpdoc_generator)
- [Report Issues](https://github.com/hiteshgeek/phpdoc_generator/issues)
