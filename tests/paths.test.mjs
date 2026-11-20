import test from "node:test";
import assert from "node:assert/strict";
import {normalizeArchivePath,chooseStartPage,deriveRootPrefix,resolveLocalPath,readableName} from "../src/path-utils.mjs";
const all = new Set(["originheartgold.github.io/guide/index.html","originheartgold.github.io/guide/known-issues/index.html","originheartgold.github.io/guide/walkthrough.html","originheartgold.github.io/guide/assets/style.css"]);
const base="originheartgold.github.io/guide/index.html";
const known="originheartgold.github.io/guide/known-issues/index.html";
const opts={rootPrefix:"originheartgold.github.io/",origin:"https://originheartgold.github.io"};
test("archive path validation",()=>{
 assert.equal(normalizeArchivePath("a\\b\\index.html"),"a/b/index.html");
 assert.equal(normalizeArchivePath("./guide/index.html"),"guide/index.html");
 assert.equal(normalizeArchivePath("../private"),null);
 assert.equal(normalizeArchivePath("/root/file"),null);
});
test("select root and label nested pages",()=>{
 assert.equal(chooseStartPage(all),base);
 assert.equal(deriveRootPrefix(all),"originheartgold.github.io/");
 assert.equal(readableName(known),"Known Issues");
});
test("resolve relative and root-relative paths",()=>{
 assert.deepEqual(resolveLocalPath("known-issues/",base,all,opts),{path:known,hash:""});
 assert.deepEqual(resolveLocalPath("/guide/known-issues/#notes",base,all,opts),{path:known,hash:"notes"});
 assert.deepEqual(resolveLocalPath("../walkthrough.html",known,all,opts),{path:"originheartgold.github.io/guide/walkthrough.html",hash:""});
 assert.deepEqual(resolveLocalPath("../assets/style.css",known,all,opts),{path:"originheartgold.github.io/guide/assets/style.css",hash:""});
});
test("absolute URLs, fragments and external links",()=>{
 assert.deepEqual(resolveLocalPath("https://originheartgold.github.io/guide/known-issues/",base,all,opts),{path:known,hash:""});
 assert.deepEqual(resolveLocalPath("#intro",known,all,opts),{path:known,hash:"intro"});
 assert.equal(resolveLocalPath("https://example.com/guide/known-issues/",base,all,opts),null);
 assert.equal(resolveLocalPath("javascript:alert(1)",base,all,opts),null);
});
