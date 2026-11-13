/* eslint-disable */
// Copied and modified from node-minify-all-js by Adones Pitogo
// https://github.com/adonespitogo/node-minify-all-js/blob/master/index.js

// @ts-nocheck
import fs from "node:fs/promises";
import path from "node:path";

import { minify } from "@node-minify/core";
import { terser } from "@node-minify/terser";

const promiseSeries = async (tasks, initial) => {
  if (!Array.isArray(tasks)) {
    return Promise.reject(
      new TypeError("promise.series only accepts an array of functions"),
    );
  }

  return tasks.reduce((current, next) => {
    return current.then(next);
  }, Promise.resolve(initial));
};

const minifyJS = async (file, ctx) => {
  try {
    await minify({
      compressor: terser,
      input: file,
      output: file,
      // node-minify 10 throws when the output is empty (i.e. empty or comment-only files)
      allowEmptyOutput: true,
      options: {
        module: ctx.options.module,
        mangle: ctx.options.mangle,
        compress: { reduce_vars: false },
      },
    });
  } catch (e) {
    ctx.failed_files.push(file);
  }
};

const minifyJSON = async (file, options) => {
  try {
    if (options.compress_json || options.packagejson) {
      const is_package_json = file.indexOf("package.json") > -1;
      const data = await fs.readFile(file, "utf8");
      const json = JSON.parse(data);
      let new_json = {};
      if (options.packagejson && is_package_json) {
        const { name, version, bin, main, binary, engines } = json;
        new_json = { name, version };
        if (bin) new_json.bin = bin;
        if (binary) new_json.binary = binary;
        if (main) new_json.main = main;
        if (engines) new_json.engines = engines;
      } else {
        new_json = json;
      }
      await fs.writeFile(file, JSON.stringify(new_json));
    }
  } catch (e) {}
};

const walk = async (currentDirPath, ctx) => {
  const js_files = [];
  const json_files = [];
  const dirs = [];
  const current_dirs = await fs.readdir(currentDirPath);
  for (const name of current_dirs) {
    const filePath = path.join(currentDirPath, name);
    const stat = await fs.stat(filePath);
    const is_bin = /\.bin$/;
    if (stat.isFile()) {
      if (filePath.substr(-5) === ".json") json_files.push(filePath);
      else if (filePath.substr(-3) === ".js" || ctx.options.all_js)
        js_files.push(filePath);
    } else if (stat.isDirectory() && !is_bin.test(filePath)) {
      dirs.push(filePath);
    }
  }
  const js_promise = Promise.all(js_files.map((f) => minifyJS(f, ctx)));
  const json_promise = Promise.all(
    json_files.map((f) => minifyJSON(f, ctx.options)),
  );
  await Promise.all([js_promise, json_promise]);
  await promiseSeries(dirs.map((dir) => () => walk(dir, ctx)));
};

/**
 * Minifies the JS (and optionally JSON) files of a directory in place.
 *
 * Calls can run concurrently. Failed files are logged and do not throw.
 *
 * @param dir Directory to walk recursively.
 * @param opts Minification options.
 * @return A promise that resolves once all the files have been processed.
 */
export async function minifyAll(dir, opts) {
  const ctx = { options: { ...opts }, failed_files: [] };
  await walk(dir, ctx);
  if (ctx.failed_files.length) {
    console.log("\n\nFailed to minify files:");
    ctx.failed_files.forEach((f) => console.log(`\t${f}`));
  }
}
