import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * A shared ESLint configuration for NestJS applications.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nestConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    rules: {
      // Nest relies on parameter decorators and DI-injected constructor params.
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      // Passport strategies call `super(...)` with untyped option bags.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
