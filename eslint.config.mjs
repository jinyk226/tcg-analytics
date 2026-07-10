import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client — never lint or edit by hand.
    "lib/generated/**",
  ]),
  // Discourage silencing the linter instead of fixing the issue.
  {
    plugins: { "@eslint-community/eslint-comments": eslintComments },
    rules: {
      // Ban blanket `/* eslint-disable */` with no rule listed.
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      // A disable must be paired with an enable (no file-wide silencing).
      "@eslint-community/eslint-comments/disable-enable-pair": "error",
    },
  },
  // Component discipline: presentational leaf components live in an `_ui/`
  // directory and must be stateless. Lift state to a parent container/`_components/`.
  {
    files: ["app/**/_ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.name="useState"]',
          message:
            "Presentational (_ui) components must be stateless. Lift state to a parent container.",
        },
        {
          selector: 'CallExpression[callee.name="useReducer"]',
          message:
            "Presentational (_ui) components must be stateless. Lift state to a parent container.",
        },
      ],
    },
  },
]);

export default eslintConfig;
