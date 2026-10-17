// @ts-check
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * The app keeps its own React, separate from the web app's.
 *
 * React Native only runs on the exact React its renderer was built for, while
 * the web app is free to move ahead. The web's React sits at the workspace
 * root and this app's in apps/mobile/node_modules, so every `react` and
 * `react-dom` import in the bundle, including those from hoisted packages like
 * react-native itself, is resolved from here.
 */
const ownReact = /^react(-dom)?(\/.*)?$/;
const fromApp = path.join(__dirname, "package.json");

config.resolver.resolveRequest = (context, moduleName, platform) =>
	context.resolveRequest(
		ownReact.test(moduleName)
			? { ...context, originModulePath: fromApp }
			: context,
		moduleName,
		platform,
	);

module.exports = config;
