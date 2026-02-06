const LS = {
  apiUrl: "gpu_booking_api_url",
  code: "gpu_booking_code",
  isAdmin: "gpu_booking_is_admin",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SESS = ["Morning", "Afternoon", "Evening"];
const GPUS = [0, 1, 2, 3];

function $(id) { return document.getElementById(id); }

function getApiUrl() { return localStorage.getItem(LS.apiUrl) || ""; }
function setApiUrl(v) { localStorage.setItem(LS.apiUrl, v); }
function clearApiUrl() { localStorage.removeItem(LS.apiUrl); }

function getCode() { return localStorage.getItem(LS.code) || ""; }
function setCode(v) { localStorage.setItem(LS.code, v); }
function clearCode() {
  localStorage.removeItem(LS.code);
  localStorage.removeItem(LS.isAdmin);
}

function getIsAdmin() { return localStorage.getItem(LS.isAdmin) === "true"; }
function setIsAdmin(v) { localStorage.setItem(LS.isAdmin, v ? "true" : "false"); }

function setStatus(msg, cls = "muted") {
  const el = $("status");
  el.className = cls;
  el.textContent = msg;
}

function setAdminStatus(msg, cls = "muted") {
  const el = $("adminStatus");
  el.className = cls;
  el.textContent = msg;
}

async function apiPost(action, payload) {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error("Missing API URL. Paste your Apps Script Web App URL first.");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiGetWeek(weekStart = "", code = "") {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error("Missing API URL. Paste your Apps Script Web App URL first.");

  const u = new URL(apiUrl);
  u.searchParams.set("action", "week");
  if (weekStart) u.searchParams.set("week_start", weekStart);
  if (code) u.searchParams.set("code", code);

  const res = await fetch(u.toString(), { method: "GET" });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderTable(grid, mineSet) {
  // grid[day][session][gpu] = boolean booked
  const wrap = $("tableWrap");
  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  const h0 = document.createElement("th");
  h0.textContent = "Day / Session";
  hr.appendChild(h0);

  for (const g of GPUS) {
    const th = document.createElement("th");
    th.textContent = `GPU ${g}`;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let d = 0; d < DAYS.length; d++) {
    for (let s = 0; s < SESS.length; s++) {
      const tr = document.createElement("tr");
      const label = document.createElement("td");
      label.textContent = `${DAYS[d]} / ${SESS[s]}`;
      tr.appendChild(label);

      for (let gi = 0; gi < GPUS.length; gi++) {
        const td = document.createElement("td");
        const key = `${d}-${s}-${gi}`;
        const isMine = mineSet.has(key);
        const booked = !!grid?.[d]?.[s]?.[gi];

        td.classList.add(booked ? "booked" : "available");
        if (isMine) td.classList.add("mine");

        td.textContent = booked ? "Booked" : "Available";
        td.style.cursor = booked ? (isMine ? "pointer" : "not-allowed") : "pointer";

        td.addEventListener("click", async () => {
          try {
            const code = getCode();
            if (!code) return;

            if (!booked) {
              if (!confirm(`Book ${DAYS[d]} ${SESS[s]} on GPU ${gi}?`)) return;
              await apiPost("book", { code, week_start: window.__weekStart, day: d, session: s, gpu: gi });
              await refresh();
            } else if (isMine) {
              if (!confirm(`Cancel your booking: ${DAYS[d]} ${SESS[s]} on GPU ${gi}?`)) return;
              await apiPost("cancel", { code, week_start: window.__weekStart, day: d, session: s, gpu: gi });
              await refresh();
            }
          } catch (e) {
            alert(String(e.message || e));
          }
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

async function refresh() {
  setStatus("Loading…", "muted");
  const code = getCode();
  const data = await apiGetWeek("", code);

  window.__weekStart = data.week_start;
  $("weekStart").textContent = data.week_start;
  $("maxPerCode").textContent = String(data.max_per_code ?? 5);

  const mine = data.mine || [];
  $("mineCount").textContent = String(mine.length);

  const mineSet = new Set(mine.map(b => `${b.day}-${b.session}-${b.gpu}`));
  renderTable(data.grid, mineSet);

  setStatus("Ready.", "ok");
}

async function login() {
  try {
    const code = $("code").value.trim();
    if (!code) return;

    setStatus("Checking code…", "muted");
    const data = await apiPost("login", { code });
    setCode(code);
    setIsAdmin(!!data.is_admin);

    // UI update
    $("loginBtn").classList.add("hidden");
    $("logoutBtn").classList.remove("hidden");
    $("mainCard").classList.remove("hidden");
    $("adminToggleBtn").classList.toggle("hidden", !getIsAdmin());

    await refresh();
  } catch (e) {
    setStatus(`Login failed: ${String(e.message || e)}`, "danger");
  }
}

function logout() {
  clearCode();
  $("code").value = "";
  $("mainCard").classList.add("hidden");
  $("loginBtn").classList.remove("hidden");
  $("logoutBtn").classList.add("hidden");
  $("adminCard").classList.add("hidden");
  $("adminToggleBtn").classList.add("hidden");
  setStatus("Logged out.", "muted");
}

async function adminCancel() {
  try {
    if (!getIsAdmin()) throw new Error("Not admin");
    const code = getCode();
    const day = Number($("aDay").value);
    const session = Number($("aSession").value);
    const gpu = Number($("aGpu").value);

    setAdminStatus("Working…", "muted");
    await apiPost("admin_cancel", { code, week_start: window.__weekStart, day, session, gpu });
    setAdminStatus("Cancelled.", "ok");
    await refresh();
  } catch (e) {
    setAdminStatus(String(e.message || e), "danger");
  }
}

function init() {
  // Load saved API URL + code
  $("apiUrl").value = getApiUrl();
  $("code").value = getCode();

  $("saveApiBtn").addEventListener("click", () => {
    const v = $("apiUrl").value.trim();
    setApiUrl(v);
    setStatus("Saved API URL.", "ok");
  });

  $("resetApiBtn").addEventListener("click", () => {
    clearApiUrl();
    $("apiUrl").value = "";
    setStatus("Cleared API URL in this browser.", "muted");
  });

  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", () => refresh().catch(e => setStatus(String(e.message || e), "danger")));

  $("adminToggleBtn").addEventListener("click", () => {
    $("adminCard").classList.toggle("hidden");
  });
  $("adminCancelBtn").addEventListener("click", adminCancel);

  // If already logged in, show main UI
  if (getCode()) {
    $("loginBtn").classList.add("hidden");
    $("logoutBtn").classList.remove("hidden");
    $("mainCard").classList.remove("hidden");
    $("adminToggleBtn").classList.toggle("hidden", !getIsAdmin());
    refresh().catch(e => setStatus(String(e.message || e), "danger"));
  } else {
    setStatus("Enter your invitation code to continue.", "muted");
  }
}

init();
