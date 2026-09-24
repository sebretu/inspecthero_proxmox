const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo configuration for Metro
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo (including packages/sync-protocol)
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from project node_modules as well as root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Disable hierarchical lookup issues
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
