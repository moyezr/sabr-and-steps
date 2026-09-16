import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const stringList = (value) => Array.isArray(value) && value.length > 0 && value.every(nonempty);
const required = ["AGENTS.md", "DECISIONS.md", "PROGRESS.md", "README.md", ".env.example", "init.sh", "feature_list.json"];

for (const file of required) {
  assert(existsSync(join(root, file)), `Missing ${file}; restore the project entry/handoff file.`);
}

const tracker = JSON.parse(readFileSync(join(root, "feature_list.json"), "utf8"));
assert.equal(tracker.schema_version, 1, "Unsupported feature tracker schema.");
assert(Array.isArray(tracker.features) && tracker.features.length > 0, "Feature tracker must not be empty.");
const ids = new Set();
const statuses = new Set(["not_started", "in_progress", "blocked", "passing"]);

for (const feature of tracker.features) {
  for (const field of ["id", "area", "title", "user_visible_behavior"]) {
    assert(nonempty(feature[field]), `Feature needs a nonempty ${field}.`);
  }
  assert(!ids.has(feature.id), `Duplicate feature ID: ${feature.id}`);
  ids.add(feature.id);
  assert(Number.isInteger(feature.priority) && feature.priority >= 0, `${feature.id}: invalid priority.`);
  assert(statuses.has(feature.status), `${feature.id}: invalid status.`);
  assert(stringList(feature.verification), `${feature.id}: add concrete verification steps.`);
  assert(Array.isArray(feature.evidence), `${feature.id}: evidence must be an array.`);
  if (feature.status === "passing") {
    assert(stringList(feature.evidence), `${feature.id}: passing requires dated verification evidence.`);
  }
  if (feature.status === "blocked") {
    assert(nonempty(feature.notes), `${feature.id}: document the blocker and recovery action in notes.`);
  }
}
assert(tracker.features.filter((feature) => feature.status === "in_progress").length <= 1,
  "Only one feature may be in_progress; finish or hand off the active feature first.");

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : extname(path) === ".md" ? [path] : [];
  });
}

const documents = [
  ...required.filter((file) => extname(file) === ".md").map((file) => join(root, file)),
  ...markdownFiles(join(root, "docs")),
];
for (const file of documents) {
  const markdown = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
    const path = decodeURIComponent(target.split(/[?#]/)[0]);
    assert(existsSync(resolve(dirname(file), path)), `Broken link in ${file}: ${target}`);
  }
}
console.log(`Harness checks passed: ${tracker.features.length} features; ${documents.length} Markdown files.`);
