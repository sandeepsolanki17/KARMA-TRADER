// Metro config for a pnpm monorepo: pnpm hoists workspace packages as
// symlinks, and enables the standard monorepo watch-folders pattern so
// Metro can resolve @karma/types from packages/types.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

// Pin react/react-dom/react-native to THIS app's own copies regardless of
// which package in the monorepo does the requiring. Without this, Metro's
// broadened node_modules search (needed to resolve @karma/types from
// packages/types) can pick up a different React instance hoisted for the
// admin app, producing two live React copies in one bundle — the classic
// "Cannot read properties of null (reading 'useEffect')" symptom.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

module.exports = config;
