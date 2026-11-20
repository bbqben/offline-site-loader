import {normalizeArchivePath,isHtmlFile,chooseStartPage,deriveRootPrefix,resolveLocalPath,readableName,chooseLargeGuideSubset} from "./path-utils.mjs";

const $ = (id) => document.getElementById(id);
const DB_NAME = "pagekeep-library-v1";
const MAX_ZIP = 500 * 1024 * 1024;
const MAX_FILES = 20000;
const MAX_UNPACKED = 1024 * 1024 * 1024;
const MAX_ONE = 120 * 1024 * 1024;
const MAX_PAGE_ASSETS = 36 * 1024 * 1024;
const state = { db:null, sites:[], active:null, files:new Set(), page:"", history:[], cursor:-1, loading:false, renderId:0 };

function request(req) {
  return new Promise((resolve,reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Database operation failed."));
  });
}
function transactionDone(tx) {
  return new Promise((resolve,reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Storage transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("Storage was interrupted."));
  });
}
function openDatabase() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("sites",{keyPath:"id"});
      const files = db.createObjectStore("files",{keyPath:["siteId","path"]});
      files.createIndex("bySite","siteId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open local storage."));
  });
}
async function allSites() {
  const sites = await request(state.db.transaction("sites","readonly").objectStore("sites").getAll());
  return sites.sort((a,b) => (b.lastOpened || b.createdAt) - (a.lastOpened || a.createdAt));
}
function putSite(site) {
  const tx = state.db.transaction("sites","readwrite");
  tx.objectStore("sites").put(site);
  return transactionDone(tx);
}
async function putFiles(batch) {
  const tx = state.db.transaction("files","readwrite");
  const store = tx.objectStore("files");
  for (const record of batch) store.put(record);
  await transactionDone(tx);
}
function savedFile(siteId,path) {
  return request(state.db.transaction("files","readonly").objectStore("files").get([siteId,path]));
}
async function removeSavedSite(siteId) {
  const tx = state.db.transaction(["sites","files"],"readwrite");
  tx.objectStore("sites").delete(siteId);
  const index = tx.objectStore("files").index("bySite");
  const cursor = index.openCursor(IDBKeyRange.only(siteId));
  cursor.onsuccess = () => {
    if (!cursor.result) return;
    cursor.result.delete();
    cursor.result.continue();
  };
  await transactionDone(tx);
}
function mime(path) {
  const ext = path.split(".").pop().toLowerCase();
  return ({
    html:"text/html",htm:"text/html",xhtml:"application/xhtml+xml",
    css:"text/css",js:"text/javascript",json:"application/json",txt:"text/plain",
    png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",
    webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",avif:"image/avif",
    woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",
    pdf:"application/pdf",mp3:"audio/mpeg",mp4:"video/mp4"
  })[ext] || "application/octet-stream";
}
function sizeString(bytes) {
  return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : Math.round(bytes / 1024) + " KB";
}
function message(text,error=false) {
  $("import-feedback").textContent = text;
  $("import-feedback").classList.toggle("error",error);
}
function setImportBusy(busy) {
  state.loading = busy;
  $("import-button").disabled = busy;
  $("archive-file").disabled = busy;
  $("import-button").textContent = busy ? "Importing…" : "Import website ↗";
}
async function importZip(file) {
  if (!window.JSZip) throw new Error("ZIP support is unavailable. Try opening the app online once.");
  if (file.size > MAX_ZIP) throw new Error("ZIP exceeds the 500 MB import limit.");
  const title = $("site-title").value.trim().slice(0,80) || file.name.replace(/\.zip$/i,"").replace(/[-_]/g," ");
  let origin = "";
  if ($("site-url").value.trim()) {
    const url = new URL($("site-url").value.trim());
    if (!["https:","http:"].includes(url.protocol)) throw new Error("Use an HTTP or HTTPS website URL.");
    origin = url.origin;
  }
  message("Reading ZIP archive…");
  const zip = await window.JSZip.loadAsync(file);
  const found = new Map();
  for (const [name,entry] of Object.entries(zip.files)) {
    const path = normalizeArchivePath(name);
    if (entry.dir || !path || path.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(path)) continue;
    found.set(path,entry);
  }
  let entries = [...found.entries()];
  if (!entries.length) throw new Error("No files were found in this ZIP.");
  let guideSubset = null;
  if (entries.length > MAX_FILES) {
    guideSubset = chooseLargeGuideSubset(entries.map(([path]) => path), MAX_FILES);
    if (guideSubset) {
      const allowed = new Set(guideSubset.paths);
      entries = entries.filter(([path]) => allowed.has(path));
      message("Large ZIP detected. Importing the guide and shared assets only (" + entries.length + " files)…");
    }
  }
  if (entries.length > MAX_FILES) {
    throw new Error("This archive contains " + entries.length.toLocaleString() +
      " files even after guide filtering. Please import a smaller website-only ZIP.");
  }
  const allPaths = entries.map(([path]) => path);
  const startPath = chooseStartPage(allPaths);
  if (!startPath) throw new Error("The ZIP has no HTML pages. Download a website mirror first.");
  const rootPrefix = deriveRootPrefix(allPaths);
  if (!origin && rootPrefix) {
    // GitHub source archives often use example.github.io-main as a folder.
    const candidate = rootPrefix.slice(0,-1).replace(/-(?:main|master)$/i,"");
    if (candidate.includes(".") && !candidate.includes("/")) origin = "https://" + candidate;
  }
  const site = {
    id: crypto.randomUUID(), title, origin, rootPrefix, startPath,
    pages: allPaths.filter(isHtmlFile).sort(), filePaths: allPaths, guideOnly: !!guideSubset,
    fileCount: allPaths.length, bytes:0, createdAt:Date.now(), lastOpened:Date.now()
  };
  let total = 0;
  try {
    for (let index = 0; index < entries.length; index += 12) {
      const chunk = entries.slice(index,index+12);
      const decoded = await Promise.all(chunk.map(async ([path,entry]) => {
        const bytes = await entry.async("uint8array");
        if (bytes.byteLength > MAX_ONE) throw new Error("An archive file exceeds the 120 MB limit: " + path);
        return {siteId:site.id,path,blob:new Blob([bytes],{type:mime(path)}),byteCount:bytes.byteLength};
      }));
      for (const item of decoded) total += item.byteCount;
      if (total > MAX_UNPACKED) throw new Error("This website exceeds the 1 GB unpacked limit.");
      await putFiles(decoded);
      message("Saving files locally… " + Math.min(index + chunk.length,entries.length) + " / " + entries.length);
    }
    site.bytes = total;
    await putSite(site);
  } catch(err) {
    await removeSavedSite(site.id).catch(() => {});
    throw err;
  }
  return site;
}
function makeSiteButton(site) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "site-item" + (state.active && state.active.id === site.id ? " active" : "");
  const icon = document.createElement("span");
  icon.className = "site-icon";
  icon.textContent = "▤";
  const info = document.createElement("span");
  const heading = document.createElement("span");
  heading.className = "site-title";
  heading.textContent = site.title;
  const small = document.createElement("span");
  small.className = "site-detail";
  small.textContent = site.pages.length + " pages · " + sizeString(site.bytes);
  info.append(heading,small);
  btn.append(icon,info);
  btn.addEventListener("click",()=>selectSite(site.id));
  return btn;
}
function renderSites() {
  const list = $("site-list");
  list.replaceChildren();
  $("site-count").textContent = String(state.sites.length);
  if (!state.sites.length) {
    const empty = document.createElement("div");
    empty.className = "no-sites";
    empty.textContent = "Nothing saved yet. Import a downloaded website ZIP to get started.";
    list.append(empty);
  } else for (const site of state.sites) list.append(makeSiteButton(site));
}
function closePageDrawer() {
  $("page-nav").classList.remove("open");
  $("toggle-pages").setAttribute("aria-expanded","false");
}
function renderPages() {
  const nav = $("page-list");
  nav.replaceChildren();
  if (!state.active) return;
  const query = $("page-search").value.trim().toLowerCase();
  const pages = state.active.pages.filter((p)=>!query || p.toLowerCase().includes(query) || readableName(p).toLowerCase().includes(query));
  $("page-count").textContent = "(" + state.active.pages.length + ")";
  for (const path of pages) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-item" + (path === state.page ? " selected" : "");
    const title = document.createElement("span");
    title.textContent = readableName(path);
    const sub = document.createElement("small");
    sub.textContent = path;
    btn.append(title,sub);
    btn.addEventListener("click",()=>{closePageDrawer();navigate(path);});
    nav.append(btn);
  }
}
async function selectSite(id) {
  const site = state.sites.find((item)=>item.id===id);
  if (!site) return;
  state.active = site;
  state.files = new Set(site.filePaths);
  state.page = "";
  state.history = [];
  state.cursor = -1;
  state.renderId++;
  $("reader-site-title").textContent = site.title;
  $("empty-state").hidden = true;
  $("reader-state").hidden = false;
  $("page-search").value = "";
  document.body.classList.add("reader-open");
  closePageDrawer();
  renderSites();
  const startingPage = state.files.has(site.lastPage) && isHtmlFile(site.lastPage) ? site.lastPage : site.startPath;
  await navigate(startingPage);
}
function updateToolbar() {
  $("go-back").disabled = state.cursor <= 0;
  $("go-forward").disabled = state.cursor >= state.history.length - 1;
}
async function navigate(path,hash="",push=true) {
  if (!state.active || !state.files.has(path) || !isHtmlFile(path)) return;
  const selectedSite = state.active;
  const renderId = ++state.renderId;
  state.page = path;
  $("viewer-loading").hidden = false;
  $("reader-page-path").textContent = path;
  renderPages();
  if (push) {
    state.history = state.history.slice(0,state.cursor + 1);
    state.history.push({path,hash});
    state.cursor = state.history.length - 1;
  }
  updateToolbar();
  try {
    const html = await buildViewerDocument(selectedSite,path,hash);
    if (state.renderId !== renderId || state.active?.id !== selectedSite.id) return;
    const frame = $("site-frame");
    frame.onload = () => {
      if (state.renderId === renderId) $("viewer-loading").hidden = true;
    };
    frame.srcdoc = html;
    selectedSite.lastPage = path;
    selectedSite.lastOpened = Date.now();
    putSite(selectedSite).catch(console.error);
  } catch(err) {
    if (state.renderId !== renderId) return;
    $("viewer-loading").textContent = "Could not open this page: " + (err.message || err);
  }
}
async function assetAsDataUri(site,path,cache,budget) {
  if (cache.has(path)) return cache.get(path);
  const record = await savedFile(site.id,path);
  if (!record) return null;
  if (budget.used + record.blob.size > MAX_PAGE_ASSETS) return null;
  budget.used += record.blob.size;
  const url = await new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(record.blob);
  });
  cache.set(path,url);
  return url;
}
async function replaceMatches(input,pattern,transform) {
  let output="",from=0;
  for (const match of input.matchAll(pattern)) {
    output += input.slice(from,match.index);
    output += await transform(match);
    from = match.index + match[0].length;
  }
  return output + input.slice(from);
}
async function buildViewerDocument(site,pagePath,hash) {
  const record = await savedFile(site.id,pagePath);
  if (!record) throw new Error("The HTML page was not found in storage.");
  const html = await record.blob.text();
  const doc = new DOMParser().parseFromString(html,"text/html");
  const cache = new Map();
  const budget = {used:0};
  const resolve = (url,from) => resolveLocalPath(url,from,state.files,{rootPrefix:site.rootPrefix,origin:site.origin});
  async function rewriteCss(input,fromPath,level=0,seen=new Set()) {
    if (level > 3) return "";
    let result = await replaceMatches(input,/@import\s+(?:url\(\s*(['"]?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)\s*([^;]*);/gi,async(match)=>{
      const ref = resolve((match[2] || match[4]).trim(),fromPath);
      if (!ref || !/\.css$/i.test(ref.path) || seen.has(ref.path)) return "";
      const cssRecord = await savedFile(site.id,ref.path);
      if (!cssRecord) return "";
      const visited = new Set(seen);
      visited.add(ref.path);
      const nested = await rewriteCss(await cssRecord.blob.text(),ref.path,level+1,visited);
      return match[5] && match[5].trim() ? "@media " + match[5].trim() + "{" + nested + "}" : nested;
    });
    result = await replaceMatches(result,/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,async(match)=>{
      const raw = (match[1] || match[2] || match[3] || "").trim();
      if (!raw || raw.startsWith("#") || /^data:/i.test(raw)) return match[0];
      const ref = resolve(raw,fromPath);
      if (!ref) return 'url("data:,")';
      const data = await assetAsDataUri(site,ref.path,cache,budget);
      return data ? 'url("' + data + '")' : 'url("data:,")';
    });
    return result;
  }

  // The imported document is not trusted: it gets its own opaque-origin sandbox.
  for (const el of doc.querySelectorAll("script,iframe,frame,frameset,object,embed,applet,portal,form,input,button,textarea,select,base,foreignObject")) el.remove();
  for (const el of doc.querySelectorAll("meta[http-equiv]")) el.remove();
  for (const el of doc.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || ["srcdoc","ping","formaction","srcset","action","integrity","crossorigin"].includes(name)) el.removeAttribute(attr.name);
    }
  }
  for (const link of [...doc.querySelectorAll("link")]) {
    const rel = (link.getAttribute("rel") || "").toLowerCase();
    const href = link.getAttribute("href") || "";
    if (!rel.split(/\s+/).includes("stylesheet")) {link.remove();continue;}
    const target = resolve(href,pagePath);
    const cssFile = target && /\.css$/i.test(target.path) ? await savedFile(site.id,target.path) : null;
    if (cssFile) {
      const style = doc.createElement("style");
      style.textContent = await rewriteCss(await cssFile.blob.text(),target.path,0,new Set([target.path]));
      style.setAttribute("data-pagekeep-processed","");
      link.replaceWith(style);
    } else link.remove();
  }
  for (const style of doc.querySelectorAll("style")) {
    if (style.hasAttribute("data-pagekeep-processed")) continue;
    // Styles added from linked CSS have already been rewritten above.
    if (!style.hasAttribute("data-pagekeep-linked")) style.textContent = await rewriteCss(style.textContent,pagePath);
  }
  for (const element of doc.querySelectorAll("[style]")) {
    element.setAttribute("style",await rewriteCss(element.getAttribute("style") || "",pagePath));
  }
  for (const element of doc.querySelectorAll("img[src],source[src],video[poster],audio[src]")) {
    const attr = element.hasAttribute("poster") ? "poster" : "src";
    const src = element.getAttribute(attr) || "";
    if (/^data:/i.test(src)) continue;
    const target = resolve(src,pagePath);
    const data = target ? await assetAsDataUri(site,target.path,cache,budget) : null;
    if (data) element.setAttribute(attr,data);
    else element.removeAttribute(attr);
    element.removeAttribute("loading");
  }
  for (const anchor of doc.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") || "";
    const target = resolve(href,pagePath);
    anchor.removeAttribute("target");
    anchor.removeAttribute("download");
    if (target && isHtmlFile(target.path)) {
      if (target.path === pagePath && target.hash) anchor.setAttribute("href","#" + encodeURIComponent(target.hash));
      else if (target.path !== pagePath) {
        anchor.setAttribute("href","#");
        anchor.setAttribute("data-pagekeep-path",target.path);
        anchor.setAttribute("data-pagekeep-hash",target.hash);
      } else anchor.setAttribute("href","#");
    } else {
      anchor.setAttribute("href","#");
      anchor.setAttribute("title","This link is not available in the offline archive.");
      anchor.setAttribute("aria-disabled","true");
    }
  }
  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv","Content-Security-Policy");
  csp.setAttribute("content","default-src 'none'; base-uri 'none'; connect-src 'none'; img-src data: blob:; style-src 'unsafe-inline' data:; font-src data: blob:; media-src data:; script-src 'unsafe-inline'; form-action 'none'; frame-src 'none'; object-src 'none'");
  doc.head.prepend(csp);
  doc.body.setAttribute("data-pagekeep-start-hash",hash || "");
  const bridge = doc.createElement("script");
  bridge.textContent = [
    "document.addEventListener('click',function(event){",
    "var a=event.target.closest&&event.target.closest('a[data-pagekeep-path]');",
    "if(!a)return;event.preventDefault();",
    "parent.postMessage({type:'pagekeep:navigate',path:a.getAttribute('data-pagekeep-path'),hash:a.getAttribute('data-pagekeep-hash')||''},'*');",
    "});",
    "var hash=document.body.getAttribute('data-pagekeep-start-hash');",
    "if(hash){requestAnimationFrame(function(){var node=document.getElementById(hash);if(node)node.scrollIntoView();});}"
  ].join("");
  doc.body.append(bridge);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
function setupListeners() {
  $("archive-file").addEventListener("change",()=>{
    const file = $("archive-file").files[0];
    $("file-choice").textContent = file ? file.name : "Choose a ZIP archive";
  });
  $("import-form").addEventListener("submit",async(event)=>{
    event.preventDefault();
    if (state.loading) return;
    const file = $("archive-file").files[0];
    if (!file) return message("Choose a ZIP file first.",true);
    setImportBusy(true);
    try {
      if (navigator.storage?.persist) await navigator.storage.persist().catch(()=>false);
      const site = await importZip(file);
      state.sites = await allSites();
      renderSites();
      $("import-form").reset();
      $("file-choice").textContent = "Choose a ZIP archive";
      message("Imported " + site.pages.length + " pages locally." + (site.guideOnly ? " Guide-only mode: unrelated repository sections were skipped." : ""));
      await selectSite(site.id);
    } catch(err) {
      message(err.message || "Could not import this ZIP.",true);
    } finally { setImportBusy(false); }
  });
  $("empty-import").addEventListener("click",()=>$("archive-file").click());
  $("show-library").addEventListener("click",()=>document.body.classList.remove("reader-open"));
  $("go-home").addEventListener("click",()=>state.active && navigate(state.active.startPath));
  $("go-back").addEventListener("click",()=>{
    if (state.cursor <= 0) return;
    state.cursor--;
    const entry = state.history[state.cursor];
    navigate(entry.path,entry.hash,false);
  });
  $("go-forward").addEventListener("click",()=>{
    if (state.cursor >= state.history.length-1) return;
    state.cursor++;
    const entry = state.history[state.cursor];
    navigate(entry.path,entry.hash,false);
  });
  $("page-search").addEventListener("input",renderPages);
  $("toggle-pages").addEventListener("click",()=>{
    const shown = $("page-nav").classList.toggle("open");
    $("toggle-pages").setAttribute("aria-expanded",shown ? "true" : "false");
  });
  $("hide-pages").addEventListener("click",closePageDrawer);
  $("delete-site").addEventListener("click",async()=>{
    if (!state.active) return;
    const site = state.active;
    if (!confirm('Remove "' + site.title + '" and all its offline files from this device?')) return;
    try {
      state.renderId++;
      await removeSavedSite(site.id);
      state.sites = await allSites();
      state.active = null;
      state.page = "";
      $("site-frame").removeAttribute("srcdoc");
      $("reader-state").hidden = true;
      $("empty-state").hidden = false;
      document.body.classList.remove("reader-open");
      renderSites();
    } catch(err) {alert("Could not remove saved website: " + (err.message || err));}
  });
  window.addEventListener("message",(event)=>{
    if (event.source !== $("site-frame").contentWindow || !state.active) return;
    if (event.data?.type !== "pagekeep:navigate") return;
    if (!state.files.has(event.data.path) || !isHtmlFile(event.data.path)) return;
    closePageDrawer();
    navigate(event.data.path,typeof event.data.hash === "string" ? event.data.hash : "");
  });
}
async function initOfflineStatus() {
  function update(ready) {
    const offline = !navigator.onLine;
    $("status-dot").classList.toggle("ready",ready);
    $("network-status").textContent = offline ? (ready ? "Ready offline" : "No internet") : (ready ? "Offline ready" : "Online · installing offline support");
  }
  update(false);
  if (!("serviceWorker" in navigator)) {
    $("network-status").textContent = "Offline install not supported";
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js",{scope:"./"});
    await navigator.serviceWorker.ready;
    update(true);
    window.addEventListener("online",()=>update(true));
    window.addEventListener("offline",()=>update(true));
  } catch {
    $("network-status").textContent = "Offline setup failed · reload online";
  }
}
async function main() {
  setupListeners();
  initOfflineStatus();
  try {
    state.db = await openDatabase();
    state.sites = await allSites();
    renderSites();
    if (state.sites.length) await selectSite(state.sites[0].id);
  } catch(err) {
    message("This browser cannot open local storage: " + (err.message || err),true);
    $("import-button").disabled = true;
  }
}
main();
