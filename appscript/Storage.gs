function normalizeWeekStart_(value) {
  const tz = getTimezone_();
  if (value instanceof Date) {
    return Utilities.formatDate(value, tz, "yyyy-MM-dd");
  }
  return String(value ?? "").trim();
}

function nowIso_() {
  const tz = getTimezone_();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
}

function weekStartUpcomingMonday_() {
  // Active booking week:
  // - Mon..Sat: this week's Monday
  // - Sun: next day's Monday (next week)
  const tz = getTimezone_();
  const now = new Date();
  const dow = Number(Utilities.formatDate(now, tz, "u")); // 1..7 (Mon..Sun)

  // If Sunday (7) -> add 1 day to reach Monday
  // Else -> go back to Monday of this week
  const addDays = (dow === 7) ? 1 : (1 - dow);

  const target = new Date(now.getTime() + addDays * 24 * 3600 * 1000);
  return Utilities.formatDate(target, tz, "yyyy-MM-dd");
}

function getValidCodeRow_(code) {
  const sh = getSheet_(SHEET_NAMES.CODE);
  const values = sh.getDataRange().getValues();
  // headers: code, is_admin
  for (let i = 1; i < values.length; i++) {
    const c = String(values[i][0] ?? "").trim();
    if (c && c === code) {
      return { rowIndex: i + 1, isAdmin: String(values[i][1] ?? "").toUpperCase() === "TRUE" };
    }
  }
  return null;
}

function log_(action, code, details) {
  try {
    const sh = getSheet_(SHEET_NAMES.LOGS);
    sh.appendRow([nowIso_(), action, code || "", details || ""]);
  } catch (e) {
    // Logging must never break API
  }
}

function readBookingsForWeek_(weekStart) {
  const sh = getSheet_(SHEET_NAMES.BOOKINGS);
  const values = sh.getDataRange().getValues();
  // headers: week_start, day, session, gpu, code, created_at
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (normalizeWeekStart_(values[i][0]) === weekStart) {
      out.push({
        week_start: String(values[i][0]),
        day: Number(values[i][1]),
        session: Number(values[i][2]),
        gpu: Number(values[i][3]),
        code: String(values[i][4]),
        created_at: String(values[i][5]),
        rowIndex: i + 1, // for deleting later
      });
    }
  }
  return out;
}

function countBookingsForCode_(weekStart, code) {
  const rows = readBookingsForWeek_(weekStart);
  return rows.filter(r => r.code === code).length;
}

function isSlotBooked_(weekStart, day, session, gpu) {
  const rows = readBookingsForWeek_(weekStart);
  return rows.some(r => r.day === day && r.session === session && r.gpu === gpu);
}

function findBookingRow_(weekStart, day, session, gpu) {
  const rows = readBookingsForWeek_(weekStart);
  return rows.find(r => r.day === day && r.session === session && r.gpu === gpu) || null;
}

function appendBooking_(weekStart, day, session, gpu, code) {
  const sh = getSheet_(SHEET_NAMES.BOOKINGS);
  sh.appendRow([weekStart, day, session, gpu, code, nowIso_()]);
}
