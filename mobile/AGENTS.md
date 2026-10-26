This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. In this project routes live in `app/` (repository root) — every file there is a screen, `_layout.tsx` files define navigators. Route files stay thin and re-export a screen from `src/features/*/screens`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## This project

Read `docs/ARCHITECTURE.md` before changing structure. Key rules:

- Screens get data only through feature hooks → `useRepositories()`. Never import `src/services/mock` or `src/services/api` from UI code.
- A new data call needs: the contract (`src/repositories/contracts.ts`), the mock implementation, the HTTP implementation (`endpoints.ts`, `dto.ts`, `mappers.ts`), a query key, and an entry in `docs/API_CONTRACTS.md`.
- Business rules belong in `src/domain` (pure, tested) or `src/constants/business.ts` — not in screens.
- Payments, Apple Wallet and other external services stay behind `src/services/integrations`. They are demo implementations; never present them as live.
- No secrets in the client: every `EXPO_PUBLIC_*` value ships in the bundle.
- Design values come from `src/theme`; images are referenced by key via `src/assets/imageRegistry.ts` (`npm run images:registry`).
- Before declaring work done: `npm run check` (typecheck app + tests, lint, Jest).

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
