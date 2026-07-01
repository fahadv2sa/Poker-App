// Flat ESLint config for the whole monorepo (audit #13).
// TypeScript everywhere; React hooks + Next rules scoped to the web app.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "packages/db/src/generated/**",
      "**/next-env.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // `any` is used deliberately in a few test/boundary spots.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Web app: browser + node globals, React hooks + Next rules.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      ...nextPlugin.configs.recommended.rules,
      // App Router has no `pages/` directory — this rule doesn't apply.
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // ── THEME GUARDRAIL ─────────────────────────────────────────────────────────
  // Colours live ONLY in @fb/theme. No hardcoded hex / rgb / rgba literals in the
  // app or shared UI — use a token (var(--fb-*) or rgb(var(--c-*))). This is what
  // keeps the centralization from eroding as new pages/cards/notifications are added.
  // Tokenized forms (var(--…), rgb(var(--…))) are allowed; numeric literals are not.
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/app/preview/**", // temporary theme-proof harness (removed at Phase 1 sign-off)
      "packages/theme/**",
      // Transactional HTML emails: rendered in email clients that DON'T support CSS vars,
      // so their inline colours must stay literal hex — not part of the app theme.
      "apps/web/src/lib/email.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "No hardcoded hex colour — use a theme token: var(--fb-*) or rgb(var(--c-*)). Colours live only in @fb/theme.",
        },
        {
          selector: "Literal[value=/rgba?\\(\\s*[0-9]/]",
          message:
            "No hardcoded rgb/rgba colour — use rgb(var(--c-*) / a). Colours live only in @fb/theme.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message: "No hardcoded hex colour in a template literal — use a theme token.",
        },
        {
          selector: "TemplateElement[value.raw=/rgba?\\(\\s*[0-9]/]",
          message: "No hardcoded rgb/rgba colour in a template literal — use a theme token.",
        },
      ],
    },
  },
);
