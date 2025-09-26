import path from "node:path";
import fs from "node:fs";

export const AddExecPermission = {
  apply: function (compiler) {
    compiler.hooks.afterEmit.tap("AddExecPermission", function (compilation) {
      for (const chunk of compilation.chunks) {
        for (const file of chunk.files) {
          const filePath = path.join(compilation.compiler.outputPath, file);
          fs.chmodSync(filePath, "755");
        }
      }
    });
  },
};
