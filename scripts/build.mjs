import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Ship one double-clickable offline HTML. The maintained sources are native ES modules.
// `entry` lets the verification harness bundle the same game with a read-only observer.
export async function renderGame({ entry } = {}) {
  const result = await build({
    absWorkingDir: root,
    ...(entry
      ? { stdin: { contents: entry, resolveDir: root, sourcefile: "verify-entry.js" } }
      : { entryPoints: ["src/main.js"] }),
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    loader: { ".webp": "dataurl", ".png": "dataurl" },
    legalComments: "none",
  });
  const css = await readFile(resolve(root, "src/style.css"), "utf8");
  const shell = await readFile(resolve(root, "src/shell.html"), "utf8");
  return shell
    .replace("<!--STYLE-->", () => "<style>" + css + "</style>")
    .replace(
      "<!--GAME-->",
      () => "<script>" + result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script>",
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await writeFile(resolve(root, "index.html"), await renderGame());
