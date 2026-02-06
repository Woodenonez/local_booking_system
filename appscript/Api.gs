function jsonResponse_(obj, status) {
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  // Apps Script doesn't let you set HTTP status reliably; include status in body.
  return output;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch {
    return {};
  }
}

function requireValidCode_(code) {
  const row = getValidCodeRow_(code);
  if (!row) throw new Error("INVALID_CODE");
  return row;
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
    if (action === "week") {
      const weekStart = String(e.parameter.week_start || weekStartUpcomingMonday_());
      const code = String(e.parameter.code || "").trim();
      // code optional for viewing; required if you want "mine"
      const bookings = readBookingsForWeek_(weekStart);

      const days = getDays_().length;      // 5
      const sessions = getSessions_().length; // 3
      const gpus = getGpus_().length;      // 4

      // public grid: booked true/false
      const grid = Array.from({ length: days }, () =>
        Array.from({ length: sessions }, () =>
          Array.from({ length: gpus }, () => false)
        )
      );

      bookings.forEach(b => {
        if (b.day >= 0 && b.day < days && b.session >= 0 && b.session < sessions) {
          const gi = b.gpu; // assumes 0..3
          if (gi >= 0 && gi < gpus) grid[b.day][b.session][gi] = true;
        }
      });

      const mine = code ? bookings.filter(b => b.code === code).map(b => ({
        day: b.day, session: b.session, gpu: b.gpu
      })) : [];

      return jsonResponse_({ ok: true, week_start: weekStart, grid, mine, max_per_code: getMaxSessionsPerCode_() });
    }

    return jsonResponse_({ ok: false, error: "UNKNOWN_ACTION" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = String(body.action || "");

    if (action === "login") {
      const code = String(body.code || "").trim();
      const row = requireValidCode_(code);
      log_("login", code, row.isAdmin ? "admin" : "user");
      // simplest: just return is_admin; frontend stores code locally
      return jsonResponse_({ ok: true, is_admin: row.isAdmin });
    }

    if (action === "book") {
      const code = String(body.code || "").trim();
      requireValidCode_(code);

      const weekStart = String(body.week_start || weekStartUpcomingMonday_());
      const day = Number(body.day);
      const session = Number(body.session);
      const gpu = Number(body.gpu);

      const daysN = getDays_().length;
      const sessN = getSessions_().length;
      const gpusN = getGpus_().length;

      if (!(day >= 0 && day < daysN && session >= 0 && session < sessN && gpu >= 0 && gpu < gpusN)) {
        throw new Error("INVALID_SLOT");
      }

      if (isSlotBooked_(weekStart, day, session, gpu)) throw new Error("ALREADY_BOOKED");

      const maxN = getMaxSessionsPerCode_();
      const cnt = countBookingsForCode_(weekStart, code);
      if (cnt >= maxN) throw new Error("MAX_REACHED");

      appendBooking_(weekStart, day, session, gpu, code);
      log_("book", code, JSON.stringify({ weekStart, day, session, gpu }));
      return jsonResponse_({ ok: true });
    }

    if (action === "cancel") {
      const code = String(body.code || "").trim();
      requireValidCode_(code);

      const weekStart = String(body.week_start || weekStartUpcomingMonday_());
      const day = Number(body.day);
      const session = Number(body.session);
      const gpu = Number(body.gpu);

      const b = findBookingRow_(weekStart, day, session, gpu);
      if (!b) throw new Error("NOT_BOOKED");
      if (b.code !== code) throw new Error("NOT_OWNER");

      const sh = getSheet_(SHEET_NAMES.BOOKINGS);
      sh.deleteRow(b.rowIndex);
      log_("cancel", code, JSON.stringify({ weekStart, day, session, gpu }));
      return jsonResponse_({ ok: true });
    }

    if (action === "admin_cancel") {
      const adminCode = String(body.code || "").trim();
      const row = requireValidCode_(adminCode);
      if (!row.isAdmin) throw new Error("NOT_ADMIN");

      const weekStart = String(body.week_start || weekStartUpcomingMonday_());
      const day = Number(body.day);
      const session = Number(body.session);
      const gpu = Number(body.gpu);

      const b = findBookingRow_(weekStart, day, session, gpu);
      if (!b) throw new Error("NOT_BOOKED");

      const sh = getSheet_(SHEET_NAMES.BOOKINGS);
      sh.deleteRow(b.rowIndex);
      log_("admin_cancel", adminCode, JSON.stringify({ weekStart, day, session, gpu, removed_code: b.code }));
      return jsonResponse_({ ok: true });
    }

    return jsonResponse_({ ok: false, error: "UNKNOWN_ACTION" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}
