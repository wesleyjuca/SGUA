```markdown
# SGUA Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the SGUA JavaScript codebase. You will learn how to structure files, write imports/exports, follow commit message conventions, and implement and test features in a consistent way. This guide is ideal for contributors looking to quickly align with the project's standards.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userProfile.js`, `dataFetcher.js`

### Import Style
- Use **relative imports** for modules within the project.
  - Example:
    ```javascript
    import { fetchData } from './dataFetcher';
    ```

### Export Style
- Use **named exports** for functions, constants, and components.
  - Example:
    ```javascript
    // In userProfile.js
    export function getUserProfile(id) {
      // implementation
    }
    ```

### Commit Messages
- Follow the **Conventional Commits** format.
- Use prefixes like `fix` or `feat`.
- Keep commit messages concise (average 56 characters).
  - Example:
    ```
    feat: add user profile fetching logic
    fix: correct typo in dataFetcher
    ```

## Workflows

### Implementing a New Feature
**Trigger:** When adding new functionality to the codebase  
**Command:** `/new-feature`

1. Create a new file using camelCase naming (e.g., `newFeature.js`).
2. Write your feature using named exports.
3. Import any dependencies using relative paths.
4. Add or update a corresponding test file (`newFeature.test.js`).
5. Commit your changes with a `feat:` prefix.
6. Push your branch and open a pull request.

### Fixing a Bug
**Trigger:** When resolving a bug or issue  
**Command:** `/bug-fix`

1. Locate the relevant file(s) using camelCase naming.
2. Apply the fix, maintaining code style conventions.
3. Update or add tests in a `*.test.js` file to cover the fix.
4. Commit your changes with a `fix:` prefix.
5. Push your branch and open a pull request.

### Writing and Running Tests
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Create or update test files following the `*.test.js` pattern.
2. Write tests for each function or component using the project's (unspecified) testing framework.
3. Run the tests using the project's test runner (framework not specified; check project documentation or scripts).
4. Ensure all tests pass before committing.

## Testing Patterns

- Test files use the `*.test.js` naming convention and are placed alongside or near the code they test.
- Each test file should cover the named exports of its corresponding module.
- The specific testing framework is not specified; follow existing patterns in the codebase.

  Example:
  ```javascript
  // In dataFetcher.test.js
  import { fetchData } from './dataFetcher';

  test('fetchData returns expected result', () => {
    // test implementation
  });
  ```

## Commands
| Command        | Purpose                                      |
|----------------|----------------------------------------------|
| /new-feature   | Start the workflow for adding a new feature  |
| /bug-fix       | Start the workflow for fixing a bug          |
| /run-tests     | Run the test suite for the codebase          |
```