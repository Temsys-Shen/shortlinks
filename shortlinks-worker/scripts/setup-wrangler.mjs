import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const WORKER_DIR = process.cwd();
const WRANGLER_TOML_PATH = resolve(WORKER_DIR, "wrangler.toml");
const ROUTE_BLOCK = `routes = [
  { pattern = "s.museday.top/api/*", zone_name = "museday.top" }
]`;

async function main() {
  ensureWranglerToml();
  ensureWranglerAvailable();

  const apiKey = await promptApiKey();
  const kvId = createNamespace({ preview: false });
  const previewKvId = createNamespace({ preview: true });

  updateWranglerToml({
    kvId,
    previewKvId,
  });

  putApiSecret(apiKey);

  output.write("\nSetup completed.\n");
  output.write(`- kv id: ${kvId}\n`);
  output.write(`- preview kv id: ${previewKvId}\n`);
  output.write("- wrangler.toml updated\n");
  output.write("- API_KEY secret uploaded\n");
}

function ensureWranglerToml() {
  if (!existsSync(WRANGLER_TOML_PATH)) {
    throw new Error(`wrangler.toml not found at ${WRANGLER_TOML_PATH}`);
  }
}

function ensureWranglerAvailable() {
  const result = runCommand(["wrangler", "--version"], {
    captureOutput: true,
    allowFailure: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `wrangler command is not available. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

async function promptApiKey() {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question("Input API_KEY for worker secret: ");
  rl.close();
  const trimmed = answer.trim();
  if (!trimmed) {
    throw new Error("API_KEY must not be empty");
  }
  return trimmed;
}

function createNamespace(options) {
  const args = ["wrangler", "kv", "namespace", "create", "shortlinks"];
  if (options.preview) {
    args.push("--preview");
  }

  const result = runCommand(args, {
    captureOutput: true,
    allowFailure: true,
  });

  if (result.status === 0) {
    const id = extractNamespaceId(result.stdout, result.stderr);
    if (!id) {
      throw new Error(
        `Failed to parse namespace id from wrangler output.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
    return id;
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (combinedOutput.includes("already exists")) {
    const existingId = findExistingNamespaceId(options.preview);
    if (!existingId) {
      throw new Error(
        `Namespace already exists but cannot find its id.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
    output.write(
      `Namespace already exists, reusing ${options.preview ? "preview" : "production"} id: ${existingId}\n`,
    );
    return existingId;
  }

  throw new Error(`Command failed: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function putApiSecret(apiKey) {
  runCommand(["wrangler", "secret", "put", "API_KEY"], {
    inputText: `${apiKey}\n`,
    captureOutput: true,
  });
}

function updateWranglerToml({ kvId, previewKvId }) {
  let content = readFileSync(WRANGLER_TOML_PATH, "utf8");

  content = ensureRoute(content);

  const kvBlockRegex =
    /(\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"shortlinks"[\s\S]*?id\s*=\s*")([^"]+)("[\s\S]*?preview_id\s*=\s*")([^"]+)(")/m;

  if (!kvBlockRegex.test(content)) {
    throw new Error("Cannot find kv_namespaces block for binding \"shortlinks\" in wrangler.toml");
  }

  content = content.replace(kvBlockRegex, `$1${kvId}$3${previewKvId}$5`);

  writeFileSync(WRANGLER_TOML_PATH, content);
}

function ensureRoute(content) {
  const routeRegex = /^\s*routes\s*=\s*\[[\s\S]*?\]\s*$/m;
  if (routeRegex.test(content)) {
    return content.replace(routeRegex, ROUTE_BLOCK);
  }

  const lines = content.split("\n");
  const compatibilityIndex = lines.findIndex((line) => line.startsWith("compatibility_date"));
  if (compatibilityIndex === -1) {
    throw new Error("Cannot find compatibility_date in wrangler.toml");
  }

  lines.splice(compatibilityIndex + 1, 0, ROUTE_BLOCK);
  return lines.join("\n");
}

function extractNamespaceId(stdout, stderr) {
  const full = `${stdout}\n${stderr}`;

  const jsonId = full.match(/"id"\s*:\s*"([a-f0-9-]+)"/i);
  if (jsonId) {
    return jsonId[1];
  }

  const tomlDoubleQuoteId = full.match(/id\s*=\s*"([a-f0-9-]+)"/i);
  if (tomlDoubleQuoteId) {
    return tomlDoubleQuoteId[1];
  }

  const tomlSingleQuoteId = full.match(/id\s*=\s*'([a-f0-9-]+)'/i);
  if (tomlSingleQuoteId) {
    return tomlSingleQuoteId[1];
  }

  return null;
}

function findExistingNamespaceId(preview) {
  const result = runCommand(["wrangler", "kv", "namespace", "list"], {
    captureOutput: true,
  });

  const expectedTitle = preview ? "shortlinks_preview" : "shortlinks";
  const fullText = `${result.stdout}\n${result.stderr}`;
  const entries = parseNamespaceEntries(fullText);
  const matched = entries.find((entry) => entry.title === expectedTitle);
  if (matched) {
    return matched.id;
  }

  return null;
}

function parseNamespaceEntries(text) {
  const entries = [];
  const pushEntry = (id, title) => {
    if (!id || !title) {
      return;
    }
    entries.push({
      id: id.trim(),
      title: title.trim(),
    });
  };

  // Match JSON style chunks:
  // "id": "...", "title": "..."
  const jsonPairRegex = /"id"\s*:\s*"([a-f0-9-]+)"[\s\S]*?"title"\s*:\s*"([^"]+)"/gi;
  for (const match of text.matchAll(jsonPairRegex)) {
    pushEntry(match[1], match[2]);
  }

  // Match wrangler create/list style:
  // id = "..."
  // title = "..."
  const tomlPairRegex = /id\s*=\s*["']([a-f0-9-]+)["'][\s\S]*?title\s*=\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(tomlPairRegex)) {
    pushEntry(match[1], match[2]);
  }

  // Match table rows:
  // │ <id> │ <title> │
  const tableRowRegex = /[│|]\s*([a-f0-9-]{8,})\s*[│|]\s*([^│|\n]+?)\s*[│|]/g;
  for (const match of text.matchAll(tableRowRegex)) {
    pushEntry(match[1], match[2]);
  }

  // Match plain rows:
  // <id> <title>
  const plainRowRegex = /^\s*([a-f0-9-]{8,})\s+([A-Za-z0-9._:-]+)\s*$/gm;
  for (const match of text.matchAll(plainRowRegex)) {
    pushEntry(match[1], match[2]);
  }

  return dedupeNamespaceEntries(entries);
}

function dedupeNamespaceEntries(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = `${entry.id}|${entry.title}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

function runCommand(args, options) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: WORKER_DIR,
    encoding: "utf8",
    input: options.inputText,
    stdio: options.captureOutput ? "pipe" : "inherit",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  return {
    status: result.status ?? 1,
    stdout,
    stderr,
  };
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
