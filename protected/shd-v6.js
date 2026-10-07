(async () => {
  if (window.__SHD_BG_V6__) {
    alert("SHD Background V6 đang chạy.");
    return;
  }
  window.__SHD_BG_V6__ = true;

  const BASE = "http://171.244.43.91/danang/index.php";
  const CONFIG = {
    CONCURRENT: 3,
    DELAY: 500,
    TIMEOUT: 18000,
    CALL_STATUS: "6",           // mặc định NKP
    CALL_TO_TYPE: "8",          // NOBODY
    CALL_NOTE: "Không nhấc máy",
    AUTO_SAVE: true,
    INCLUDE_PHONE: true,
    INCLUDE_ID: true,
    XLSX_CDN: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
  };

  // Map mã
  const STATUS_MAP = {
    "NKP": "6",
    "NAB": "8"
  };

  const FIXED_COLUMNS = [
    "SHD", "GIN", "TRẠNG_THÁI", "ĐÃ LƯU",
    "Số HD", "Số HD kênh thu hộ", "Loại HD", "Ngày giải ngân",
    "Số tiền quá hạn (cũ)", "DEBT SALE DATES", "Gốc còn lại", "AppID",
    "Số tiền vay", "Ngày quá hạn", "Số lần tt",
    "Số tiền thanh toán gần nhất", "Ngày tt gần nhất", "Tiền kỳ tt",
    "Kỳ hạn vay", "Lãi tới hạn", "Lãi quá hạn", "Tổng tiền trả",
    "Tổng kỳ tt", "Ngày trả hàng tháng", "LAST_PAID", "CHARGE_OFF_FLAG",
    "Product", "Product scheme", "CDL_DESC", "Segmantation",
    "PRODUCT_GROUP", "Phân loại",
    "Tên", "CMND", "CCCD mới", "Giới tính", "Ngày sinh",
    "Số đt kh", "Số đt kh mới", "Tên cty",
    "MOTHER_NUM", "FATHER_NUM", "SISTER_NUM", "BROTHER_NUM",
    "FRIEND_NUM", "UNCLE_NUM", "SDT vợ/chồng",
    "SDT THAM CHIẾU 1", "SDT THAM CHIẾU 2", "SDT THAM CHIẾU 3", "SDT THAM CHIẾU 4",
    "SDT THAM CHIẾU 5", "SDT THAM CHIẾU 6", "SDT THAM CHIẾU 7", "SDT THAM CHIẾU 8",
    "SỐ ĐIỆN THOẠI",
    "Địa chỉ cty", "Đ/c hộ khẩu", "Đ/c tạm trú",
    "Đ/c thường trú mới", "Đ/c tạm trú mới",
    "TC_NAME", "KEEP_MONTHS", "MOB181", "REGION", "STATUS_LITI"
  ];

  let rows = [], results = [];
  let running = false, paused = false, stopRequested = false;
  let completed = 0, success = 0, notFound = 0, errors = 0, nextIndex = 0, active = 0;
  let uiTimer = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const normalize = v => clean(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.:_-]+/g, " ").replace(/\s+/g, " ").trim();

  function getTargetUrl(shd) {
    const s = clean(shd).toUpperCase();
    if (s.startsWith("LD")) return BASE + "?page=customerVpb";
    if (s.includes("-")) return BASE + "?page=customerLoan&offset=0";
    return BASE + "?page=customerCrc";
  }

  // ========== IFRAME POOL ==========
  const iframes = [];
  for (let i = 0; i < CONFIG.CONCURRENT; i++) {
    let fr = document.getElementById("__shd_bg_iframe_" + i);
    if (!fr) {
      fr = document.createElement("iframe");
      fr.id = "__shd_bg_iframe_" + i;
      fr.style.cssText = "position:fixed;left:-9999px;top:0;width:1300px;height:1000px;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(fr);
    }
    iframes.push(fr);
  }

  function idoc(fr) {
    try { return fr.contentDocument || fr.contentWindow?.document; }
    catch { return null; }
  }

  function loadUrl(fr, url) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout load trang")), CONFIG.TIMEOUT);
      fr.onload = () => { clearTimeout(timer); setTimeout(resolve, 500); };
      fr.onerror = () => { clearTimeout(timer); reject(new Error("Lỗi load iframe")); };
      fr.src = url;
    });
  }

  async function waitFor(fr, fn, timeout = 14000, interval = 300) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const doc = idoc(fr);
        if (doc && fn(doc)) return true;
      } catch (_) {}
      await sleep(interval);
    }
    return false;
  }

  // ========== UI ==========
  function createUI() {
    document.getElementById("__SHD_BG_UI")?.remove();
    document.getElementById("__SHD_BG_STYLE")?.remove();

    const style = document.createElement("style");
    style.id = "__SHD_BG_STYLE";
    style.textContent = `
      #__SHD_BG_UI{position:fixed;z-index:2147483647;right:14px;top:14px;width:460px;max-height:94vh;overflow:auto;background:#f8f9fa;border:1px solid #dee2e6;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.22);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
      #__SHD_BG_UI *{box-sizing:border-box}
      #bg_header{padding:12px 14px;background:#dc3545;color:#fff;font-weight:700;font-size:15px;border-radius:10px 10px 0 0}
      #bg_body{padding:12px}
      .bg_stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}
      .bg_card{background:#fff;border:1px solid #e3e6e8;border-radius:7px;padding:8px}
      .bg_label{font-size:10px;color:#6c757d;text-transform:uppercase;font-weight:600}
      .bg_num{font-size:18px;font-weight:700;margin-top:2px}
      .bg_green{color:#198754}.bg_red{color:#dc3545}.bg_yellow{color:#b58105}.bg_blue{color:#0d6efd}
      #bg_current{background:#fff;border:1px solid #dee2e6;border-radius:7px;padding:10px;margin-bottom:8px}
      #bg_shd{font-weight:700;font-size:14px;margin-top:3px}
      #bg_status{font-size:12px;color:#495057;margin-top:4px;min-height:34px}
      .bg_progress{height:8px;background:#e9ecef;border-radius:5px;overflow:hidden;margin:8px 0}
      #bg_fill{height:100%;width:0;background:#dc3545;transition:width .2s}
      #bg_percent{text-align:center;font-size:11px;color:#6c757d}
      .bg_btn{display:block;width:100%;border:1px solid #ced4da;background:#fff;border-radius:6px;padding:8px;margin-top:6px;cursor:pointer;font-size:12px;font-weight:600}
      .bg_btn:hover{background:#f1f3f5}
      .bg_start{background:#dc3545;color:#fff;border-color:#dc3545}
      .bg_export{background:#198754;color:#fff;border-color:#198754}
      .bg_reset{color:#dc3545}
      #bg_log{background:#111827;color:#d1d5db;border-radius:6px;padding:8px;height:150px;overflow:auto;font:11px/1.4 Consolas,Monaco,monospace;margin-top:8px}
      .bg_ok{color:#75b798}.bg_err{color:#ea868f}.bg_warn{color:#ffda6a}.bg_info{color:#9ec5fe}
      .bg_hint{font-size:11px;color:#6c757d;margin-top:6px;line-height:1.4}
      .bg_file{width:100%;font-size:12px}
      .bg_config{background:#fff;border:1px solid #e3e6e8;border-radius:7px;padding:10px;margin:10px 0}
      .bg_config label{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#333}
      .bg_config select, .bg_config textarea, .bg_config input[type="text"]{width:100%;padding:6px 8px;border:1px solid #ced4da;border-radius:5px;font-size:13px;margin-bottom:8px}
      .bg_config textarea{height:60px;resize:vertical}
      .bg_radio{display:flex;gap:16px;margin-bottom:8px}
      .bg_radio label{font-weight:500;display:flex;align-items:center;gap:5px;cursor:pointer}
    `;
    document.head.appendChild(style);

    const box = document.createElement("div");
    box.id = "__SHD_BG_UI";
    box.innerHTML = `
      <div id="bg_header">SHD V6 - Cào + Lưu (tùy chọn)</div>
      <div id="bg_body">
        <input id="bg_file" class="bg_file" type="file" accept=".xlsx,.xls,.csv">

        <div class="bg_config">
          <label>Trạng thái cuộc gọi</label>
          <div class="bg_radio">
            <label><input type="radio" name="bg_status" value="NKP" checked> NKP (Không nhấc máy)</label>
            <label><input type="radio" name="bg_status" value="NAB"> NAB (Số không liên lạc được)</label>
          </div>

          <label>Nội dung Note</label>
          <textarea id="bg_note">Không nhấc máy</textarea>
        </div>

        <div class="bg_hint">
          Chọn NKP hoặc NAB + ghi Note → tool sẽ tự điền và bấm Lưu
        </div>

        <div class="bg_stats">
          <div class="bg_card"><div class="bg_label">Tổng</div><div id="bg_total" class="bg_num">0</div></div>
          <div class="bg_card"><div class="bg_label">Xong</div><div id="bg_done" class="bg_num bg_blue">0</div></div>
          <div class="bg_card"><div class="bg_label">Đang chạy</div><div id="bg_active" class="bg_num">0</div></div>
          <div class="bg_card"><div class="bg_label">Có DL</div><div id="bg_yes" class="bg_num bg_green">0</div></div>
          <div class="bg_card"><div class="bg_label">Không</div><div id="bg_no" class="bg_num bg_yellow">0</div></div>
          <div class="bg_card"><div class="bg_label">Lỗi</div><div id="bg_error" class="bg_num bg_red">0</div></div>
        </div>

        <div id="bg_current">
          <div class="bg_label">Trạng thái</div>
          <div id="bg_shd">Chưa bắt đầu</div>
          <div id="bg_status">Chọn file Excel rồi bấm Bắt đầu</div>
        </div>

        <div class="bg_progress"><div id="bg_fill"></div></div>
        <div id="bg_percent">0%</div>

        <button id="bg_start" class="bg_btn bg_start">▶ Bắt đầu (Cào + Lưu)</button>
        <button id="bg_pause" class="bg_btn">⏸ Tạm dừng</button>
        <button id="bg_export" class="bg_btn bg_export">↓ Xuất Excel</button>
        <button id="bg_csv" class="bg_btn">↓ Xuất CSV</button>
        <button id="bg_reset" class="bg_btn bg_reset">↺ Reset</button>
        <button id="bg_close" class="bg_btn">✕ Đóng</button>
        <div id="bg_log"></div>
      </div>`;
    document.body.appendChild(box);
  }

  function $(id) { return document.getElementById(id); }

  function log(msg, cls = "") {
    const el = $("bg_log");
    if (!el) return;
    const line = document.createElement("div");
    line.className = cls;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(line);
    while (el.children.length > 350) el.removeChild(el.firstElementChild);
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(m) { const el = $("bg_status"); if (el) el.textContent = m; }

  function updateUI() {
    const total = rows.length;
    const percent = total ? Math.floor(completed / total * 100) : 0;
    if ($("bg_total")) $("bg_total").textContent = total;
    if ($("bg_done")) $("bg_done").textContent = completed;
    if ($("bg_active")) $("bg_active").textContent = active;
    if ($("bg_yes")) $("bg_yes").textContent = success;
    if ($("bg_no")) $("bg_no").textContent = notFound;
    if ($("bg_error")) $("bg_error").textContent = errors;
    if ($("bg_fill")) $("bg_fill").style.width = percent + "%";
    if ($("bg_percent")) $("bg_percent").textContent = `${percent}% — ${completed}/${total}`;
  }

  // Lấy cấu hình từ UI
  function readConfigFromUI() {
    const checked = document.querySelector('input[name="bg_status"]:checked');
    const statusKey = checked ? checked.value : "NKP";
    CONFIG.CALL_STATUS = STATUS_MAP[statusKey] || "6";
    CONFIG.CALL_NOTE = ($("bg_note")?.value || "Không nhấc máy").trim();
    log(`Cấu hình: ${statusKey} (value=${CONFIG.CALL_STATUS}) | Note: "${CONFIG.CALL_NOTE}"`, "bg_info");
  }

  // ========== PARSE ==========
  function addValue(out, key, value) {
    key = clean(key); value = clean(value);
    if (!key || !value || key.length > 100) return;
    if (!out[key]) { out[key] = value; return; }
    if (normalize(out[key]) === normalize(value)) return;
    const old = String(out[key]).split(" // ").map(clean).filter(Boolean);
    if (!old.some(x => normalize(x) === normalize(value))) out[key] = old.concat(value).join(" // ");
  }

  function isPhone(label) {
    const n = normalize(label);
    return n.includes("sdt") || n.includes("dien thoai") || n.includes("phone") || n.includes("tham chieu");
  }

  function isId(label) {
    const n = normalize(label);
    return n.includes("cmnd") || n.includes("cccd") || n.includes("can cuoc");
  }

  function extractCell(cell) {
    if (!cell) return "";
    const inp = cell.matches?.("input,textarea,select") ? cell : cell.querySelector?.("input,textarea,select");
    if (inp && clean(inp.value)) return clean(inp.value);
    return clean(cell.innerText || cell.textContent);
  }

  function parseDoc(doc) {
    const out = {};
    const tables = [...doc.querySelectorAll("table.bright_blue_body, table")];
    tables.forEach(table => {
      [...table.querySelectorAll("tr")].forEach(tr => {
        const cells = [...tr.querySelectorAll("td,th")];
        if (cells.length < 2) return;
        const key = extractCell(cells[0]);
        const val = extractCell(cells[1]);
        if (!key || !val) return;
        if (normalize(key) === "stt") return;
        addValue(out, key, val);
        if (isPhone(key) && CONFIG.INCLUDE_PHONE) addValue(out, "SỐ ĐIỆN THOẠI", val);
        if (isId(key) && CONFIG.INCLUDE_ID) addValue(out, key, val);
      });
    });
    return out;
  }

  function hasDetail(doc) {
    const text = doc.body?.innerText || "";
    return /thông tin hd/i.test(text) || /thông tin kh/i.test(text) ||
           (/số hd/i.test(text) && /tên/i.test(text));
  }

  function findResultRow(doc, shd) {
    const tds = [...doc.querySelectorAll('td[onclick*="customerDetail"], td[onclick*="CustomerDetail"], td[onclick*="detail"]')];
    return tds.find(td => clean(td.textContent).includes(clean(shd))) || null;
  }

  function findInput(doc) {
    return doc.querySelector('input[name="appID"]') ||
           doc.querySelector('input[name="shd"]') ||
           doc.querySelector('input[name="contractNo"]') ||
           doc.querySelector('input.input_css[type="text"]') ||
           doc.querySelector('input[type="text"]');
  }

  function findButton(doc) {
    return doc.querySelector('input[name="cmd_search"]') ||
           doc.querySelector('input[type="submit"][value*="Tìm"]') ||
           doc.querySelector('input.button_css[type="submit"]') ||
           doc.querySelector('button[type="submit"]');
  }

  // ========== LƯU HÀNH ĐỘNG ==========
  async function saveAction(fr, shd) {
    log(`${shd} → bắt đầu Lưu...`, "bg_info");

    const hasForm = await waitFor(fr, doc => !!doc.querySelector('select[name="callStatus"]'), 10000);
    if (!hasForm) {
      log(`${shd} → KHÔNG THẤY form callStatus`, "bg_err");
      return false;
    }

    const doc = idoc(fr);
    if (!doc) return false;

    // 1. callStatus
    const statusSel = doc.querySelector('select[name="callStatus"]');
    if (!statusSel) {
      log(`${shd} → không tìm thấy select callStatus`, "bg_err");
      return false;
    }

    statusSel.value = CONFIG.CALL_STATUS;
    statusSel.dispatchEvent(new Event("change", { bubbles: true }));
    statusSel.dispatchEvent(new Event("input", { bubbles: true }));

    try {
      if (typeof fr.contentWindow.callStatusChange === "function") {
        fr.contentWindow.callStatusChange(CONFIG.CALL_STATUS);
      }
    } catch (e) {}

    const statusName = CONFIG.CALL_STATUS === "6" ? "NKP" : (CONFIG.CALL_STATUS === "8" ? "NAB" : CONFIG.CALL_STATUS);
    log(`${shd} → đã chọn ${statusName}`, "bg_info");
    await sleep(600);

    // 2. callToType = NOBODY
    let typeSel = doc.querySelector('#callToTypeForm') || doc.querySelector('select[name="callToType"]');
    if (typeSel) {
      typeSel.value = CONFIG.CALL_TO_TYPE;
      typeSel.dispatchEvent(new Event("change", { bubbles: true }));
      log(`${shd} → đã chọn NOBODY`, "bg_info");
    }

    await sleep(300);

    // 3. Note
    const note = doc.querySelector('textarea[name="callNote"]');
    if (note) {
      note.value = CONFIG.CALL_NOTE;
      note.dispatchEvent(new Event("input", { bubbles: true }));
      note.dispatchEvent(new Event("change", { bubbles: true }));
      log(`${shd} → đã ghi Note`, "bg_info");
    }

    await sleep(300);

    // 4. Nút Lưu
    const saveBtn = [...doc.querySelectorAll('input[type="submit"], button[type="submit"]')]
      .find(b => /lưu/i.test(b.value || b.textContent || ""));

    if (!saveBtn) {
      const allSubmit = doc.querySelectorAll('input[type="submit"]');
      if (allSubmit.length) {
        allSubmit[allSubmit.length - 1].click();
      } else {
        log(`${shd} → KHÔNG TÌM THẤY nút Lưu`, "bg_err");
        return false;
      }
    } else {
      log(`${shd} → đang bấm Lưu...`, "bg_info");
      saveBtn.click();
    }

    await sleep(1200);
    log(`${shd} → ĐÃ GỬI LƯU`, "bg_ok");
    return true;
  }

  // ========== PROCESS 1 SHD ==========
  async function processOne(fr, row) {
    const shd = clean(row.SHD);
    log(`${shd} → bắt đầu`, "bg_info");

    try {
      await loadUrl(fr, getTargetUrl(shd));
      let doc = idoc(fr);
      if (!doc) throw new Error("Không truy cập được iframe");

      if (hasDetail(doc) && (doc.body.innerText || "").includes(shd)) {
        const data = parseDoc(doc);
        let saved = false;
        if (CONFIG.AUTO_SAVE && Object.keys(data).length > 2) {
          saved = await saveAction(fr, shd);
        }
        if (Object.keys(data).length > 2) {
          log(`${shd} → CÓ DỮ LIỆU${saved ? " + ĐÃ LƯU" : ""}`, "bg_ok");
          return { ...row, ...data, GIN: "có", TRẠNG_THÁI: "Đã tìm thấy", "ĐÃ LƯU": saved ? "Có" : "Không", __ERR: "" };
        }
      }

      const input = findInput(doc);
      if (!input) throw new Error("Không tìm thấy ô nhập SHD");

      input.value = shd;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const btn = findButton(doc);
      if (!btn) throw new Error("Không tìm thấy nút Tìm kiếm");

      log(`${shd} → gửi tìm kiếm`, "bg_info");
      btn.click();

      const found = await waitFor(fr, d => hasDetail(d) || !!findResultRow(d, shd), 14000);
      if (!found) {
        log(`${shd} → KHÔNG CÓ KẾT QUẢ`, "bg_warn");
        return { ...row, GIN: "không", TRẠNG_THÁI: "Không tìm thấy", "ĐÃ LƯU": "Không", __ERR: "" };
      }

      doc = idoc(fr);

      if (hasDetail(doc)) {
        const data = parseDoc(doc);
        let saved = false;
        if (CONFIG.AUTO_SAVE && Object.keys(data).length > 2) {
          saved = await saveAction(fr, shd);
        }
        if (Object.keys(data).length > 2) {
          log(`${shd} → CÓ DỮ LIỆU${saved ? " + ĐÃ LƯU" : ""}`, "bg_ok");
          return { ...row, ...data, GIN: "có", TRẠNG_THÁI: "Đã tìm thấy", "ĐÃ LƯU": saved ? "Có" : "Không", __ERR: "" };
        }
      }

      const rowEl = findResultRow(doc, shd);
      if (rowEl) {
        log(`${shd} → click kết quả`, "bg_info");
        rowEl.click();

        const got = await waitFor(fr, d => hasDetail(d), 14000);
        if (got) {
          await sleep(800);
          doc = idoc(fr);
          const data = parseDoc(doc);
          let saved = false;
          if (CONFIG.AUTO_SAVE && Object.keys(data).length > 2) {
            saved = await saveAction(fr, shd);
          }
          if (Object.keys(data).length > 2) {
            log(`${shd} → CÓ DỮ LIỆU${saved ? " + ĐÃ LƯU" : ""}`, "bg_ok");
            return { ...row, ...data, GIN: "có", TRẠNG_THÁI: "Đã tìm thấy", "ĐÃ LƯU": saved ? "Có" : "Không", __ERR: "" };
          }
        }
        log(`${shd} → không lấy được chi tiết`, "bg_warn");
        return { ...row, GIN: "không", TRẠNG_THÁI: "Không lấy được chi tiết", "ĐÃ LƯU": "Không", __ERR: "" };
      }

      log(`${shd} → KHÔNG CÓ KẾT QUẢ`, "bg_warn");
      return { ...row, GIN: "không", TRẠNG_THÁI: "Không tìm thấy", "ĐÃ LƯU": "Không", __ERR: "" };

    } catch (err) {
      log(`${shd} → LỖI: ${err.message}`, "bg_err");
      return { ...row, GIN: "lỗi", TRẠNG_THÁI: "Lỗi", "ĐÃ LƯU": "Không", __ERR: err.message };
    }
  }

  // ========== WORKER ==========
  async function worker(workerId, fr) {
    while (running && !stopRequested) {
      if (paused) break;
      const index = nextIndex;
      if (index >= rows.length) break;
      nextIndex++;

      active++;
      updateUI();
      $("bg_shd").textContent = `Đang chạy ${active} luồng`;

      const row = rows[index];
      const result = await processOne(fr, row);

      results[index] = result;
      completed++;
      active = Math.max(0, active - 1);

      const g = normalize(result.GIN);
      if (g === "co" || g === "có") success++;
      else if (g === "khong" || g === "không") notFound++;
      else errors++;

      updateUI();
      setStatus(`${completed}/${rows.length} hoàn thành`);
      if (CONFIG.DELAY > 0) await sleep(CONFIG.DELAY);
    }
  }

  async function startProcessing() {
    if (!rows.length) return alert("Chưa chọn file");
    if (running && !paused) return;

    // Đọc cấu hình từ UI trước khi chạy
    readConfigFromUI();

    if (completed >= rows.length && active === 0) {
      results = new Array(rows.length);
      completed = success = notFound = errors = nextIndex = 0;
    }

    running = true;
    paused = false;
    stopRequested = false;
    setStatus("Đang chạy + Lưu...");
    log(`BẮT ĐẦU — ${rows.length} SHD`, "bg_ok");

    const tasks = [];
    for (let i = 0; i < CONFIG.CONCURRENT; i++) {
      tasks.push(worker(i + 1, iframes[i]));
    }
    await Promise.all(tasks);

    if (paused) {
      setStatus(`Tạm dừng — ${completed}/${rows.length}`);
      log("Tạm dừng", "bg_warn");
      return;
    }

    running = false;
    if (completed >= rows.length) {
      setStatus("HOÀN THÀNH!");
      $("bg_shd").textContent = "Đã xử lý toàn bộ";
      log(`HOÀN THÀNH — ${completed} SHD`, "bg_ok");
    }
    updateUI();
  }

  // ========== FILE & EXPORT ==========
  async function loadXLSX() {
    if (window.XLSX) return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = CONFIG.XLSX_CDN;
      s.onload = () => window.XLSX ? res() : rej(new Error("XLSX fail"));
      s.onerror = () => rej(new Error("Không tải SheetJS"));
      document.head.appendChild(s);
    });
  }

  async function readExcel(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", dense: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!data.length) throw new Error("File trống");
    const headers = Object.keys(data[0]);
    const shdKey = headers.find(k => normalize(k) === "shd");
    if (!shdKey) throw new Error("Không tìm thấy cột SHD");

    rows = data.map(r => ({ ...r, SHD: clean(r[shdKey]) })).filter(r => r.SHD);
    results = new Array(rows.length);
    completed = success = notFound = errors = nextIndex = active = 0;
    updateUI();
    log(`Đã đọc ${rows.length} SHD`, "bg_ok");
    setStatus(`Đã load ${rows.length} SHD — bấm Bắt đầu`);
  }

  function getExportRows() {
    return rows.map((src, i) => results[i] ? { ...results[i] } : { ...src, GIN: "chưa chạy", TRẠNG_THÁI: "Chưa xử lý", "ĐÃ LƯU": "", __ERR: "" });
  }

  function getColumns(data) {
    const existing = new Set();
    data.forEach(r => Object.keys(r).forEach(k => { if (k !== "__ERR") existing.add(k); }));
    const ordered = [];
    FIXED_COLUMNS.forEach(col => { if (existing.has(col)) ordered.push(col); });
    existing.forEach(col => { if (!ordered.includes(col)) ordered.push(col); });
    return ordered;
  }

  async function exportXLSX() {
    const data = getExportRows();
    if (!data.length) return alert("Chưa có dữ liệu");
    const btn = $("bg_export");
    btn.disabled = true; btn.textContent = "Đang tạo...";
    try {
      const columns = getColumns(data);
      const aoa = [columns];
      data.forEach(row => aoa.push(columns.map(c => row[c] ?? "")));
      const ws = XLSX.utils.aoa_to_sheet(aoa, { dense: true });
      ws["!cols"] = columns.map(col => {
        let max = String(col).length;
        for (let i = 0; i < Math.min(data.length, 40); i++) max = Math.max(max, String(data[i][col] ?? "").length);
        return { wch: Math.min(Math.max(max + 2, 11), 42) };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "KET QUA");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["THỐNG KÊ"], ["Tổng", rows.length], ["Hoàn thành", completed],
        ["Có dữ liệu", success], ["Không có", notFound], ["Lỗi", errors]
      ]), "THONG KE");
      XLSX.writeFile(wb, `SHD_BG_${new Date().toISOString().slice(0,10)}.xlsx`, { compression: true });
      log(`Xuất Excel OK — ${data.length} dòng`, "bg_ok");
    } catch (e) {
      log("Lỗi Excel: " + e.message, "bg_err");
      alert(e.message);
    } finally {
      btn.disabled = false; btn.textContent = "↓ Xuất Excel";
    }
  }

  function exportCSV() {
    const data = getExportRows();
    if (!data.length) return alert("Chưa có dữ liệu");
    const columns = getColumns(data);
    const esc = v => {
      const t = String(v ?? "");
      return /["\n\r,]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t;
    };
    const lines = [columns.map(esc).join(",")];
    data.forEach(row => lines.push(columns.map(c => esc(row[c])).join(",")));
    const blob = new Blob(["\uFEFF"+lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `SHD_BG_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    log(`Xuất CSV OK — ${data.length} dòng`, "bg_ok");
  }

  function bind() {
    $("bg_file").onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { await readExcel(f); } catch (err) { log(err.message,"bg_err"); alert(err.message); }
    };
    $("bg_start").onclick = startProcessing;
    $("bg_pause").onclick = () => {
      paused = true; running = false;
      setStatus("Đã tạm dừng");
      log("Tạm dừng", "bg_warn");
    };
    $("bg_export").onclick = exportXLSX;
    $("bg_csv").onclick = exportCSV;
    $("bg_reset").onclick = () => {
      if (!confirm("Reset?")) return;
      running = false; paused = true; stopRequested = true;
      rows = []; results = [];
      completed = success = notFound = errors = nextIndex = active = 0;
      updateUI();
      $("bg_shd").textContent = "Chưa bắt đầu";
      setStatus("Đã reset");
      $("bg_log").innerHTML = "";
      log("Đã reset", "bg_info");
    };
    $("bg_close").onclick = () => {
      running = false; stopRequested = true;
      if (uiTimer) clearInterval(uiTimer);
      document.getElementById("__SHD_BG_UI")?.remove();
      document.getElementById("__SHD_BG_STYLE")?.remove();
      for (let i = 0; i < CONFIG.CONCURRENT; i++) {
        document.getElementById("__shd_bg_iframe_" + i)?.remove();
      }
      window.__SHD_BG_V6__ = false;
    };
  }

  // INIT
  createUI();
  try {
    await loadXLSX();
    log("SheetJS sẵn sàng", "bg_ok");
  } catch (e) {
    log(e.message, "bg_err");
    alert(e.message);
    return;
  }
  bind();
  updateUI();
  uiTimer = setInterval(updateUI, 400);
  log("SHD V6 sẵn sàng — chọn NKP/NAB + Note trên khung điều khiển.", "bg_ok");
})();
