/* Olven — Vinted sales tracker for Benedict.
   Drop-in: upload next to index.html; index.html loads it with
   <script type="module" src="olven.js"></script>. Data comes from your own
   Google Apps Script (olven-apps-script.gs), never from a third party. */
const CFG_KEY = "benedict_olven_config", LOC_KEY = "benedict_olven_local", CACHE_KEY = "benedict_olven_cache";
const DAY = 864e5;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const style = document.createElement("style");
style.textContent = `
.ol-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 16px}
.ol-card{background:#242F3D;border-radius:12px;padding:12px}
.ol-num{font-size:26px;color:#B08A52;font-family:'Fraunces',serif}
.ol-lbl{font-size:11px;color:#7C8695;text-transform:uppercase;letter-spacing:.06em}
.ol-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #2E3A4A}
.ol-t{font-size:14px;overflow-wrap:anywhere}.ol-s{font-size:12px;color:#7C8695;margin-top:2px}
.ol-warn{color:#D9826B}.ol-acts{display:flex;gap:6px;flex-shrink:0}
.ol-btn{background:transparent;color:#B08A52;border:1px solid #B08A52;border-radius:8px;padding:6px 10px;font-size:12px}
.ol-in{width:100%;box-sizing:border-box;margin:4px 0 12px;padding:10px;border-radius:8px;border:1px solid #2E3A4A;background:#1B2430;color:#E6E9EE}
.ol-top{display:flex;justify-content:space-between;align-items:center}`;
document.head.appendChild(style);

const loc = () => ({ hidden: [], shipped: [], reposted: {}, ...load(LOC_KEY, {}) });
const age = (iso) => Math.floor((Date.now() - Date.parse(iso)) / DAY);
function left(ms) {
  const a = Math.abs(ms), d = Math.floor(a / DAY), h = Math.floor((a % DAY) / 36e5), m = Math.floor((a % 36e5) / 6e4);
  const t = d ? `${d}d ${h}h` : `${h}h ${m}m`;
  return ms < 0 ? `overdue ${t}` : `${t} left`;
}

function render(panel, data, msg) {
  const cfg = load(CFG_KEY, null);
  if (!cfg?.url) {
    panel.innerHTML = `<p class="hint">Connect Olven to your Google Apps Script (see README step B). Paste the web app URL and your key.</p>
      <label class="ol-lbl">Web app URL</label><input id="olUrl" class="ol-in" placeholder="https://script.google.com/macros/s/.../exec" />
      <label class="ol-lbl">Key</label><input id="olKey" class="ol-in" placeholder="key from setup()" />
      <button class="ol-btn" data-a="connect">Connect</button>`;
    return;
  }
  const L = loc(), now = Date.now();
  const shipDays = data?.shipDays || 5, staleDays = data?.staleDays || 30;
  const items = (data?.items || []).filter((i) => !L.hidden.includes(i.id));
  const listed = items.filter((i) => !i.soldAt);
  const toShip = items
    .filter((i) => i.soldAt && !i.shippedAt && !L.shipped.includes(i.id) && now - Date.parse(i.soldAt) < (shipDays + 10) * DAY)
    .map((i) => ({ ...i, left: Date.parse(i.soldAt) + shipDays * DAY - now })).sort((a, b) => a.left - b.left);
  const stale = listed.filter((i) => now - Date.parse(L.reposted[i.id] || i.listedAt) >= staleDays * DAY)
    .sort((a, b) => Date.parse(a.listedAt) - Date.parse(b.listedAt));
  const sold30 = items.filter((i) => i.soldAt && now - Date.parse(i.soldAt) < 30 * DAY);
  const revenue = sold30.reduce((s, i) => s + (i.price || 0), 0);
  const cur = (sold30.find((i) => i.cur) || {}).cur || "";
  const likes = listed.reduce((s, i) => s + (i.likes || 0), 0);

  const rows = (arr, f) => arr.length ? arr.map(f).join("") : `<div class="empty-state">Nothing here.</div>`;
  panel.innerHTML = `
    <div class="ol-top"><span class="ol-s">${data ? "Synced " + Math.max(0, Math.round((now - data.fetchedAt) / 60000)) + " min ago" : "Not synced yet"}</span>
      <span class="ol-acts"><button class="ol-btn" data-a="refresh">Refresh</button><button class="ol-btn" data-a="disconnect">Disconnect</button></span></div>
    ${msg ? `<p class="hint ol-warn">${esc(msg)}</p>` : ""}
    <div class="ol-grid">
      <div class="ol-card"><div class="ol-num">${listed.length}</div><div class="ol-lbl">Listed now</div></div>
      <div class="ol-card"><div class="ol-num">${toShip.length}</div><div class="ol-lbl">To ship</div></div>
      <div class="ol-card"><div class="ol-num">${sold30.length}</div><div class="ol-lbl">Sold, 30 days${revenue ? " · " + Math.round(revenue) + " " + esc(cur) : ""}</div></div>
      <div class="ol-card"><div class="ol-num">${likes}</div><div class="ol-lbl">Likes on listings</div></div>
    </div>
    <h2 class="section-label">To ship</h2>
    ${rows(toShip, (i) => `<div class="ol-row"><div><div class="ol-t">${esc(i.title)}</div><div class="ol-s ${i.left < DAY ? "ol-warn" : ""}">${left(i.left)}</div></div>
      <div class="ol-acts"><button class="ol-btn" data-a="shipped" data-id="${esc(i.id)}">Shipped ✓</button></div></div>`)}
    <h2 class="section-label" style="margin-top:18px">Repost these (${staleDays}+ days)</h2>
    ${rows(stale, (i) => `<div class="ol-row"><div><div class="ol-t">${esc(i.title)}</div><div class="ol-s">${age(L.reposted[i.id] || i.listedAt)} days · ${i.likes || 0} likes — try new photos</div></div>
      <div class="ol-acts"><button class="ol-btn" data-a="reposted" data-id="${esc(i.id)}">Reposted</button><button class="ol-btn" data-a="gone" data-id="${esc(i.id)}">Gone</button></div></div>`)}
    <p class="hint" style="margin-top:14px">Counts come from Vinted emails. Items deleted without an email stay listed until you tap Gone.</p>`;
}

