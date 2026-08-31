// Minimal ICS (iCalendar) parser — handles VEVENTs with DTSTART/DTEND/SUMMARY.
// Note: does not expand RRULE recurrence; recurring events show only their
// first stored occurrence. Good enough for "what's coming up" style views.

function unfoldLines(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  const out = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseICSDate(value) {
  // Forms: 20260824T090000Z | 20260824T090000 | 20260824
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  const date = new Date(iso);
  return isNaN(date) ? null : date;
}

export function parseICS(raw) {
  const lines = unfoldLines(raw);
  const events = [];
  let cur = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      cur = {};
    } else if (line.startsWith("END:VEVENT")) {
      if (cur && cur.start) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx).split(";")[0];
      const val = line.slice(idx + 1);
      if (keyPart === "SUMMARY") cur.title = val;
      else if (keyPart === "DTSTART") cur.start = parseICSDate(val);
      else if (keyPart === "DTEND") cur.end = parseICSDate(val);
      else if (keyPart === "LOCATION") cur.location = val;
    }
  }

  return events
    .filter((e) => e.start)
    .sort((a, b) => a.start - b.start);
}
