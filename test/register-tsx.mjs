import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) {
      return nextLoad(url, context);
    }

    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: fileURLToPath(url),
    });

    return {
      format: "module",
      shortCircuit: true,
      source: output.outputText,
    };
  },
});
