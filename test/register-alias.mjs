import path from "node:path";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();

registerHooks({
  resolve(specifier, context, defaultResolve) {
    if (specifier.startsWith("@/")) {
      const basePath = path.join(workspaceRoot, "src", specifier.slice(2));
      const resolvedPath = [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mjs`,
        `${basePath}.js`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
        basePath,
      ].find((candidate) => fs.existsSync(candidate)) ?? basePath;
      const resolved = pathToFileURL(resolvedPath).href;
      return defaultResolve(resolved, context);
    }

    if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
      const parentPath = path.dirname(fileURLToPath(context.parentURL));
      const basePath = path.resolve(parentPath, specifier);
      const resolvedPath = [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mjs`,
        `${basePath}.js`,
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.tsx"),
      ].find((candidate) => fs.existsSync(candidate));
      if (resolvedPath) {
        return defaultResolve(pathToFileURL(resolvedPath).href, context);
      }
    }

    return defaultResolve(specifier, context);
  },
});
