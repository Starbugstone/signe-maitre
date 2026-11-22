import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The published game: index.html, with the script and the artwork as hashed files beside it,
// so a returning player only downloads what changed.
const site = resolve(root, "game");

// `npm run build` writes the published site: the root index.html and game/. With `inline`,
// the page carries the script and the artwork itself, so the verification harness and the
// scenery checks can open one temporary file from file://.
// `entry` lets the verification harness bundle the same game with a read-only observer.
export async function renderGame({ entry, inline = true } = {}) {
  const result = await build({
    absWorkingDir: root,
    ...(entry
      ? { stdin: { contents: entry, resolveDir: root, sourcefile: "verify-entry.js" } }
      : { entryPoints: ["src/main.js"] }),
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    legalComments: "none",
    ...(inline
      ? { loader: { ".webp": "dataurl", ".png": "dataurl" } }
      : {
          loader: { ".webp": "file", ".png": "file" },
          outdir: site,
          entryNames: "game-[hash]",
          assetNames: "[name]-[hash]",
          publicPath: "game",
        }),
  });
  const css = await readFile(resolve(root, "src/style.css"), "utf8");
  const shell = await readFile(resolve(root, "src/shell.html"), "utf8");
  const script = inline ? result.outputFiles[0] : result.outputFiles.find((f) => f.path.endsWith(".js"));
  const html = shell
    .replace("<!--STYLE-->", () => "<style>" + css + "</style>")
    .replace("<!--GAME-->", () =>
      inline
        ? "<script>" + script.text.replace(/<\/script/gi, "<\\/script") + "</script>"
        : '<script src="' + relative(root, script.path) + '"></script>',
    );
  if (inline) return html;
  return { html, files: result.outputFiles.map((f) => ({ path: f.path, contents: f.contents })) };
}

// The published page as `npm run build` writes it, for freshness checks.
export async function publishedPage() {
  return (await renderGame({ inline: false })).html;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, files } = await renderGame({ inline: false });
  await rm(site, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  for (const file of files) await writeFile(file.path, file.contents);
  await writeFile(resolve(root, "index.html"), html);
}
