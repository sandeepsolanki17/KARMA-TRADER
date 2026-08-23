# KARMA Trading Platform Handoff

This directory contains a clean copy of the KARMA Trading Platform project, specifically prepared for code review, debugging, and AI-assisted fixing. All necessary source code, configuration, and structural files are preserved. Large build artifacts, caches, and secrets have been removed to keep the archive small and secure.

## Project Overview
1. **Project name**: KARMA Trading Platform
2. **Project structure**: Monorepo using pnpm workspaces (pps/, packages/, infra/, etc.).
3. **Client application location**: pps/client/ (Expo / React Native)
4. **API location**: pps/api/ (Backend service)
5. **Admin application location**: pps/admin/
6. **Shared packages**: packages/config/ (configuration), packages/types/ (shared TypeScript definitions)
7. **How the project is started**: Usually via top-level scripts like pnpm run dev:api or pnpm run dev:admin. 
8. **How the client is started**: Inside pps/client/, using pnpm run start (which runs xpo start).
9. **How the API is started**: Typically via pnpm --filter @karma/api dev from the root, or within pps/api/.
10. **How the admin app is started**: Via pnpm --filter @karma/admin dev from the root, or within pps/admin/.
11. **Package manager**: pnpm (configured in pnpm-workspace.yaml).
12. **Required Node/pnpm versions**: Node.js >= 20 (as defined in package.json engines).
13. **Required environment variables**: See .env.example files throughout the project (especially in pps/client, pps/api, and pps/admin).
14. **Clerk integration**: Used for authentication across the stack. Requires Clerk publishable and secret keys in the environment variables.
15. **Firebase/push notification integration**: Handled via Expo Notifications and Firebase. Private credentials (google-services.json, etc.) have been excluded for security (see FIREBASE_SETUP.md).
16. **Device activation architecture**: The client activates a device against the API. This process requires a Bearer token.
17. **Database architecture**: The API handles database operations. Schemas and migrations are located in pps/api/ (likely Prisma or Drizzle).
18. **Known current problems**:
    - Device activation failed: Missing bearer token
    - Clerk pending tasks/navigation warning
    - Firebase/google-services.json not configured
    - Need complete authentication → API → device activation flow verification
19. **What was recently changed**: The project has undergone active development combining Clerk authentication, Expo Router, device activation, and API integration. (Exact git history is not preserved in this ZIP, but the code reflects these latest features).
20. **Which files are most important for authentication**: pps/client/app/_layout.tsx (or similar Expo Router layouts), Clerk configuration files in the client and API, and pps/api/ auth middleware.
21. **Which files are most important for API authorization**: pps/api/ middleware that validates Clerk JWT tokens.
22. **Which files are most important for device activation**: Client services handling API calls for device registration, and API endpoints receiving these requests.
23. **Which files are most important for push notifications**: Firebase configuration and Expo notification registration logic in the client.

Please refer to the source files in pps/ and packages/ to understand the implementation in detail.
