/**
 * Minimal RFC 5545 .ics builder (no library).
 * Produces a single VEVENT and triggers a download.
 */

interface IcsInput {
  uid: string;
  title: string;
  description?: string | null;
  startISO: string;
  endISO: string;
  location?: string | null;
  url?: string | null;
}

function fmtUTC(iso: string): string {
  // YYYYMMDDTHHmmssZ
  const d = new Date(iso);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs(input: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//null_collective//events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@null-collective`,
    `DTSTAMP:${fmtUTC(new Date().toISOString())}`,
    `DTSTART:${fmtUTC(input.startISO)}`,
    `DTEND:${fmtUTC(input.endISO)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcs(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`);
  if (input.url) lines.push(`URL:${escapeIcs(input.url)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
