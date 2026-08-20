import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ESLint 9 « flat config ». eslint-config-next 16 expose directement des
// configs plates : pas besoin de FlatCompat.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      // Les tests tournent sous le runner natif de Node et importent avec
      // l'extension .ts, que la résolution d'ESLint ne suit pas ici.
      "tests/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Convention du dépôt : un identifiant préfixé d'un souligné signale
      // une valeur volontairement ignorée (déstructuration partielle).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Les logos d'agence sont hébergés sur des domaines arbitraires, choisis
    // par le client dans ses réglages. next/image exigerait de déclarer
    // chaque domaine dans images.remotePatterns, ce qui est impossible ici.
    files: [
      "app/portal/**/*.tsx",
      "app/dashboard/settings/settings-form.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },
];

export default config;
