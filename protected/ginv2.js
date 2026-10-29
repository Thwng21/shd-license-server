(async () => {
  /* =========================================================
     GIN AUTO FULL V26 (QR Call + Chèn Note Nhanh + Chuẩn hóa SĐT)
     - Nút 📞: Hiện QR + Chọn Code + Nhập Nội dung + Chèn vào Note
     - Nút 📝: Chèn nhanh SĐT vào Note
     - Giữ nguyên các tính năng cào dữ liệu, xuất Excel, v.v.
     ========================================================= */

  if (window.__GIN_AUTO_FULL_V25__) { alert("GIN AUTO FULL V26 đang chạy."); return; }
  window.__GIN_AUTO_FULL_V25__ = true;

  const CONFIG = {
    CONCURRENT: 100,
    RETRY: 2,
    DELAY: 350,
    RETRY_DELAY: 1200,
    UI_INTERVAL: 250,
    ACTIVE_TIMER_INTERVAL: 1000,
    XLSX_CDN: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    QR_CDN: "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
    LS_KEY: "__GIN_AUTO_V22_META__",
    LS_ROWS_KEY: "__GIN_AUTO_V22_ROWS__",
    CODE_OPTIONS: [
      { id: "8",  code: "nab",    display: "NAB" },
      { id: "6",  code: "nkp",    display: "NKP" },
      { id: "7",  code: "ncp",    display: "NCP" },
      { id: "14", code: "cab",    display: "CAB" },
      { id: "36", code: "keep",   display: "KEEP" },
      { id: "23", code: "hup",    display: "HUP" },
      { id: "1",  code: "ter",    display: "TER" },
      { id: "2",  code: "ptp",    display: "PTP" },
      { id: "22", code: "rtp",    display: "RTP" },
      { id: "9",  code: "lem",    display: "LEM" },
      { id: "15", code: "wfp",    display: "WFP" },
      { id: "25", code: "dif",    display: "DIF" },
      { id: "29", code: "wfp2",   display: "WFP" },
      { id: "32", code: "spc",    display: "SPC" },
      { id: "33", code: "liti",   display: "LITI" },
      { id: "34", code: "skip_1", display: "SKIP_1" },
      { id: "35", code: "skip_0", display: "SKIP_0" },
      { id: "37", code: "rptp",   display: "RPTP" },
      { id: "39", code: "dnc",    display: "DNC" },
      { id: "40", code: "cfa",    display: "CFA" }
    ]
  };

  let rows = [], results = [];
  let running = false, paused = false, stopRequested = false;
  let completed = 0, success = 0, notFound = 0, errors = 0, active = 0, nextIndex = 0;
  let uiDirty = true, uiTimer = null, activeTimer = null;
  const activeMap = new Map();
  let previewFilter = "all", previewSearch = "", selectedRowIdx = null, isExpanded = false;
  let highlightPhone = "";
  let highlightName = "";
  let noteFilter = "all";

  const shdMeta = new Map();

  function loadMetaFromLS() {
    try {
      const raw = localStorage.getItem(CONFIG.LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        Object.entries(obj).forEach(([shd, v]) => {
          if (v && typeof v === "object") {
            shdMeta.set(String(shd), {
              status: String(v.status || ""),
              code: String(v.code || ""),
              note: String(v.note || "")
            });
          }
        });
      }
    } catch (e) { /* ignore */ }
  }

  function saveMetaToLS() {
    try {
      const obj = {};
      shdMeta.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(CONFIG.LS_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }

  function getMeta(shd) {
    const key = String(shd ?? "");
    if (!shdMeta.has(key)) shdMeta.set(key, { status: "", code: "", note: "" });
    return shdMeta.get(key);
  }

  function setMeta(shd, patch) {
    const key = String(shd ?? "");
    const m = getMeta(key);
    Object.assign(m, patch);
    shdMeta.set(key, m);
    saveMetaToLS();
    markUIDirty();
  }

  function getCodeDisplay(meta) {
    if (!meta.code) return "";
    const opt = CONFIG.CODE_OPTIONS.find(x => x.code === meta.code);
    return opt ? (opt.display || opt.code.toUpperCase()) : meta.code.toUpperCase();
  }

  function getExportNote(meta) { return meta.note || ""; }
  function getStatusLabel(meta) {
    if (meta.status === "ok") return "Thành công";
    if (meta.status === "fail") return "Không thành công";
    return "";
  }

  loadMetaFromLS();

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const normalize = v => clean(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.:_-]+/g, " ").replace(/\s+/g, " ").trim();
  const escapeHtml = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapeAttr = v => escapeHtml(v).replace(/'/g, "&#39;");
  const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function markUIDirty() { uiDirty = true; }

  // Hàm chuẩn hóa SĐT nội bộ dùng cho so sánh
  function normalizePhone(v) {
    return String(v ?? "").replace(/\D+/g, "").replace(/^0+/, "");
  }

  // Hàm chuẩn hóa SĐT để đưa vào link tel: (gọi thực tế)
  function getCleanTelNumber(phone) {
    let raw = String(phone).replace(/\D/g, ''); 
    if (raw.startsWith('84') && raw.length >= 11) {
      raw = '0' + raw.slice(2);
    } else if (raw.length === 9) {
      raw = '0' + raw;
    }
    return raw;
  }

  function phonesMatch(query, target) {
    const q = normalizePhone(query);
    const t = normalizePhone(target);
    if (!q || !t) return false;
    return t.includes(q) || q.includes(t);
  }

  function extractPhones(text) {
    if (!text) return [];
    const str = String(text);
    const regex = /(?:\+?84|0)?[\s.-]*\d(?:[\s.-]*\d){7,10}(?!\d)/g;
    const matches = str.match(regex) || [];
    const validPhones = [];
    matches.forEach(m => {
      const digits = m.replace(/\D+/g, "");
      if (digits.length === 9 || digits.length === 10 || digits.length === 11) {
        validPhones.push(m.trim());
      }
    });
    return [...new Set(validPhones)];
  }

  function highlightTextHtml(rawText, query) {
    const text = String(rawText ?? "");
    if (!query || !text) return escapeHtml(text);
    const q = query.trim();
    if (!q) return escapeHtml(text);

    let regex;
    try {
      regex = new RegExp("(" + escapeRegExp(q) + ")", "gi");
      if (text.match(regex)) {
        return escapeHtml(text).replace(
          new RegExp("(" + escapeRegExp(escapeHtml(q)) + ")", "gi"),
          '<mark class="hl-name">$1</mark>'
        );
      }
    } catch (e) { /* ignore */ }

    const normQuery = normalize(q);
    if (!normQuery) return escapeHtml(text);
    try {
      const textNorm = normalize(text);
      const idx = textNorm.indexOf(normQuery);
      if (idx < 0) return escapeHtml(text);
      const tokens = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text)) !== null) tokens.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
      for (let a = 0; a < tokens.length; a++) {
        for (let b = a; b < tokens.length && b < a + 8; b++) {
          const sub = text.slice(tokens[a].start, tokens[b].end);
          if (normalize(sub) === normQuery) {
            const before = text.slice(0, tokens[a].start);
            const mid = text.slice(tokens[a].start, tokens[b].end);
            const after = text.slice(tokens[b].end);
            return escapeHtml(before) + '<mark class="hl-name">' + escapeHtml(mid) + '</mark>' + escapeHtml(after);
          }
        }
      }
    } catch (e) { /* ignore */ }
    return escapeHtml(text);
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error("Không tải được script: " + src));
      document.head.appendChild(s);
    });
  }

  async function loadLibs() {
    if (!window.XLSX) await loadScript(CONFIG.XLSX_CDN);
    if (!window.QRCode) await loadScript(CONFIG.QR_CDN);
  }

  // --- Hàm hiển thị QR & Thao tác nhanh ---
  function showQRCode(phone, shd) {
    // Chuẩn hóa số điện thoại
    const raw = getCleanTelNumber(phone);
    const telLink = "tel:" + raw;

    // Xóa overlay cũ nếu có
    let overlay = document.getElementById("__ga25_qr_overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "__ga25_qr_overlay";
    overlay.style.cssText = "position:fixed;z-index:2147483650;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;";

    const box = document.createElement("div");
    box.style.cssText = "background:#fff;padding:20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);display:flex;flex-direction:column;align-items:center;min-width:340px;max-width:400px;";

    // Header: SĐT
    const title = document.createElement("div");
    title.innerHTML = `SĐT: <span style="color:#0d6efd">${raw}</span>`;
    title.style.cssText = "font:bold 16px sans-serif;margin-bottom:12px;color:#212529;";

    // QR Container
    const qrContainer = document.createElement("div");
    qrContainer.id = "__ga25_qr_container";
    qrContainer.style.cssText = "padding:10px;background:#fff;border:1px solid #dee2e6;border-radius:8px;margin-bottom:15px;";

    // Chọn Code
    const codeWrapper = document.createElement("div");
    codeWrapper.style.cssText = "width:100%;margin-bottom:10px;display:flex;align-items:center;gap:8px;";
    const codeLabel = document.createElement("span");
    codeLabel.textContent = "Code:";
    codeLabel.style.cssText = "font:bold 12px sans-serif;color:#495057;white-space:nowrap;";
    const codeSelect = document.createElement("select");
    codeSelect.style.cssText = "flex:1;padding:6px;font-size:13px;border:1px solid #ced4da;border-radius:6px;outline:none;";
    codeSelect.innerHTML = `<option value="">-- Chọn Code --</option>` + CONFIG.CODE_OPTIONS.map(c => {
        const txt = (c.display || c.code.toUpperCase()) + " (" + c.id + ")";
        return `<option value="${c.code}">${escapeHtml(txt)}</option>`;
    }).join("");
    codeWrapper.appendChild(codeLabel);
    codeWrapper.appendChild(codeSelect);

    // Nhập Nội dung (Text tự do)
    const textWrapper = document.createElement("div");
    textWrapper.style.cssText = "width:100%;margin-bottom:15px;display:flex;align-items:center;gap:8px;";
    const textLabel = document.createElement("span");
    textLabel.textContent = "Nội dung:";
    textLabel.style.cssText = "font:bold 12px sans-serif;color:#495057;white-space:nowrap;";
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.style.cssText = "flex:1;padding:6px 8px;font-size:13px;border:1px solid #ced4da;border-radius:6px;outline:none;";
    textInput.placeholder = "VD: không nghe máy...";
    textWrapper.appendChild(textLabel);
    textWrapper.appendChild(textInput);

    // Các nút thao tác
    const btnGroup = document.createElement("div");
    btnGroup.style.cssText = "display:flex;gap:10px;width:100%;";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Chèn vào Note";
    saveBtn.style.cssText = "flex:1;padding:8px 0;border:none;border-radius:6px;background:#198754;color:#fff;font:bold 13px sans-serif;cursor:pointer;";
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Đóng";
    closeBtn.style.cssText = "flex:1;padding:8px 0;border:none;border-radius:6px;background:#6c757d;color:#fff;font:bold 13px sans-serif;cursor:pointer;";

    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(closeBtn);

    // Gắn sự kiện Lưu
    saveBtn.onclick = () => {
        const selectedCode = codeSelect.value;
        const textValue = textInput.value.trim();
        
        // 1. Lấy Note hiện tại
        const curMeta = getMeta(shd);
        let curNote = curMeta.note || "";
        
        // 2. Chuẩn bị các mảnh để nối
        let partsToAdd = [];
        partsToAdd.push(raw); // SĐT
        if (selectedCode) partsToAdd.push(selectedCode); // Code (chữ thường cho gọn)
        if (textValue) partsToAdd.push(textValue); // Nội dung

        // 3. Nối chuỗi
        let nextNote = curNote.trim();
        if (nextNote) {
            // Nếu Note cũ chưa có dấu phẩy ở cuối, thêm dấu phẩy
            if (!/,$/.test(nextNote)) nextNote += ",";
            nextNote += " " + partsToAdd.join(" ");
        } else {
            nextNote = partsToAdd.join(" ");
        }

        // 4. Lưu vào localStorage (chỉ lưu Note mới, giữ nguyên status)
        setMeta(shd, { note: nextNote });

        // 5. Cập nhật lại giao diện bảng ngoài
        if (isExpanded) {
            renderExpandedList();
            // Nếu đang xem đúng SHD này thì cập nhật lại ô Note bên phải
            if (selectedRowIdx !== null && rows[selectedRowIdx].SHD === shd) {
                const noteEl = $("exp25_meta_note");
                if (noteEl) {
                    noteEl.value = nextNote;
                }
            }
        }
        
        showToast(`Đã chèn: ${partsToAdd.join(" ")}`);
        overlay.remove();
    };

    closeBtn.onclick = () => overlay.remove();

    // Build UI
    box.appendChild(title);
    box.appendChild(qrContainer);
    box.appendChild(codeWrapper);
    box.appendChild(textWrapper);
    box.appendChild(btnGroup);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Tạo QR
    new QRCode(qrContainer, {
      text: telLink,
      width: 180,
      height: 180,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  function createUI() {
    document.getElementById("__GINAUTO_V25_UI")?.remove();
    document.getElementById("__GINAUTO_V25_STYLE")?.remove();

    const style = document.createElement("style");
    style.id = "__GINAUTO_V25_STYLE";
    style.textContent = `
      #__GINAUTO_V25_UI{position:fixed;z-index:2147483647;right:16px;top:16px;width:460px;height:760px;max-height:calc(100vh - 32px);overflow:hidden;background:#f8f9fa;color:#212529;border:1px solid #dee2e6;border-radius:9px;box-shadow:0 8px 30px rgba(0,0,0,.18);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;contain:layout paint style}
      #__GINAUTO_V25_UI *{box-sizing:border-box}
      #ga25_header{height:45px;display:flex;align-items:center;padding:0 14px;background:#212529;color:#fff;font-size:15px;font-weight:700;flex-shrink:0}
      #ga25_body{height:calc(100% - 45px);padding:12px;overflow-y:auto;overflow-x:hidden}
      .ga25_card{background:#fff;border:1px solid #e3e6e8;border-radius:7px;padding:9px 10px;margin-bottom:8px}
      .ga25_stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
      .ga25_label{font-size:10px;color:#6c757d;text-transform:uppercase;font-weight:600}
      .ga25_number{font-size:19px;font-weight:700;margin-top:2px}
      .ga25_green{color:#198754}.ga25_red{color:#dc3545}.ga25_yellow{color:#b58105}.ga25_blue{color:#0d6efd}
      #ga25_current{height:83px;background:#fff;border:1px solid #dee2e6;border-radius:7px;padding:10px;margin-top:9px;overflow:hidden}
      #ga25_current_shd{height:21px;font-size:14px;font-weight:700;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #ga25_current_status{height:35px;margin-top:4px;font-size:12px;line-height:1.45;overflow:hidden}
      #ga25_active{height:120px;overflow-y:auto;overflow-x:hidden;margin-top:8px;background:#fff;border:1px solid #e3e6e8;border-radius:7px;padding:4px;contain:content}
      .ga25_active_item{height:25px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 7px;border-bottom:1px solid #f1f3f5;font-size:11px}
      .ga25_active_item:last-child{border-bottom:0}
      .ga25_active_shd{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
      .ga25_active_time{flex-shrink:0;color:#6c757d}
      .ga25_progress{height:8px;background:#e9ecef;border-radius:5px;overflow:hidden;margin-top:10px}
      #ga25_progress_fill{width:0%;height:100%;background:#198754;transition:width .18s ease}
      #ga25_percent{text-align:center;margin-top:5px;font-size:11px;color:#6c757d;height:16px}
      .ga25_buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}
      .ga25_button{border:1px solid #ced4da;background:#fff;border-radius:6px;padding:8px 9px;cursor:pointer;font-size:12px;font-weight:600}
      .ga25_button:hover{background:#f1f3f5}
      .ga25_button:disabled{opacity:.55;cursor:not-allowed}
      .ga25_start{background:#212529;color:#fff;border-color:#212529}
      .ga25_expand_btn{width:100%;margin-top:7px;background:#6f42c1;color:#fff;border-color:#6f42c1}
      .ga25_export{width:100%;margin-top:7px;background:#198754;color:#fff;border-color:#198754}
      .ga25_meta_export{width:100%;margin-top:7px;background:#6f42c1;color:#fff;border-color:#6f42c1}
      .ga25_csv{width:100%;margin-top:7px}
      .ga25_reset{width:100%;margin-top:7px;color:#dc3545}
      .ga25_close{width:100%;margin-top:7px}
      #ga25_log{background:#111827;color:#d1d5db;border-radius:6px;padding:8px;height:180px;overflow:auto;font:11px/1.45 Consolas,Monaco,monospace}
      .ga25_ok{color:#75b798}.ga25_error{color:#ea868f}.ga25_warn{color:#ffda6a}.ga25_info{color:#9ec5fe}
      .ga25_file{width:100%;font-size:12px}
      .ga25_hint{color:#6c757d;font-size:11px;margin-top:5px;line-height:1.4}

      #__GINAUTO_V25_EXPANDED{position:fixed;z-index:2147483648;left:20px;top:20px;right:20px;bottom:20px;background:#fff;border:2px solid #6f42c1;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:700px;min-height:400px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#212529}
      #__GINAUTO_V25_EXPANDED *{box-sizing:border-box}
      #exp25_header{padding:10px 16px;background:linear-gradient(90deg,#6f42c1,#5a32a3);color:#fff;font-weight:700;font-size:14px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
      #exp25_header button{padding:5px 12px;font-size:12px;font-weight:600;border:none;border-radius:5px;cursor:pointer;background:#dc3545;color:#fff}
      #exp25_toolbar{display:flex;gap:4px;padding:8px 10px;background:#f8f9fa;border-bottom:1px solid #dee2e6;flex-wrap:wrap;align-items:center;flex-shrink:0}
      .filter-btn{padding:3px 8px;font-size:11px;font-weight:600;border:1px solid #ced4da;background:#fff;border-radius:4px;cursor:pointer}
      .filter-btn.active{background:#6f42c1;color:#fff;border-color:#6f42c1}
      .filter-btn .count{font-weight:400;opacity:.75;font-size:10px}
      #exp25_search{flex:1;min-width:150px;padding:5px 8px;font-size:12px;border:1px solid #ced4da;border-radius:4px}
      #exp25_main{flex:1;display:flex;overflow:hidden;min-height:0}
      #exp25_left{flex:0 0 480px;display:flex;flex-direction:column;border-right:2px solid #dee2e6;overflow:hidden;min-width:260px;max-width:800px;resize:horizontal}
      #exp25_left_header{padding:8px 10px;background:#f3e8ff;border-bottom:1px solid #dee2e6;font-size:11.5px;font-weight:700;color:#5a32a3;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:6px}
      #exp25_left_filters{display:flex;gap:4px;padding:6px 10px;background:#faf5ff;border-bottom:1px solid #dee2e6;flex-shrink:0;flex-wrap:wrap}
      .note-filter-btn{padding:3px 7px;font-size:10.5px;font-weight:600;border:1px solid #c4b5fd;background:#fff;border-radius:4px;cursor:pointer;color:#5a32a3}
      .note-filter-btn.active{background:#6f42c1;color:#fff;border-color:#6f42c1}
      .note-filter-btn .count{font-weight:400;opacity:.75;margin-left:3px}
      #exp25_list{flex:1;overflow:auto;background:#fff}
      #exp25_list table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
      #exp25_list th,#exp25_list td{padding:6px;border-bottom:1px solid #f1f3f5;text-align:left;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #exp25_list th{background:#f8f9fa;font-weight:700;color:#495057;position:sticky;top:0;font-size:10.5px;z-index:1}
      #exp25_list th.col-stt,#exp25_list td.col-stt{width:42px !important;min-width:42px !important;max-width:42px !important;text-align:right !important;overflow:visible !important}
      
      #exp25_list td.cell-shd{white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important;}
      #exp25_list td.cell-shd .shd-wrapper{display:flex; align-items:center; gap:4px; overflow:hidden;}
      #exp25_list td.cell-shd .shd-cell{overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      
      #exp25_list tr.row-item{cursor:pointer}
      #exp25_list tr.row-item:hover{background:#f8f9fa}
      #exp25_list tr.row-item.selected{background:#e9d5ff !important;border-left:3px solid #6f42c1;font-weight:600}
      #exp25_list tr.row-item.status-ok{background:#f0fdf4}
      #exp25_list tr.row-item.status-fail{background:#fef2f2}
      #exp25_list tr.row-item.status-pending{background:#fffbeb}
      #exp25_list tr.row-item.status-error{background:#fef2f2}
      #exp25_list tr.row-item.phone-hit{box-shadow:inset 0 0 0 2px #f59e0b}
      #exp25_list tr.row-item.name-hit{box-shadow:inset 0 0 0 2px #16a34a}
      #exp25_left_footer{padding:5px 10px;background:#f8f9fa;border-top:1px solid #dee2e6;font-size:11px;color:#6c757d;flex-shrink:0}
      #exp25_right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:#fff}
      
      #exp25_right_header{padding:8px 12px;background:#f0fdf4;border-bottom:1px solid #dee2e6;font-size:12px;font-weight:700;color:#166534;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:8px}
      #exp25_right_header .title-wrap{display:flex;align-items:center;gap:6px;overflow:hidden;}
      #exp25_right_title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      
      #exp25_detail{flex:1;overflow:auto;padding:0;background:#fff;position:relative}
      #exp25_detail_inner{padding:12px}
      #exp25_detail .empty-detail{text-align:center;padding:60px 20px;color:#adb5bd;font-size:13px;font-style:italic}
      #exp25_detail .detail-section{margin-bottom:16px}
      #exp25_detail .detail-section-title{font-size:12.5px;font-weight:700;color:#6f42c1;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #f3e8ff;display:flex;align-items:center;gap:6px}
      #exp25_detail .detail-grid{display:grid;grid-template-columns:180px 1fr;gap:6px 12px;font-size:12.5px}
      #exp25_detail .detail-grid .k{color:#6c757d;font-weight:600;padding:3px 0;border-bottom:1px dashed #f1f3f5;word-break:break-word}
      #exp25_detail .detail-grid .v{color:#212529;word-break:break-word;padding:3px 0;border-bottom:1px dashed #f1f3f5}
      #exp25_detail .detail-grid .v.empty{color:#adb5bd;font-style:italic}
      #exp25_detail table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}
      #exp25_detail table th{background:#f8f9fa;font-weight:700;color:#495057;padding:5px 6px;border:1px solid #dee2e6;font-size:10.5px;text-align:left}
      #exp25_detail table td{padding:5px 6px;border:1px solid #dee2e6;vertical-align:top;word-break:break-word}
      
      .highlight-phone-text { background-color: #fef08a; color: #854d0e; font-weight: bold; padding: 1px 3px; border-radius: 3px; border: 1px solid #eab308; }
      mark.hl-name { background:#bbf7d0; color:#14532d; font-weight:700; padding:0 2px; border-radius:2px; border:1px solid #16a34a; }
      
      .action-btns { display: inline-flex; align-items: center; gap: 3px; margin-left: 4px; vertical-align: middle; }
      .call-btn, .note-btn {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 1px 4px; font-size: 10px; border-radius: 3px; cursor: pointer;
        line-height: 1.2; text-decoration: none;
      }
      .call-btn { border: 1px solid #198754; background: #d1e7dd; color: #0f5132; }
      .call-btn:hover { background: #198754; color: #fff; }
      .note-btn { border: 1px solid #6f42c1; background: #f3e8ff; color: #5a32a3; }
      .note-btn:hover { background: #6f42c1; color: #fff; }

      .copy-top-btn{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;font-size:11px;font-weight:600;border:1px solid #0d6efd;background:#fff;color:#0d6efd;border-radius:4px;cursor:pointer;transition:all .15s;}
      .copy-top-btn:hover{background:#0d6efd;color:#fff;}
      
      #exp25_footer{padding:8px 12px;background:#f8f9fa;border-top:1px solid #dee2e6;font-size:12px;color:#6c757d;display:flex;justify-content:space-between;flex-shrink:0}
      .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;flex-shrink:0}
      .dot-ok{background:#198754}.dot-fail{background:#dc3545}.dot-pending{background:#ffc107}.dot-error{background:#dc3545}
      .shd-cell{font-family:Consolas,Monaco,monospace;font-weight:600}
      .name-cell{color:#dc3545;font-weight:600;font-size:11px}
      .phone-cell{color:#0d6efd;font-weight:600;font-size:11px}
      .gin-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700}
      .gin-yes{background:#d1e7dd;color:#0f5132}
      .gin-no{background:#fff3cd;color:#856404}
      .gin-err{background:#f8d7da;color:#842029}
      .gin-pending{background:#e2e3e5;color:#495057}

      #exp25_meta_box{position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#faf5ff,#f3e8ff);border-bottom:2px solid #d8b4fe;padding:8px 12px;display:flex;flex-wrap:nowrap;gap:8px 10px;align-items:flex-start;box-shadow:0 2px 6px rgba(111,66,193,.08)}
      #exp25_meta_box .meta-status{display:flex;gap:6px;align-items:center;font-size:11.5px;font-weight:600;color:#5a32a3;flex:0 0 auto;padding-top:4px}
      #exp25_meta_box .meta-status label{display:inline-flex;align-items:center;gap:3px;cursor:pointer;padding:3px 6px;border:1px solid #c4b5fd;border-radius:5px;background:#fff;user-select:none;transition:all .12s;white-space:nowrap;font-size:11px}
      #exp25_meta_box .meta-status label:hover{background:#f3e8ff}
      #exp25_meta_box .meta-status input[type="radio"]{margin:0;cursor:pointer;accent-color:#6f42c1}
      #exp25_meta_box .meta-status label.checked-ok{background:#d1e7dd;border-color:#198754;color:#0f5132}
      #exp25_meta_box .meta-status label.checked-fail{background:#f8d7da;border-color:#dc3545;color:#842029}
      #exp25_meta_box .meta-fields{display:flex;flex-direction:row;gap:6px;flex:1;min-width:0;align-items:flex-start;flex-wrap:nowrap}
      #exp25_meta_box .meta-fields-row{display:flex;gap:6px;align-items:center;flex:0 0 auto;min-width:0;padding-top:2px}
      #exp25_meta_box select,#exp25_meta_box input[type="text"],#exp25_meta_box textarea{padding:4px 7px;font-size:11.5px;border:1px solid #c4b5fd;border-radius:4px;background:#fff;outline:none;font-family:inherit}
      #exp25_meta_box select:focus,#exp25_meta_box input[type="text"]:focus,#exp25_meta_box textarea:focus{border-color:#6f42c1;box-shadow:0 0 0 2px rgba(111,66,193,.15)}
      #exp25_meta_box select{width:130px;flex:0 0 auto;font-size:11.5px;font-weight:600;color:#5a32a3}
      #exp25_meta_box input[type="text"]{flex:1;min-width:120px}
      #exp25_meta_note{flex:1;min-width:120px;height:32px;min-height:32px;max-height:240px;resize:vertical;line-height:1.4;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11.5px;border:1px solid #c4b5fd;border-radius:4px;padding:4px 7px;background:#fff;font-family:inherit;outline:none}
      #exp25_meta_note:focus{border-color:#6f42c1;box-shadow:0 0 0 2px rgba(111,66,193,.15)}
      #exp25_meta_export{padding:5px 10px;font-size:11px;font-weight:700;border:none;border-radius:4px;background:#6f42c1;color:#fff;cursor:pointer;white-space:nowrap;flex:0 0 auto}
      #exp25_meta_export:hover{background:#5a32a3}
      .meta-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:9.5px;font-weight:700;margin-left:4px;flex-shrink:0;}
      .meta-badge.ok{background:#d1e7dd;color:#0f5132}
      .meta-badge.fail{background:#f8d7da;color:#842029}
    `;
    document.head.appendChild(style);

    const box = document.createElement("div");
    box.id = "__GINAUTO_V25_UI";
    box.innerHTML = `
      <div id="ga25_header">GIN AUTO FULL V26 (QR Call + Chèn Note Nhanh)</div>
      <div id="ga25_body">
        <input id="ga25_file" class="ga25_file" type="file" accept=".xlsx,.xls,.csv">
        <div class="ga25_hint">Nhấp 📞 để hiện QR & chèn Note nhanh. Nhấp 📝 để chèn SĐT vào Note.</div>
        <div class="ga25_stats" style="margin-top:9px">
          <div class="ga25_card"><div class="ga25_label">Tổng SHD</div><div id="ga25_total" class="ga25_number">0</div></div>
          <div class="ga25_card"><div class="ga25_label">Đã xong</div><div id="ga25_done" class="ga25_number ga25_blue">0</div></div>
          <div class="ga25_card"><div class="ga25_label">Đang chạy</div><div id="ga25_active_count" class="ga25_number">0</div></div>
          <div class="ga25_card"><div class="ga25_label">GIN có</div><div id="ga25_yes" class="ga25_number ga25_green">0</div></div>
          <div class="ga25_card"><div class="ga25_label">Không có</div><div id="ga25_no" class="ga25_number ga25_yellow">0</div></div>
          <div class="ga25_card"><div class="ga25_label">Lỗi</div><div id="ga25_error" class="ga25_number ga25_red">0</div></div>
        </div>
        <div id="ga25_current">
          <div class="ga25_label">Đang thực hiện</div>
          <div id="ga25_current_shd">Chưa bắt đầu</div>
          <div id="ga25_current_status">Hãy chọn file Excel.</div>
        </div>
        <div class="ga25_progress"><div id="ga25_progress_fill"></div></div>
        <div id="ga25_percent">0%</div>
        <div id="ga25_active"><div style="color:#6c757d;font-size:11px;padding:5px">Không có SHD đang chạy</div></div>
        <div class="ga25_buttons">
          <button id="ga25_start" class="ga25_button ga25_start">▶ Bắt đầu</button>
          <button id="ga25_pause" class="ga25_button">⏸ Tạm dừng</button>
        </div>
        <button id="ga25_expand" class="ga25_button ga25_expand_btn">🔍 Mở rộng bảng kết quả</button>
        <button id="ga25_export" class="ga25_button ga25_export">↓ Xuất Excel (9 sheets)</button>
        <button id="ga25_meta_export" class="ga25_button ga25_meta_export">↓ Xuất Code + Note (CSV)</button>
        <button id="ga25_csv" class="ga25_button ga25_csv">↓ Xuất CSV dự phòng</button>
        <button id="ga25_reset" class="ga25_button ga25_reset">↺ Reset</button>
        <button id="ga25_close" class="ga25_button ga25_close">✕ Đóng</button>
        <div class="ga25_label" style="margin-top:12px;margin-bottom:5px">Nhật ký</div>
        <div id="ga25_log"></div>
      </div>
    `;
    document.body.appendChild(box);
  }

  function $(id) { return document.getElementById(id); }

  function log(message, cls = "") {
    const el = $("ga25_log"); if (!el) return;
    const line = document.createElement("div");
    line.className = cls;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el.appendChild(line);
    while (el.children.length > 500) el.removeChild(el.firstElementChild);
    el.scrollTop = el.scrollHeight;
  }

  function setStatus(msg) { const el = $("ga25_current_status"); if (el) el.textContent = msg; }

  function updateUI(force = false) {
    if (!force && !uiDirty) return;
    const total = rows.length;
    const percent = total ? Math.floor(completed / total * 100) : 0;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set("ga25_total", total); set("ga25_done", completed);
    set("ga25_yes", success); set("ga25_no", notFound);
    set("ga25_error", errors); set("ga25_active_count", active);
    const fill = $("ga25_progress_fill"); if (fill) fill.style.width = percent + "%";
    const pc = $("ga25_percent"); if (pc) pc.textContent = `${percent}% — ${completed}/${total}`;
    uiDirty = false;
  }
  uiTimer = setInterval(() => { if (window.__GIN_AUTO_FULL_V25__) updateUI(); }, CONFIG.UI_INTERVAL);

  let activeRenderDirty = true;
  function markActiveDirty() { activeRenderDirty = true; }
  function renderActive(force = false) {
    if (!force && !activeRenderDirty) return;
    const el = $("ga25_active"); if (!el) return;
    if (!activeMap.size) {
      el.innerHTML = `<div style="color:#6c757d;font-size:11px;padding:5px">Không có SHD đang chạy</div>`;
      activeRenderDirty = false; return;
    }
    const frag = document.createDocumentFragment();
    for (const [i, item] of activeMap.entries()) {
      const div = document.createElement("div"); div.className = "ga25_active_item";
      const s = document.createElement("span"); s.className = "ga25_active_shd"; s.textContent = `#${i + 1} ${item.shd}`;
      const t = document.createElement("span"); t.className = "ga25_active_time";
      t.textContent = `${Math.floor((Date.now() - item.started) / 1000)}s`;
      div.appendChild(s); div.appendChild(t); frag.appendChild(div);
    }
    el.replaceChildren(frag); activeRenderDirty = false;
  }
  activeTimer = setInterval(() => {
    if (!window.__GIN_AUTO_FULL_V25__) return;
    const el = $("ga25_active"); if (!el) return;
    const items = el.querySelectorAll(".ga25_active_item"); if (!items.length) return;
    let i = 0;
    for (const item of activeMap.values()) {
      const t = items[i]?.querySelector(".ga25_active_time");
      if (t) t.textContent = `${Math.floor((Date.now() - item.started) / 1000)}s`;
      i++;
    }
  }, CONFIG.ACTIVE_TIMER_INTERVAL);
  setInterval(() => { if (window.__GIN_AUTO_FULL_V25__) renderActive(); }, CONFIG.UI_INTERVAL);

  function addActive(i, shd) { activeMap.set(i, { shd, started: Date.now() }); active++; markActiveDirty(); markUIDirty(); }
  function removeActive(i) { activeMap.delete(i); active--; if (active < 0) active = 0; markActiveDirty(); markUIDirty(); }

  function extractBasicInfo(doc) {
    const out = {};
    doc.querySelectorAll("#container-basic_merged ul.gin-info-list li.gin-info-list__item").forEach(li => {
      const k = clean(li.querySelector(".gin-info-list__label")?.textContent);
      const v = clean(li.querySelector(".gin-info-list__value")?.textContent);
      if (k && v) out[k] = v;
    });
    return out;
  }

  function extractTableGeneric(tableEl) {
    if (!tableEl) return { headers: [], rows: [] };
    const ths = [...tableEl.querySelectorAll("thead th")].map(th => clean(th.textContent));
    const trs = [...tableEl.querySelectorAll("tbody tr")];
    const rows = trs.map(tr => [...tr.querySelectorAll("td")].map(td => clean(td.textContent)));
    return { headers: ths, rows };
  }

  function extractPhoneTable(doc) {
    return extractTableGeneric(doc.querySelector("#container-phone_merged table"));
  }
  function extractRelatedTable(doc) {
    return extractTableGeneric(doc.querySelector("#container-related_tt56 table"));
  }

  function extractExtraTables(doc) {
    const result = { lienLac: null, luoiLienHe: null, diaChi: null, nguoiThamChieu: null };
    const cardBody = doc.querySelector("#container-fecre_lite .card-body");
    if (!cardBody) return result;
    const headings = [...cardBody.querySelectorAll("h6")];
    headings.forEach(h => {
      const headingText = normalize(h.textContent);
      let next = h.nextElementSibling;
      while (next && !next.querySelector("table")) next = next.nextElementSibling;
      const tbl = next?.querySelector("table");
      if (!tbl) return;
      const data = extractTableGeneric(tbl);
      if (headingText.includes("so lien lac")) result.lienLac = data;
      else if (headingText.includes("luoi lien he")) result.luoiLienHe = data;
      else if (headingText.includes("dia chi")) result.diaChi = data;
      else if (headingText.includes("nguoi tham chieu")) result.nguoiThamChieu = data;
    });
    return result;
  }

  function detectResult(doc, shd) {
    const bodyText = clean(doc.body?.innerText || "");
    const target = normalize(shd);
    const tables = [...doc.querySelectorAll("table")];
    const dataTables = tables.filter(t => t.querySelectorAll("tr").length >= 2);
    const shdFound = Boolean(target && normalize(bodyText).includes(target));
    const noResultPatterns = ["khong tim thay", "khong co du lieu", "khong co ket qua",
      "no result", "not found", "không tìm thấy", "không có dữ liệu", "không có kết quả"];
    const explicitNo = noResultPatterns.some(x => normalize(bodyText).includes(normalize(x)));
    if (dataTables.length > 0 && shdFound) return true;
    if (shdFound && !explicitNo) return true;
    return false;
  }

  function parsePage(doc, shd) {
    const found = detectResult(doc, shd);
    if (!found) return { found: false, data: null };
    return {
      found: true,
      data: {
        shd,
        basic: extractBasicInfo(doc),
        phone: extractPhoneTable(doc),
        related: extractRelatedTable(doc),
        extra: extractExtraTables(doc),
        raw: doc.body?.innerText || ""
      }
    };
  }

  async function search(shd) {
    const input = document.querySelector("#searchInput");
    if (!input) throw new Error("Không tìm thấy #searchInput");
    const form = input.closest("form");
    if (!form) throw new Error("Không tìm thấy form");
    const action = form.action || location.href;
    const method = (form.method || "GET").toUpperCase();
    const url = new URL(action, location.href);
    const options = {
      credentials: "include", redirect: "follow",
      headers: { "X-Requested-With": "XMLHttpRequest", "Accept": "text/html,application/xhtml+xml" }
    };
    if (method === "GET") {
      url.searchParams.set(input.name || "q", shd);
      options.method = "GET";
    } else {
      options.method = method;
      const fd = new FormData(form); fd.set(input.name || "q", shd);
      options.body = fd;
    }
    const response = await fetch(url.href, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (!html || html.length < 100) throw new Error("Phản hồi rỗng");
    const doc = new DOMParser().parseFromString(html, "text/html");
    return parsePage(doc, shd);
  }

  async function processOne(row, rowIndex) {
    const shd = clean(row.SHD);
    addActive(rowIndex, shd);
    $("ga25_current_shd").textContent = `SHD: ${shd}`;
    let lastError = null;
    try {
      if (!shd) return { ...row, GIN: "không", TRẠNG_THÁI: "SHD trống", __ERR: "SHD trống", _DATA: null };
      for (let attempt = 1; attempt <= CONFIG.RETRY + 1; attempt++) {
        try {
          setStatus(`Đang truy vấn... lần ${attempt}`);
          log(`${shd} → truy vấn lần ${attempt}`, "ga25_info");
          const response = await search(shd);
          if (response && response.found) {
            log(`${shd} → GIN CÓ`, "ga25_ok");
            return { ...row, GIN: "có", TRẠNG_THÁI: "Đã tìm thấy", __ERR: "", _DATA: response.data };
          }
          log(`${shd} → KHÔNG CÓ`, "ga25_warn");
          return { ...row, GIN: "không", TRẠNG_THÁI: "Không tìm thấy", __ERR: "", _DATA: null };
        } catch (error) {
          lastError = error;
          log(`${shd} → lỗi lần ${attempt}: ${error.message}`, "ga25_warn");
          if (attempt <= CONFIG.RETRY) await sleep(CONFIG.RETRY_DELAY * attempt);
        }
      }
      log(`${shd} → LỖI SAU ${CONFIG.RETRY + 1} LẦN`, "ga25_error");
      return { ...row, GIN: "lỗi", TRẠNG_THÁI: "Lỗi truy vấn", __ERR: lastError?.message || "Không xác định", _DATA: null };
    } finally {
      removeActive(rowIndex);
    }
  }

  function finalizeResult(index, result) {
    results[index] = result;
    completed++;
    const gin = normalize(result?.GIN);
    if (gin === "co" || gin === "có") success++;
    else if (gin === "khong" || gin === "không") notFound++;
    else errors++;
    markUIDirty();
  }

  async function worker() {
    while (running && !stopRequested) {
      if (paused) break;
      const index = nextIndex;
      if (index >= rows.length) break;
      nextIndex++;
      const row = rows[index];
      try {
        const result = await processOne(row, index);
        finalizeResult(index, result);
        setStatus(`${row.SHD} hoàn thành — ${completed}/${rows.length}`);
      } catch (error) {
        finalizeResult(index, { ...row, GIN: "lỗi", TRẠNG_THÁI: "Lỗi worker", __ERR: error?.message || "Worker error", _DATA: null });
      }
      if (CONFIG.DELAY > 0 && running && !paused && !stopRequested) await sleep(CONFIG.DELAY);
    }
  }

  async function startProcessing() {
    if (!rows.length) return alert("Chưa chọn file Excel.");
    if (running && !paused) return;
    if (completed >= rows.length && !active) {
      results = new Array(rows.length);
      completed = 0; success = 0; notFound = 0; errors = 0; nextIndex = 0;
    }
    running = true; paused = false; stopRequested = false;
    markUIDirty(); setStatus("Đang khởi động...");
    log(`BẮT ĐẦU — ${rows.length} SHD`, "ga25_ok");
    const workers = [];
    for (let i = 0; i < CONFIG.CONCURRENT; i++) workers.push(worker());
    await Promise.all(workers);
    if (paused) { setStatus(`TẠM DỪNG — ${completed}/${rows.length}`); return; }
    if (stopRequested) { running = false; setStatus(`ĐÃ DỪNG — ${completed}/${rows.length}`); return; }
    running = false;
    if (completed >= rows.length) {
      setStatus(`HOÀN THÀNH — ${completed}/${rows.length}`);
      $("ga25_current_shd").textContent = "Đã xử lý toàn bộ";
      log(`HOÀN THÀNH — ${completed} SHD`, "ga25_ok");
    }
    markUIDirty(); updateUI(true); renderActive(true);
    if (isExpanded) renderExpanded();
  }

  function pauseProcessing() {
    if (!running) return;
    paused = true;
    setStatus(`Tạm dừng — ${completed}/${rows.length}`);
    log("TẠM DỪNG", "ga25_warn");
    markUIDirty();
  }

  function resetAll() {
    if (!confirm("Reset toàn bộ? (Code + Note đã lưu vẫn được giữ trong localStorage)")) return;
    running = false; paused = true; stopRequested = true;
    rows = []; results = [];
    completed = 0; success = 0; notFound = 0; errors = 0; active = 0; nextIndex = 0;
    activeMap.clear(); selectedRowIdx = null; isExpanded = false; highlightPhone = ""; highlightName = "";
    document.getElementById("__GINAUTO_V25_EXPANDED")?.remove();
    ["ga25_total","ga25_done","ga25_yes","ga25_no","ga25_error","ga25_active_count"].forEach(id => { const e = $(id); if (e) e.textContent = "0"; });
    if ($("ga25_current_shd")) $("ga25_current_shd").textContent = "Chưa bắt đầu";
    if ($("ga25_current_status")) $("ga25_current_status").textContent = "Đã reset";
    if ($("ga25_progress_fill")) $("ga25_progress_fill").style.width = "0%";
    if ($("ga25_percent")) $("ga25_percent").textContent = "0%";
    if ($("ga25_active")) $("ga25_active").innerHTML = `<div style="color:#6c757d;font-size:11px;padding:5px">Không có SHD đang chạy</div>`;
    if ($("ga25_log")) $("ga25_log").innerHTML = "";
    if ($("ga25_file")) $("ga25_file").value = "";
    try { localStorage.removeItem(CONFIG.LS_ROWS_KEY); } catch {}
    uiDirty = false; activeRenderDirty = false;
    log("Đã reset. (Code + Note vẫn còn trong localStorage)", "ga25_info");
  }

  async function readExcel(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", dense: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!data.length) throw new Error("File trống");
    const headers = Object.keys(data[0]);
    const shdKey = headers.find(k => normalize(k) === "shd");
    if (!shdKey) throw new Error("Không tìm thấy cột SHD");
    rows = data.map(r => ({ ...r, SHD: clean(r[shdKey]) })).filter(r => r.SHD);
    results = new Array(rows.length);
    completed = 0; success = 0; notFound = 0; errors = 0; active = 0; nextIndex = 0;
    paused = false; running = false; stopRequested = false;
    selectedRowIdx = rows.length ? 0 : null;
    highlightPhone = ""; highlightName = "";
    try { localStorage.setItem(CONFIG.LS_ROWS_KEY, JSON.stringify(rows)); } catch {}
    updateUI(true);
    log(`ĐỌC FILE THÀNH CÔNG — ${rows.length} SHD`, "ga25_ok");
    if (isExpanded) renderExpanded();
  }

  function getRowStatus(r, idx) {
    const res = results[idx]; if (!res) return "pending";
    const g = normalize(res.GIN);
    if (g === "co" || g === "có") return "ok";
    if (g === "khong" || g === "không") return "fail";
    return "error";
  }
  function getTen(res) {
    if (!res || !res._DATA || !res._DATA.basic) return "";
    return res._DATA.basic["Họ và tên"] || res._DATA.basic["Họ tên"] || res._DATA.basic["Tên"] || "";
  }
  function getPhone(res) {
    if (!res || !res._DATA || !res._DATA.phone || !res._DATA.phone.rows.length) return "";
    return res._DATA.phone.rows[0][1] || "";
  }
  function shortText(s, max = 22) { return !s ? "" : (s.length > max ? s.slice(0, max - 1) + "…" : s); }

  function getAllPhonesOfResult(res) {
    const phones = [];
    if (!res || !res._DATA) return phones;
    const d = res._DATA;
    if (d.phone && d.phone.rows) {
      d.phone.rows.forEach(r => { 
        r.forEach((cell) => {
          phones.push(...extractPhones(cell));
        }); 
      });
    }
    ["lienLac", "luoiLienHe", "nguoiThamChieu"].forEach(k => {
      const t = d.extra?.[k];
      if (t && t.rows) {
        t.rows.forEach(r => { 
          r.forEach((cell) => {
            phones.push(...extractPhones(cell));
          }); 
        });
      }
    });
    return phones;
  }

  function getAllRelatedNamesOfResult(res) {
    const names = [];
    if (!res || !res._DATA) return names;
    const d = res._DATA;

    if (d.related && d.related.headers && d.related.rows) {
      const headers = d.related.headers.map(h => normalize(h));
      let nameIdx = headers.findIndex(h =>
        h === "ho va ten" || h === "ho ten" || h === "ten" || h.includes("ho va ten")
      );
      if (nameIdx < 0) nameIdx = 1;
      d.related.rows.forEach(row => {
        const v = clean(row[nameIdx]);
        if (v) names.push(v);
      });
    }

    ["nguoiThamChieu", "luoiLienHe", "lienLac"].forEach(k => {
      const t = d.extra?.[k];
      if (!t || !t.headers || !t.rows) return;
      const headers = t.headers.map(h => normalize(h));
      let nameIdx = headers.findIndex(h =>
        h === "ho ten" || h === "ho va ten" || h === "ten" || h.includes("ho ten") || h.includes("ho va ten")
      );
      if (nameIdx < 0) nameIdx = 1;
      t.rows.forEach(row => {
        const v = clean(row[nameIdx]);
        if (v) names.push(v);
      });
    });

    return names;
  }

  function rowMatchesPhoneSearch(r, idx, query) {
    if (!query) return false;
    const res = results[idx];
    if (res && res._DATA) {
      const phones = getAllPhonesOfResult(res);
      if (phones.some(p => phonesMatch(query, p))) return true;
    }
    const meta = shdMeta.get(String(r.SHD));
    if (meta && meta.note && phonesMatch(query, meta.note)) return true;
    return false;
  }

  function findFirstExactPhoneRow(query) {
    if (!query) return -1;
    const qNorm = normalizePhone(query);
    if (!qNorm) return -1;
    for (let i = 0; i < rows.length; i++) {
      const res = results[i];
      if (!res || !res._DATA) continue;
      const phones = getAllPhonesOfResult(res);
      if (phones.some(p => normalizePhone(p) === qNorm)) return i;
    }
    return -1;
  }

  function renderExpandedList() {
    const listEl = $("exp25_list"); if (!listEl) return;
    let counts = { all: rows.length, ok: 0, fail: 0, error: 0, pending: 0 };
    rows.forEach((r, i) => { const s = getRowStatus(r, i); if (counts[s] !== undefined) counts[s]++; });
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set("exp25_cnt_all", counts.all); set("exp25_cnt_ok", counts.ok);
    set("exp25_cnt_fail", counts.fail); set("exp25_cnt_error", counts.error); set("exp25_cnt_pending", counts.pending);

    let noteCounts = { all: rows.length, notedOk: 0, notedFail: 0, notNoted: 0 };
    rows.forEach(r => {
      const meta = shdMeta.get(String(r.SHD));
      if (!meta || (!meta.status && !meta.code && !meta.note)) noteCounts.notNoted++;
      else if (meta.status === "ok") noteCounts.notedOk++;
      else if (meta.status === "fail") noteCounts.notedFail++;
      else noteCounts.notNoted++;
    });
    set("exp25_note_cnt_all", noteCounts.all);
    set("exp25_note_cnt_ok", noteCounts.notedOk);
    set("exp25_note_cnt_fail", noteCounts.notedFail);
    set("exp25_note_cnt_none", noteCounts.notNoted);

    const searchLower = previewSearch.trim().toLowerCase();
    const digitsOnly = previewSearch.replace(/\D+/g, "");
    const isPhoneSearch = digitsOnly.length >= 3 && /^[\d\s.\-+]+$/.test(previewSearch.trim());
    const isNameSearch = !isPhoneSearch && previewSearch.trim().length >= 2;

    highlightPhone = isPhoneSearch ? previewSearch.trim() : "";
    highlightName = isNameSearch ? previewSearch.trim() : "";

    const filtered = [];
    let firstPhoneHitIdx = -1;

    rows.forEach((r, i) => {
      const st = getRowStatus(r, i);
      if (previewFilter !== "all" && previewFilter !== st) return;

      if (noteFilter !== "all") {
        const meta = shdMeta.get(String(r.SHD));
        const hasNote = meta && (meta.status || meta.code || meta.note);
        if (noteFilter === "notedOk") { if (!(hasNote && meta.status === "ok")) return; }
        else if (noteFilter === "notedFail") { if (!(hasNote && meta.status === "fail")) return; }
        else if (noteFilter === "notNoted") { if (hasNote) return; }
      }

      let phoneHitFlag = false;
      let nameHitFlag = false;
      if (searchLower) {
        const shdMatch = String(r.SHD).toLowerCase().includes(searchLower);
        const phoneHit = isPhoneSearch && rowMatchesPhoneSearch(r, i, previewSearch);
        const tenMatch = (() => {
          const t = getTen(results[i]).toLowerCase();
          return t && t.includes(searchLower);
        })();
        const relatedNameHit = (() => {
          const res = results[i];
          if (!res || !res._DATA) return false;
          const names = getAllRelatedNamesOfResult(res);
          return names.some(n => normalize(n).includes(normalize(previewSearch)));
        })();

        if (!shdMatch && !phoneHit && !tenMatch && !relatedNameHit) return;

        if (phoneHit && firstPhoneHitIdx === -1) firstPhoneHitIdx = i;
        phoneHitFlag = phoneHit;
        nameHitFlag = relatedNameHit && !tenMatch;
      }
      filtered.push({ row: r, idx: i, status: st, phoneHit: phoneHitFlag, nameHit: nameHitFlag });
    });

    if (isPhoneSearch && selectedRowIdx === null) {
      const exactIdx = findFirstExactPhoneRow(previewSearch);
      if (exactIdx !== -1) {
        selectedRowIdx = exactIdx;
        renderExpandedDetail();
      } else if (firstPhoneHitIdx !== -1) {
        selectedRowIdx = firstPhoneHitIdx;
        renderExpandedDetail();
      }
    }

    let html = `<table><thead><tr>
      <th class="col-stt">#</th><th style="width:130px">SHD</th>
      <th>Tên KH</th><th style="width:105px">SĐT</th><th style="width:50px">GIN</th>
    </tr></thead><tbody>`;
    if (!filtered.length) {
      html += `<tr><td colspan="5" style="text-align:center;padding:20px;color:#6c757d;font-size:11.5px">Không có dòng</td></tr>`;
    } else {
      filtered.forEach(({ row, idx, status, phoneHit, nameHit }) => {
        const res = results[idx];
        const ten = getTen(res), phone = getPhone(res);
        const meta = shdMeta.get(String(row.SHD)) || { status: "", code: "", note: "" };
        const sel = selectedRowIdx === idx;
        const dotCls = status === "ok" ? "dot-ok" : status === "fail" ? "dot-fail" : status === "error" ? "dot-error" : "dot-pending";
        const trClass = `${status === "ok" ? "status-ok" : status === "fail" ? "status-fail" : status === "error" ? "status-error" : "status-pending"}${sel ? " selected" : ""}${phoneHit ? " phone-hit" : ""}${nameHit ? " name-hit" : ""}`;
        const ginBadge = status === "ok" ? `<span class="gin-badge gin-yes">CÓ</span>` :
                         status === "fail" ? `<span class="gin-badge gin-no">KHÔNG</span>` :
                         status === "error" ? `<span class="gin-badge gin-err">LỖI</span>` :
                         `<span class="gin-badge gin-pending">CHỜ</span>`;
        let metaBadge = "";
        if (meta.status === "ok") {
          const txt = meta.code ? getCodeDisplay(meta) : "OK";
          const title = `OK${meta.code ? " — " + meta.code.toUpperCase() : ""}${meta.note ? " — " + meta.note : ""}`;
          metaBadge = `<span class="meta-badge ok" title="${escapeHtml(title)}">${escapeHtml(txt)}</span>`;
        } else if (meta.status === "fail") {
          const txt = meta.code ? getCodeDisplay(meta) : "✗";
          const title = `Không thành công${meta.code ? " — " + meta.code.toUpperCase() : ""}${meta.note ? " — " + meta.note : ""}`;
          metaBadge = `<span class="meta-badge fail" title="${escapeHtml(title)}">${escapeHtml(txt)}</span>`;
        }
        const tenHtml = ten
          ? `<span class="name-cell">${highlightName ? highlightTextHtml(shortText(ten, 30), highlightName) : escapeHtml(shortText(ten, 22))}</span>`
          : `<span style="color:#adb5bd">—</span>`;
        
        html += `<tr class="row-item ${trClass}" data-idx="${idx}">
          <td class="col-stt">${idx + 1}</td>
          <td class="cell-shd" title="${escapeAttr(row.SHD)}">
            <div class="shd-wrapper">
              <span class="status-dot ${dotCls}"></span>
              <span class="shd-cell">${escapeHtml(row.SHD)}</span>
              ${metaBadge}
            </div>
          </td>
          <td title="${escapeHtml(ten)}">${tenHtml}</td>
          <td title="${phone}">${phone ? `<span class="phone-cell">${shortText(phone, 14)}</span>` : `<span style="color:#adb5bd">—</span>`}</td>
          <td>${ginBadge}</td>
        </tr>`;
      });
    }
    html += `</tbody></table>`;
    listEl.innerHTML = html;
    set("exp25_left_count", `${filtered.length}/${rows.length}`);
    if ($("exp25_pv_count")) $("exp25_pv_count").textContent = `${filtered.length}/${rows.length} dòng${isPhoneSearch ? ` (search SĐT)` : isNameSearch ? ` (search tên)` : ""}`;

    listEl.querySelectorAll('tr.row-item').forEach(tr => {
      tr.onclick = () => {
        selectedRowIdx = parseInt(tr.dataset.idx);
        renderExpandedList(); 
        renderExpandedDetail();
      };
    });
  }

  function renderCellContent(cell, headers, colIndex) {
    const str = String(cell || "");
    const extractedPhones = extractPhones(str);
    
    if (extractedPhones.length > 0) {
      let html = escapeHtml(str);
      extractedPhones.forEach(p => {
        const safeP = escapeHtml(p);
        const pNorm = normalizePhone(p);
        const qNorm = normalizePhone(highlightPhone);
        const isMatch = qNorm && (pNorm.includes(qNorm) || qNorm.includes(pNorm));
        
        // Tạo 2 nút: Call (hiện QR) và Note
        const actionHtml = `
          <span class="action-btns">
            <button class="call-btn" data-phone="${escapeAttr(p)}" title="Hiện mã QR để gọi">📞</button>
            <button class="note-btn" data-phone="${escapeAttr(p)}" title="Chèn SĐT vào Note">📝</button>
          </span>`;

        const replacement = isMatch
          ? `<span class="highlight-phone-text">${safeP}</span>${actionHtml}`
          : `<span>${safeP}</span>${actionHtml}`;
        html = html.replace(safeP, replacement);
      });
      return `<td>${html}</td>`;
    }
    if (highlightName && str) {
      return `<td>${highlightTextHtml(str, highlightName)}</td>`;
    }
    return `<td>${escapeHtml(str)}</td>`;
  }

  function renderTable(headers, rows) {
    if (!headers.length) return `<div style="color:#adb5bd;font-style:italic;font-size:11.5px">(Không có dữ liệu)</div>`;
    let h = `<table><thead><tr>${headers.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>`;
    if (!rows.length) {
      h += `<tr><td colspan="${headers.length}" style="text-align:center;color:#adb5bd;font-style:italic">(Không có dòng)</td></tr>`;
    } else {
      rows.forEach(r => {
        h += `<tr>${headers.map((_, i) => renderCellContent(r[i] || "", headers, i)).join("")}</tr>`;
      });
    }
    h += `</tbody></table>`;
    return h;
  }

  function renderExpandedDetail() {
    const detailEl = $("exp25_detail");
    const titleEl = $("exp25_right_title");
    const statusEl = $("exp25_right_status");
    if (!detailEl) return;

    if (selectedRowIdx === null || !rows[selectedRowIdx]) {
      detailEl.innerHTML = `<div id="exp25_detail_inner"><div class="empty-detail">← Chọn SHD để xem chi tiết</div></div>`;
      if (titleEl) titleEl.textContent = "📄 CHI TIẾT SHD";
      if (statusEl) statusEl.textContent = "";
      return;
    }
    const idx = selectedRowIdx;
    const row = rows[idx];
    const res = results[idx];
    const status = getRowStatus(row, idx);
    const ten = getTen(res);

    if (titleEl) {
      const tenHl = highlightName && ten ? highlightTextHtml(ten, highlightName) : escapeHtml(ten);
      titleEl.innerHTML = `
        <div class="title-wrap">
          <span>📄 ${escapeHtml(row.SHD)}${ten ? ` — ${tenHl}` : ''}</span>
          <button class="copy-top-btn" id="exp25_copy_top" title="Copy SHD">📋 Copy SHD</button>
        </div>
      `;
      const copyBtn = document.getElementById("exp25_copy_top");
      if (copyBtn) {
        copyBtn.onclick = (e) => {
          e.stopPropagation();
          copyToClipboard(row.SHD);
        };
      }
    }
    
    if (statusEl) {
      statusEl.textContent = status === "ok" ? "✅ GIN có" : status === "fail" ? "❌ Không có" : status === "error" ? "⚠️ Lỗi" : "⏳ Chờ";
    }

    const meta = getMeta(row.SHD);
    const noteH = 32;
    const metaHtml = `<div id="exp25_meta_box">
      <div class="meta-status">
        <label class="${meta.status === "ok" ? "checked-ok" : ""}">
          <input type="radio" name="exp25_status_${idx}" value="ok" ${meta.status === "ok" ? "checked" : ""}>
          ✅ OK
        </label>
        <label class="${meta.status === "fail" ? "checked-fail" : ""}">
          <input type="radio" name="exp25_status_${idx}" value="fail" ${meta.status === "fail" ? "checked" : ""}>
          ❌ Fail
        </label>
      </div>
      <div class="meta-fields">
        <div class="meta-fields-row">
          <select id="exp25_meta_code">
            <option value="">-- Code --</option>
            ${CONFIG.CODE_OPTIONS.map(c => {
              const txt = (c.display || c.code.toUpperCase()) + " (" + c.id + ")";
              return `<option value="${c.code}"${meta.code === c.code ? " selected" : ""}>${escapeHtml(txt)}</option>`;
            }).join("")}
          </select>
        </div>
        <textarea id="exp25_meta_note" placeholder="Note... (kéo xuống để mở rộng)" rows="1" style="height:${noteH}px">${escapeHtml(meta.note)}</textarea>
        <button id="exp25_meta_export">↓ Xuất</button>
      </div>
    </div>`;

    let bodyHtml = "";
    if (!res || !res._DATA) {
      bodyHtml = `<div class="empty-detail">Chưa có dữ liệu cào — bấm "▶ Bắt đầu".</div>`;
    } else {
      const d = res._DATA;
      if (d.basic && Object.keys(d.basic).length) {
        bodyHtml += `<div class="detail-section"><div class="detail-section-title">📋 THÔNG TIN CƠ BẢN</div>
          <div class="detail-grid">
            ${Object.entries(d.basic).map(([k, v]) => `<div class="k">${escapeHtml(k)}</div><div class="v">${highlightName ? highlightTextHtml(v, highlightName) : escapeHtml(v)}</div>`).join("")}
          </div></div>`;
      }
      if (d.phone && d.phone.rows.length) {
        bodyHtml += `<div class="detail-section"><div class="detail-section-title">📞 THÔNG TIN SĐT</div>${renderTable(d.phone.headers, d.phone.rows)}</div>`;
      }
      if (d.related && d.related.rows.length) {
        bodyHtml += `<div class="detail-section"><div class="detail-section-title">👥 THÔNG TIN LIÊN QUAN</div>${renderTable(d.related.headers, d.related.rows)}</div>`;
      }
      if (d.extra) {
        const extraLabels = { lienLac: "📇 Số liên lạc", luoiLienHe: "🕸️ Lưới liên hệ", diaChi: "📍 Địa chỉ", nguoiThamChieu: "🤝 Người tham chiếu" };
        Object.entries(d.extra).forEach(([key, tbl]) => {
          if (!tbl || !tbl.rows.length) return;
          bodyHtml += `<div class="detail-section"><div class="detail-section-title">${extraLabels[key] || key}</div>${renderTable(tbl.headers, tbl.rows)}</div>`;
        });
      }
    }

    detailEl.innerHTML = metaHtml + `<div id="exp25_detail_inner">${bodyHtml}</div>`;
    bindMetaEvents(row.SHD, idx);
    bindCallButtons(row.SHD, idx);
  }

  function bindCallButtons(shd, idx) {
    const detailEl = $("exp25_detail");
    if (!detailEl) return;
    
    // Nút Note
    detailEl.querySelectorAll(".note-btn").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const phone = btn.dataset.phone || "";
        appendPhoneToNote(phone, shd);
      };
    });

    // Nút Call (QR)
    detailEl.querySelectorAll(".call-btn").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const phone = btn.dataset.phone || "";
        showQRCode(phone, shd); // <-- Thêm shd vào đây
      };
    });
  }

  function appendPhoneToNote(phone, shd) {
    const noteEl = $("exp25_meta_note");
    if (!noteEl) return;
    const cur = noteEl.value || "";
    let next;
    if (!cur.trim()) {
      next = phone;
    } else if (/\s$/.test(cur) || /[\s,;]$/.test(cur)) {
      next = cur + phone;
    } else {
      next = cur + " " + phone;
    }
    noteEl.value = next;
    setMeta(shd, { note: next });
    noteEl.focus();
    try { noteEl.setSelectionRange(next.length, next.length); } catch (e) { }
    renderExpandedList();
    showToast(`Đã chèn ${phone} vào Note`);
  }

  let toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById("__ga25_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__ga25_toast";
      el.style.cssText = "position:fixed;z-index:2147483649;left:50%;bottom:30px;transform:translateX(-50%);background:#198754;color:#fff;padding:8px 16px;border-radius:6px;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 1400);
  }

  function copyToClipboard(text) {
    const done = () => showToast(`📋 Đã copy: ${text}`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done && done();
    } catch (e) {
      alert("Không copy được: " + text);
    }
  }

  function bindMetaEvents(shd, idx) {
    const detailEl = $("exp25_detail");
    const codeEl = $("exp25_meta_code");
    const noteEl = $("exp25_meta_note");
    const radios = detailEl.querySelectorAll(`input[name="exp25_status_${idx}"]`);

    radios.forEach(r => {
      r.onchange = () => {
        const val = r.value;
        setMeta(shd, { status: val });
        radios.forEach(rr => {
          const label = rr.closest("label");
          label.classList.remove("checked-ok", "checked-fail");
          if (rr.checked) label.classList.add(val === "ok" ? "checked-ok" : "checked-fail");
        });
        renderExpandedList();
      };
    });

    if (codeEl) {
      codeEl.onchange = () => {
        setMeta(shd, { code: codeEl.value });
        renderExpandedList();
      };
    }
    if (noteEl) {
      noteEl.onmouseup = () => {
        try { noteEl.dataset.userHeight = noteEl.style.height || noteEl.offsetHeight + "px"; } catch (e) {}
      };
      noteEl.oninput = () => {
        setMeta(shd, { note: noteEl.value });
      };
      noteEl.onblur = () => {
        setMeta(shd, { note: noteEl.value.trim() });
        renderExpandedList();
      };
    }
    const expBtn = $("exp25_meta_export");
    if (expBtn) expBtn.onclick = exportMetaCSV;
  }

  function openExpanded() {
    if (!rows.length) return alert("Chưa có dữ liệu.");
    document.getElementById("__GINAUTO_V25_EXPANDED")?.remove();
    isExpanded = true;
    if (selectedRowIdx === null && rows.length) selectedRowIdx = 0;

    if (typeof noteFilter === "undefined") noteFilter = "all";

    const overlay = document.createElement("div");
    overlay.id = "__GINAUTO_V25_EXPANDED";
    overlay.innerHTML = `
      <div id="exp25_header">
        <span>🔍 WGnouht - DASHBOAD GIN</span>
        <button id="exp25_close">✕ Đóng</button>
      </div>
      <div id="exp25_toolbar">
        <button class="filter-btn active" data-filter="all">Tất cả <span class="count" id="exp25_cnt_all">0</span></button>
        <button class="filter-btn" data-filter="ok">✅ GIN có <span class="count" id="exp25_cnt_ok">0</span></button>
        <button class="filter-btn" data-filter="fail">❌ Không có <span class="count" id="exp25_cnt_fail">0</span></button>
        <button class="filter-btn" data-filter="error">⚠️ Lỗi <span class="count" id="exp25_cnt_error">0</span></button>
        <button class="filter-btn" data-filter="pending">⏳ Chờ <span class="count" id="exp25_cnt_pending">0</span></button>
        <input type="text" id="exp25_search" placeholder="🔍 Tìm SHD / Tên KH / SĐT / Tên người liên quan...">
      </div>
      <div id="exp25_main">
        <div id="exp25_left">
          <div id="exp25_left_header"><span>📋 DANH SÁCH SHD</span><span id="exp25_left_count" style="font-weight:400;font-size:10.5px;color:#6c757d">0</span></div>
          <div id="exp25_left_filters">
            <button class="note-filter-btn active" data-note-filter="all">Tất cả note <span class="count" id="exp25_note_cnt_all">0</span></button>
            <button class="note-filter-btn" data-note-filter="notedOk">✅ Đã note Thành công <span class="count" id="exp25_note_cnt_ok">0</span></button>
            <button class="note-filter-btn" data-note-filter="notedFail">❌ Đã note Không thành công <span class="count" id="exp25_note_cnt_fail">0</span></button>
            <button class="note-filter-btn" data-note-filter="notNoted">📝 Chưa note <span class="count" id="exp25_note_cnt_none">0</span></button>
          </div>
          <div id="exp25_list"></div>
          <div id="exp25_left_footer">Click SHD để xem chi tiết & nhập Code/Note</div>
        </div>
        <div id="exp25_right">
          <div id="exp25_right_header">
            <span id="exp25_right_title">📄 CHI TIẾT SHD</span>
            <span id="exp25_right_status" style="font-weight:400;font-size:11px;color:#6c757d"></span>
          </div>
          <div id="exp25_detail"></div>
        </div>
      </div>
      <div id="exp25_footer">
        <span id="exp25_pv_count">0 dòng</span>
        <span style="color:#adb5bd">Kéo góc để resize</span>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('#exp25_toolbar .filter-btn').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('#exp25_toolbar .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        previewFilter = btn.dataset.filter;
        renderExpandedList();
      };
    });

    overlay.querySelectorAll('#exp25_left_filters .note-filter-btn').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('#exp25_left_filters .note-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        noteFilter = btn.dataset.noteFilter;
        renderExpandedList();
      };
    });

    overlay.querySelector("#exp25_search").value = previewSearch;
    overlay.querySelector("#exp25_search").oninput = (e) => { 
      previewSearch = e.target.value.trim(); 
      selectedRowIdx = null; 
      renderExpandedList(); 
    };
    overlay.querySelector("#exp25_close").onclick = () => { isExpanded = false; document.getElementById("__GINAUTO_V25_EXPANDED")?.remove(); };

    renderExpandedList();
    renderExpandedDetail();
  }

  function renderExpanded() { if (!isExpanded) return; renderExpandedList(); renderExpandedDetail(); }

  const getTenKH = (r) => {
    const b = r._DATA?.basic || {};
    return b["Họ và tên"] || b["Họ tên"] || b["Tên"] || "";
  };

  const getBasic = (r, ...keys) => {
    const b = r._DATA?.basic || {};
    for (const k of keys) {
      if (b[k]) return b[k];
    }
    const normKeys = keys.map(x => normalize(x));
    for (const [k, v] of Object.entries(b)) {
      if (normKeys.includes(normalize(k))) return v;
    }
    return "";
  };

  const getPhonesFromPhoneTable = (r) => {
    const p = r._DATA?.phone;
    if (!p || !p.rows || !p.rows.length) return "";
    const headers = (p.headers || []).map(h => normalize(h));
    const idxCurrent = headers.findIndex(h =>
      h.includes("current mobile") || h.includes("sdt hien tai") || h.includes("di dong hien tai") || h === "current"
    );
    const idxPermanent = headers.findIndex(h =>
      h.includes("permanent mobile") || h.includes("sdt thuong tru") || h.includes("di dong thuong tru") || h === "permanent"
    );
    const phones = [];
    p.rows.forEach(row => {
      if (idxCurrent >= 0 && row[idxCurrent]) phones.push(clean(row[idxCurrent]));
      if (idxPermanent >= 0 && row[idxPermanent]) phones.push(clean(row[idxPermanent]));
    });
    if (!phones.length) {
      p.rows.forEach(row => { if (row[1]) phones.push(clean(row[1])); });
    }
    const seen = new Set();
    const unique = [];
    phones.forEach(x => { if (x && !seen.has(x)) { seen.add(x); unique.push(x); } });
    return unique.join(", ");
  };

  const getChucDanh = (r) => getBasic(r, "Chức danh", "Chức vụ", "Vị trí", "Job Title", "Title");
  const getTenCongTy = (r) => getBasic(r, "Tên công ty", "Công ty", "Company", "Company Name", "Nơi làm việc");
  const getDiaChiCongTy = (r) => getBasic(r, "Địa chỉ công ty", "Địa chỉ cơ quan", "Company Address", "Địa chỉ nơi làm việc");

  const getCCCD = (r) => {
    const fromBasic = getBasic(r, "CMND/CCCD", "CCCD", "CMND", "Số CMND", "Số CCCD", "Identity Card", "ID Card");
    if (fromBasic) return fromBasic;
    const p = r._DATA?.phone;
    if (p && p.headers) {
      const headers = p.headers.map(h => normalize(h));
      const idx = headers.findIndex(h => h.includes("cccd") || h.includes("cmnd") || h.includes("ma hd") || h.includes("mã hđ"));
      if (idx >= 0 && p.rows[0] && p.rows[0][idx]) return clean(p.rows[0][idx]);
    }
    return "";
  };

  const getTinhTrang = (r) => {
    const g = normalize(r.GIN);
    if (g === "co" || g === "có") return "Có GIN";
    if (g === "khong" || g === "không") return "Không có GIN";
    if (g === "loi" || g === "lỗi") return "Lỗi truy vấn";
    return "Chưa xử lý";
  };

  async function exportXLSX() {
    const allRows = rows.map((r, i) => results[i] || { ...r, GIN: "", TRẠNG_THÁI: "Chưa xử lý", _DATA: null });
    if (!allRows.length) return alert("Chưa có dữ liệu.");
    const btn = $("ga25_export");
    btn.disabled = true; btn.textContent = "⏳ Đang tạo Excel...";

    try {
      await sleep(50);

      const tongAoA = [[
        "STT", "SHD", "Họ tên KH", "Ngày sinh", "Giới tính", "CCCD",
        "Địa chỉ", "SDT", "Chức danh", "Tên công ty", "Địa chỉ công ty",
        "Trạng thái đánh dấu", "Code", "CODE", "Note", "Tình trạng"
      ]];
      allRows.forEach((r, i) => {
        const meta = shdMeta.get(String(r.SHD)) || { status: "", code: "", note: "" };
        tongAoA.push([
          i + 1,
          r.SHD || "",
          getTenKH(r),
          getBasic(r, "Ngày sinh", "DOB", "Date of Birth"),
          getBasic(r, "Giới tính", "Gender", "Sex"),
          getCCCD(r),
          getBasic(r, "Địa chỉ", "Address", "Địa chỉ thường trú", "Địa chỉ hiện tại"),
          getPhonesFromPhoneTable(r),
          getChucDanh(r),
          getTenCongTy(r),
          getDiaChiCongTy(r),
          getStatusLabel(meta),
          meta.code || "",
          meta.code ? meta.code.toUpperCase() : "",
          getExportNote(meta),
          getTinhTrang(r)
        ]);
      });
      const wsTong = XLSX.utils.aoa_to_sheet(tongAoA, { dense: true });

      const summaryAoA = [[
        "STT", "SHD", "Tên khách hàng", "GIN", "Ngày sinh", "Giới tính",
        "Địa chỉ", "Địa chỉ hộ khẩu", "Quê quán", "Ngày bắt đầu làm",
        "SĐT chính", "Số lượng SĐT", "Số liên quan", "Số người tham chiếu",
        "Trạng thái đánh dấu", "Code", "CODE", "Note"
      ]];
      allRows.forEach((r, i) => {
        const d = r._DATA;
        const ten = getTenKH(r);
        const meta = shdMeta.get(String(r.SHD)) || { status: "", code: "", note: "" };
        if (!d) {
          summaryAoA.push([i + 1, r.SHD || "", ten, r.GIN || "", "", "", "", "", "", "", "", 0, 0, 0, getStatusLabel(meta), meta.code || "", meta.code ? meta.code.toUpperCase() : "", getExportNote(meta)]);
          return;
        }
        const basic = d.basic || {};
        const phoneRows = d.phone?.rows || [];
        const relatedRows = d.related?.rows || [];
        const refRows = d.extra?.nguoiThamChieu?.rows || [];
        summaryAoA.push([
          i + 1, r.SHD || "", ten, r.GIN || "",
          basic["Ngày sinh"] || "", basic["Giới tính"] || "",
          basic["Địa chỉ"] || "", basic["Địa chỉ hộ khẩu"] || "", basic["Quê quán"] || "", basic["Ngày bắt đầu làm"] || "",
          phoneRows[0]?.[1] || "", phoneRows.length, relatedRows.length, refRows.length,
          getStatusLabel(meta),
          meta.code || "",
          meta.code ? meta.code.toUpperCase() : "",
          getExportNote(meta)
        ]);
      });
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA, { dense: true });

      const basicAoA = [["STT", "SHD", "Tên khách hàng", "Ngày sinh", "Giới tính", "Địa chỉ", "Địa chỉ hộ khẩu", "Quê quán", "Ngày bắt đầu làm"]];
      allRows.forEach((r, i) => {
        const b = r._DATA?.basic || {};
        basicAoA.push([i + 1, r.SHD || "", getTenKH(r), b["Ngày sinh"] || "", b["Giới tính"] || "", b["Địa chỉ"] || "", b["Địa chỉ hộ khẩu"] || "", b["Quê quán"] || "", b["Ngày bắt đầu làm"] || ""]);
      });
      const wsBasic = XLSX.utils.aoa_to_sheet(basicAoA, { dense: true });

      const phoneAoA = [["STT", "SHD", "Tên khách hàng", "STT SĐT", "Số điện thoại", "Mã HĐ", "Remark"]];
      allRows.forEach((r, i) => {
        const p = r._DATA?.phone;
        const ten = getTenKH(r);
        if (!p || !p.rows.length) {
          phoneAoA.push([i + 1, r.SHD || "", ten, "", "", "", ""]);
          return;
        }
        p.rows.forEach((pr, j) => {
          phoneAoA.push([i + 1, r.SHD || "", j === 0 ? ten : "", pr[0] || "", pr[1] || "", pr[2] || "", pr[3] || ""]);
        });
      });
      const wsPhone = XLSX.utils.aoa_to_sheet(phoneAoA, { dense: true });

      const relAoA = [["STT", "SHD", "Tên khách hàng", "STT LQ", "Họ và tên", "Ngày sinh", "Giới tính", "Quan hệ", "Nơi sinh", "CMND/CCCD", "Địa chỉ", "SĐT", "Tên công ty", "Nơi làm việc"]];
      allRows.forEach((r, i) => {
        const rel = r._DATA?.related;
        const ten = getTenKH(r);
        if (!rel || !rel.rows.length) {
          relAoA.push([i + 1, r.SHD || "", ten, "", "", "", "", "", "", "", "", "", "", ""]);
          return;
        }
        rel.rows.forEach((rr, j) => {
          relAoA.push([i + 1, r.SHD || "", j === 0 ? ten : "", rr[0] || "", rr[1] || "", rr[2] || "", rr[3] || "", rr[4] || "", rr[5] || "", rr[6] || "", rr[7] || "", rr[8] || "", rr[9] || "", rr[10] || ""]);
        });
      });
      const wsRel = XLSX.utils.aoa_to_sheet(relAoA, { dense: true });

      const llAoA = [["STT", "SHD", "Tên khách hàng", "STT LL", "Số CMND/CCCD", "Loại SĐT", "Số điện thoại", "Cập nhật"]];
      allRows.forEach((r, i) => {
        const ll = r._DATA?.extra?.lienLac;
        const ten = getTenKH(r);
        if (!ll || !ll.rows.length) {
          llAoA.push([i + 1, r.SHD || "", ten, "", "", "", "", ""]);
          return;
        }
        ll.rows.forEach((x, j) => {
          llAoA.push([i + 1, r.SHD || "", j === 0 ? ten : "", x[0] || "", x[1] || "", x[2] || "", x[3] || "", x[4] || ""]);
        });
      });
      const wsLL = XLSX.utils.aoa_to_sheet(llAoA, { dense: true });

      const lhAoA = [["STT", "SHD", "Tên khách hàng", "STT LH", "CMND/CCCD", "Họ tên", "SĐT", "Loại"]];
      allRows.forEach((r, i) => {
        const lh = r._DATA?.extra?.luoiLienHe;
        const ten = getTenKH(r);
        if (!lh || !lh.rows.length) {
          lhAoA.push([i + 1, r.SHD || "", ten, "", "", "", "", ""]);
          return;
        }
        lh.rows.forEach((x, j) => {
          lhAoA.push([i + 1, r.SHD || "", j === 0 ? ten : "", x[0] || "", x[1] || "", x[2] || "", x[3] || "", x[4] || ""]);
        });
      });
      const wsLH = XLSX.utils.aoa_to_sheet(lhAoA, { dense: true });

      const dcAoA = [["STT", "SHD", "Tên khách hàng", "STT ĐC", "Số CMND/CCCD", "Loại địa chỉ", "Địa chỉ", "Cập nhật"]];
      allRows.forEach((r, i) => {
        const dc = r._DATA?.extra?.diaChi;
        const ten = getTenKH(r);
        if (!dc || !dc.rows.length) {
          dcAoA.push([i + 1, r.SHD || "", ten, "", "", "", "", ""]);
          return;
        }
        dc.rows.forEach((x, j) => {
          dcAoA.push([i + 1, r.SHD || "", j === 0 ? ten : "", x[0] || "", x[1] || "", x[2] || "", x[3] || "", x[4] || ""]);
        });
      });
      const wsDC = XLSX.utils.aoa_to_sheet(dcAoA, { dense: true });

      const ntAoA = [["STT", "SHD", "Tên khách hàng", "STT NTC", "Số CMND/CCCD", "Họ tên", "Quan hệ", "SĐT", "Cập nhật"]];
      allRows.forEach((r, i) => {
        const nt = r._DATA?.extra?.nguoiThamChieu;
        const ten = getTenKH(r);
        if (!nt || !nt.rows.length) {
          ntAoA.push([i + 1, r.SHD || "", ten, "", "", "", "", "", ""]);
          return;
        }
        nt.rows.forEach((x, j) => {
          ntAoA.push([i + 1, r.SHD || "", j === 0 ? ten : "", x[0] || "", x[1] || "", x[2] || "", x[3] || "", x[4] || "", x[5] || ""]);
        });
      });
      const wsNT = XLSX.utils.aoa_to_sheet(ntAoA, { dense: true });

      const autoWidth = (ws) => {
        if (!ws["!ref"]) return;
        const ref = XLSX.utils.decode_range(ws["!ref"]);
        const cols = [];
        for (let C = ref.s.c; C <= ref.e.c; C++) {
          let max = 10;
          for (let R = ref.s.r; R <= Math.min(ref.e.r, 100); R++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell && cell.v) max = Math.max(max, String(cell.v).length);
          }
          cols.push({ wch: Math.min(Math.max(max + 2, 12), 50) });
        }
        ws["!cols"] = cols;
      };
      [wsTong, wsSummary, wsBasic, wsPhone, wsRel, wsLL, wsLH, wsDC, wsNT].forEach(autoWidth);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsTong, "TONG");
      XLSX.utils.book_append_sheet(wb, wsSummary, "TONG HOP");
      XLSX.utils.book_append_sheet(wb, wsBasic, "THONG TIN CO BAN");
      XLSX.utils.book_append_sheet(wb, wsPhone, "THONG TIN SDT");
      XLSX.utils.book_append_sheet(wb, wsRel, "THONG TIN LIEN QUAN");
      XLSX.utils.book_append_sheet(wb, wsLL, "SO LIEN LAC");
      XLSX.utils.book_append_sheet(wb, wsLH, "LUOI LIEN HE");
      XLSX.utils.book_append_sheet(wb, wsDC, "DIA CHI");
      XLSX.utils.book_append_sheet(wb, wsNT, "NGUOI THAM CHIEU");

      const filename = `GIN_KET_QUA_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (typeof XLSX.writeFileXLSX === "function") XLSX.writeFileXLSX(wb, filename, { compression: true });
      else XLSX.writeFile(wb, filename, { bookType: "xlsx", compression: true });

      log(`XUẤT EXCEL THÀNH CÔNG — 9 sheets (Code thường + CODE hoa + Note)`, "ga25_ok");
      setStatus(`Đã xuất Excel — 9 sheets`);
    } catch (e) {
      console.error(e);
      log(`XUẤT EXCEL LỖI: ${e.message}`, "ga25_error");
      alert("Lỗi xuất Excel:\n\n" + e.message);
    } finally {
      btn.disabled = false; btn.textContent = "↓ Xuất Excel (9 sheets)";
    }
  }

  function csvEscape(v) {
    const t = String(v ?? "");
    return /["\n\r,]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function exportCSV() {
    const allRows = rows.map((r, i) => results[i] || { ...r, GIN: "", TRẠNG_THÁI: "Chưa xử lý", _DATA: null });
    if (!allRows.length) return alert("Chưa có dữ liệu.");
    const headers = ["STT", "SHD", "Tên khách hàng", "GIN", "Ngày sinh", "Giới tính", "Địa chỉ", "Địa chỉ hộ khẩu", "Quê quán", "SĐT chính", "Số lượng SĐT", "Số liên quan", "Trạng thái đánh dấu", "Code", "CODE", "Note"];
    const lines = [headers.map(csvEscape).join(",")];
    allRows.forEach((r, i) => {
      const b = r._DATA?.basic || {};
      const p = r._DATA?.phone?.rows || [];
      const rel = r._DATA?.related?.rows || [];
      const meta = shdMeta.get(String(r.SHD)) || { status: "", code: "", note: "" };
      lines.push([i + 1, r.SHD || "", getTenKH(r), r.GIN || "", b["Ngày sinh"] || "", b["Giới tính"] || "", b["Địa chỉ"] || "", b["Địa chỉ hộ khẩu"] || "", b["Quê quán"] || "", p[0]?.[1] || "", p.length, rel.length, getStatusLabel(meta), meta.code || "", meta.code ? meta.code.toUpperCase() : "", getExportNote(meta)].map(csvEscape).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `GIN_KET_QUA_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    log(`ĐÃ XUẤT CSV — ${allRows.length} dòng`, "ga25_ok");
  }

  function exportMetaCSV() {
    const allRows = rows.map((r, i) => results[i] || { ...r, _DATA: null });
    if (!allRows.length) return alert("Chưa có dữ liệu.");

    const lines = ["SHD,Tên KH,Kết quả,Code,CODE,Note"];
    let filled = 0;
    allRows.forEach(r => {
      const meta = shdMeta.get(String(r.SHD)) || { status: "", code: "", note: "" };
      if (meta.status || meta.code || meta.note) filled++;
      const tenKH = getTenKH(r);
      const ketQua = getStatusLabel(meta);
      lines.push([r.SHD || "", tenKH, ketQua, meta.code || "", meta.code ? meta.code.toUpperCase() : "", getExportNote(meta)].map(csvEscape).join(","));
    });

    if (!filled) {
      if (!confirm("Chưa có SHD nào được đánh dấu. Vẫn xuất file trống?")) return;
    }

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GIN_SHD_TENKH_KETQUA_CODE_NOTE_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    log(`ĐÃ XUẤT SHD + TÊN KH + KẾT QUẢ + CODE + NOTE — ${filled}/${allRows.length} SHD có dữ liệu`, "ga25_ok");
    setStatus(`Đã xuất SHD + Tên KH + Kết quả + Code + Note (${filled} SHD)`);
  }

  function bindEvents() {
    $("ga25_file").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      try { await readExcel(f); } catch (err) { log(`Lỗi đọc Excel: ${err.message}`, "ga25_error"); alert("Không đọc được file:\n\n" + err.message); }
    });
    $("ga25_start").addEventListener("click", startProcessing);
    $("ga25_pause").addEventListener("click", pauseProcessing);
    $("ga25_expand").addEventListener("click", () => { if (isExpanded) { isExpanded = false; document.getElementById("__GINAUTO_V25_EXPANDED")?.remove(); } else openExpanded(); });
    $("ga25_export").addEventListener("click", exportXLSX);
    $("ga25_meta_export").addEventListener("click", exportMetaCSV);
    $("ga25_csv").addEventListener("click", exportCSV);
    $("ga25_reset").addEventListener("click", resetAll);
    $("ga25_close").addEventListener("click", () => {
      running = false; paused = true; stopRequested = true;
      if (uiTimer) clearInterval(uiTimer);
      if (activeTimer) clearInterval(activeTimer);
      document.getElementById("__GINAUTO_V25_UI")?.remove();
      document.getElementById("__GINAUTO_V25_STYLE")?.remove();
      document.getElementById("__GINAUTO_V25_EXPANDED")?.remove();
      document.getElementById("__ga25_toast")?.remove();
      document.getElementById("__ga25_qr_overlay")?.remove();
      window.__GIN_AUTO_FULL_V25__ = false;
    });
  }

  function restoreAfterReload() {
    try {
      const raw = localStorage.getItem(CONFIG.LS_ROWS_KEY);
      if (!raw) return false;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return false;

      rows = arr;
      results = new Array(rows.length);
      completed = 0; success = 0; notFound = 0; errors = 0;
      nextIndex = 0; active = 0;
      selectedRowIdx = 0;
      highlightPhone = ""; highlightName = "";

      updateUI(true);
      openExpanded();

      log(`↺ Đã khôi phục ${rows.length} SHD sau F5.`, "ga25_ok");
      log(`Code/Note đã chọn trước đó vẫn được giữ (${shdMeta.size} SHD có meta).`, "ga25_info");
      setStatus(`Đã khôi phục ${rows.length} SHD — Code/Note cũ vẫn còn. Bấm ▶ Bắt đầu để cào lại.`);
      return true;
    } catch (e) {
      console.warn("restoreAfterReload:", e);
      return false;
    }
  }

  window.addEventListener("beforeunload", (e) => {
    const hasResults = results.some(r => r && r._DATA);
    if (running || active > 0 || hasResults || shdMeta.size > 0 || rows.length > 0) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });

  createUI();
  try {
    await loadLibs();
    log("Thư viện Excel và QR đã sẵn sàng.", "ga25_ok");
  } catch (err) {
    log(err.message, "ga25_error");
    alert("Không tải được thư viện:\n\n" + err.message);
    return;
  }
  bindEvents();

  const restored = restoreAfterReload();
  if (!restored) {
    log("GIN AUTO FULL V26 đã sẵn sàng.", "ga25_ok");
    log("Tính năng mới: 📞 hiện QR + chọn Code + nhập nội dung + chèn nhanh vào Note.", "ga25_info");
    if (shdMeta.size > 0) {
      log(`Đã tải ${shdMeta.size} SHD có Code/Note từ lần trước — chọn lại file Excel để xem.`, "ga25_info");
    }
  }

  updateUI(true);
  renderActive(true);
})();
