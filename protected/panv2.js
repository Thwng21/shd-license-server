(async () => {

  /* =========================================================
     SEEK CONTRACT AUTO FULL V1
     (dựa trên GIN AUTO FULL V7)
     
     - UI cố định, batch update ~250ms
     - Concurrent 3
     - Lấy đầy đủ 5 tab chính + 2 tab lịch sử
     - Xử lý đặc biệt tab Số điện thoại (API stats)
     - XLSX + CSV
     ========================================================= */

  if (window.__SEEK_CONTRACT_AUTO_V1__) {
    alert("SEEK CONTRACT AUTO V1 đang chạy.");
    return;
  }

  window.__SEEK_CONTRACT_AUTO_V1__ = true;

  /* =========================================================
     CONFIG
     ========================================================= */

  const CONFIG = {
    CONCURRENT: 3,
    RETRY: 2,
    DELAY: 400,
    RETRY_DELAY: 1300,
    UI_INTERVAL: 250,
    ACTIVE_TIMER_INTERVAL: 1000,
    INCLUDE_PHONE: true,
    INCLUDE_ID: true,
    XLSX_CDN: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
  };

  /* =========================================================
     GLOBAL STATE
     ========================================================= */

  let rows = [];
  let results = [];
  let running = false;
  let paused = false;
  let stopRequested = false;
  let completed = 0;
  let success = 0;
  let notFound = 0;
  let errors = 0;
  let active = 0;
  let nextIndex = 0;
  let fileLoaded = false;
  let uiDirty = true;
  let uiTimer = null;
  let activeTimer = null;
  const activeMap = new Map();
  let activeRenderDirty = true;

  /* =========================================================
     HELPERS
     ========================================================= */

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();

  const normalize = v =>
    clean(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.:_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const escapeHtml = v =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function markUIDirty() {
    uiDirty = true;
  }

  function markActiveDirty() {
    activeRenderDirty = true;
  }

  /* =========================================================
     LOAD XLSX
     ========================================================= */

  function loadXLSX() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = CONFIG.XLSX_CDN;
      script.onload = () => (window.XLSX ? resolve() : reject(new Error("Không tìm thấy XLSX")));
      script.onerror = () => reject(new Error("Không tải được SheetJS"));
      document.head.appendChild(script);
    });
  }

  /* =========================================================
     UI
     ========================================================= */

  function createUI() {
    document.getElementById("__SEEKAUTO_V1_UI")?.remove();
    document.getElementById("__SEEKAUTO_V1_STYLE")?.remove();

    const style = document.createElement("style");
    style.id = "__SEEKAUTO_V1_STYLE";
    style.textContent = `
      #__SEEKAUTO_V1_UI {
        position: fixed; z-index: 2147483647; right: 16px; top: 16px;
        width: 460px; height: 780px; max-height: calc(100vh - 32px);
        overflow: hidden; background: #f8f9fa; color: #212529;
        border: 1px solid #dee2e6; border-radius: 9px;
        box-shadow: 0 8px 30px rgba(0,0,0,.18);
        font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        contain: layout paint style;
      }
      #__SEEKAUTO_V1_UI * { box-sizing: border-box; }
      #sa1_header {
        height: 45px; display: flex; align-items: center; padding: 0 14px;
        background: #4a3f6b; color: #fff; font-size: 15px; font-weight: 700; flex-shrink: 0;
      }
      #sa1_body {
        height: calc(100% - 45px); padding: 12px; overflow-y: auto; overflow-x: hidden;
        overscroll-behavior: contain;
      }
      .sa1_card {
        background: #fff; border: 1px solid #e3e6e8; border-radius: 7px;
        padding: 9px 10px; margin-bottom: 8px;
      }
      .sa1_stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .sa1_label { font-size: 10px; color: #6c757d; text-transform: uppercase; font-weight: 600; }
      .sa1_number { font-size: 19px; font-weight: 700; margin-top: 2px; }
      .sa1_green { color: #198754; }
      .sa1_red { color: #dc3545; }
      .sa1_yellow { color: #b58105; }
      .sa1_blue { color: #0d6efd; }
      #sa1_current {
        height: 83px; background: #fff; border: 1px solid #dee2e6; border-radius: 7px;
        padding: 10px; margin-top: 9px; overflow: hidden;
      }
      #sa1_current_shd {
        height: 21px; font-size: 14px; font-weight: 700; margin-top: 4px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #sa1_current_status {
        height: 35px; margin-top: 4px; font-size: 12px; line-height: 1.45; overflow: hidden;
      }
      #sa1_active {
        height: 120px; overflow-y: auto; overflow-x: hidden; margin-top: 8px;
        background: #fff; border: 1px solid #e3e6e8; border-radius: 7px; padding: 4px; contain: content;
      }
      .sa1_active_item {
        height: 25px; display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 3px 7px; border-bottom: 1px solid #f1f3f5; font-size: 11px;
      }
      .sa1_active_item:last-child { border-bottom: 0; }
      .sa1_active_shd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
      .sa1_active_time { flex-shrink: 0; color: #6c757d; }
      .sa1_progress { height: 8px; background: #e9ecef; border-radius: 5px; overflow: hidden; margin-top: 10px; }
      #sa1_progress_fill {
        width: 0%; height: 100%; background: #6f42c1; transform: translateZ(0); transition: width .18s ease;
      }
      #sa1_percent { text-align: center; margin-top: 5px; font-size: 11px; color: #6c757d; height: 16px; }
      .sa1_buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 9px; }
      .sa1_button {
        border: 1px solid #ced4da; background: #fff; border-radius: 6px;
        padding: 8px 9px; cursor: pointer; font-size: 12px; font-weight: 600;
      }
      .sa1_button:hover { background: #f1f3f5; }
      .sa1_button:disabled { opacity: .55; cursor: not-allowed; }
      .sa1_start { background: #4a3f6b; color: #fff; border-color: #4a3f6b; }
      .sa1_export { width: 100%; margin-top: 7px; background: #198754; color: #fff; border-color: #198754; }
      .sa1_csv { width: 100%; margin-top: 7px; }
      .sa1_reset { width: 100%; margin-top: 7px; color: #dc3545; }
      .sa1_close { width: 100%; margin-top: 7px; }
      #sa1_log {
        background: #111827; color: #d1d5db; border-radius: 6px; padding: 8px;
        height: 170px; overflow: auto; font: 11px/1.45 Consolas, Monaco, monospace; contain: content;
      }
      .sa1_ok { color: #75b798; }
      .sa1_error { color: #ea868f; }
      .sa1_warn { color: #ffda6a; }
      .sa1_info { color: #9ec5fe; }
      .sa1_file { width: 100%; font-size: 12px; }
      .sa1_hint { color: #6c757d; font-size: 11px; margin-top: 5px; line-height: 1.4; }
    `;
    document.head.appendChild(style);

    const box = document.createElement("div");
    box.id = "__SEEKAUTO_V1_UI";
    box.innerHTML = `
      <div id="sa1_header">SEEK CONTRACT AUTO V1</div>
      <div id="sa1_body">
        <input id="sa1_file" class="sa1_file" type="file" accept=".xlsx,.xls,.csv">
        <div class="sa1_hint">
          Chọn file Excel có cột <b>SHD</b>. Script sẽ tìm kiếm + lấy đủ 5 tab thông tin + 2 tab lịch sử.
        </div>

        <div class="sa1_stats" style="margin-top:9px">
          <div class="sa1_card"><div class="sa1_label">Tổng SHD</div><div id="sa1_total" class="sa1_number">0</div></div>
          <div class="sa1_card"><div class="sa1_label">Đã xong</div><div id="sa1_done" class="sa1_number sa1_blue">0</div></div>
          <div class="sa1_card"><div class="sa1_label">Đang chạy</div><div id="sa1_active_count" class="sa1_number">0</div></div>
          <div class="sa1_card"><div class="sa1_label">Có kết quả</div><div id="sa1_yes" class="sa1_number sa1_green">0</div></div>
          <div class="sa1_card"><div class="sa1_label">Không có</div><div id="sa1_no" class="sa1_number sa1_yellow">0</div></div>
          <div class="sa1_card"><div class="sa1_label">Lỗi</div><div id="sa1_error" class="sa1_number sa1_red">0</div></div>
        </div>

        <div id="sa1_current">
          <div class="sa1_label">Đang thực hiện</div>
          <div id="sa1_current_shd">Chưa bắt đầu</div>
          <div id="sa1_current_status">Hãy chọn file Excel.</div>
        </div>

        <div class="sa1_progress"><div id="sa1_progress_fill"></div></div>
        <div id="sa1_percent">0%</div>

        <div id="sa1_active">
          <div style="color:#6c757d;font-size:11px;padding:5px">Không có SHD đang chạy</div>
        </div>

        <div class="sa1_buttons">
          <button id="sa1_start" class="sa1_button sa1_start">▶ Bắt đầu</button>
          <button id="sa1_pause" class="sa1_button">⏸ Tạm dừng</button>
        </div>

        <button id="sa1_export" class="sa1_button sa1_export">↓ Xuất Excel</button>
        <button id="sa1_csv" class="sa1_button sa1_csv">↓ Xuất CSV dự phòng</button>
        <button id="sa1_reset" class="sa1_button sa1_reset">↺ Reset</button>
        <button id="sa1_close" class="sa1_button sa1_close">✕ Đóng</button>

        <div class="sa1_label" style="margin-top:12px;margin-bottom:5px">Nhật ký</div>
        <div id="sa1_log"></div>
      </div>
    `;
    document.body.appendChild(box);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function log(message, cls = "") {
    const el = $("sa1_log");
    if (!el) return;
    const line = document.createElement("div");
    line.className = cls;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el.appendChild(line);
    while (el.children.length > 500) el.removeChild(el.firstElementChild);
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(message) {
    const el = $("sa1_current_status");
    if (el) el.textContent = message;
  }

  function updateUI(force = false) {
    if (!force && !uiDirty) return;
    const total = rows.length;
    const percent = total ? Math.floor(completed / total * 100) : 0;
    const els = {
      total: $("sa1_total"), done: $("sa1_done"), yes: $("sa1_yes"),
      no: $("sa1_no"), error: $("sa1_error"), active: $("sa1_active_count"),
      fill: $("sa1_progress_fill"), percent: $("sa1_percent")
    };
    if (els.total) els.total.textContent = total;
    if (els.done) els.done.textContent = completed;
    if (els.yes) els.yes.textContent = success;
    if (els.no) els.no.textContent = notFound;
    if (els.error) els.error.textContent = errors;
    if (els.active) els.active.textContent = active;
    if (els.fill) els.fill.style.width = percent + "%";
    if (els.percent) els.percent.textContent = `${percent}% — ${completed}/${total}`;
    uiDirty = false;
  }

  uiTimer = setInterval(() => {
    if (window.__SEEK_CONTRACT_AUTO_V1__) updateUI();
  }, CONFIG.UI_INTERVAL);

  function renderActive(force = false) {
    if (!force && !activeRenderDirty) return;
    const el = $("sa1_active");
    if (!el) return;
    if (!activeMap.size) {
      el.innerHTML = `<div style="color:#6c757d;font-size:11px;padding:5px">Không có SHD đang chạy</div>`;
      activeRenderDirty = false;
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [index, item] of activeMap.entries()) {
      const div = document.createElement("div");
      div.className = "sa1_active_item";
      const shd = document.createElement("span");
      shd.className = "sa1_active_shd";
      shd.textContent = `#${index + 1} ${item.shd}`;
      const time = document.createElement("span");
      time.className = "sa1_active_time";
      time.textContent = `${Math.floor((Date.now() - item.started) / 1000)}s`;
      div.appendChild(shd);
      div.appendChild(time);
      fragment.appendChild(div);
    }
    el.replaceChildren(fragment);
    activeRenderDirty = false;
  }

  activeTimer = setInterval(() => {
    if (!window.__SEEK_CONTRACT_AUTO_V1__) return;
    const el = $("sa1_active");
    if (!el) return;
    const items = el.querySelectorAll(".sa1_active_item");
    if (!items.length) return;
    let i = 0;
    for (const item of activeMap.values()) {
      const time = items[i]?.querySelector(".sa1_active_time");
      if (time) time.textContent = `${Math.floor((Date.now() - item.started) / 1000)}s`;
      i++;
    }
  }, CONFIG.ACTIVE_TIMER_INTERVAL);

  setInterval(() => {
    if (window.__SEEK_CONTRACT_AUTO_V1__) renderActive();
  }, CONFIG.UI_INTERVAL);

  function addActive(index, shd) {
    activeMap.set(index, { shd, started: Date.now() });
    active++;
    markActiveDirty();
    markUIDirty();
  }

  function removeActive(index) {
    activeMap.delete(index);
    active--;
    if (active < 0) active = 0;
    markActiveDirty();
    markUIDirty();
  }

  /* =========================================================
     ADD VALUE
     ========================================================= */

  function addValue(out, key, value) {
    key = clean(key);
    value = clean(value);
    if (!key || !value) return;
    if (!out[key]) {
      out[key] = value;
      return;
    }
    if (normalize(out[key]) === normalize(value)) return;
    const old = String(out[key]).split(" // ").map(clean).filter(Boolean);
    if (!old.some(x => normalize(x) === normalize(value))) {
      out[key] = old.concat(value).join(" // ");
    }
  }

  /* =========================================================
     PHONE / ID HELPERS
     ========================================================= */

  function isPhoneHeader(label) {
    const n = normalize(label);
    return n === "sdt" || n === "so dt" || n === "so dien thoai" || n === "dien thoai" ||
      n === "phone" || n === "mobile" || n.includes("so dien thoai") || n.includes("dien thoai") ||
      n === "sđt" || n.includes("sđt");
  }

  function isIdHeader(label) {
    const n = normalize(label);
    return n.includes("cmnd") || n.includes("cccd") || n.includes("can cuoc") || n.includes("chung minh");
  }

  function isSensitive(label) {
    if (isPhoneHeader(label)) return !CONFIG.INCLUDE_PHONE;
    if (isIdHeader(label)) return !CONFIG.INCLUDE_ID;
    return false;
  }

  /* =========================================================
     EXTRACT CELL VALUE
     ========================================================= */

  function extractCellValue(cell) {
    if (!cell) return "";
    const formElement = cell.matches?.("input,textarea,select")
      ? cell
      : cell.querySelector?.("input,textarea,select");
    if (formElement) {
      const value = clean(formElement.value);
      if (value) return value;
    }
    const link = cell.querySelector?.("a");
    if (link) {
      const text = clean(link.innerText || link.textContent);
      if (text) return text;
      const href = clean(link.getAttribute("href"));
      if (href && !/^javascript:/i.test(href)) return href;
    }
    const dataPhone = cell.getAttribute?.("data-phone");
    if (clean(dataPhone)) return clean(dataPhone);
    const dataValue = cell.getAttribute?.("data-value");
    if (clean(dataValue)) return clean(dataValue);
    const title = cell.getAttribute?.("title");
    if (clean(title)) return clean(title);
    const aria = cell.getAttribute?.("aria-label");
    if (clean(aria)) return clean(aria);
    return clean(cell.innerText || cell.textContent);
  }

  /* =========================================================
     EXTRACT TABLES (generic)
     ========================================================= */

  function extractTablesFromContainer(container, out, sectionPrefix = "") {
    if (!container) return;
    const tables = [...container.querySelectorAll("table")];
    tables.forEach((table, tableIndex) => {
      const trs = [...table.querySelectorAll("tr")];
      if (!trs.length) return;

      let headerRow = trs.find(tr => tr.querySelector("th")) || trs[0];
      let headers = [...headerRow.querySelectorAll("th,td")].map(c => clean(extractCellValue(c)));
      if (!headers.length) return;
      headers = headers.map((h, i) => h || `Cột ${i + 1}`);

      const section = sectionPrefix || `Bảng ${tableIndex + 1}`;
      const normalizedHeaders = headers.map(normalize);

      const phoneIndexes = [];
      const nameIndexes = [];
      const relationIndexes = [];

      normalizedHeaders.forEach((h, i) => {
        if (isPhoneHeader(h)) phoneIndexes.push(i);
        if (h === "ho ten" || h === "ho va ten" || h === "ten" || h === "ten khach hang") nameIndexes.push(i);
        if (h === "loai" || h === "quan he" || h === "moi quan he" || h === "mqh") relationIndexes.push(i);
      });

      trs.forEach(tr => {
        if (tr === headerRow) return;
        const cells = [...tr.querySelectorAll("td")];
        if (!cells.length) return;
        const values = cells.map(extractCellValue);
        if (values.every(x => !clean(x))) return;

        // empty row check
        if (values.some(v => normalize(v).includes("khong tim thay") || normalize(v).includes("khong co"))) return;

        phoneIndexes.forEach(idx => {
          const value = clean(values[idx]);
          if (value && CONFIG.INCLUDE_PHONE) addValue(out, "SỐ ĐIỆN THOẠI", value);
        });

        nameIndexes.forEach(idx => {
          const value = clean(values[idx]);
          if (value) addValue(out, "DANH SÁCH HỌ TÊN", value);
        });

        relationIndexes.forEach(idx => {
          const value = clean(values[idx]);
          if (value) addValue(out, "QUAN HỆ", value);
        });

        values.forEach((value, i) => {
          if (!value) return;
          const header = headers[i] || `Cột ${i + 1}`;
          if (normalize(header) === "stt") return;

          if (isPhoneHeader(header) && CONFIG.INCLUDE_PHONE) {
            addValue(out, "SỐ ĐIỆN THOẠI", value);
          }
          if (isIdHeader(header) && CONFIG.INCLUDE_ID) {
            addValue(out, header, value);
          }

          const key = `${section} - ${header}`;
          addValue(out, key, value);
        });
      });
    });
  }

  /* =========================================================
     EXTRACT INFO BLOCKS (label-value)
     ========================================================= */

  function extractInfoBlocks(container, out, sectionPrefix = "") {
    if (!container) return;

    // list style
    container.querySelectorAll("li, .row > div, .form-group, .mb-2, .mb-3").forEach(el => {
      const labelEl = el.querySelector("label, .form-label, .col-form-label, strong, b, .fw-bold");
      const valueEl = el.querySelector("input, textarea, select, .form-control, .form-select, span, p, div");
      if (labelEl && valueEl && labelEl !== valueEl) {
        const k = clean(labelEl.textContent);
        const v = extractCellValue(valueEl);
        if (k && v && k.length < 120 && v.length < 2000 && !isSensitive(k)) {
          const key = sectionPrefix ? `${sectionPrefix} - ${k}` : k;
          addValue(out, key, v);
          if (isPhoneHeader(k) && CONFIG.INCLUDE_PHONE) addValue(out, "SỐ ĐIỆN THOẠI", v);
        }
      }
    });

    // 2-column div pattern
    container.querySelectorAll("div").forEach(el => {
      const children = [...el.children];
      if (children.length !== 2) return;
      const key = clean(children[0].innerText);
      const value = extractCellValue(children[1]);
      if (!key || !value || key.length > 150 || value.length > 2000) return;
      if (isSensitive(key)) return;
      const fullKey = sectionPrefix ? `${sectionPrefix} - ${key}` : key;
      addValue(out, fullKey, value);
      if (isPhoneHeader(key) && CONFIG.INCLUDE_PHONE) addValue(out, "SỐ ĐIỆN THOẠI", value);
    });
  }

  /* =========================================================
     DETECT RESULT
     ========================================================= */

  function detectResult(doc) {
    const emptyCount = [...doc.querySelectorAll(".empty")].filter(el =>
      normalize(el.textContent).includes("khong tim thay")
    ).length;

    const dataTables = [...doc.querySelectorAll("table")].filter(t => {
      const rows = t.querySelectorAll("tbody tr");
      return [...rows].some(tr => {
        const tds = tr.querySelectorAll("td");
        return tds.length > 1 && !normalize(tr.textContent).includes("khong tim thay");
      });
    });

    if (dataTables.length > 0) return true;
    if (emptyCount >= 4) return false;

    // còn một số field có dữ liệu thật
    const bodyText = normalize(doc.body?.innerText || "");
    if (bodyText.includes("thong tin hop dong") || bodyText.includes("thong tin khach hang")) {
      // nếu có nhiều "không tìm thấy" thì coi như không
      return emptyCount < 3;
    }
    return false;
  }

  /* =========================================================
     EXTRACT PHONE STATS (API)
     ========================================================= */

  async function extractPhoneStats(doc, out) {
    if (!CONFIG.INCLUDE_PHONE) return;

    let code = "";

    // 1. Lấy từ script
    for (const script of doc.querySelectorAll("script")) {
      const txt = script.textContent || "";
      const m = txt.match(/var\s+code\s*=\s*['"]([^'"]*)['"]/);
      if (m && m[1]) {
        code = m[1];
        break;
      }
    }

    // 2. Fallback: tìm trong input / data
    if (!code) {
      const possible = doc.querySelector(
        "input[name*='contract_code'], input[name*='contractCode'], [data-contract-code], [data-code]"
      );
      if (possible) code = clean(possible.value || possible.getAttribute("data-contract-code") || possible.getAttribute("data-code"));
    }

    if (!code) return;

    try {
      const url = new URL("/contract/phone-number-stats", location.origin);
      url.searchParams.set("contract_code", code);

      const res = await fetch(url.href, {
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "application/json" }
      });

      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      items.forEach(it => {
        const pn = clean(it.phone_no);
        if (pn) {
          addValue(out, "SỐ ĐIỆN THOẠI", pn);
          if (it.main != null) addValue(out, "SĐT - KHÁCH HÀNG %", `${pn}: ${Number(it.main).toFixed(2)}%`);
          if (it.relative != null) addValue(out, "SĐT - NGƯỜI THÂN %", `${pn}: ${Number(it.relative).toFixed(2)}%`);
          if (it.other != null) addValue(out, "SĐT - MQH KHÁC %", `${pn}: ${Number(it.other).toFixed(2)}%`);
          if (it.ptp != null) addValue(out, "SĐT - PTP %", `${pn}: ${Number(it.ptp).toFixed(2)}%`);
          if (it.connect != null) addValue(out, "SĐT - CONNECT %", `${pn}: ${Number(it.connect).toFixed(2)}%`);
          if (it.not_connect != null) addValue(out, "SĐT - NOT CONNECT %", `${pn}: ${Number(it.not_connect).toFixed(2)}%`);
        }
      });
    } catch (e) {
      // silent
    }
  }

  /* =========================================================
     PARSE PAGE
     ========================================================= */

  async function parsePage(doc, shd) {
    const out = {};
    const found = detectResult(doc);

    // 5 tab chính + 2 tab lịch sử
    const tabs = [
      { id: "general", name: "Thông tin tổng quát" },
      { id: "info", name: "Thông tin Hợp Đồng" },
      { id: "customer", name: "Thông tin Khách Hàng" },
      { id: "customer_relation", name: "Thông tin liên hệ" },
      { id: "phone_number", name: "Thông tin số điện thoại" },
      { id: "followup", name: "Lịch sử tác động" },
      { id: "payment", name: "Lịch sử thanh toán" }
    ];

    for (const tab of tabs) {
      const pane = doc.getElementById(tab.id);
      if (!pane) continue;

      // bỏ qua nếu chỉ có empty
      const empty = pane.querySelector(".empty");
      if (empty && normalize(empty.textContent).includes("khong tim thay") &&
          !pane.querySelector("table tbody tr td:not([colspan])")) {
        continue;
      }

      extractInfoBlocks(pane, out, tab.name);
      extractTablesFromContainer(pane, out, tab.name);
    }

    // Thêm API phone stats nếu cần
    await extractPhoneStats(doc, out);

    // Fallback phone từ toàn page
    if (CONFIG.INCLUDE_PHONE) {
      doc.querySelectorAll("[class*='phone'], [class*='sdt'], [data-phone]").forEach(el => {
        const v = extractCellValue(el);
        const digits = v.replace(/[^0-9+]/g, "");
        if (digits.length >= 8 && digits.length <= 15) {
          addValue(out, "SỐ ĐIỆN THOẠI", v);
        }
      });
    }

    if (found || Object.keys(out).length > 0) {
      out.KẾT_QUẢ = "có";
      return { found: true, data: out };
    }

    return { found: false, data: out };
  }

  /* =========================================================
     SEARCH
     ========================================================= */

  async function search(shd) {
    const input = document.querySelector("#seekcontractsearch-keywords");
    if (!input) throw new Error("Không tìm thấy #seekcontractsearch-keywords");

    const form = input.closest("form");
    if (!form) throw new Error("Không tìm thấy form tìm kiếm");

    const action = form.action || location.href;
    const method = (form.method || "GET").toUpperCase();
    const url = new URL(action, location.href);

    const options = {
      credentials: "include",
      redirect: "follow",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    };

    const fd = new FormData(form);
    fd.set(input.name || "SeekContractSearch[keywords]", shd);

    if (method === "GET") {
      // chuyển FormData thành query
      for (const [k, v] of fd.entries()) {
        url.searchParams.set(k, v);
      }
      options.method = "GET";
    } else {
      options.method = method;
      options.body = fd;
    }

    const response = await fetch(url.href, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    if (!html || html.length < 100) throw new Error("Phản hồi rỗng");

    const doc = new DOMParser().parseFromString(html, "text/html");
    return await parsePage(doc, shd);
  }

  /* =========================================================
     PROCESS ONE
     ========================================================= */

  async function processOne(row, rowIndex) {
    const shd = clean(row.SHD);
    addActive(rowIndex, shd);
    $("sa1_current_shd").textContent = `SHD: ${shd}`;

    let lastError = null;

    try {
      if (!shd) {
        return {
          ...row,
          KẾT_QUẢ: "không",
          TRẠNG_THÁI: "SHD trống",
          __ERR: "SHD trống"
        };
      }

      for (let attempt = 1; attempt <= CONFIG.RETRY + 1; attempt++) {
        try {
          setStatus(`Đang truy vấn... lần ${attempt}`);
          log(`${shd} → truy vấn lần ${attempt}`, "sa1_info");

          const response = await search(shd);

          if (response && response.found) {
            const data = response.data || {};
            const fieldCount = Object.keys(data).filter(k => k !== "KẾT_QUẢ").length;
            log(`${shd} → CÓ KẾT QUẢ → ${fieldCount} trường`, "sa1_ok");
            return {
              ...row,
              ...data,
              KẾT_QUẢ: "có",
              TRẠNG_THÁI: "Đã tìm thấy",
              __ERR: ""
            };
          }

          log(`${shd} → KHÔNG CÓ KẾT QUẢ`, "sa1_warn");
          return {
            ...row,
            KẾT_QUẢ: "không",
            TRẠNG_THÁI: "Không tìm thấy",
            __ERR: ""
          };

        } catch (error) {
          lastError = error;
          log(`${shd} → lỗi lần ${attempt}: ${error.message}`, "sa1_warn");
          if (attempt <= CONFIG.RETRY) {
            await sleep(CONFIG.RETRY_DELAY * attempt);
          }
        }
      }

      log(`${shd} → LỖI SAU ${CONFIG.RETRY + 1} LẦN`, "sa1_error");
      return {
        ...row,
        KẾT_QUẢ: "lỗi",
        TRẠNG_THÁI: "Lỗi truy vấn",
        __ERR: lastError?.message || "Không xác định"
      };

    } finally {
      removeActive(rowIndex);
    }
  }

  /* =========================================================
     FINALIZE
     ========================================================= */

  function finalizeResult(index, result) {
    results[index] = result;
    completed++;
    const kq = normalize(result?.KẾT_QUẢ);
    if (kq === "co" || kq === "có") success++;
    else if (kq === "khong" || kq === "không") notFound++;
    else errors++;
    markUIDirty();
  }

  /* =========================================================
     WORKER
     ========================================================= */

  async function worker(workerId) {
    while (running && !stopRequested) {
      if (paused) break;
      const index = nextIndex;
      if (index >= rows.length) break;
      nextIndex++;

      const row = rows[index];
      try {
        const result = await processOne(row, index);
        finalizeResult(index, result);
        const shd = clean(row.SHD);
        setStatus(`${shd} hoàn thành — ${completed}/${rows.length}`);
      } catch (error) {
        const result = {
          ...row,
          KẾT_QUẢ: "lỗi",
          TRẠNG_THÁI: "Lỗi worker",
          __ERR: error?.message || "Worker error"
        };
        finalizeResult(index, result);
        log(`${row.SHD} → Worker error: ${error.message}`, "sa1_error");
      }

      if (CONFIG.DELAY > 0 && running && !paused && !stopRequested) {
        await sleep(CONFIG.DELAY);
      }
    }
  }

  /* =========================================================
     START / PAUSE / RESET
     ========================================================= */

  async function startProcessing() {
    if (!rows.length) {
      alert("Bạn chưa chọn file Excel.");
      return;
    }
    if (running && !paused) return;

    if (completed >= rows.length && !active) {
      results = new Array(rows.length);
      completed = 0;
      success = 0;
      notFound = 0;
      errors = 0;
      nextIndex = 0;
    }

    running = true;
    paused = false;
    stopRequested = false;
    markUIDirty();
    setStatus("Đang khởi động...");
    log(`BẮT ĐẦU — ${rows.length} SHD — CONCURRENT=${CONFIG.CONCURRENT}`, "sa1_ok");

    const workers = [];
    for (let i = 0; i < CONFIG.CONCURRENT; i++) {
      workers.push(worker(i + 1));
    }
    await Promise.all(workers);

    if (paused) {
      setStatus(`ĐÃ TẠM DỪNG — ${completed}/${rows.length}`);
      log(`TẠM DỪNG — ${completed}/${rows.length}`, "sa1_warn");
      markUIDirty();
      return;
    }

    if (stopRequested) {
      running = false;
      setStatus(`ĐÃ DỪNG — ${completed}/${rows.length}`);
      markUIDirty();
      return;
    }

    running = false;
    if (completed >= rows.length) {
      setStatus(`HOÀN THÀNH — ${completed}/${rows.length}`);
      $("sa1_current_shd").textContent = "Đã xử lý toàn bộ";
      log(`HOÀN THÀNH — ${completed} SHD`, "sa1_ok");
    }
    markUIDirty();
    updateUI(true);
    renderActive(true);
  }

  function pauseProcessing() {
    if (!running) return;
    paused = true;
    setStatus(`Tạm dừng nhận SHD mới — ${completed}/${rows.length}`);
    log("TẠM DỪNG — request đang chạy sẽ hoàn tất", "sa1_warn");
    markUIDirty();
  }

  function resetAll() {
    if (!confirm("Bạn có chắc muốn reset tiến trình?")) return;
    running = false;
    paused = true;
    stopRequested = true;
    rows = [];
    results = [];
    completed = 0;
    success = 0;
    notFound = 0;
    errors = 0;
    active = 0;
    nextIndex = 0;
    fileLoaded = false;
    activeMap.clear();

    ["sa1_total", "sa1_done", "sa1_yes", "sa1_no", "sa1_error", "sa1_active_count"].forEach(id => {
      const el = $(id);
      if (el) el.textContent = "0";
    });
    $("sa1_current_shd").textContent = "Chưa bắt đầu";
    $("sa1_current_status").textContent = "Đã reset";
    $("sa1_progress_fill").style.width = "0%";
    $("sa1_percent").textContent = "0%";
    $("sa1_active").innerHTML = `<div style="color:#6c757d;font-size:11px;padding:5px">Không có SHD đang chạy</div>`;
    $("sa1_log").innerHTML = "";
    $("sa1_file").value = "";
    uiDirty = false;
    activeRenderDirty = false;
    log("Đã reset.", "sa1_info");
  }

  /* =========================================================
     READ EXCEL
     ========================================================= */

  async function readExcel(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", dense: true });
    if (!workbook.SheetNames.length) throw new Error("File không có worksheet.");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!data.length) throw new Error("Worksheet không có dữ liệu.");

    const headers = Object.keys(data[0]);
    const shdKey = headers.find(k => normalize(k) === "shd");
    if (!shdKey) throw new Error("Không tìm thấy cột SHD.");

    rows = data
      .map(row => ({
        ...row,
        SHD: clean(row[shdKey])
      }))
      .filter(row => Boolean(row.SHD));

    results = new Array(rows.length);
    completed = success = notFound = errors = active = nextIndex = 0;
    paused = running = stopRequested = false;
    fileLoaded = true;

    $("sa1_total").textContent = rows.length;
    $("sa1_done").textContent = "0";
    $("sa1_yes").textContent = "0";
    $("sa1_no").textContent = "0";
    $("sa1_error").textContent = "0";
    $("sa1_active_count").textContent = "0";
    $("sa1_current_shd").textContent = "Sẵn sàng";
    setStatus(`Đã đọc ${rows.length} SHD`);
    $("sa1_progress_fill").style.width = "0%";
    $("sa1_percent").textContent = `0% — 0/${rows.length}`;
    log(`ĐỌC FILE THÀNH CÔNG — ${rows.length} SHD`, "sa1_ok");
    markUIDirty();
  }

  /* =========================================================
     EXPORT
     ========================================================= */

  function getExportRows() {
    return rows.map((source, index) => {
      const result = results[index];
      if (result) return { ...result };
      return {
        ...source,
        KẾT_QUẢ: "chưa chạy",
        TRẠNG_THÁI: "Chưa xử lý",
        __ERR: ""
      };
    });
  }

  function getColumns(data) {
    const set = new Set();
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== "__ERR") set.add(key);
      });
    });
    const columns = [...set];
    const priority = [
      "SHD", "KẾT_QUẢ", "TRẠNG_THÁI",
      "Họ và tên", "Tên khách hàng", "Ngày sinh", "Giới tính", "Địa chỉ",
      "SỐ ĐIỆN THOẠI", "DANH SÁCH HỌ TÊN", "QUAN HỆ"
    ];
    const ordered = [];
    priority.forEach(key => {
      if (columns.includes(key)) ordered.push(key);
    });
    columns.forEach(key => {
      if (!ordered.includes(key)) ordered.push(key);
    });
    return ordered;
  }

  async function exportXLSX() {
    const data = getExportRows();
    if (!data.length) {
      alert("Chưa có dữ liệu.");
      return;
    }
    const btn = $("sa1_export");
    btn.disabled = true;
    btn.textContent = "⏳ Đang tạo Excel...";

    try {
      await sleep(50);
      const columns = getColumns(data);
      const aoa = new Array(data.length + 1);
      aoa[0] = columns;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const output = new Array(columns.length);
        for (let j = 0; j < columns.length; j++) {
          output[j] = row[columns[j]] ?? "";
        }
        aoa[i + 1] = output;
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa, { dense: true });
      ws["!cols"] = columns.map(column => {
        let max = String(column).length;
        const sampleCount = Math.min(data.length, 100);
        for (let i = 0; i < sampleCount; i++) {
          const len = String(data[i][column] ?? "").length;
          if (len > max) max = len;
        }
        return { wch: Math.min(Math.max(max + 2, 12), 55) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "KET QUA");

      const summary = [
        ["THỐNG KÊ"],
        ["Tổng SHD", rows.length],
        ["Đã hoàn thành", completed],
        ["Có kết quả", success],
        ["Không tìm thấy", notFound],
        ["Lỗi", errors],
        ["Chưa xử lý", Math.max(0, rows.length - completed)]
      ];
      const summaryWS = XLSX.utils.aoa_to_sheet(summary, { dense: true });
      summaryWS["!cols"] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, summaryWS, "THONG KE");

      const filename = `SEEK_CONTRACT_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (typeof XLSX.writeFileXLSX === "function") {
        XLSX.writeFileXLSX(wb, filename, { compression: true });
      } else {
        XLSX.writeFile(wb, filename, { bookType: "xlsx", compression: true });
      }

      log(`XUẤT EXCEL THÀNH CÔNG — ${data.length} dòng / ${columns.length} cột`, "sa1_ok");
      setStatus(`Đã xuất Excel — ${data.length} dòng`);
    } catch (error) {
      console.error(error);
      log(`XUẤT EXCEL LỖI: ${error.message}`, "sa1_error");
      alert("Xuất Excel bị lỗi:\n\n" + error.message + "\n\nHãy thử 'Xuất CSV dự phòng'.");
    } finally {
      btn.disabled = false;
      btn.textContent = "↓ Xuất Excel";
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/["\n\r,]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function exportCSV() {
    const data = getExportRows();
    if (!data.length) {
      alert("Chưa có dữ liệu.");
      return;
    }
    const columns = getColumns(data);
    const lines = new Array(data.length + 1);
    lines[0] = columns.map(csvEscape).join(",");
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      lines[i + 1] = columns.map(col => csvEscape(row[col] ?? "")).join(",");
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SEEK_CONTRACT_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    log(`ĐÃ XUẤT CSV — ${data.length} dòng`, "sa1_ok");
    setStatus(`Đã xuất CSV — ${data.length} dòng`);
  }

  /* =========================================================
     EVENTS
     ========================================================= */

  function bindEvents() {
    $("sa1_file").addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await readExcel(file);
      } catch (error) {
        console.error(error);
        log(`Lỗi đọc Excel: ${error.message}`, "sa1_error");
        alert("Không đọc được file:\n\n" + error.message);
      }
    });

    $("sa1_start").addEventListener("click", startProcessing);
    $("sa1_pause").addEventListener("click", pauseProcessing);
    $("sa1_export").addEventListener("click", exportXLSX);
    $("sa1_csv").addEventListener("click", exportCSV);
    $("sa1_reset").addEventListener("click", resetAll);

    $("sa1_close").addEventListener("click", () => {
      running = false;
      paused = true;
      stopRequested = true;
      if (uiTimer) clearInterval(uiTimer);
      if (activeTimer) clearInterval(activeTimer);
      document.getElementById("__SEEKAUTO_V1_UI")?.remove();
      document.getElementById("__SEEKAUTO_V1_STYLE")?.remove();
      window.__SEEK_CONTRACT_AUTO_V1__ = false;
    });
  }

  /* =========================================================
     INIT
     ========================================================= */

  createUI();

  try {
    await loadXLSX();
    log("SheetJS 0.20.3 đã sẵn sàng.", "sa1_ok");
  } catch (error) {
    log(error.message, "sa1_error");
    alert("Không tải được thư viện Excel:\n\n" + error.message);
    return;
  }

  bindEvents();
  updateUI(true);
  renderActive(true);
  log("SEEK CONTRACT AUTO V1 đã sẵn sàng.", "sa1_ok");

})();
