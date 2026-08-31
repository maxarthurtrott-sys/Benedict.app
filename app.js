import { parseICS } from "./ics-parser.js";

const OUTDOOR_KEYWORDS = ["mow", "mowing", "lawn", "garden", "wash car", "bike ride", "hike"];
const RAIN_KEYWORDS = ["rain", "thunderstorm", "drizzle", "shower"];
const STORAGE_KEY = "benedict_settings";
const TASKS_KEY = "benedict_tasks";
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
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  saveBtn: document.getElementById("saveBtn"),
  savedNote: document.getElementById("savedNote"),
};

const settingsFields = ["weatherKey", "cityName", "icsUrl", "newsTopics"];

/* ---------- storage ---------- */
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
