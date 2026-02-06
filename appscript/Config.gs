const SHEET_NAMES = {
  BOOKINGS: "Bookings",
  CONFIG: "Config",
  CODE: "Code",
  LOGS: "Logs",
};

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Missing sheet: ${name}`);
  return sh;
}

function getConfig_() {
  const sh = getSheet_(SHEET_NAMES.CONFIG);
  const values = sh.getDataRange().getValues(); // [ [key, value], ... ]
  const cfg = {};
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] ?? "").trim();
    const val = String(values[i][1] ?? "").trim();
    if (key) cfg[key] = val;
  }
  return cfg;
}

function getTimezone_() {
  const cfg = getConfig_();
  return cfg.timezone || "Europe/Stockholm";
}

function getMaxSessionsPerCode_() {
  const cfg = getConfig_();
  const n = Number(cfg.max_sessions_per_code || 5);
  return Number.isFinite(n) ? n : 5;
}

function parseCsvList_(s) {
  return String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function getDays_() {
  const cfg = getConfig_();
  return parseCsvList_(cfg.days || "Mon,Tue,Wed,Thu,Fri");
}

function getSessions_() {
  const cfg = getConfig_();
  return parseCsvList_(cfg.sessions || "Morning,Afternoon,Evening");
}

function getGpus_() {
  const cfg = getConfig_();
  return parseCsvList_(cfg.gpus || "0,1,2,3").map(x => Number(x));
}
