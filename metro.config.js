const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Resolve @/* imports (e.g., @/src/utils/constants -> ./src/utils/constants)
config.watchFolders = [__dirname];

module.exports = config;
