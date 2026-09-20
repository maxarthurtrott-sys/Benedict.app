import { parseICS } from "./ics-parser.js";
 
const OUTDOOR_KEYWORDS = ["mow", "mowing", "lawn", "garden", "wash car", "bike ride", "hike"];
const RAIN_KEYWORDS = ["rain", "thunderstorm", "drizzle", "shower"];
const STORAGE_KEY = "benedict_settings";
const TASKS_KEY = "benedict_tasks";
const TRACKERS_KEY = "benedict_trackers";
const CORS_PROXY = "https://corsproxy.io/?url=";
 
const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  closeSettings: document.getElementById("closeSettings"),
  openSettingsLink: document.getElementById("openSettingsLink"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  setupNotice: document.getElementById("setupNotice"),
  briefText: document.getElementById("briefText"),
  speakBtn: document.getElementById("speakBtn"),
  weatherRow: document.getElementById("weatherRow"),
  weatherTemp: document.getElementById("weatherTemp"),
  weatherNote: document.getElementById("weatherNote"),
  timeline: document.getElementById("timeline"),
  calendarList: document.getElementById("calendarList"),
  taskList: document.getElementById("taskList"),
  taskInput: document.getElementById("taskInput"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  newsList: document.getElementById("newsList"),
  trackerList: document.getElementById("trackerList"),
  addTrackerBtn: document.getElementById("addTrackerBtn"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  saveBtn: document.getElementById("saveBtn"),
  savedNote: document.getElementById("savedNote"),
};
 
const settingsFields = ["weatherKey", "cityName", "icsUrl", "newsTopics"];
 
/* ---------- settings storage ---------- */
function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings();
  } catch {
    return defaultSettings();
  }
}
function defaultSettings() {
  return {
    weatherKey: "", cityName: "", icsUrl: "", newsTopics: "",
    autoSpeak: false, voiceName: "", rate: 1, useProxy: false,
  };
}
function saveSettings(values) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}
 
/* ---------- task storage ---------- */
function getTasks() {
  try {
    return JSON.parse(localStorage.getItem(TASKS_KEY)) || [];
  } catch {
    return [];
  }
}
function setTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}
 
/* ---------- tracker storage ---------- */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function defaultTrackers() {
  return [
    { id: "weight", name: "Weight", type: "number", unit: "kg", entries: [] },
    { id: "exercise", name: "Exercise", type: "tally", entries: [] },
    { id: "reading", name: "Reading", type: "tally", entries: [] },
    { id: "dogwalk", name: "Walk the dog", type: "tally", entries: [] },
    { id: "biking", name: "Biking", type: "tally", entries: [] },
  ];
}
function getTrackers() {
  try {
    const raw = localStorage.getItem(TRACKERS_KEY);
    if (!raw) {
      const seeded = defaultTrackers();
      setTrackers(seeded);
      return seeded;
    }
    return JSON.parse(raw);
  } catch {
    return defaultTrackers();
  }
}
function setTrackers(trackers) {
  localStorage.setItem(TRACKERS_KEY, JSON.stringify(trackers));
}
 
/* ---------- tabs ---------- */
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    els.tabs.forEach((t) => t.classList.remove("active"));
    els.panels.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});
 
/* ---------- settings sheet ---------- */
function openSettings() {
  const s = getSettings();
  settingsFields.forEach((f) => {
    const el = document.getElementById(f);
    if (el) el.value = s[f] || "";
  });
  document.getElementById("autoSpeak").checked = !!s.autoSpeak;
  document.getElementById("useProxy").checked = !!s.useProxy;
  document.getElementById("rate").value = s.rate || 1;
  populateVoices(s.voiceName);
  els.settingsOverlay.classList.remove("hidden");
}
function closeSettings() {
  els.settingsOverlay.classList.add("hidden");
}
els.settingsBtn.addEventListener("click", openSettings);
els.openSettingsLink.addEventListener("click", (e) => { e.preventDefault(); openSettings(); });
els.closeSettings.addEventListener("click", closeSettings);
 
function populateVoices(selected) {
  const select = document.getElementById("voiceSelect");
  const voices = speechSynthesis.getVoices();
  select.innerHTML = "";
  voices.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    select.appendChild(opt);
  });
  if (selected) select.value = selected;
}
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => populateVoices(getSettings().voiceName);
}
 
