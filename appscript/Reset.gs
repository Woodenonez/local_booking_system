/**
 * Clears bookings for the active week (upcoming Monday by default).
 * Safe: only deletes rows where week_start matches the computed week_start.
 */
function resetWeek_() {
  const weekStart = weekStartUpcomingMonday_();
  const sh = getSheet_(SHEET_NAMES.BOOKINGS);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    log_("reset", "", `No rows to clear. week_start=${weekStart}`);
    return;
  }

  // Read all bookings
  const range = sh.getRange(2, 1, lastRow - 1, 6);
  const values = range.getValues();

  // Keep rows that are NOT the target weekStart
  const kept = [];
  let removedCount = 0;
  for (const row of values) {
    const ws = normalizeWeekStart_(row[0]);
    if (ws === weekStart) removedCount++;
    else kept.push(row);
  }

  // Rewrite sheet: clear then write back kept rows
  range.clearContent();
  if (kept.length > 0) {
    sh.getRange(2, 1, kept.length, 6).setValues(kept);
  }

  log_("reset", "", `Cleared week_start=${weekStart}, removed=${removedCount}, kept=${kept.length}`);
}

/**
 * Public wrapper you can run manually from the editor for testing.
 */
function resetNow() {
  resetWeek_();
}

/**
 * Create (or recreate) the Sunday reset trigger.
 * Runs at ~08:00 Europe/Stockholm each Sunday.
 */
function installResetTrigger() {
  // Remove existing triggers for this function (avoid duplicates)
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === "resetNow") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Create new trigger: Sunday at ~08:00 (script timezone)
  ScriptApp.newTrigger("resetNow")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(8)
    .create();

  log_("trigger_install", "", "Installed weekly reset trigger: Sunday ~08:00");
}
