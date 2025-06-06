# Change Log

## [Unreleased]

### Added

- New setting: **Generate/Update on Save** (checkbox, default: off). When enabled, automatically generates/updates PHPDoc blocks for the entire file every time a PHP file is saved.
- Status bar indicator for the Generate/Update on Save feature, with click-to-toggle support.
- Command palette command and keyboard shortcut (`Ctrl+Alt+9`) to toggle the Generate/Update on Save feature.
- The status bar now updates immediately when the setting is changed from the settings UI.
- **Docblock Folding/Expanding:** Added commands and keyboard shortcuts (`Ctrl+Alt+5` to collapse, `Ctrl+Alt+6` to expand) to fold and unfold all PHPDoc blocks in the current file. These commands are available in the Command Palette as "PHPDoc Generator: Collapse All Docblocks in File" and "PHPDoc Generator: Expand All Docblocks in File".
- **Custom Folding Provider:** Implemented a custom FoldingRangeProvider so that only PHPDoc blocks are folded/unfolded, and nested/recursive function docblocks are handled correctly. (Better than inbuild docblock collapse\expand commmands)
- **@var Docblock Support:** The extension now generates `@var` docblocks for all class properties.
- **Consistent Docblock Formatting:** Improved docblock formatting and tag ordering for robust and consistent output.

---

## [0.0.3] - 2025-06-06

### Improvements

- **Docblock Generation from Anywhere:** You can now generate or regenerate a docblock when your cursor is anywhere inside a function, method, class, interface, trait, or within its docblock. This makes it easy to update docblocks without needing to be at the block's declaration line.
- **Full Nested Block Support:** The extension now fully supports generating and updating docblocks for all nested functions, methods, and sub-blocks, regardless of their depth. Nested and inner blocks are detected and handled recursively for both single-block and file-wide docblock generation.
- **Automatic @throws Tag Synchronization:** The extension now automatically synchronizes `@throws` tags in the docblock—new exception types are added when detected in the function, and obsolete tags are removed if the corresponding throw statement is commented out or deleted.
- **Default Docblock Structure:** The default docblock structure is now:

  ```
  @param

  @throws

  @return
  ```

- **Consistent Tag Ordering and Spacing:** Tags are always generated in the above order for improved readability.
- **Full-File Support:** All improvements apply to both single-block and entire-file docblock generation.
- **Enhanced @param and @return Tag Detection:** The extension now has improved logic for detecting and suggesting types for `@param` and `@return` tags based on the function signature and body.
- **New Configuration Options:** Added new configuration options for users to customize the default visibility (public/protected/private) of generated class properties and methods in the docblock.
- **Better Handling of Variadic Functions:** Improved support for variadic functions, ensuring that `@param` tags correctly reflect the use of `...$args` syntax.
- **Project-wide Docblock Generation:** Added a command and shortcut (`Ctrl+Alt+2`) to generate docblocks for all PHP files in the project recursively.
- **Exclude Patterns for Project Generation:** Added a configuration property (`phpdoc-generator-hiteshgeek.exclude`) to specify folders and files to exclude from project-wide docblock generation.
- **Improved Return Type Inference:** The extension now has improved return type inference for PHPDoc generation:
  - Arithmetic expressions like `$a + $b` now infer `int` or `float` based on parameter types.
  - String concatenation like `$a . $b` now infers `string` if both operands are strings.
  - Handles direct values, object instantiation, ternary, and more for accurate `@return` types.
  - Enhanced PHPDoc return type inference for generated docblocks:
    - Arithmetic expressions (e.g., `$a + $b`, `$a - $b`, etc.) now infer `int` or `float` as the return type if both operands are typed as such in the function parameters. For example, if both parameters are `float`, the return type will be `float`.
    - String concatenation expressions (e.g., `$a . $b`) now infer `string` as the return type if both operands are typed as `string` in the function parameters.
    - Direct value returns (e.g., `return [];`, `return 123;`, `return "text";`, etc.) are now mapped to their correct types (`array`, `int`, `string`, etc.).
    - Object instantiation (e.g., `return new User();`, `return new self();`) now infers the correct class name as the return type.
    - Ternary expressions and other simple expressions are analyzed to infer the most accurate type possible, defaulting to `mixed` if uncertain.
    - Variable, property, constant, and function call returns are safely defaulted to `mixed` unless a more specific type can be determined.
    - The extension now uses parameter type hints to improve the accuracy of inferred return types for expressions involving parameters.
    - These improvements ensure that generated PHPDoc blocks are more accurate and helpful for static analysis, code completion, and documentation.

### Bug Fixes

- **Parameter and Return Types Always Provided:** The extension now always provides types for parameters and return values in the docblock, even when not explicitly mentioned in the code (defaults to `mixed` or `void` as appropriate).
- **Fixed Missing Empty Lines:** Resolved issues where empty lines before `@param` and `@return` tags were missing in generated docblocks.
- **Fixed @throws Tag Updates:** Fixed issues where `@throws` tags were not updated or removed when the corresponding throw statement was commented out or deleted.
- **Consistent All-Block Generation:** Ensured that `@throws` detection and formatting logic is always applied when generating docblocks for all functions in a file.
- **Fixed Inheritance Bug for Class Method Tags:** Resolved an issue where inherited class methods did not have their docblocks updated correctly when the parent method's docblock was changed.
- **Corrected Namespace Handling:** Fixed a bug where the extension would sometimes generate incorrect or incomplete namespaces in the docblocks of namespaced classes.

### Internal

- Made sure that all @settings docblock logic is only used for Accrete Globus Technology (AGT) users. If the database configuration is incomplete, all @settings checks and docblock output are fully skipped for all docblock generation commands. This logic is only relevant for AGT users and will not affect other users or environments.

---

## [0.0.2] - 2025-06-04

### Improvements

- **Improved Type Inference:** The extension now has improved type inference for scalar types (string, int, float, bool), and will default to these types when the parameter or return type is not explicitly declared.
- **Support for Union Types:** Added support for PHP 8.0 union types in parameter and return type declarations.
- **New @mixin Tag Support:** Added support for the `@mixin` tag to include traits in the docblock generation.

### Bug Fixes

- **Fixed @var Tag Generation:** Resolved an issue where the `@var` tag was not being generated for class properties.
- **Corrected @param Tag Duplication:** Fixed a bug that caused duplicate `@param` tags to be generated in certain cases.

---

## [0.0.1] - 2025-06-04

- Initial release
