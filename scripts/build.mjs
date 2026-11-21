import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

// Ship one double-clickable offline HTML. The maintained sources are native ES modules.
const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  loader: { ".webp": "dataurl", ".png": "dataurl" },
  legalComments: "none",
});
const css = await readFile("src/style.css", "utf8");
const shell = await readFile("src/shell.html", "utf8");
await writeFile(
  "index.html",
  shell
    .replace("<!--STYLE-->", () => "<style>" + css + "</style>")
    .replace(
      "<!--GAME-->",
      () => "<script>" + result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script>",
    ),
);