els.saveBtn.addEventListener("click", () => {
  const values = getSettings();
  settingsFields.forEach((f) => {
    const el = document.getElementById(f);
    if (el) values[f] = el.value.trim();
  });
  values.autoSpeak = document.getElementById("autoSpeak").checked;
  values.useProxy = document.getElementById("useProxy").checked;
  values.voiceName = document.getElementById("voiceSelect").value || "";
  values.rate = parseFloat(document.getElementById("rate").value) || 1;
  saveSettings(values);
  els.savedNote.classList.remove("hidden");
  setTimeout(() => els.savedNote.classList.add("hidden"), 1500);
  setTimeout(() => { closeSettings(); loadAndRender(); }, 500);
});
 
/* ---------- data fetching ---------- */
async function fetchWeather(settings) {
  if (!settings.weatherKey || !settings.cityName) return null;
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(settings.cityName)}&units=metric&appid=${settings.weatherKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather fetch failed");
    return await res.json();
  } catch (e) {
    console.error(e);
    return null;
  }
}
 
async function fetchCalendar(settings) {
  if (!settings.icsUrl) return [];
  const url = settings.useProxy ? CORS_PROXY + encodeURIComponent(settings.icsUrl) : settings.icsUrl;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("calendar fetch failed");
    const text = await res.text();
    return parseICS(text);
  } catch (e) {
    console.error(e);
    return [];
  }
}
 
function willRainToday(weatherJson) {
  if (!weatherJson || !weatherJson.list) return null;
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;
  return weatherJson.list.find((slot) => {
    const t = slot.dt * 1000;
    if (t < now || t > in24h) return false;
    const desc = (slot.weather?.[0]?.main || "").toLowerCase();
    return RAIN_KEYWORDS.some((k) => desc.includes(k));
  }) || null;
}
 
function buildBriefing(events, rainSlot, weatherJson) {
  const lines = [];
  const upcoming = events.filter((e) => e.start > new Date());
  const next = upcoming[0];
  if (next) lines.push(`Next up: ${next.title} at ${formatTime(next.start)}.`);
  else lines.push("Nothing left on the calendar for today.");
 
  if (rainSlot) {
    lines.push(`Rain expected around ${formatTime(new Date(rainSlot.dt * 1000))} — bring an umbrella.`);
    const clash = upcoming.find((e) => OUTDOOR_KEYWORDS.some((k) => e.title.toLowerCase().includes(k)));
    if (clash) lines.push(`"${clash.title}" may clash with the rain — consider moving it.`);
  } else if (weatherJson) {
    lines.push("No rain expected in the next 24 hours.");
  }
  return lines.join(" ");
}
 
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
 
function renderTimeline(container, events, emptyMsg) {
  container.innerHTML = "";
  const upcoming = events.filter((e) => e.start > new Date()).slice(0, 8);
  if (!upcoming.length) {
    container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }
  for (const e of upcoming) {
    const row = document.createElement("div");
    row.className = "event";
    row.innerHTML = `<span class="event-time">${formatTime(e.start)}</span><span class="event-title">${escapeHtml(e.title || "Untitled event")}</span>`;
    container.appendChild(row);
  }
}
 
function renderTasks() {
  const tasks = getTasks();
  els.taskList.innerHTML = "";
  if (!tasks.length) {
    els.taskList.innerHTML = `<div class="empty-state">No tasks yet.</div>`;
    return;
  }
  tasks.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "task-item" + (t.done ? " done" : "");
    row.innerHTML = `<span class="task-check"></span><span>${escapeHtml(t.text)}</span>`;
    row.addEventListener("click", () => {
      tasks[i].done = !tasks[i].done;
      setTasks(tasks);
      renderTasks();
    });
    els.taskList.appendChild(row);
  });
}
 
els.addTaskBtn.addEventListener("click", addTask);
els.taskInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addTask(); });
function addTask() {
  const text = els.taskInput.value.trim();
  if (!text) return;
  const tasks = getTasks();
  tasks.push({ text, done: false });
  setTasks(tasks);
  els.taskInput.value = "";
  renderTasks();
}
 
function renderNewsPlaceholder(settings) {
  els.newsList.innerHTML = "";
  const note = document.createElement("div");
  note.className = "empty-state";
  note.textContent = settings.newsTopics
    ? "News source not connected yet — topics saved, ready to plug in a feed."
    : "No topics set yet. Add some in Settings.";
  els.newsList.appendChild(note);
}
 
