import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const webFiles = ["apps/web/**/*.{ts,tsx}"];

export default defineConfig(
  {
    // Generated output: builds, test reports and the code graph.
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "design/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/graphify-out/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      // Leaving keys out with a rest object ({ a, ...rest }) counts as using them.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },

  // The website: Next.js, React (hooks, correctness) and accessibility rules.
  {
    files: webFiles,
    languageOptions: { globals: globals.browser },
    settings: { next: { rootDir: "apps/web/" } },
    extends: [
      nextPlugin.configs["core-web-vitals"],
      reactHooks.configs.flat["recommended-latest"],
      eslintReact.configs["recommended-type-checked"],
      jsxA11y.configs.strict,
    ],
  },

  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
