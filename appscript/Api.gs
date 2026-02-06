function jsonpResponse_(obj, callback) {
  const text = callback ? `${callback}(${JSON.stringify(obj)})` : JSON.stringify(obj);
  const out = ContentService.createTextOutput(text);
  out.setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
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
    const p = (e && e.parameter) ? e.parameter : {};
    const action = String(p.action || "");
    const cb = p.callback ? String(p.callback) : "";

    // --- GET week (public grid + mine list if code provided)
    if (action === "week") {
      const weekStart = String(p.week_start || weekStartUpcomingMonday_());
      const code = String(p.code || "").trim();

      const bookings = readBookingsForWeek_(weekStart);

      const days = getDays_().length;
      const sessions = getSessions_().length;
      const gpus = getGpus_().length;

      const grid = Array.from({ length: days }, () =>
        Array.from({ length: sessions }, () =>
          Array.from({ length: gpus }, () => false)
        )
      );

      bookings.forEach(b => {
        const gi = b.gpu;
        if (b.day >= 0 && b.day < days && b.session >= 0 && b.session < sessions && gi >= 0 && gi < gpus) {
          grid[b.day][b.session][gi] = true;
        }
      });

      const mine = code
        ? bookings.filter(b => b.code === code).map(b => ({ day: b.day, session: b.session, gpu: b.gpu }))
        : [];

      return jsonpResponse_({
        ok: true,
        week_start: weekStart,
        grid,
        mine,
        max_per_code: getMaxSessionsPerCode_(),
      }, cb);
    }

    // --- GET login
    if (action === "login") {
      const code = String(p.code || "").trim();
      const row = requireValidCode_(code);
      log_("login", code, row.isAdmin ? "admin" : "user");
      return jsonpResponse_({ ok: true, is_admin: row.isAdmin }, cb);
    }

    // --- GET book
    if (action === "book") {
      const code = String(p.code || "").trim();
      requireValidCode_(code);

      const weekStart = String(p.week_start || weekStartUpcomingMonday_());
      const day = Number(p.day);
      const session = Number(p.session);
      const gpu = Number(p.gpu);

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
      return jsonpResponse_({ ok: true }, cb);
    }

    // --- GET cancel (owner only)
    if (action === "cancel") {
      const code = String(p.code || "").trim();
      requireValidCode_(code);

      const weekStart = String(p.week_start || weekStartUpcomingMonday_());
      const day = Number(p.day);
      const session = Number(p.session);
      const gpu = Number(p.gpu);

      const b = findBookingRow_(weekStart, day, session, gpu);
      if (!b) throw new Error("NOT_BOOKED");
      if (b.code !== code) throw new Error("NOT_OWNER");

      const sh = getSheet_(SHEET_NAMES.BOOKINGS);
      sh.deleteRow(b.rowIndex);
      log_("cancel", code, JSON.stringify({ weekStart, day, session, gpu }));
      return jsonpResponse_({ ok: true }, cb);
    }

    // --- GET admin_cancel
    if (action === "admin_cancel") {
      const adminCode = String(p.code || "").trim();
      const row = requireValidCode_(adminCode);
      if (!row.isAdmin) throw new Error("NOT_ADMIN");

      const weekStart = String(p.week_start || weekStartUpcomingMonday_());
      const day = Number(p.day);
      const session = Number(p.session);
      const gpu = Number(p.gpu);

      const b = findBookingRow_(weekStart, day, session, gpu);
      if (!b) throw new Error("NOT_BOOKED");

      const sh = getSheet_(SHEET_NAMES.BOOKINGS);
      sh.deleteRow(b.rowIndex);
      log_("admin_cancel", adminCode, JSON.stringify({ weekStart, day, session, gpu, removed_code: b.code }));
      return jsonpResponse_({ ok: true }, cb);
    }

    return jsonpResponse_({ ok: false, error: "UNKNOWN_ACTION" }, cb);
  } catch (err) {
    const msg = String(err.message || err);
    const cb = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : "";
    return jsonpResponse_({ ok: false, error: msg }, cb);
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
