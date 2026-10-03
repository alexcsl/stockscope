import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const docs = join(root, "docs");
const files = [join(root, "README.md")];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "source-reports") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".md")) files.push(path);
  }
}

if (existsSync(docs)) collect(docs);

const missing = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(https?:|mailto:)/i.test(target)) continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) {
      missing.push(`${file}: ${target}`);
    }
  }
}

if (missing.length) {
  process.stderr.write(`Broken local links:\n${missing.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked local links in ${files.length} maintained Markdown files.\n`);
}
