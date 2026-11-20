import test from "node:test";
import assert from "node:assert/strict";
import { normalizeArchivePath, chooseStartPage, deriveRootPrefix, resolveLocalPath, readableName } from "../src/path-utils.mjs";

const prefix = "example.com-main/";
const all = new Set([
  prefix + "index.html",
  prefix + "docs/index.html",
  prefix + "docs/setup/index.html",
  prefix + "docs/faq.html",
  prefix + "assets/theme.css",
  prefix + "images/logo.webp"
]);
const home = prefix + "index.html";
const setup = prefix + "docs/setup/index.html";
const options = { rootPrefix: prefix, origin: "https://example.com" };

test("normalize ZIP paths and reject traversal", () => {
  assert.equal(normalizeArchivePath("a\\b\\index.html"), "a/b/index.html");
  assert.equal(normalizeArchivePath("./docs/index.html"), "docs/index.html");
  assert.equal(normalizeArchivePath("../secret"), null);
  assert.equal(normalizeArchivePath("/private/file"), null);
});

test("select top-level home page and normalize wrapper", () => {
  assert.equal(chooseStartPage(all), home);
  assert.equal(deriveRootPrefix(all), prefix);
  assert.equal(readableName(setup), "Setup");
});

test("resolve nested relative and root-relative paths", () => {
  assert.deepEqual(resolveLocalPath("docs/setup/", home, all, options), { path: setup, hash: "" });
  assert.deepEqual(resolveLocalPath("/docs/setup/#step-one", home, all, options), { path: setup, hash: "step-one" });
  assert.deepEqual(resolveLocalPath("../faq.html", setup, all, options), { path: prefix + "docs/faq.html", hash: "" });
  assert.deepEqual(resolveLocalPath("../../assets/theme.css", setup, all, options), { path: prefix + "assets/theme.css", hash: "" });
});

test("same-site links and unsafe URLs", () => {
  assert.deepEqual(resolveLocalPath("https://example.com/docs/setup/", home, all, options), { path: setup, hash: "" });
  assert.deepEqual(resolveLocalPath("#overview", setup, all, options), { path: setup, hash: "overview" });
  assert.equal(resolveLocalPath("https://other.example/docs/setup/", home, all, options), null);
  assert.equal(resolveLocalPath("javascript:alert(1)", home, all, options), null);
});

test("large archives are not subject to a count-based restriction", () => {
  const paths = Array.from({ length: 30_500 }, (_, i) => prefix + "pages/page-" + i + ".html");
  const valid = paths.map(normalizeArchivePath);
  assert.equal(valid.length, 30_500);
  assert.equal(valid.filter(Boolean).length, 30_500);
  assert.equal(new Set(valid).size, 30_500);
});
