import path from "node:path";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();

registerHooks({
  resolve(specifier, context, defaultResolve) {
    if (specifier.startsWith("@/")) {
      const basePath = path.join(workspaceRoot, "src", specifier.slice(2));
      const resolvedPath = fs.existsSync(basePath)
        ? basePath
        : fs.existsSync(`${basePath}.ts`)
          ? `${basePath}.ts`
          : fs.existsSync(`${basePath}.tsx`)
            ? `${basePath}.tsx`
            : basePath;
      const resolved = pathToFileURL(resolvedPath).href;
      return defaultResolve(resolved, context);
    }

    return defaultResolve(specifier, context);
  },
});