async function refresh(panel) {
  const cfg = load(CFG_KEY, null);
  if (!cfg?.url) return render(panel, null);
  try {
    const r = await fetch(`${cfg.url}?key=${encodeURIComponent(cfg.key || "")}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    d.fetchedAt = Date.now();
    save(CACHE_KEY, d);
    render(panel, d);
  } catch (e) {
    render(panel, load(CACHE_KEY, null), `Couldn't sync (${e.message}). Showing saved data.`);
  }
}

function mount() {
  const nav = document.querySelector(".tabs"), main = document.querySelector("main");
  if (!nav || !main) return;
  const tab = document.createElement("button");
  tab.className = "tab"; tab.dataset.tab = "olven"; tab.textContent = "Olven";
  const panel = document.createElement("section");
  panel.id = "tab-olven"; panel.className = "panel";
  nav.appendChild(tab); main.appendChild(panel);

  nav.addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    if (t === tab) {
      document.querySelectorAll(".tab, .panel").forEach((x) => x.classList.remove("active"));
      tab.classList.add("active"); panel.classList.add("active");
      render(panel, load(CACHE_KEY, null)); refresh(panel);
    } else { tab.classList.remove("active"); panel.classList.remove("active"); }
  });

  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a, id = b.dataset.id, L = loc();
    if (a === "connect") {
      const url = panel.querySelector("#olUrl").value.trim(), key = panel.querySelector("#olKey").value.trim();
      if (!/^https:\/\/script\.google\.com\//.test(url)) return render(panel, null, "That doesn't look like a script.google.com URL.");
      save(CFG_KEY, { url, key }); return refresh(panel);
    }
    if (a === "refresh") return refresh(panel);
    if (a === "disconnect") { localStorage.removeItem(CFG_KEY); localStorage.removeItem(CACHE_KEY); return render(panel, null); }
    if (a === "shipped") L.shipped.push(id);
    if (a === "gone") L.hidden.push(id);
    if (a === "reposted") L.reposted[id] = new Date().toISOString();
    save(LOC_KEY, L); render(panel, load(CACHE_KEY, null));
  });

  setInterval(() => { if (panel.classList.contains("active") && load(CFG_KEY, null)?.url) render(panel, load(CACHE_KEY, null)); }, 60000);
  render(panel, load(CACHE_KEY, null));
}
mount();