/* ---------- Life tracker stats & charts ---------- */
function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function computeStreak(entries) {
  const dates = new Set(entries.map((e) => e.date));
  let streak = 0;
  for (let i = 0; ; i++) {
    if (dates.has(daysAgoKey(i))) streak++;
    else break;
  }
  return streak;
}
function countInLastNDays(entries, n) {
  const cutoff = daysAgoKey(n - 1);
  return entries.filter((e) => e.date >= cutoff).length;
}
 
function lineChartSVG(entries) {
  const recent = entries.slice(-14);
  if (recent.length < 2) {
    return `<div class="chart-empty">Log a couple more entries to see a trend line.</div>`;
  }
  const w = 280, h = 64, pad = 6;
  const values = recent.map((e) => e.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (recent.length - 1);
  const points = recent.map((e, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((e.value - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const lastX = pad + (recent.length - 1) * stepX;
  const lastY = h - pad - ((last - min) / range) * (h - pad * 2);
 
  return `<svg viewBox="0 0 ${w} ${h}" class="tracker-chart" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="#B08A52" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.2" fill="#B08A52" />
  </svg>`;
}
 
function barChartSVG(entries) {
  const days = Array.from({ length: 14 }, (_, i) => 13 - i).map((n) => daysAgoKey(n));
  const dateSet = new Set(entries.map((e) => e.date));
  const w = 280, h = 64, gap = 4;
  const barW = (w - gap * (days.length - 1)) / days.length;
  const bars = days.map((d, i) => {
    const done = dateSet.has(d);
    const x = i * (barW + gap);
    const barH = done ? h - 10 : 6;
    const y = h - barH;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${barH}" rx="2.5" fill="${done ? "#B08A52" : "#2A3542"}" />`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="tracker-chart" preserveAspectRatio="none">${bars}</svg>`;
}
 
function renderLife() {
  const trackers = getTrackers();
  els.trackerList.innerHTML = "";
 
  trackers.forEach((t) => {
    const card = document.createElement("div");
    card.className = "tracker-card";
 
    let statsHtml, chartHtml, actionHtml;
 
    if (t.type === "number") {
      const sorted = [...t.entries].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1];
      const first = sorted[0];
      const change = latest && first && sorted.length > 1 ? (latest.value - first.value) : null;
      statsHtml = latest
        ? `Latest: <strong>${latest.value}${t.unit ? " " + t.unit : ""}</strong>` +
          (change !== null ? ` &nbsp;•&nbsp; Change: ${change > 0 ? "+" : ""}${change.toFixed(1)}${t.unit ? " " + t.unit : ""}` : "")
        : "No entries yet.";
      chartHtml = lineChartSVG(sorted);
      actionHtml = `<button class="tracker-btn" data-action="log-number" data-id="${t.id}">Log ${escapeHtml(t.name.toLowerCase())}</button>`;
    } else {
      const loggedToday = t.entries.some((e) => e.date === todayKey());
      const week = countInLastNDays(t.entries, 7);
      const month = countInLastNDays(t.entries, 30);
      const streak = computeStreak(t.entries);
      statsHtml = `This week: <strong>${week}/7</strong> &nbsp;•&nbsp; Streak: <strong>${streak}d</strong> &nbsp;•&nbsp; 30d: <strong>${month}</strong>`;
      chartHtml = barChartSVG(t.entries);
      actionHtml = `<button class="tracker-btn ${loggedToday ? "done" : ""}" data-action="toggle-tally" data-id="${t.id}">${loggedToday ? "Logged today ✓" : "Log today"}</button>`;
    }
 
    card.innerHTML = `
      <div class="tracker-header">
        <span class="tracker-name">${escapeHtml(t.name)}</span>
        <div class="tracker-actions">
          <button data-action="rename" data-id="${t.id}" title="Rename">✎</button>
          <button data-action="delete" data-id="${t.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="tracker-summary">${statsHtml}</div>
      ${chartHtml}
      <div class="tracker-action-row">${actionHtml}</div>
    `;
    els.trackerList.appendChild(card);
  });
 
  els.trackerList.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleTrackerAction(btn.dataset.action, btn.dataset.id));
  });
}
 
function handleTrackerAction(action, id) {
  const trackers = getTrackers();
  const t = trackers.find((x) => x.id === id);
  if (!t) return;
 
  if (action === "rename") {
    const name = prompt("Rename tracker", t.name);
    if (!name || !name.trim()) return;
    t.name = name.trim();
    setTrackers(trackers);
    renderLife();
  } else if (action === "delete") {
    if (!confirm(`Delete "${t.name}" and its history? This can't be undone.`)) return;
    setTrackers(trackers.filter((x) => x.id !== id));
    renderLife();
  } else if (action === "log-number") {
    const val = prompt(`Log ${t.name}${t.unit ? " (" + t.unit + ")" : ""}`);
    if (val === null || val.trim() === "") return;
    const num = parseFloat(val.replace(",", "."));
    if (isNaN(num)) { alert("That doesn't look like a number."); return; }
    const today = todayKey();
    const existing = t.entries.find((e) => e.date === today);
    if (existing) existing.value = num;
    else t.entries.push({ date: today, value: num });
    setTrackers(trackers);
    renderLife();
  } else if (action === "toggle-tally") {
    const today = todayKey();
    const idx = t.entries.findIndex((e) => e.date === today);
    if (idx >= 0) t.entries.splice(idx, 1);
    else t.entries.push({ date: today });
    setTrackers(trackers);
    renderLife();
  }
}
 
els.addTrackerBtn.addEventListener("click", () => {
  const name = prompt("Tracker name (e.g. Weight, Yoga, Guitar practice)");
  if (!name || !name.trim()) return;
  const isNumber = confirm(
    "Is this a NUMBER you log (like weight)?\n\nOK = number tracker\nCancel = simple day-log (like exercise, reading)"
  );
  let unit = "";
  if (isNumber) unit = prompt("Unit (optional, e.g. kg, lbs)") || "";
  const trackers = getTrackers();
  trackers.push({
    id: Date.now().toString(),
    name: name.trim(),
    type: isNumber ? "number" : "tally",
    unit: unit.trim(),
    entries: [],
  });
  setTrackers(trackers);
  renderLife();
});
 
/* ---------- voice ---------- */
function speak(text, settings) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = settings.rate || 1;
  if (settings.voiceName) {
    const voice = speechSynthesis.getVoices().find((v) => v.name === settings.voiceName);
    if (voice) utter.voice = voice;
  }
  speechSynthesis.speak(utter);
}
function buildSpokenReport(briefing, tasks) {
  const parts = [briefing];
  const open = tasks.filter((t) => !t.done);
  if (open.length) {
    parts.push(`You have ${open.length} open task${open.length > 1 ? "s" : ""}: ${open.slice(0, 5).map((t) => t.text).join(", ")}.`);
  }
  return parts.join(" ");
}
 
/* ---------- main render ---------- */
async function loadAndRender() {
  const settings = getSettings();
  const missingSetup = !settings.weatherKey || !settings.icsUrl;
  els.setupNotice.classList.toggle("hidden", !missingSetup);
 
  renderTasks();
  renderNewsPlaceholder(settings);
  renderLife();
 
  const [weatherJson, events] = await Promise.all([
    fetchWeather(settings),
    fetchCalendar(settings),
  ]);
 
  if (weatherJson?.list?.[0]) {
    els.weatherRow.classList.remove("hidden");
    els.weatherTemp.textContent = `${Math.round(weatherJson.list[0].main.temp)}°C now`;
  }
  const rainSlot = willRainToday(weatherJson);
  if (rainSlot) els.weatherNote.textContent = `Rain near ${formatTime(new Date(rainSlot.dt * 1000))}`;
 
  const briefingText = missingSetup
    ? "Add your weather key and calendar link in Settings to get a real briefing."
    : buildBriefing(events, rainSlot, weatherJson);
  els.briefText.textContent = briefingText;
 
  renderTimeline(els.timeline, events, "Nothing on the calendar right now.");
  renderTimeline(els.calendarList, events, "No upcoming events found.");
 
  const tasks = getTasks();
  const spokenReport = buildSpokenReport(briefingText, tasks);
  els.speakBtn.onclick = () => speak(spokenReport, settings);
  if (settings.autoSpeak && !missingSetup) speak(spokenReport, settings);
}
 
loadAndRender();
 
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((e) => console.error(e));
  });
}
 
