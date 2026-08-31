/** Calendário de dias úteis em America/Sao_Paulo (sem horário de verão). */

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: wdMap[get("weekday")]
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function easterGregorian(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function addDays(parts, delta) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + delta);
  const d = new Date(utc);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function holidaySet(year) {
  const set = new Set([
    ymd(year, 1, 1),
    ymd(year, 4, 21),
    ymd(year, 5, 1),
    ymd(year, 9, 7),
    ymd(year, 10, 12),
    ymd(year, 11, 2),
    ymd(year, 11, 15),
    ymd(year, 11, 20),
    ymd(year, 12, 25)
  ]);
  const easter = easterGregorian(year);
  const add = (delta) => {
    const p = addDays(easter, delta);
    return ymd(p.year, p.month, p.day);
  };
  set.add(add(-48));
  set.add(add(-47));
  set.add(add(-2));
  set.add(add(60));
  return set;
}

function saoPauloToday(now) {
  return zonedParts(now || new Date(), "America/Sao_Paulo");
}

function isWeekend(parts) {
  return parts.weekday === 0 || parts.weekday === 6;
}

function isHoliday(parts) {
  return holidaySet(parts.year).has(ymd(parts.year, parts.month, parts.day));
}

function isBusinessDaySP(now) {
  const parts = saoPauloToday(now);
  if (isWeekend(parts)) return { ok: false, reason: "weekend", parts };
  if (isHoliday(parts)) return { ok: false, reason: "holiday", parts };
  return { ok: true, reason: "business", parts };
}

function todayIsoSP(now) {
  const p = saoPauloToday(now);
  return ymd(p.year, p.month, p.day);
}

module.exports = {
  saoPauloToday,
  isWeekend,
  isHoliday,
  isBusinessDaySP,
  todayIsoSP
};
