# Project Manifest

This file lists the most important directories and files in this archive and explains their purpose to help you quickly navigate the codebase.

## Monorepo Root
- package.json - Root package describing workspaces and top-level scripts.
- pnpm-workspace.yaml - Configures the pnpm workspaces (apps, packages).
- docker-compose.yml - Contains backend/infrastructure Docker setup.

## Apps
- pps/client/ - The React Native (Expo) client application. Includes package.json, pp.json, Expo configuration, and Expo Router (pp/) structure.
- pps/api/ - The backend API application. Contains server code, database configuration/migrations, and authentication middleware.
- pps/admin/ - The administrative application for managing the platform.
- pps/landing/ - The landing page application.

## Shared Packages
- packages/config/ - Shared configuration files (e.g., ESLint, TypeScript) used across workspaces.
- packages/types/ - Shared TypeScript types used by the client, API, and admin apps.

## Key Configuration Files
- .env.example - Sanitized environment variables. You must fill these out and rename them to .env.
- 	sconfig.json files - TypeScript compilation configurations across the monorepo.
