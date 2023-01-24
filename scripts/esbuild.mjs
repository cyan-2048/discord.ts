#!/usr/bin/env node

import esbuild from "esbuild";
import fs from "fs/promises";

const args = (arg) => process.argv.includes(arg);

const kaios3 = args("--kaios3");
const debug = args("--debug");
const noPolyfills = args("--no-polyfills");

const outfile = "./dist/bundle.js";

async function getPolyfills() {
	const polyfills = await esbuild.transform(await fs.readFile("./scripts/polyfills.js", "utf-8"), {
		minify: true,
		target: "es6",
	});
	return polyfills.code;
}

const options = {
	entryPoints: ["./test.ts"],
	mainFields: ["svelte", "browser", "module", "main"],
	outfile,
	format: "iife",
	logLevel: "info",
	ignoreAnnotations: true,
	treeShaking: true,
	legalComments: "linked",
	banner: {
		js: kaios3 || noPolyfills ? "" : await getPolyfills(),
	},
	target: kaios3 ? "es2021" : "es6",
	minify: !debug,
	bundle: true,
	define: { PRODUCTION: "true" },
	sourcemap: "linked",
	supported: {
		"hex-rgba": false,
	},
	// annoying CSS
	external: ["*.png", "*.ttf", "*.svg"],
};

try {
	await esbuild.build(options);
	const regexp = /for((\s?)*)\(((\s?)*)const/g;
	const text = await fs.readFile(outfile, "utf-8");
	// on KaiOS aka Firefox48, for(const is broken
	await fs.writeFile(outfile, text.replace(regexp, "for(let "), "utf-8");
} catch (err) {
	console.error(err);
	process.exit(1);
}
