(async () => {
  if (window.__UNIFIED_DEBT_V1__) {
    alert("Tool đang chạy!");
    return;
  }
  window.__UNIFIED_DEBT_V1__ = true;

  const CONFIG = {
    CONCURRENT: 20,
    DELAY: 80,
    TIMEOUT: 35000,
    SEARCH_TIMEOUT: 35000,
    FORM_TIMEOUT: 25000,
    VERIFY_TIMEOUT: 6000,
    MAX_RETRY: 2,
    RETRY_WAIT: 2000,
    MAX_CONCURRENT: 100,
    MAX_PARALLEL_SAFE: 20,
    BATCH_WAIT: 400,
    XLSX_CDN: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    SEARCH_TIMEOUT_BY_TAB: { LOAN: 35000, CRC: 40000, VPB: 40000 },
    LOAD_TIMEOUT_BY_TAB:   { LOAN: 40000, CRC: 45000, VPB: 45000 },
    AJAX_WAIT_BY_TAB:      { LOAN: 400,   CRC: 800,   VPB: 800   },
    ADAPTIVE: {
      ENABLED: true,
      TIMEOUT_THRESHOLD: 3,
      SUCCESS_THRESHOLD: 2,
      MIN_BATCH: 15,
      MAX_BATCH: 25,
      MIN_WAIT: 200,
      MAX_WAIT: 1000
    },
    LOG_THROTTLE: 20
  };

  const BASE = location.origin + location.pathname;
  let mode = "list";
  let rows = [], results = [];
  let running = false, paused = false, stopRequested = false;
  let completed = 0, success = 0, notFound = 0, errors = 0, active = 0;
  let pendingQueue = [], retryQueue = [];
  let queueLock = false;
  let actionCode = "6";
  let noteText = "Không nhắc máy";
  let keepCallToType = "6";
  let keepNote = "";
  let lemNote = "Để lại lời nhắn cho người thân";
  let uiTimer = null;
  let activePages = ["loan", "crc", "vpb"];
  let round = 0;
  let previewFilter = "all";
  let previewSearch = "";
  let expandedRow = null;
  let selectedRowIdx = null;
  let isExpanded = false;
  let currentBatch = 0;
  let totalBatches = 0;
  let dynamicBatchSize = CONFIG.MAX_PARALLEL_SAFE;
  let dynamicBatchWait = CONFIG.BATCH_WAIT;
  let consecutiveCleanBatches = 0;
  let logCounter = 0;
  // Lưu text đã chỉnh sửa theo idx, để khi render lại không mất
  const zaloEdits = new Map();

  const CALL_STATUS_LIST = [
    { value: "1",  code: "TER",   label: "TER - Thanh lý hợp đồng" },
    { value: "2",  code: "PTP",   label: "PTP - Hứa thanh toán, thanh toán theo kỳ" },
    { value: "22", code: "RTP",   label: "RTP - Từ chối đóng tiền / Lừa đảo / Không phải KH" },
    { value: "6",  code: "NKP",   label: "NKP - Không nhấc máy, máy bận, hộp thư thoại" },
    { value: "7",  code: "NCP",   label: "NCP - Không phải số KH / số người thân khác" },
    { value: "8",  code: "NAB",   label: "NAB - Số không liên lạc được / không tồn tại" },
    { value: "9",  code: "LEM",   label: "LEM - Để lại lời nhắn cho người thân" },
    { value: "23", code: "HUP",   label: "HUP - Cúp máy ngang" },
    { value: "14", code: "CAB",   label: "CAB - Gọi lại" },
    { value: "15", code: "WFP",   label: "WFP - KH báo đã thanh toán (treo hệ thống)" },
    { value: "25", code: "DIF",   label: "DIF - KH thông báo khó khăn tài chính" },
    { value: "29", code: "WFP2",  label: "WFP - Người nghe báo đã thanh toán" },
    { value: "32", code: "SPC",   label: "SPC - KH mất / đi tù / cai nghiện / tâm thần" },
    { value: "33", code: "LITI",  label: "LITI - Cần hỗ trợ giấy tờ pháp lý" },
    { value: "34", code: "SKIP_1",label: "SKIP_1 - Xác minh trong hệ thống" },
    { value: "35", code: "SKIP_0",label: "SKIP_0 - Xác minh ngoài hệ thống" },
    { value: "36", code: "KEEP",  label: "KEEP - Xác minh ngoài hệ thống (giữ)" },
    { value: "37", code: "RPTP",  label: "RPTP - Nhắc lại lời hứa thanh toán" },
    { value: "39", code: "DNC",   label: "DNC - KH/người thân không đồng ý gọi" },
    { value: "40", code: "CFA",   label: "CFA - KH thách thức chuyển kiện" }
  ];

  const CALL_TO_TYPE_LIST = [
    { value: "6",  label: "CLIENT - Khách hàng" },
    { value: "14", label: "SPOUSE - Vợ/Chồng" },
    { value: "11", label: "FATHER - Cha" },
    { value: "10", label: "MOTHER - Mẹ" },
    { value: "5",  label: "SISTER - Chị/em gái" },
    { value: "4",  label: "BROTHER - Anh/em trai" },
    { value: "3",  label: "CHILD - Con" },
    { value: "7",  label: "OTHER - Bạn bè, đồng nghiệp, hàng xóm" },
    { value: "9",  label: "UNCLE - Người thân khác" },
    { value: "12", label: "OWNER - Khách hàng/Chủ hợp đồng" }
  ];

  const CODE_ALIASES = {
    "1":"1","2":"2","3":"3","4":"4","5":"5","6":"6","7":"7","8":"8","9":"9",
    "10":"10","11":"11","12":"12","14":"14","15":"15","22":"22","23":"23",
    "25":"25","29":"29","32":"32","33":"33","34":"34","35":"35","36":"36",
    "37":"37","39":"39","40":"40",
    "TER":"1","PTP":"2","RTP":"22","NKP":"6","NCP":"7","NAB":"8","NAP":"8","LEM":"9",
    "HUP":"23","CAB":"14","WFP":"15","DIF":"25","SPC":"32","LITI":"33",
    "SKIP_1":"34","SKIP1":"34","SKIP-1":"34","SKIP 1":"34",
    "SKIP_0":"35","SKIP0":"35","SKIP-0":"35","SKIP 0":"35",
    "KEEP":"36","RPTP":"37","DNC":"39","CFA":"40",
    "NP":"6","KNP":"6","KNM":"6","KLL":"8","KLH":"8","NPK":"7",
    "CALLBACK":"14","GOILAI":"14","HANGUP":"23","CUPMAY":"23",
    "LEFMSG":"9","NHAN":"9","PAY":"2","PROMISE":"2","REFUSE":"22","TUChoi":"22"
  };

  function parseCodeFromCell(rawVal) {
    if (rawVal === undefined || rawVal === null) return { code: null, raw: "" };
    const raw = String(rawVal).trim();
    if (!raw) return { code: null, raw: "" };
    let s = raw.toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[()（）]/g, " ").replace(/[.,;:_\-]+/g, " ")
      .replace(/\s+/g, " ").trim();
    if (/^\d+$/.test(s)) {
      if (CODE_ALIASES[s]) return { code: CODE_ALIASES[s], raw };
      return { code: null, raw };
    }
    const firstToken = s.split(" ")[0];
    if (CODE_ALIASES[firstToken]) return { code: CODE_ALIASES[firstToken], raw };
    const tokens = s.split(" ");
    if (tokens.length >= 2) {
      const combo = tokens[0] + "_" + tokens[1];
      if (CODE_ALIASES[combo]) return { code: CODE_ALIASES[combo], raw };
      const combo2 = tokens[0] + tokens[1];
      if (CODE_ALIASES[combo2]) return { code: CODE_ALIASES[combo2], raw };
    }
    const sortedKeys = Object.keys(CODE_ALIASES).filter(k => !/^\d+$/.test(k)).sort((a, b) => b.length - a.length);
    for (const k of sortedKeys) {
      const pat = k.replace(/_/g, "[_ ]?");
      const re = new RegExp(`(^|[^A-Z0-9])${pat}([^A-Z0-9]|$)`);
      if (re.test(s)) return { code: CODE_ALIASES[k], raw };
    }
    const numMatch = s.match(/\b(1|2|6|7|8|9|10|11|12|14|15|22|23|25|29|32|33|34|35|36|37|39|40)\b/);
    if (numMatch && CODE_ALIASES[numMatch[1]]) return { code: CODE_ALIASES[numMatch[1]], raw };
    return { code: null, raw };
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const normalize = v => clean(v).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:_-]+/g, " ").replace(/\s+/g, " ").trim();

  function isMoneyValue(val) {
    if (val === undefined || val === null) return false;
    const s = String(val).trim();
    if (!s) return false;
    const core = s.replace(/\s*(đ|Đ|vnđ|VNĐ|vnd|VND)\s*$/i, "").trim();
    if (!core) return false;
    const digits = core.replace(/[^\d]/g, "");
    if (digits.length < 4) return false;
    if (!/^[\d.,\s]+$/.test(core)) return false;
    return true;
  }

  function formatMoney(val) {
    if (val === undefined || val === null) return val;
    const s = String(val).trim();
    if (!s) return s;
    if (/[đĐ]\s*$/.test(s) || /(vnđ|vnd)\s*$/i.test(s)) return s;
    return s + "đ";
  }

  function fmtMoneyForZalo(val) {
    if (val === undefined || val === null) return "…";
    const s = String(val).trim();
    if (!s || s === "…") return "…";
    if (isMoneyValue(s)) return formatMoney(s);
    return s;
  }

  const VN_NAME_RE = /^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ][A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴa-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+(\s+[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴa-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+){1,5}$/;

  function looksLikeVNName(s) {
    if (!s) return false;
    const t = clean(s);
    if (t.length < 5 || t.length > 60) return false;
    if (/\d/.test(t)) return false;
    if (/[^\p{L}\s.'-]/u.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    return VN_NAME_RE.test(t);
  }

  function cleanName(s) {
    if (!s) return "";
    let t = clean(s);
    t = t.replace(/^[\s\-–—:•*©®™]+/, "").replace(/[\s\-–—:•*©®™✆☎📞📱]+$/, "");
    t = t.replace(/\s{2,}/g, " ").trim();
    return t;
  }

  const HIGHLIGHT_FIELDS = {
    "so tien vay": "color:#dc3545;font-weight:700",
    "so tien cho vay": "color:#dc3545;font-weight:700",
    "so tien giai ngan": "color:#dc3545;font-weight:700",
    "giai ngan": "color:#dc3545;font-weight:700",
    "du no goc": "color:#dc3545;font-weight:700",
    "goc con lai": "color:#dc3545;font-weight:700",
    "tong tien tra": "color:#198754;font-weight:700",
    "tong so tien phai tra": "color:#198754;font-weight:700",
    "tong du no": "color:#198754;font-weight:700",
    "ten": "color:#dc3545;font-weight:700",
    "ten kh": "color:#dc3545;font-weight:700",
    "ten khach hang": "color:#dc3545;font-weight:700",
    "ho ten": "color:#dc3545;font-weight:700",
    "ho va ten": "color:#dc3545;font-weight:700"
  };

  function highlightValue(key, value) {
    const n = normalize(key);
    if (HIGHLIGHT_FIELDS[n]) return `<span style="${HIGHLIGHT_FIELDS[n]}">${value}</span>`;
    if (/(so tien vay|so tien cho vay|so tien giai ngan|giai ngan|du no goc|goc con lai)/.test(n)) {
      return `<span style="color:#dc3545;font-weight:700">${value}</span>`;
    }
    if (/(tong tien tra|tong so tien phai tra|tong du no|so tien phai tra)/.test(n)) {
      return `<span style="color:#198754;font-weight:700">${value}</span>`;
    }
    if (/^(ten|ho ten|ho va ten)\b/.test(n)) {
      return `<span style="color:#dc3545;font-weight:700">${value}</span>`;
    }
    return value;
  }

  function getTenFromResult(res) {
    if (!res) return "";
    const keys = ["Tên", "Tên KH", "Tên khách hàng", "Tên khách hàng vay",
      "Tên chủ hợp đồng", "Tên người vay", "Họ tên", "Họ và tên",
      "Họ tên KH", "Họ tên khách hàng", "_TEN_KH"];
    for (const k of keys) {
      if (res[k] !== undefined && String(res[k]).trim()) return cleanName(res[k]);
    }
    return "";
  }

  function shortTen(ten, max = 22) {
    if (!ten) return "";
    return ten.length > max ? ten.slice(0, max - 1) + "…" : ten;
  }

  // ===================== TEMPLATE TIN NHẮN ZALO =====================
  function buildZaloMessage(res, shdFallback = "") {
    if (!res) res = {};
    const shd    = clean(res.SHD || shdFallback);
    const ten    = getTenFromResult(res) || "…";
    const tienVayRaw = res["Số tiền vay"] || res["Số tiền cho vay"] || res["Số tiền giải ngân"] || "";
    const ngayTT     = res["Ngày tt gần nhất"] || res["Ngày thanh toán gần nhất"] || "…";
    const tienKyRaw  = res["Tiền kỳ tt"] || res["Số tiền thanh toán gần nhất"] || "";
    const kyHan      = res["Kỳ hạn vay"] || "…";
    const tongTraRaw = res["Tổng tiền trả"] || res["Tổng số tiền phải trả"] || "";
    const tongKy     = res["Tổng kỳ tt"] || "…";

    const tienVay = fmtMoneyForZalo(tienVayRaw);
    const tienKy  = fmtMoneyForZalo(tienKyRaw);
    const tongTra = fmtMoneyForZalo(tongTraRaw);

    return (
`Năm .... chị có mở hợp đồng vay bên phía công ty tài chình FE CREDIT.
SHD:  ${shd} ${ten}
Số tiền vay: \t\t${tienVay}
Ngày tt gần nhất:\t${ngayTT}
Tiền kỳ tt:\t\t${tienKy}
Kỳ hạn vay:\t\t${kyHan}
Tổng tiền trả:\t\t${tongTra}
Tổng kỳ tt: \t${tongKy}
Do hợp đồng quá hạn nghiêm trọng nên phía công ty tài chính FE CREDIT đã bán nợ qua cho công ty Galaxy DT để xử lý và truy thu.
Hiện tại hợp đồng của anh đã quá hạn nên tổng nợ gốc và lãi phạt tính đến thời điểm hiện tại là: ...`
    );
  }

  // Lấy nội dung để copy: nếu user đã sửa thì lấy bản sửa, chưa thì build
  function getZaloTextForCopy(idx) {
    if (zaloEdits.has(idx)) {
      const edited = zaloEdits.get(idx);
      if (edited !== undefined && edited !== null) return edited;
    }
    const res = results[idx];
    const shd = rows[idx]?.SHD || "";
    return buildZaloMessage(res, shd);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch { return false; }
    }
  }

  function buildZaloActions(res, idx, shdFallback = "") {
    // Nếu user đã sửa thì dùng bản sửa, chưa thì build mới
    const initialText = zaloEdits.has(idx)
      ? zaloEdits.get(idx)
      : buildZaloMessage(res, shdFallback);
    const uid = "__zalo_" + idx;
    const escaped = String(initialText)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    return `
      <div style="display:flex;gap:6px;align-items:center;margin:4px 0 8px 0;flex-wrap:wrap">
        <button type="button" class="zalo-btn zalo-toggle" data-target="${uid}"
          style="padding:3px 9px;font-size:11px;font-weight:600;border:1px solid #0d6efd;background:#fff;color:#0d6efd;border-radius:5px;cursor:pointer">
          📄 Xem trước
        </button>
        <button type="button" class="zalo-btn zalo-copy" data-idx="${idx}"
          style="padding:3px 9px;font-size:11px;font-weight:600;border:1px solid #198754;background:#198754;color:#fff;border-radius:5px;cursor:pointer">
          📋 Copy Zalo
        </button>
        <button type="button" class="zalo-btn zalo-reset" data-idx="${idx}" data-target="${uid}"
          style="padding:3px 9px;font-size:11px;font-weight:600;border:1px solid #6c757d;background:#fff;color:#6c757d;border-radius:5px;cursor:pointer"
          title="Khôi phục nội dung gốc (bỏ mọi chỉnh sửa)">
          ↺ Gốc
        </button>
        <span class="zalo-feedback" style="font-size:10.5px;color:#198754;display:none">✅ Đã copy!</span>
      </div>
      <div id="${uid}" style="display:none;background:#fff8e1;border:1px dashed #ffc107;border-radius:6px;
        padding:0;margin-bottom:8px;overflow:hidden">
        <textarea class="zalo-textarea" data-idx="${idx}"
          spellcheck="false"
          style="width:100%;min-height:180px;max-height:320px;padding:8px 10px;border:0;outline:none;resize:vertical;
          font-family:Consolas,Monaco,monospace;font-size:11px;line-height:1.5;background:#fff8e1;color:#212529;
          white-space:pre-wrap;word-break:break-word;display:block">${escaped}</textarea>
        <div style="padding:3px 8px;background:#ffc10733;font-size:10px;color:#856404;border-top:1px dashed #ffc107">
          ✏️ Có thể sửa trực tiếp · Nút "Copy Zalo" sẽ copy đúng nội dung trong ô này
        </div>
      </div>
    `;
  }

  function bindZaloActions(container, resultsRef, rowsRef) {
    if (!container) return;
    container.querySelectorAll(".zalo-toggle").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const open = target.style.display !== "none";
        target.style.display = open ? "none" : "block";
        btn.textContent = open ? "📄 Xem trước" : "📄 Ẩn";
        // Khi mở, focus vào textarea để user sửa ngay
        if (!open) {
          const ta = target.querySelector(".zalo-textarea");
          if (ta) setTimeout(() => ta.focus(), 50);
        }
      };
    });

    // Ghi nhận mọi thay đổi vào zaloEdits
    container.querySelectorAll(".zalo-textarea").forEach(ta => {
      ta.addEventListener("input", () => {
        const idx = parseInt(ta.dataset.idx);
        zaloEdits.set(idx, ta.value);
      });
      // Ngăn click lan ra row (tránh toggle expand khi đang sửa)
      ta.addEventListener("click", (e) => e.stopPropagation());
    });

    container.querySelectorAll(".zalo-copy").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        // Ưu tiên nội dung đang hiển thị trong textarea (kể cả chưa input event)
        const wrap = btn.closest(".row-detail, .detail-section") || document;
        const ta = wrap.querySelector(`.zalo-textarea[data-idx="${idx}"]`);
        let msg;
        if (ta) {
          msg = ta.value;
          zaloEdits.set(idx, msg);
        } else {
          msg = getZaloTextForCopy(idx);
        }
        const ok = await copyToClipboard(msg);
        const fb = btn.parentElement?.querySelector(".zalo-feedback");
        if (fb) {
          fb.textContent = ok ? "✅ Đã copy!" : "❌ Copy lỗi";
          fb.style.color = ok ? "#198754" : "#dc3545";
          fb.style.display = "inline";
          clearTimeout(fb._t);
          fb._t = setTimeout(() => { fb.style.display = "none"; }, 1800);
        }
      };
    });

    container.querySelectorAll(".zalo-reset").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        const target = document.getElementById(btn.dataset.target);
        zaloEdits.delete(idx);
        const res = resultsRef[idx];
        const shd = rowsRef?.[idx]?.SHD || "";
        const fresh = buildZaloMessage(res, shd);
        if (target) {
          const ta = target.querySelector(".zalo-textarea");
          if (ta) ta.value = fresh;
        }
        const fb = btn.parentElement?.querySelector(".zalo-feedback");
        if (fb) {
          fb.textContent = "↺ Đã khôi phục gốc";
          fb.style.color = "#6c757d";
          fb.style.display = "inline";
          clearTimeout(fb._t);
          fb._t = setTimeout(() => { fb.style.display = "none"; }, 1500);
        }
      };
    });
  }

  const iframes = [];
  const iframeTab = new Map();

  function createIframes(n) {
    document.querySelectorAll('[id^="__uni_fr_"]').forEach(el => el.remove());
    iframes.length = 0;
    iframeTab.clear();
    for (let i = 0; i < n; i++) {
      const fr = document.createElement("iframe");
      fr.id = "__uni_fr_" + i;
      fr.style.cssText = "position:fixed;left:-9999px;top:0;width:1300px;height:1000px;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(fr);
      iframes.push(fr);
    }
  }
  createIframes(CONFIG.CONCURRENT);

  const searchFrame = (() => {
    let fr = document.getElementById("__uni_search_fr");
    if (!fr) {
      fr = document.createElement("iframe");
      fr.id = "__uni_search_fr";
      fr.style.cssText = "position:fixed;left:-9999px;top:0;width:1400px;height:1100px;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(fr);
    }
    return fr;
  })();

  function idoc(fr) {
    try { return fr.contentDocument || fr.contentWindow?.document; } catch { return null; }
  }

  function loadUrl(fr, url, timeout = CONFIG.TIMEOUT) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout load")), timeout);
      fr.onload = () => { clearTimeout(t); setTimeout(resolve, 150); };
      fr.onerror = () => { clearTimeout(t); reject(new Error("Load iframe lỗi")); };
      fr.src = url;
    });
  }

  async function loadUrlIfNeeded(fr, url, tabName, forceReload = false) {
    const currentTab = iframeTab.get(fr.id);
    if (!forceReload && currentTab === tabName) {
      const doc = idoc(fr);
      if (doc && doc.body) {
        const input = findSearchInput(doc);
        if (input) { input.value = ""; triggerChange(input); }
        try { fr.contentWindow.scrollTo(0, 0); } catch {}
      }
      return;
    }
    const timeout = CONFIG.LOAD_TIMEOUT_BY_TAB[tabName] || CONFIG.TIMEOUT;
    await loadUrl(fr, url, timeout);
    iframeTab.set(fr.id, tabName);
  }

  async function waitFor(fr, fn, timeout = 12000, interval = 120) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (fn(idoc(fr), fr)) return true; } catch {}
      await sleep(interval);
    }
    return false;
  }

  function getTargetType(shd) {
    const s = clean(shd).toUpperCase().trim();
    if (/^LD/.test(s)) return "VPB";
    if (/^\d{6,}-\d+/.test(s) || s.includes("-")) return "LOAN";
    return "CRC";
  }

  function getTargetInfo(shd) {
    const t = getTargetType(shd);
    if (t === "VPB") return { url: BASE + "?page=customerVpb", name: "VPB" };
    if (t === "LOAN") return { url: BASE + "?page=customerLoan&offset=0", name: "LOAN" };
    return { url: BASE + "?page=customerCrc", name: "CRC" };
  }

  function findActionDoc(fr) {
    const visited = new Set();
    function search(doc, depth) {
      if (!doc || depth > 8 || visited.has(doc)) return null;
      visited.add(doc);
      try {
        let form = doc.querySelector?.('form#customerActionForm');
        if (!form) {
          const forms = [...(doc.querySelectorAll?.('form') || [])];
          form = forms.find(f => f.querySelector('select[name="callStatus"]') && f.querySelector('textarea[name="callNote"]'));
        }
        if (form && form.querySelector('select[name="callStatus"]') && form.querySelector('textarea[name="callNote"]')) return doc;
      } catch {}
      try {
        const frames = [...(doc.querySelectorAll?.('iframe, frame') || [])];
        for (const f of frames) {
          try {
            const d2 = f.contentDocument || f.contentWindow?.document;
            const found = search(d2, depth + 1);
            if (found) return found;
          } catch {}
        }
      } catch {}
      return null;
    }
    return search(idoc(fr), 0);
  }

  function findSearchInput(doc) {
    if (!doc) return null;
    return doc.querySelector('form#data_source_list_form input[name="appID"]')
      || doc.querySelector('input[name="appID"]')
      || doc.querySelector('input[name="shd"]')
      || doc.querySelector('input[name="contractNo"]')
      || doc.querySelector('input[name="contract_no"]')
      || doc.querySelector('input[name="soHD"]')
      || doc.querySelector('input[name="so_hd"]')
      || doc.querySelector('input[name="keyword"]')
      || doc.querySelector('input[name="key"]')
      || doc.querySelector('form#data_source_list_form input[type="text"]')
      || doc.querySelector('form input[type="text"]');
  }

  function findSearchButton(doc) {
    if (!doc) return null;
    const cands = [...doc.querySelectorAll('input[type="submit"], input[type="button"], button')];
    return cands.find(b => {
      const v = (b.value || b.textContent || "").trim();
      return /tìm|tim|search/i.test(v) && !/lưu|luu|save/i.test(v);
    }) || doc.querySelector('input[name="cmd_search"]');
  }

  function findSaveButton(doc) {
    if (!doc) return null;
    const cands = [...doc.querySelectorAll('input[type="submit"], input[type="button"], button, a[onclick]')];
    let btn = cands.find(b => /lưu|luu|save/i.test((b.value || b.textContent || "").trim()));
    if (btn) return btn;
    return [...doc.querySelectorAll('input[name="cmd_search"]')].find(b => /lưu|luu/i.test(b.value || "")) || null;
  }

  function triggerChange(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      const win = el.ownerDocument.defaultView;
      if (win?.jQuery) win.jQuery(el).trigger("change").trigger("input").trigger("blur");
    } catch {}
  }

  function extractCustomerName(doc) {
    if (!doc) return "";

    const labelRe = /^(tên(\s+kh|\s+khách\s+hàng|\s+chủ\s+hợp\s+đồng|\s+người\s+vay)?|họ\s+tên|họ\s+và\s+tên|customer\s+name|full\s*name)\s*[:：]?\s*$/i;
    const allRows = [...doc.querySelectorAll('tr')];
    for (const tr of allRows) {
      const cells = [...tr.querySelectorAll('td, th')];
      if (cells.length < 2) continue;
      const label = clean(cells[0].innerText || cells[0].textContent);
      if (!labelRe.test(label)) continue;
      for (let i = 1; i < cells.length; i++) {
        const v = cleanName(cells[i].innerText || cells[i].textContent);
        if (v && looksLikeVNName(v)) return v;
        const inp = cells[i].querySelector('input');
        if (inp && inp.value) {
          const iv = cleanName(inp.value);
          if (iv && looksLikeVNName(iv)) return iv;
        }
      }
    }

    const nameEls = [...doc.querySelectorAll('[class*="ten" i], [id*="ten" i], [class*="name" i], [id*="name" i], [class*="customer" i], [id*="customer" i]')];
    for (const el of nameEls) {
      if (el.querySelector('input, select, textarea, button')) continue;
      const t = cleanName(el.innerText || el.textContent);
      if (t && looksLikeVNName(t)) return t;
    }

    const shdCells = [...doc.querySelectorAll('td')];
    for (const td of shdCells) {
      const txt = clean(td.textContent);
      if (!/^[\d\-]+\s*[✆☎📞📱]?$/i.test(txt.replace(/[✆☎📞📱]/g, "").trim())) continue;
      if (!/\d{6,}/.test(txt)) continue;
      const next = td.nextElementSibling;
      if (next) {
        const v = cleanName(next.innerText || next.textContent);
        if (v && looksLikeVNName(v)) return v;
      }
    }

    const candidates = [...doc.querySelectorAll('td, div, span, h1, h2, h3, h4, b, strong')];
    const scored = [];
    for (const el of candidates) {
      if (el.querySelector('td, div, span, input, select, textarea, button')) continue;
      const t = cleanName(el.innerText || el.textContent);
      if (!looksLikeVNName(t)) continue;
      const isUpper = t === t.toUpperCase() && /[A-ZÀ-Ỹ]/.test(t);
      scored.push({ t, isUpper, len: t.length });
    }
    if (scored.length) {
      scored.sort((a, b) => {
        if (a.isUpper !== b.isUpper) return a.isUpper ? -1 : 1;
        const wa = a.t.split(/\s+/).length, wb = b.t.split(/\s+/).length;
        const scoreA = Math.abs(wa - 3) * 10 + a.len;
        const scoreB = Math.abs(wb - 3) * 10 + b.len;
        return scoreA - scoreB;
      });
      return scored[0].t;
    }
    return "";
  }

  const BLACKLIST_KEYS = new Set([
    "actioncode","action code","action code *","action","code",
    "bộ phận","bo phan","department","select 1 department","chọn 1 department",
    "worklist","work list","priority group","priority",
    "số hđ","so hd","tên","ten",
    "mối quan hệ","moi quan he","mối quan hệ *","relationship",
    "tl đánh giá","tl danh gia","mức độ thiện chí","muc do thien chi",
    "- chọn -","- chon -","lựa chọn mqh","lua chon mqh","select a group of priority",
    "stt","#","download","upload","chọn","select"
  ]);

  function looksLikeOptionList(val) {
    if (!val) return false;
    if (val.length > 100) return true;
    const parens = (val.match(/\(/g) || []).length;
    if (parens >= 3) return true;
    const optionHints = /(thanh lý hợp đồng|hứa thanh toán|không nhấc máy|không phải số|số không liên lạc|để lại lời nhắn|cúp máy ngang|gọi lại|khó khăn tài chính|xác minh thông tin|nhắc lại lời hứa|không đồng ý|thách thức chuyển|client -|spouse -|father -|mother -|sister -|brother -|child -|other -|uncle -|owner -|department|worklist|priority group|slap)/i;
    if (optionHints.test(val)) return true;
    return false;
  }

  function looksLikeFormLabel(key) {
    if (!key) return true;
    const n = normalize(key);
    if (n.length > 60) return true;
    if (/^(select|chọn|- chọn -|lựa chọn)/.test(n)) return true;
    if (/^[0-9\s]+$/.test(n)) return true;
    if (/^(t-?\d+|slap\s*\d+|lan\s*\d+|seg\s*\d+)$/i.test(n)) return true;
    if (/(department|worklist|priority|mức độ|thien chi|tl danh gia)/.test(n)) return true;
    return false;
  }

  function parseInfoTables(doc) {
    const out = {};
    if (!doc) return out;

    const tables = [...doc.querySelectorAll('table.bright_blue_body')];
    tables.forEach(table => {
      if (table.querySelector('select, option, textarea, input')) return;
      const rowsEl = [...table.querySelectorAll('tr')];
      rowsEl.forEach(tr => {
        const cells = [...tr.querySelectorAll('td')];
        if (cells.length < 2) return;
        const key = clean(cells[0].innerText || cells[0].textContent);
        const val = clean(cells[1].innerText || cells[1].textContent);
        if (!key || !val) return;
        if (key.length > 80) return;
        const nKey = normalize(key);
        if (BLACKLIST_KEYS.has(nKey)) return;
        if (looksLikeFormLabel(key)) return;
        if (looksLikeOptionList(val)) return;
        if (val.length > 200) return;
        if (/[\u0000-\u001f]/.test(key) || /[\u0000-\u001f]/.test(val)) return;
        if (!out[key]) out[key] = val;
        else if (normalize(out[key]) !== normalize(val)) {
          const olds = String(out[key]).split(" / ").map(clean).filter(Boolean);
          if (!olds.some(x => normalize(x) === normalize(val))) out[key] = olds.concat(val).join(" / ");
        }
      });
    });

    const existingName = getTenFromResult(out);
    if (!existingName) {
      const found = extractCustomerName(doc);
      if (found) out["_TEN_KH"] = found;
    }

    return out;
  }

  function pickValidType(desired, available) {
    if (!available.length) return null;
    if (desired && available.includes(desired)) return desired;
    const priority = ["8", "12", "7", "6"];
    for (const v of priority) if (available.includes(v)) return v;
    return available[0];
  }

  function snapshotForm(fr) {
    try {
      const d = findActionDoc(fr);
      if (!d) return { hasForm: false, url: "", status: null, type: null, note: null, hash: 0, len: 0 };
      const ss = d.querySelector('select[name="callStatus"]');
      const ts = d.querySelector('select[name="callToType"]');
      const nt = d.querySelector('textarea[name="callNote"]');
      const body = (idoc(fr)?.body?.innerText || "");
      let hash = 0;
      for (let i = 0; i < body.length; i++) hash = (hash * 31 + body.charCodeAt(i)) | 0;
      let url = "";
      try { url = fr.contentWindow?.location?.href || ""; } catch {}
      return {
        hasForm: true, url,
        status: ss ? ss.value : null,
        type: ts ? ts.value : null,
        note: nt ? nt.value : null,
        hash, len: body.length
      };
    } catch {
      return { hasForm: false, url: "", status: null, type: null, note: null, hash: 0, len: 0 };
    }
  }

  async function verifySaveSuccess(fr, statusSel, oldUrl, beforeHTML, timeout = CONFIG.VERIFY_TIMEOUT, beforeSnap = null, expectedCode = null) {
    const start = Date.now();
    const initial = beforeSnap || snapshotForm(fr);
    while (Date.now() - start < timeout) {
      await sleep(250);
      const doc = idoc(fr);
      if (!doc) return { ok: true, reason: "iframe reload" };
      try {
        const curUrl = fr.contentWindow?.location?.href || "";
        if (oldUrl && curUrl && curUrl !== oldUrl) return { ok: true, reason: "url changed" };
      } catch {}
      const bodyText = (doc.body?.innerText || "").toLowerCase();
      const successKw = ["lưu thành công", "luu thanh cong", "cập nhật thành công",
        "cap nhat thanh cong", "successfully", "đã lưu", "da luu", "saved",
        "ghi nhận thành công", "ghi nhan thanh cong"];
      if (successKw.some(k => bodyText.includes(k))) return { ok: true, reason: "success text" };
      const failKw = ["lỗi", "loi ", "thất bại", "that bai", "không thể", "khong the",
        "invalid", "failed", "không hợp lệ", "khong hop le", "vui lòng chọn", "vui long chon"];
      const cur = snapshotForm(fr);
      if (cur.hasForm && (cur.hash !== initial.hash || cur.len !== initial.len)) {
        if (failKw.some(k => bodyText.includes(k))) return { ok: false, reason: "fail text" };
        return { ok: true, reason: "body changed" };
      }
      if (!cur.hasForm) return { ok: true, reason: "form gone" };
      if (expectedCode && cur.status && cur.status !== expectedCode) {
        return { ok: true, reason: `status changed ${expectedCode}->${cur.status}` };
      }
      if (cur.status === "" && cur.type === "") return { ok: true, reason: "form reset" };
    }
    return { ok: true, reason: "no fail signal (baseline v1.1)" };
  }

  async function saveAction(fr, shdLabel = "", overrideCode = null) {
    const code = overrideCode || actionCode;
    const hasForm = await waitFor(fr, () => !!findActionDoc(fr), CONFIG.FORM_TIMEOUT);
    if (!hasForm) { log(`${shdLabel} - Không thấy form action`, "err"); return { saved: false, reason: "no form" }; }
    await sleep(200);
    const doc = findActionDoc(fr);
    if (!doc) return { saved: false, reason: "no doc" };
    const win = doc.defaultView || fr.contentWindow;
    const form = doc.querySelector('form#customerActionForm')
      || [...doc.querySelectorAll('form')].find(f => f.querySelector('select[name="callStatus"]') && f.querySelector('textarea[name="callNote"]'));
    if (!form) { log(`${shdLabel} - Không có form`, "err"); return { saved: false, reason: "no form el" }; }

    const statusSel = form.querySelector('select[name="callStatus"]');
    if (!statusSel) { log(`${shdLabel} - Không có callStatus`, "err"); return { saved: false, reason: "no callStatus" }; }

    const statusOpts = [...statusSel.options].map(o => o.value).filter(Boolean);
    if (!statusOpts.includes(code)) {
      log(`${shdLabel} - Code ${code} không có trong callStatus [${statusOpts.join(",")}]`, "err");
      return { saved: false, reason: `code ${code} not in DOM` };
    }

    statusSel.value = code;
    triggerChange(statusSel);
    try { if (typeof win.callStatusChange === "function") win.callStatusChange(code); } catch {}
    await sleep(300);

    const typeSel = form.querySelector('select#callToTypeForm, select[name="callToType"]');
    if (typeSel) {
      const available = [...typeSel.options].map(o => o.value).filter(Boolean);
      let desired;
      if (code === "36") desired = keepCallToType;
      else if (code === "9") desired = keepCallToType || "14";
      else desired = "8";
      const finalVal = pickValidType(desired, available);
      if (finalVal) {
        typeSel.value = finalVal;
        triggerChange(typeSel);
        log(`${shdLabel} - type=${finalVal} (desired=${desired}, avail=[${available.join(",")}])`, "info");
      } else {
        log(`${shdLabel} - ⚠️ callToType rỗng (code=${code})`, "warn");
      }
    }
    await sleep(120);

    const noteEl = form.querySelector('textarea[name="callNote"]');
    if (noteEl) {
      let noteVal;
      if (code === "36") noteVal = keepNote || noteText;
      else if (code === "9") noteVal = lemNote || noteText;
      else noteVal = noteText;
      noteEl.value = noteVal;
      triggerChange(noteEl);
    }
    await sleep(120);

    if (statusSel.value !== code) {
      log(`${shdLabel} - Validate fail: callStatus=${statusSel.value} != ${code}`, "err");
      return { saved: false, reason: "validate status" };
    }
    if (typeSel && !typeSel.value) {
      log(`${shdLabel} - Validate fail: callToType rỗng`, "err");
      return { saved: false, reason: "validate type" };
    }

    const before = snapshotForm(fr);
    const saveBtn = findSaveButton(form) || findSaveButton(doc);
    if (!saveBtn) { log(`${shdLabel} - Không tìm thấy nút Lưu`, "err"); return { saved: false, reason: "no save btn" }; }

    let oldUrl = "";
    try { oldUrl = fr.contentWindow?.location?.href || ""; } catch {}
    const beforeHTML = (doc.body?.innerText || "").slice(0, 2000);

    let dialogMsg = null, dialogType = null;
    const origAlert = win.alert, origConfirm = win.confirm;
    win.alert = (msg) => { dialogMsg = msg; dialogType = "alert"; };
    win.confirm = (msg) => { dialogMsg = msg; dialogType = "confirm"; return true; };

    try {
      const onclickAttr = saveBtn.getAttribute("onclick");
      if (onclickAttr) win.eval(onclickAttr);
      if (typeof saveBtn.onclick === "function") saveBtn.onclick.call(saveBtn);
    } catch {}
    try { saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: win })); } catch {}
    try { saveBtn.click(); } catch {}

    await sleep(600);
    win.alert = origAlert; win.confirm = origConfirm;

    if (dialogType && dialogMsg) {
      const m = String(dialogMsg).toLowerCase();
      const isFail = /lỗi|loi |thất bại|that bai|không thể|khong the|invalid|error|failed|không hợp lệ|khong hop le/.test(m);
      const isSuccess = /thành công|thanh cong|success|đã lưu|da luu|ghi nhận|ghi nhan/.test(m);
      log(`${shdLabel} - [${dialogType}] ${dialogMsg}`, isFail ? "err" : isSuccess ? "ok" : "info");
      if (isFail) return { saved: false, reason: "alert: " + dialogMsg };
      if (isSuccess) {
        log(`${shdLabel} - ĐÃ LƯU (${code}) [alert success]`, "ok");
        return { saved: true, reason: "alert success" };
      }
    }

    const v = await verifySaveSuccess(fr, statusSel, oldUrl, beforeHTML, CONFIG.VERIFY_TIMEOUT, before, code);
    if (v.ok) {
      log(`${shdLabel} - ĐÃ LƯU (${code}) [${v.reason}]`, "ok");
      return { saved: true, reason: v.reason };
    }
    log(`${shdLabel} - LƯU THẤT BẠI (${code}) [${v.reason}]`, "err");
    return { saved: false, reason: v.reason };
  }

  async function processOneList(fr, row) {
    const shd = clean(row.SHD);
    const rowCode = row._CODE || null;
    const tInfo = getTargetInfo(shd);
    try {
      await loadUrlIfNeeded(fr, tInfo.url, tInfo.name);
      const doc = idoc(fr);
      const input = findSearchInput(doc);
      if (!input) throw new Error(`Không tìm thấy ô SHD [${tInfo.name}]`);
      input.value = shd;
      triggerChange(input);
      await sleep(80);
      const btn = findSearchButton(doc);
      if (!btn) throw new Error(`Không tìm thấy nút Tìm [${tInfo.name}]`);
      btn.click();
      const ajaxWait = CONFIG.AJAX_WAIT_BY_TAB[tInfo.name] || 400;
      await sleep(ajaxWait);
      const searchTimeout = CONFIG.SEARCH_TIMEOUT_BY_TAB[tInfo.name] || CONFIG.SEARCH_TIMEOUT;
      const found = await waitFor(fr, d => !!findActionDoc(fr) || !!findResultRow(d, shd), searchTimeout);
      if (!found) return { ...row, GIN: "khong", TRANG_THAI: `Timeout search [${tInfo.name}]`, "ĐÃ LƯU": "Không", _TIMEOUT: true };
      if (findActionDoc(fr)) {
        const data = parseInfoTables(idoc(fr));
        const saveRes = await saveAction(fr, `${shd} [${tInfo.name}]`, rowCode);
        return { ...row, ...data, GIN: "co", TRANG_THAI: "Đã tìm thấy",
          "ĐÃ LƯU": saveRes.saved ? "Có" : "Không", LY_DO: saveRes.reason, CODE_USED: rowCode || actionCode };
      }
      const doc2 = idoc(fr);
      const rowEl = findResultRow(doc2, shd);
      if (rowEl) {
        const onclickAttr = rowEl.getAttribute("onclick");
        const win = fr.contentWindow;
        try {
          if (onclickAttr) win.eval(onclickAttr);
          else if (typeof rowEl.onclick === "function") rowEl.onclick.call(rowEl);
        } catch {}
        try { rowEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: win })); } catch {}
        const got = await waitFor(fr, () => !!findActionDoc(fr), CONFIG.FORM_TIMEOUT, 150);
        if (got) {
          await sleep(200);
          const data = parseInfoTables(idoc(fr));
          const saveRes = await saveAction(fr, `${shd} [${tInfo.name}]`, rowCode);
          return { ...row, ...data, GIN: "co", TRANG_THAI: "Đã tìm thấy",
            "ĐÃ LƯU": saveRes.saved ? "Có" : "Không", LY_DO: saveRes.reason, CODE_USED: rowCode || actionCode };
        }
        return { ...row, GIN: "khong", TRANG_THAI: `Timeout form [${tInfo.name}]`, "ĐÃ LƯU": "Không", _TIMEOUT: true };
      }
      return { ...row, GIN: "khong", TRANG_THAI: `Không tìm thấy [${tInfo.name}]`, "ĐÃ LƯU": "Không" };
    } catch (err) {
      return { ...row, GIN: "loi", TRANG_THAI: `Lỗi [${tInfo.name}]`, "ĐÃ LƯU": "Không", _ERR: err.message, _TIMEOUT: true };
    }
  }

  async function scrapeOneList(fr, row) {
    const shd = clean(row.SHD);
    const tInfo = getTargetInfo(shd);
    try {
      await loadUrlIfNeeded(fr, tInfo.url, tInfo.name);
      const doc = idoc(fr);
      const input = findSearchInput(doc);
      if (!input) throw new Error(`Không tìm thấy ô SHD [${tInfo.name}]`);
      input.value = shd;
      triggerChange(input);
      await sleep(80);
      const btn = findSearchButton(doc);
      if (!btn) throw new Error(`Không tìm thấy nút Tìm [${tInfo.name}]`);
      btn.click();
      const ajaxWait = CONFIG.AJAX_WAIT_BY_TAB[tInfo.name] || 400;
      await sleep(ajaxWait);
      const searchTimeout = CONFIG.SEARCH_TIMEOUT_BY_TAB[tInfo.name] || CONFIG.SEARCH_TIMEOUT;
      const found = await waitFor(fr, d => !!findActionDoc(fr) || !!findResultRow(d, shd), searchTimeout);
      if (!found) return { ...row, GIN: "khong", TRANG_THAI: `Timeout search [${tInfo.name}]`, "ĐÃ LƯU": "—", _TIMEOUT: true };
      if (findActionDoc(fr)) {
        const data = parseInfoTables(idoc(fr));
        return { ...row, ...data, GIN: "co", TRANG_THAI: "Đã cào", "ĐÃ LƯU": "—",
          LY_DO: "chỉ cào, không lưu", CODE_USED: row._CODE || actionCode };
      }
      const doc2 = idoc(fr);
      const rowEl = findResultRow(doc2, shd);
      if (rowEl) {
        const onclickAttr = rowEl.getAttribute("onclick");
        const win = fr.contentWindow;
        try {
          if (onclickAttr) win.eval(onclickAttr);
          else if (typeof rowEl.onclick === "function") rowEl.onclick.call(rowEl);
        } catch {}
        try { rowEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: win })); } catch {}
        const got = await waitFor(fr, () => !!findActionDoc(fr), CONFIG.FORM_TIMEOUT, 150);
        if (got) {
          await sleep(200);
          const data = parseInfoTables(idoc(fr));
          return { ...row, ...data, GIN: "co", TRANG_THAI: "Đã cào", "ĐÃ LƯU": "—",
            LY_DO: "chỉ cào, không lưu", CODE_USED: row._CODE || actionCode };
        }
        return { ...row, GIN: "khong", TRANG_THAI: `Timeout form [${tInfo.name}]`, "ĐÃ LƯU": "—", _TIMEOUT: true };
      }
      return { ...row, GIN: "khong", TRANG_THAI: `Không tìm thấy [${tInfo.name}]`, "ĐÃ LƯU": "—" };
    } catch (err) {
      return { ...row, GIN: "loi", TRANG_THAI: `Lỗi [${tInfo.name}]`, "ĐÃ LƯU": "—", _ERR: err.message, _TIMEOUT: true };
    }
  }

  function findResultRow(doc, shd) {
    if (!doc) return null;
    const cleanSHD = clean(shd);
    const normSHD = normalize(cleanSHD);
    let found = [...doc.querySelectorAll('td[onclick*="customerDetail"], td[onclick*="detail"], tr[onclick*="customerDetail"]')]
      .find(td => clean(td.textContent).includes(cleanSHD) || normalize(td.textContent).includes(normSHD));
    if (found) return found;
    found = [...doc.querySelectorAll('td')].find(td => (clean(td.textContent).includes(cleanSHD) || normalize(td.textContent).includes(normSHD)) && (td.getAttribute('onclick') || td.onclick));
    if (found) return found;
    const a = [...doc.querySelectorAll('a')].find(a => clean(a.textContent).includes(cleanSHD) || normalize(a.textContent).includes(normSHD));
    if (a) return a;
    const allRows = [...doc.querySelectorAll('td[onclick*="customerDetail"], tr[onclick*="customerDetail"]')];
    if (allRows.length === 1) {
      log(`Không khớp SHD "${cleanSHD}", nhưng có 1 dòng kết quả -> click luôn`, "warn");
      return allRows[0];
    }
    return null;
  }

  const PAGES = [
    { key: "loan", url: "?page=customerLoan&offset=0", name: "LOAN" },
    { key: "crc",  url: "?page=customerCrc",           name: "CRC"  },
    { key: "vpb",  url: "?page=customerVpb",           name: "VPB"  }
  ];

  async function searchNEWOnPage(page) {
    const fullUrl = BASE + page.url;
    await loadUrl(searchFrame, fullUrl);
    let doc = idoc(searchFrame);
    if (!doc) return [];
    const form = doc.querySelector("#data_source_list_form") || doc.querySelector("form");
    if (!form) return [];
    const select = form.querySelector('select[name="callStatus"]');
    if (select) { select.value = "NEW"; select.dispatchEvent(new Event("change", { bubbles: true })); }
    const btn = form.querySelector('input[name="cmd_search"]') || form.querySelector('input[value*="Tìm kiếm"]') || form.querySelector('input[type="submit"]');
    if (btn) btn.click(); else form.submit();
    const maxWait = (page.key === "crc" || page.key === "vpb") ? 8500 : 5500;
    const start = Date.now();
    let items = [];
    while (Date.now() - start < maxWait) {
      await sleep(280);
      doc = idoc(searchFrame);
      if (!doc) continue;
      const found = [];
      const seen = new Set();
      doc.querySelectorAll("td[onclick*='customerDetail']").forEach(td => {
        const text = clean(td.textContent);
        const shdMatch = text.match(/(\d{8}-\d+|\d{6,})/);
        const idMatch = (td.getAttribute("onclick") || "").match(/customerDetail\s*\(\s*['"](\d+)['"]\s*\)/);
        if (shdMatch && idMatch) {
          const shd = shdMatch[1];
          const detailId = idMatch[1];
          const key = page.key + "_" + shd;
          if (!seen.has(key)) {
            seen.add(key);
            found.push({ shd, detailId, page: page.key, pageUrl: page.url, pageName: page.name });
          }
        }
      });
      if (found.length) { items = found; break; }
      const bodyText = (doc.body?.innerText || "").toLowerCase();
      if (bodyText.includes("không có dữ liệu") || bodyText.includes("không tìm thấy") || bodyText.includes("no data")) break;
    }
    return items;
  }

  async function processOneNew(fr, item) {
    const { shd, detailId, pageUrl, pageName } = item;
    try {
      await loadUrl(fr, BASE + pageUrl, CONFIG.LOAD_TIMEOUT_BY_TAB[pageName] || CONFIG.TIMEOUT);
      iframeTab.set(fr.id, pageName);
      let doc = idoc(fr);
      if (!doc) throw new Error("Không vào iframe");
      if (typeof fr.contentWindow.customerDetail !== "function") throw new Error("Không có hàm customerDetail");
      fr.contentWindow.customerDetail(detailId);
      const gotForm = await waitFor(fr, () => !!findActionDoc(fr), 10000, 200);
      if (!gotForm) { log(`${shd} [${pageName}] → Timeout form`, "err"); return null; }
      await sleep(300);
      const saveRes = await saveAction(fr, `${shd} [${pageName}]`);
      if (!saveRes.saved) { log(`${shd} [${pageName}] → bỏ qua vì lưu thất bại`, "warn"); return null; }
      const data = parseInfoTables(findActionDoc(fr) || idoc(fr));
      data.SHD = shd;
      data.detailId = detailId;
      data.Tab = pageName;
      const c = CALL_STATUS_LIST.find(x => x.value === actionCode);
      data.Action = c ? c.code : actionCode;
      data.Note = noteText;
      data["Thời gian"] = new Date().toLocaleString("vi-VN");
      return data;
    } catch (err) {
      log(`${shd} [${pageName}] → Lỗi: ${err.message}`, "err");
      return null;
    }
  }

  async function takeTask() {
    while (queueLock) await sleep(4);
    queueLock = true;
    try { return pendingQueue.length ? pendingQueue.shift() : null; }
    finally { queueLock = false; }
  }

  function pushRetry(task) {
    retryQueue.push(task);
    setTimeout(async () => {
      while (queueLock) await sleep(4);
      queueLock = true;
      try {
        const idx = retryQueue.indexOf(task);
        if (idx >= 0) retryQueue.splice(idx, 1);
        pendingQueue.push(task);
      } finally { queueLock = false; }
    }, CONFIG.RETRY_WAIT);
  }

  async function workerList(fr) {
    while (running && !stopRequested) {
      if (paused) break;
      const task = await takeTask();
      if (!task) {
        if (retryQueue.length === 0 && pendingQueue.length === 0 && active === 0) break;
        await sleep(60);
        continue;
      }
      active++;
      updateUI();
      const result = await processOneList(fr, task.row);
      active = Math.max(0, active - 1);
      if (result._TIMEOUT && task.attempt < CONFIG.MAX_RETRY) {
        task.attempt++;
        log(`${task.row.SHD} → retry ${task.attempt}/${CONFIG.MAX_RETRY}`, "warn");
        iframeTab.delete(fr.id);
        pushRetry(task);
        continue;
      }
      delete result._TIMEOUT;
      results[task.index] = result;
      completed++;
      const g = normalize(result.GIN || "");
      if (g === "co" || g === "có") success++;
      else if (g === "khong" || g === "không") notFound++;
      else errors++;
      updateUI();
      if (completed % 5 === 0 || completed === rows.length) renderPreview();
      if (isExpanded && (completed % 5 === 0 || completed === rows.length)) renderExpanded();
      if (CONFIG.DELAY) await sleep(CONFIG.DELAY);
    }
  }

  async function workerScrape(fr) {
    while (running && !stopRequested) {
      if (paused) break;
      const task = await takeTask();
      if (!task) {
        if (retryQueue.length === 0 && pendingQueue.length === 0 && active === 0) break;
        await sleep(60);
        continue;
      }
      active++;
      updateUI();
      const result = await scrapeOneList(fr, task.row);
      active = Math.max(0, active - 1);
      if (result._TIMEOUT && task.attempt < CONFIG.MAX_RETRY) {
        task.attempt++;
        log(`${task.row.SHD} → retry ${task.attempt}/${CONFIG.MAX_RETRY}`, "warn");
        iframeTab.delete(fr.id);
        pushRetry(task);
        continue;
      }
      delete result._TIMEOUT;
      results[task.index] = result;
      completed++;
      const g = normalize(result.GIN || "");
      if (g === "co" || g === "có") success++;
      else if (g === "khong" || g === "không") notFound++;
      else errors++;
      updateUI();
      if (completed % 5 === 0 || completed === rows.length) renderPreview();
      if (isExpanded && (completed % 5 === 0 || completed === rows.length)) renderExpanded();
      if (CONFIG.DELAY) await sleep(CONFIG.DELAY);
    }
  }

  function createUI() {
    document.getElementById("__UNI_UI")?.remove();
    document.getElementById("__UNI_STYLE")?.remove();
    document.getElementById("__UNI_EXPANDED")?.remove();

    const style = document.createElement("style");
    style.id = "__UNI_STYLE";
    style.textContent = `
      #__UNI_UI{position:fixed;z-index:2147483647;right:10px;top:10px;width:600px;max-height:96vh;overflow:auto;
        background:#fff;border:1px solid #dee2e6;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);
        font:12.5px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#212529}
      #__UNI_UI *{box-sizing:border-box}
      #uni_header{padding:10px 14px;background:linear-gradient(90deg,#0d6efd,#0a58ca);color:#fff;font-weight:700;
        font-size:13.5px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10}
      #uni_body{padding:10px 12px}
      .uni_sec{background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:8px 10px;margin-bottom:8px}
      .uni_sec_title{font-size:11px;font-weight:700;color:#495057;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px}
      .uni_row{display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap}
      .uni_field{flex:1;min-width:0}
      .uni_field label{display:block;font-size:10.5px;color:#6c757d;font-weight:600;margin-bottom:2px}
      .uni_stats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
      .uni_card{background:#fff;border:1px solid #e9ecef;border-radius:6px;padding:6px 8px;text-align:center}
      .uni_card .lbl{font-size:9.5px;color:#6c757d;font-weight:600;text-transform:uppercase}
      .uni_card .num{font-size:16px;font-weight:700;margin-top:1px}
      .g{color:#198754}.r{color:#dc3545}.b{color:#0d6efd}.y{color:#b58105}.o{color:#fd7e14}
      .uni_btn{border:1px solid #ced4da;background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;
        font-size:12px;font-weight:600;flex:1;transition:all .12s}
      .uni_btn:hover{background:#f1f3f5}
      .uni_primary{background:#0d6efd;color:#fff;border-color:#0d6efd}
      .uni_success{background:#198754;color:#fff;border-color:#198754}
      .uni_info{background:#0dcaf0;color:#fff;border-color:#0dcaf0}
      .uni_danger{background:#dc3545;color:#fff;border-color:#dc3545}
      .uni_warn{background:#ffc107;color:#000;border-color:#ffc107}
      #uni_log{background:#111827;color:#d1d5db;border-radius:6px;padding:7px 8px;height:150px;overflow:auto;
        font:10.5px Consolas,Monaco,monospace;margin-top:6px}
      .ok{color:#75b798}.err{color:#ea868f}.warn{color:#ffda6a}.info{color:#9ec5fe}
      select,textarea,input[type=file],input[type=number],input[type=text]{width:100%;padding:5px 7px;
        border:1px solid #ced4da;border-radius:5px;font-size:12px;font-family:inherit;background:#fff}
      textarea{resize:vertical;min-height:36px}
      .mode-tabs{display:flex;gap:4px;margin-bottom:8px;background:#e9ecef;padding:3px;border-radius:7px}
      .mode-tab{flex:1;padding:6px;text-align:center;font-size:12px;font-weight:600;border-radius:5px;
        cursor:pointer;color:#495057;transition:all .12s}
      .mode-tab.active{background:#fff;color:#0d6efd;box-shadow:0 1px 3px rgba(0,0,0,.1)}
      #uni_status{font-size:11.5px;color:#495057;padding:6px 8px;background:#e7f1ff;border-radius:5px;
        border-left:3px solid #0d6efd;margin-top:4px;min-height:26px;line-height:1.35}
      .checkbox-line{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#212529;cursor:pointer;padding:4px 0}
      .checkbox-line input{width:auto;margin:0;transform:scale(1.15);accent-color:#0d6efd}
      .export-group{display:flex;gap:4px;margin-top:4px}
      .hint{font-size:10.5px;color:#6c757d;margin-top:3px}
      .code-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;
        background:#d1e7dd;color:#0f5132;font-family:Consolas,monospace}
      .code-badge.warnbadge{background:#fff3cd;color:#856404}
      #uni_preview_wrap{margin-top:6px;border:1px solid #dee2e6;border-radius:6px;background:#fff;overflow:hidden}
      #uni_preview_toolbar{display:flex;gap:4px;padding:6px;background:#f8f9fa;border-bottom:1px solid #dee2e6;flex-wrap:wrap;align-items:center}
      .filter-btn{padding:3px 8px;font-size:11px;font-weight:600;border:1px solid #ced4da;background:#fff;border-radius:4px;cursor:pointer}
      .filter-btn.active{background:#0d6efd;color:#fff;border-color:#0d6efd}
      .filter-btn .count{font-weight:400;opacity:.75;font-size:10px}
      #uni_search_preview{flex:1;min-width:100px;padding:3px 7px;font-size:11px}
      #uni_preview{max-height:280px;overflow:auto;background:#fff}
      #uni_preview table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
      #uni_preview th,#uni_preview td{padding:5px 6px;border-bottom:1px solid #f1f3f5;text-align:left;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #uni_preview th{background:#f8f9fa;font-weight:600;color:#495057;position:sticky;top:0;font-size:10px;z-index:1}
      #uni_preview th.col-stt,#uni_preview td.col-stt,#exp_list th.col-stt,#exp_list td.col-stt{
        width:42px !important;min-width:42px !important;max-width:42px !important;
        text-align:right !important;overflow:visible !important;white-space:nowrap !important;
        font-variant-numeric:tabular-nums;
      }
      #uni_preview tr.row-main{cursor:pointer;transition:background .1s}
      #uni_preview tr.row-main:hover{background:#f8f9fa}
      #uni_preview tr.row-main.status-ok{background:#f0fdf4}
      #uni_preview tr.row-main.status-fail{background:#fef2f2}
      #uni_preview tr.row-main.status-pending{background:#fffbeb}
      #uni_preview tr.row-main.status-scraped{background:#f0f9ff}
      #uni_preview tr.row-detail td{background:#f8f9fa;padding:8px;font-size:10.5px;color:#495057;border-bottom:2px solid #dee2e6;white-space:normal}
      #uni_preview tr.row-detail .detail-grid{display:grid;grid-template-columns:120px 1fr;gap:3px 8px;max-height:240px;overflow:auto}
      #uni_preview tr.row-detail .detail-grid .k{color:#6c757d;font-weight:600}
      #uni_preview tr.row-detail .detail-grid .v{color:#212529;word-break:break-word}
      #uni_preview tr.row-detail .detail-grid .v.empty{color:#adb5bd;font-style:italic}
      #uni_preview .empty-msg{padding:20px;text-align:center;color:#6c757d;font-size:11.5px}
      #uni_preview .expand-icon{color:#adb5bd;font-size:10px;transition:transform .15s}
      #uni_preview .expand-icon.open{transform:rotate(90deg);color:#0d6efd}
      #uni_preview_footer{padding:4px 8px;background:#f8f9fa;border-top:1px solid #dee2e6;font-size:10.5px;color:#6c757d;display:flex;justify-content:space-between}
      .ten-cell{color:#dc3545;font-weight:600;font-size:11px}
      #__UNI_EXPANDED{position:fixed;z-index:2147483648;left:20px;top:20px;right:20px;bottom:20px;
        background:#fff;border:2px solid #0d6efd;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.4);
        display:flex;flex-direction:column;resize:both;overflow:hidden;min-width:700px;min-height:400px;
        font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#212529}
      #__UNI_EXPANDED *{box-sizing:border-box}
      #exp_header{padding:10px 16px;background:linear-gradient(90deg,#0d6efd,#0a58ca);color:#fff;font-weight:700;
        font-size:14px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
      #exp_header .btn-group{display:flex;gap:6px}
      #exp_header button{padding:5px 12px;font-size:12px;font-weight:600;border:none;border-radius:5px;cursor:pointer}
      #exp_close{background:#dc3545;color:#fff}
      #exp_min{background:#ffc107;color:#000}
      #exp_toolbar{display:flex;gap:4px;padding:8px 10px;background:#f8f9fa;border-bottom:1px solid #dee2e6;flex-wrap:wrap;align-items:center;flex-shrink:0}
      #exp_main{flex:1;display:flex;gap:0;overflow:hidden;min-height:0}
      #exp_left{flex:0 0 460px;display:flex;flex-direction:column;border-right:2px solid #dee2e6;overflow:hidden;min-width:260px;max-width:800px;resize:horizontal}
      #exp_left_header{padding:8px 10px;background:#e7f1ff;border-bottom:1px solid #dee2e6;font-size:11.5px;font-weight:700;color:#084298;flex-shrink:0;display:flex;justify-content:space-between}
      #exp_list{flex:1;overflow:auto;background:#fff}
      #exp_list table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
      #exp_list th,#exp_list td{padding:6px 6px;border-bottom:1px solid #f1f3f5;text-align:left;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #exp_list th{background:#f8f9fa;font-weight:700;color:#495057;position:sticky;top:0;font-size:10.5px;z-index:1}
      #exp_list tr.row-item{cursor:pointer;transition:background .1s}
      #exp_list tr.row-item:hover{background:#f8f9fa}
      #exp_list tr.row-item.selected{background:#dbeafe !important;border-left:3px solid #0d6efd;font-weight:600}
      #exp_list tr.row-item.status-ok{background:#f0fdf4}
      #exp_list tr.row-item.status-fail{background:#fef2f2}
      #exp_list tr.row-item.status-pending{background:#fffbeb}
      #exp_list tr.row-item.status-scraped{background:#f0f9ff}
      #exp_left_footer{padding:5px 10px;background:#f8f9fa;border-top:1px solid #dee2e6;font-size:11px;color:#6c757d;flex-shrink:0}
      #exp_right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:#fff}
      #exp_right_header{padding:8px 12px;background:#f0fdf4;border-bottom:1px solid #dee2e6;font-size:12px;font-weight:700;color:#166534;flex-shrink:0;display:flex;justify-content:space-between;align-items:center}
      #exp_detail{flex:1;overflow:auto;padding:12px;background:#fff}
      #exp_detail .empty-detail{text-align:center;padding:60px 20px;color:#adb5bd;font-size:13px;font-style:italic}
      #exp_detail .detail-section{margin-bottom:16px}
      #exp_detail .detail-section-title{font-size:12.5px;font-weight:700;color:#0d6efd;margin-bottom:8px;padding-bottom:5px;
        border-bottom:2px solid #e7f1ff;display:flex;align-items:center;gap:6px}
      #exp_detail .detail-grid{display:grid;grid-template-columns:160px 1fr;gap:6px 12px;font-size:12.5px}
      #exp_detail .detail-grid .k{color:#6c757d;font-weight:600;padding:3px 0;border-bottom:1px dashed #f1f3f5}
      #exp_detail .detail-grid .v{color:#212529;word-break:break-word;padding:3px 0;border-bottom:1px dashed #f1f3f5}
      #exp_detail .detail-grid .v.empty{color:#adb5bd;font-style:italic}
      #exp_footer{padding:8px 12px;background:#f8f9fa;border-top:1px solid #dee2e6;font-size:12px;color:#6c757d;display:flex;justify-content:space-between;flex-shrink:0}
      .resize-hint{position:absolute;right:3px;bottom:3px;color:#adb5bd;font-size:14px;pointer-events:none}
      .status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
      .dot-ok{background:#198754}.dot-fail{background:#dc3545}.dot-pending{background:#ffc107}.dot-scraped{background:#0dcaf0}.dot-error{background:#dc3545}
    `;
    document.head.appendChild(style);

    const statusOptions = CALL_STATUS_LIST.map(c =>
      `<option value="${c.value}"${c.value === "6" ? " selected" : ""}>${c.label}</option>`
    ).join("");
    const typeOptions = CALL_TO_TYPE_LIST.map(c =>
      `<option value="${c.value}"${c.value === "6" ? " selected" : ""}>${c.label}</option>`
    ).join("");

    const box = document.createElement("div");
    box.id = "__UNI_UI";
    box.innerHTML = `
      <div id="uni_header">
        <span>UNIFIED DEBT TOOL <small>v4.6 (Zalo editable)</small></span>
        <small>${new Date().toLocaleDateString("vi-VN")}</small>
      </div>
      <div id="uni_body">
        <div class="mode-tabs">
          <div class="mode-tab active" data-mode="list">📋 Danh sách SHD</div>
          <div class="mode-tab" data-mode="new">🔍 Quét NEW</div>
        </div>

        <div class="uni_sec" id="sec_file">
          <div class="uni_sec_title">📁 File dữ liệu</div>
          <input type="file" id="uni_file" accept=".xlsx,.xls,.csv">
          <label class="checkbox-line" style="margin-top:6px">
            <input type="checkbox" id="uni_use_file_code" checked>
            <span>Note code theo file (đọc cột CODE/Action trong Excel)</span>
          </label>
          <div class="hint">SHD không có CODE trong file → dùng CODE mặc định bên dưới</div>
        </div>

        <div class="uni_sec">
          <div class="uni_sec_title">⚙️ Cấu hình Action</div>
          <div class="uni_row">
            <div class="uni_field">
              <label>Trạng thái mặc định</label>
              <select id="uni_action">${statusOptions}</select>
            </div>
          </div>
          <div class="uni_row">
            <div class="uni_field">
              <label>Note / Remark (dùng chung)</label>
              <textarea id="uni_note" rows="2">Không nhắc máy</textarea>
            </div>
          </div>
          <div id="uni_keep_box" style="display:none">
            <div class="uni_row">
              <div class="uni_field">
                <label>Call To Type (KEEP/LEM)</label>
                <select id="uni_keep_type">${typeOptions}</select>
              </div>
            </div>
            <div class="uni_row" id="uni_keep_note_row" style="display:none">
              <div class="uni_field"><label>Note KEEP</label><textarea id="uni_keep_note" rows="2"></textarea></div>
            </div>
            <div class="uni_row" id="uni_lem_note_row" style="display:none">
              <div class="uni_field"><label>Note LEM</label><textarea id="uni_lem_note" rows="2">Để lại lời nhắn cho người thân</textarea></div>
            </div>
          </div>
        </div>

        <div class="uni_sec">
          <div class="uni_sec_title">⚡ Tốc độ</div>
          <div class="uni_row">
            <div class="uni_field"><label>Luồng (1-100)</label><input type="number" id="uni_concurrent" min="1" max="100" value="20"></div>
            <div class="uni_field"><label>Delay (ms)</label><input type="number" id="uni_delay" min="0" max="3000" step="50" value="80"></div>
          </div>
          <div class="hint">🚀 Batch tối đa <b>${CONFIG.MAX_PARALLEL_SAFE}</b> | Adaptive batch</div>
        </div>

        <div class="uni_sec">
          <div class="uni_sec_title">📊 Tiến độ</div>
          <div class="uni_stats">
            <div class="uni_card"><div class="lbl">Tổng</div><div id="uni_total" class="num b">0</div></div>
            <div class="uni_card"><div class="lbl">Xong</div><div id="uni_done" class="num">0</div></div>
            <div class="uni_card"><div class="lbl">Chạy</div><div id="uni_active" class="num o">0</div></div>
            <div class="uni_card"><div class="lbl">OK</div><div id="uni_ok" class="num g">0</div></div>
          </div>
          <div class="uni_row" style="margin-top:5px">
            <div class="uni_card" style="flex:1"><div class="lbl">Không/Lỗi</div><div id="uni_err" class="num r">0</div></div>
            <div class="uni_card" style="flex:1"><div class="lbl">Batch</div><div id="uni_batch" class="num y">0/0</div></div>
          </div>
          <div id="uni_status">Sẵn sàng</div>
        </div>

        <div class="uni_row">
          <button id="uni_run" class="uni_btn uni_success">▶ Chạy & Lưu</button>
          <button id="uni_scrape" class="uni_btn uni_info">📋 Cào (không lưu)</button>
        </div>
        <div class="uni_row">
          <button id="uni_pause" class="uni_btn uni_warn">⏸ Dừng</button>
          <button id="uni_expand" class="uni_btn" style="background:#6f42c1;color:#fff;border-color:#6f42c1">🔍 Mở rộng</button>
        </div>
        <div class="export-group">
          <button id="uni_export_xlsx" class="uni_btn uni_primary">📥 Excel</button>
          <button id="uni_export_csv" class="uni_btn uni_primary">📥 CSV</button>
        </div>
        <div class="uni_row" style="margin-top:6px">
          <button id="uni_reset" class="uni_btn">🔄 Reset</button>
          <button id="uni_close" class="uni_btn uni_danger">✕ Đóng</button>
        </div>

        <div id="uni_preview_wrap" style="display:none">
          <div id="uni_preview_toolbar">
            <button class="filter-btn active" data-filter="all">Tất cả <span class="count" id="cnt_all">0</span></button>
            <button class="filter-btn" data-filter="saved">✅ Lưu <span class="count" id="cnt_saved">0</span></button>
            <button class="filter-btn" data-filter="scraped">📋 Cào <span class="count" id="cnt_scraped">0</span></button>
            <button class="filter-btn" data-filter="unsaved">❌ Chưa <span class="count" id="cnt_unsaved">0</span></button>
            <button class="filter-btn" data-filter="error">⚠️ Lỗi <span class="count" id="cnt_error">0</span></button>
            <button class="filter-btn" data-filter="pending">⏳ Chờ <span class="count" id="cnt_pending">0</span></button>
            <input type="text" id="uni_search_preview" placeholder="🔍 Tìm SHD...">
          </div>
          <div id="uni_preview"></div>
          <div id="uni_preview_footer">
            <span id="uni_pv_count">0 dòng</span>
            <span style="color:#adb5bd">Click dòng để xem chi tiết</span>
          </div>
        </div>

        <div id="uni_log"></div>
      </div>
    `;
    document.body.appendChild(box);

    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        mode = tab.dataset.mode;
        $("sec_file").style.display = mode === "list" ? "block" : "none";
        log(`Chế độ: ${mode === "list" ? "Danh sách SHD" : "Quét NEW"}`, "info");
      };
    });

    $("uni_action").onchange = () => {
      const v = $("uni_action").value;
      const show = (v === "36" || v === "9");
      $("uni_keep_box").style.display = show ? "block" : "none";
      if ($("uni_keep_note_row")) $("uni_keep_note_row").style.display = (v === "36") ? "block" : "none";
      if ($("uni_lem_note_row"))  $("uni_lem_note_row").style.display  = (v === "9")  ? "block" : "none";
    };

    document.querySelectorAll('#uni_preview_toolbar .filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#uni_preview_toolbar .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        previewFilter = btn.dataset.filter;
        renderPreview();
        if (isExpanded) renderExpanded();
      };
    });

    $("uni_search_preview").oninput = (e) => {
      previewSearch = e.target.value.trim();
      renderPreview();
      if (isExpanded) renderExpanded();
    };
  }

  const $ = id => document.getElementById(id);

  function log(msg, cls = "info", force = false) {
    const el = $("uni_log");
    if (!el) return;
    logCounter++;
    if (!force && logCounter % CONFIG.LOG_THROTTLE !== 0 && !/retry|Batch|━━━|Xong|Bắt đầu|sẵn sàng|ĐÃ LƯU|LƯU THẤT BẠI/.test(msg)) return;
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(div);
    while (el.children.length > 300) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function updateUI() {
    if ($("uni_total")) $("uni_total").textContent = mode === "list" ? rows.length : (pendingQueue.length + completed);
    if ($("uni_done")) $("uni_done").textContent = completed;
    if ($("uni_active")) $("uni_active").textContent = active;
    if ($("uni_ok")) $("uni_ok").textContent = success;
    if ($("uni_err")) $("uni_err").textContent = errors + notFound;
    if ($("uni_batch")) $("uni_batch").textContent = `${currentBatch}/${totalBatches}`;
  }

  function readConfig() {
    actionCode = $("uni_action").value;
    noteText = ($("uni_note").value || "Không nhắc máy").trim();
    keepCallToType = $("uni_keep_type")?.value || "6";
    keepNote = ($("uni_keep_note")?.value || "").trim();
    lemNote = ($("uni_lem_note")?.value || "").trim() || "Để lại lời nhắn cho người thân";
    const conc = parseInt($("uni_concurrent")?.value || 20);
    const delay = parseInt($("uni_delay")?.value || 80);
    CONFIG.CONCURRENT = Math.max(1, Math.min(CONFIG.MAX_CONCURRENT, conc || 20));
    CONFIG.DELAY = Math.max(0, delay || 80);
    if (iframes.length !== CONFIG.CONCURRENT) {
      createIframes(CONFIG.CONCURRENT);
      log(`Đã tạo lại ${CONFIG.CONCURRENT} iframe`, "info", true);
    }
  }

  async function loadXLSX() {
    if (window.XLSX) return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = CONFIG.XLSX_CDN;
      s.onload = () => window.XLSX ? res() : rej();
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function getRowStatus(r, idx) {
    if (!r || !results[idx]) return "pending";
    const res = results[idx];
    const g = normalize(res.GIN || "");
    if (g === "co" || g === "có") {
      if (res["ĐÃ LƯU"] === "—" || res.LY_DO?.includes("chỉ cào")) return "scraped";
      return res["ĐÃ LƯU"] === "Có" ? "saved" : "unsaved";
    }
    if (g === "khong" || g === "không") return "unsaved";
    return "error";
  }

  const HIDDEN_FIELDS = new Set([
    "SHD","GIN","TRANG_THAI","ĐÃ LƯU","LY_DO","CODE_USED","_ERR","_CODE","_RAW_CODE","Thời gian","Action","Note","Tab","detailId","_TEN_KH"
  ]);

  function buildPreviewTable() {
    const searchLower = previewSearch.toLowerCase();
    const filtered = [];
    rows.forEach((r, i) => {
      const st = getRowStatus(r, i);
      if (previewFilter !== "all" && previewFilter !== st) return;
      if (searchLower && !String(r.SHD).toLowerCase().includes(searchLower)) return;
      filtered.push({ row: r, idx: i, status: st });
    });

    let html = `<table><thead><tr>
      <th style="width:22px"></th><th class="col-stt">#</th><th style="width:110px">SHD</th>
      <th>Tên KH</th>
      <th style="width:55px">CODE</th><th style="width:65px">Trạng thái</th><th style="width:55px">Đã lưu</th>
    </tr></thead><tbody>`;

    if (!filtered.length) {
      html += `<tr><td colspan="7" class="empty-msg">Không có dòng nào</td></tr>`;
    } else {
      filtered.forEach(({ row, idx, status }) => {
        const res = results[idx];
        const fileCode = row._RAW_CODE || "";
        const usedCode = row._CODE || "";
        const expand = expandedRow === idx;
        const ten = getTenFromResult(res);
        const statusIcon = status === "saved" ? "✅" : status === "scraped" ? "📋" :
                          status === "unsaved" ? "❌" : status === "error" ? "⚠️" : "⏳";
        const statusText = status === "saved" ? "Đã lưu" : status === "scraped" ? "Đã cào" :
                          status === "unsaved" ? "Chưa" : status === "error" ? "Lỗi" : "Chờ";
        const savedText = res?.["ĐÃ LƯU"] || "—";
        const savedCls = savedText === "Có" ? "g" : savedText === "Không" ? "r" : "";
        const trClass = status === "saved" ? "status-ok" : status === "scraped" ? "status-scraped" :
                        status === "unsaved" ? "status-fail" : status === "error" ? "status-fail" : "status-pending";

        html += `<tr class="row-main ${trClass}" data-idx="${idx}">
          <td><span class="expand-icon ${expand ? "open" : ""}">▶</span></td>
          <td class="col-stt">${idx + 1}</td>
          <td><b>${row.SHD}</b></td>
          <td title="${ten || ''}">${ten ? `<span class="ten-cell">${shortTen(ten, 24)}</span>` : `<span style="color:#adb5bd">—</span>`}</td>
          <td>${fileCode ? `<span class="code-badge ${!usedCode ? "warnbadge" : ""}">${fileCode}</span>` : `<span style="color:#adb5bd">—</span>`}</td>
          <td>${statusIcon} ${statusText}</td>
          <td class="${savedCls}">${savedText}</td>
        </tr>`;

        if (expand) {
          const infoFields = [];
          if (res) {
            Object.keys(res).forEach(k => {
              if (HIDDEN_FIELDS.has(k)) return;
              if (k.startsWith("_")) return;
              const v = String(res[k] ?? "").trim();
              if (!v) return;
              infoFields.push([k, v]);
            });
          }
          const meta = [
            ["SHD", row.SHD], ["CODE file", fileCode || "(trống)"],
            ["CODE dùng", usedCode ? (CALL_STATUS_LIST.find(c => c.value === usedCode)?.code || usedCode) : "(mặc định)"],
            ["Trạng thái", res?.TRANG_THAI || "Chưa chạy"], ["Đã lưu", res?.["ĐÃ LƯU"] || "—"], ["Lý do", res?.LY_DO || "—"]
          ];
          if (res?._ERR) meta.push(["Lỗi", res._ERR]);
          if (res?.["Thời gian"]) meta.push(["Thời gian", res["Thời gian"]]);

          html += `<tr class="row-detail"><td colspan="7">
            ${buildZaloActions(res || { SHD: row.SHD }, idx, row.SHD)}
            <div style="margin-bottom:6px;font-weight:700;color:#495057;font-size:11px">🔎 THÔNG TIN XỬ LÝ</div>
            <div class="detail-grid">${meta.map(([k, v]) => `<div class="k">${k}</div><div class="v ${!v || v === '—' ? 'empty' : ''}">${v || '—'}</div>`).join("")}</div>
            ${infoFields.length ? `
              <div style="margin:10px 0 6px;font-weight:700;color:#495057;font-size:11px">📋 THÔNG TIN KH & HỢP ĐỒNG</div>
              <div class="detail-grid">${infoFields.map(([k, v]) => `<div class="k">${k}</div><div class="v">${highlightValue(k, v)}</div>`).join("")}</div>
            ` : `<div style="margin-top:6px;color:#adb5bd;font-style:italic;font-size:10.5px">(chưa có dữ liệu)</div>`}
          </td></tr>`;
        }
      });
    }
    html += `</tbody></table>`;
    return { html, filteredCount: filtered.length, totalCount: rows.length };
  }

  function renderPreview() {
    const wrap = $("uni_preview_wrap");
    if (!wrap) return;
    if (!rows.length) { wrap.style.display = "none"; return; }
    wrap.style.display = "block";

    let counts = { all: rows.length, saved: 0, scraped: 0, unsaved: 0, error: 0, pending: 0 };
    rows.forEach((r, i) => {
      const s = getRowStatus(r, i);
      if (counts[s] !== undefined) counts[s]++;
    });
    $("cnt_all").textContent = counts.all;
    $("cnt_saved").textContent = counts.saved;
    if ($("cnt_scraped")) $("cnt_scraped").textContent = counts.scraped;
    $("cnt_unsaved").textContent = counts.unsaved;
    $("cnt_error").textContent = counts.error;
    $("cnt_pending").textContent = counts.pending;

    const { html, filteredCount, totalCount } = buildPreviewTable();
    $("uni_preview").innerHTML = html;
    $("uni_pv_count").textContent = `${filteredCount}/${totalCount} dòng`;

    document.querySelectorAll('#uni_preview tr.row-main').forEach(tr => {
      tr.onclick = () => {
        const idx = parseInt(tr.dataset.idx);
        expandedRow = (expandedRow === idx) ? null : idx;
        renderPreview();
        if (isExpanded) renderExpanded();
      };
    });

    bindZaloActions($("uni_preview"), results, rows);
  }

  function openExpanded() {
    if (!rows.length) return alert("Chưa có dữ liệu để mở rộng");
    document.getElementById("__UNI_EXPANDED")?.remove();
    isExpanded = true;
    if (selectedRowIdx === null && rows.length) selectedRowIdx = 0;

    const overlay = document.createElement("div");
    overlay.id = "__UNI_EXPANDED";
    overlay.innerHTML = `
      <div id="exp_header">
        <span>🔍 BẢNG DỮ LIỆU CHI TIẾT - v4.6</span>
        <div class="btn-group">
          <button id="exp_min">🔽 Thu nhỏ</button>
          <button id="exp_close">✕ Đóng</button>
        </div>
      </div>
      <div id="exp_toolbar">
        <button class="filter-btn active" data-filter="all">Tất cả <span class="count" id="exp_cnt_all">0</span></button>
        <button class="filter-btn" data-filter="saved">✅ Lưu <span class="count" id="exp_cnt_saved">0</span></button>
        <button class="filter-btn" data-filter="scraped">📋 Cào <span class="count" id="exp_cnt_scraped">0</span></button>
        <button class="filter-btn" data-filter="unsaved">❌ Chưa <span class="count" id="exp_cnt_unsaved">0</span></button>
        <button class="filter-btn" data-filter="error">⚠️ Lỗi <span class="count" id="exp_cnt_error">0</span></button>
        <button class="filter-btn" data-filter="pending">⏳ Chờ <span class="count" id="exp_cnt_pending">0</span></button>
        <input type="text" id="exp_search_preview" placeholder="🔍 Tìm SHD..." style="flex:1;min-width:150px;padding:5px 8px;font-size:12px;border:1px solid #ced4da;border-radius:4px">
      </div>
      <div id="exp_main">
        <div id="exp_left">
          <div id="exp_left_header"><span>📋 DANH SÁCH SHD</span><span id="exp_left_count" style="font-weight:400;font-size:10.5px;color:#6c757d">0</span></div>
          <div id="exp_list"></div>
          <div id="exp_left_footer">Click SHD để xem chi tiết</div>
        </div>
        <div id="exp_right">
          <div id="exp_right_header">
            <span id="exp_right_title">📄 CHI TIẾT SHD</span>
            <span id="exp_right_status" style="font-weight:400;font-size:11px;color:#6c757d"></span>
          </div>
          <div id="exp_detail"></div>
        </div>
      </div>
      <div id="exp_footer">
        <span id="exp_pv_count">0 dòng</span>
        <span style="color:#adb5bd">Kéo góc để resize · Kéo vạch giữa để đổi độ rộng</span>
      </div>
      <div class="resize-hint">◢</div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('#exp_toolbar .filter-btn').forEach(btn => {
      if (btn.dataset.filter === previewFilter) {
        overlay.querySelectorAll('#exp_toolbar .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      btn.onclick = () => {
        overlay.querySelectorAll('#exp_toolbar .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        previewFilter = btn.dataset.filter;
        document.querySelectorAll('#uni_preview_toolbar .filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filter === previewFilter);
        });
        renderPreview();
        renderExpanded();
      };
    });

    overlay.querySelector("#exp_search_preview").value = previewSearch;
    overlay.querySelector("#exp_search_preview").oninput = (e) => {
      previewSearch = e.target.value.trim();
      if ($("uni_search_preview")) $("uni_search_preview").value = previewSearch;
      renderPreview();
      renderExpanded();
    };

    overlay.querySelector("#exp_min").onclick = () => {
      isExpanded = false;
      document.getElementById("__UNI_EXPANDED")?.remove();
    };
    overlay.querySelector("#exp_close").onclick = () => {
      isExpanded = false;
      document.getElementById("__UNI_EXPANDED")?.remove();
    };

    renderExpanded();
  }

  function renderExpanded() {
    const listEl = $("exp_list");
    const detailEl = $("exp_detail");
    if (!listEl || !detailEl) return;

    let counts = { all: rows.length, saved: 0, scraped: 0, unsaved: 0, error: 0, pending: 0 };
    rows.forEach((r, i) => {
      const s = getRowStatus(r, i);
      if (counts[s] !== undefined) counts[s]++;
    });
    const setCnt = (id, v) => { if ($(id)) $(id).textContent = v; };
    setCnt("exp_cnt_all", counts.all);
    setCnt("exp_cnt_saved", counts.saved);
    setCnt("exp_cnt_scraped", counts.scraped);
    setCnt("exp_cnt_unsaved", counts.unsaved);
    setCnt("exp_cnt_error", counts.error);
    setCnt("exp_cnt_pending", counts.pending);

    const searchLower = previewSearch.toLowerCase();
    const filtered = [];
    rows.forEach((r, i) => {
      const st = getRowStatus(r, i);
      if (previewFilter !== "all" && previewFilter !== st) return;
      if (searchLower && !String(r.SHD).toLowerCase().includes(searchLower)) return;
      filtered.push({ row: r, idx: i, status: st });
    });

    setCnt("exp_left_count", `${filtered.length}/${rows.length}`);
    if ($("exp_pv_count")) $("exp_pv_count").textContent = `${filtered.length}/${rows.length} dòng`;

    let listHtml = `<table><thead><tr>
      <th class="col-stt">#</th>
      <th style="width:105px">SHD</th>
      <th>Tên KH</th>
      <th style="width:50px">CODE</th>
    </tr></thead><tbody>`;

    if (!filtered.length) {
      listHtml += `<tr><td colspan="4" class="empty-msg">Không có dòng nào</td></tr>`;
    } else {
      filtered.forEach(({ row, idx, status }) => {
        const res = results[idx];
        const fileCode = row._RAW_CODE || "";
        const usedCode = row._CODE || "";
        const ten = getTenFromResult(res);
        const sel = selectedRowIdx === idx;
        const dotCls = status === "saved" ? "dot-ok" : status === "scraped" ? "dot-scraped" :
                       status === "unsaved" ? "dot-fail" : status === "error" ? "dot-error" : "dot-pending";
        const trClass = `${status === "saved" ? "status-ok" : status === "scraped" ? "status-scraped" :
                        status === "unsaved" ? "status-fail" : status === "error" ? "status-fail" : "status-pending"}${sel ? " selected" : ""}`;
        listHtml += `<tr class="row-item ${trClass}" data-idx="${idx}">
          <td class="col-stt">${idx + 1}</td>
          <td title="${row.SHD}"><span class="status-dot ${dotCls}"></span><b>${row.SHD}</b></td>
          <td title="${ten || ''}">${ten ? `<span class="ten-cell">${shortTen(ten, 24)}</span>` : `<span style="color:#adb5bd">—</span>`}</td>
          <td>${fileCode ? `<span class="code-badge ${!usedCode ? "warnbadge" : ""}">${fileCode}</span>` : `<span style="color:#adb5bd">—</span>`}</td>
        </tr>`;
      });
    }
    listHtml += `</tbody></table>`;
    listEl.innerHTML = listHtml;

    listEl.querySelectorAll('tr.row-item').forEach(tr => {
      tr.onclick = () => {
        selectedRowIdx = parseInt(tr.dataset.idx);
        renderExpanded();
        renderPreview();
      };
    });

    renderExpandedDetail();
  }

  function renderExpandedDetail() {
    const detailEl = $("exp_detail");
    const titleEl = $("exp_right_title");
    const statusEl = $("exp_right_status");
    if (!detailEl) return;

    if (selectedRowIdx === null || !rows[selectedRowIdx]) {
      detailEl.innerHTML = `<div class="empty-detail">← Chọn SHD để xem chi tiết</div>`;
      if (titleEl) titleEl.textContent = "📄 CHI TIẾT SHD";
      if (statusEl) statusEl.textContent = "";
      return;
    }

    const idx = selectedRowIdx;
    const row = rows[idx];
    const res = results[idx];
    const status = getRowStatus(row, idx);
    const fileCode = row._RAW_CODE || "";
    const usedCode = row._CODE || "";
    const ten = getTenFromResult(res);

    if (titleEl) {
      titleEl.textContent = ten ? `📄 ${row.SHD} — ${ten}` : `📄 CHI TIẾT: ${row.SHD}`;
    }
    if (statusEl) {
      const statusText = status === "saved" ? "✅ Đã lưu" : status === "scraped" ? "📋 Đã cào" :
                         status === "unsaved" ? "❌ Chưa lưu" : status === "error" ? "⚠️ Lỗi" : "⏳ Chờ";
      statusEl.textContent = statusText;
    }

    const meta = [
      ["SHD", row.SHD],
      ["Tên KH", ten || "(chưa lấy được)"],
      ["CODE file", fileCode || "(trống)"],
      ["CODE dùng", usedCode ? (CALL_STATUS_LIST.find(c => c.value === usedCode)?.code || usedCode) : "(mặc định)"],
      ["Trạng thái", res?.TRANG_THAI || "Chưa chạy"], ["Đã lưu", res?.["ĐÃ LƯU"] || "—"], ["Lý do", res?.LY_DO || "—"]
    ];
    if (res?._ERR) meta.push(["Lỗi", res._ERR]);
    if (res?.["Thời gian"]) meta.push(["Thời gian", res["Thời gian"]]);

    const infoFields = [];
    if (res) {
      Object.keys(res).forEach(k => {
        if (HIDDEN_FIELDS.has(k)) return;
        if (k.startsWith("_")) return;
        const v = String(res[k] ?? "").trim();
        if (!v) return;
        infoFields.push([k, v]);
      });
    }

    const HOPDONG_KEYS = ["Số HD","Số HD kênh thu hộ","Loại HD","Ngày giải ngân","Số tiền quá hạn (cũ)",
      "DEBT SALE DATES","Gốc còn lại","AppID","Số tiền vay","Ngày quá hạn","Số lần tt",
      "Số tiền thanh toán gần nhất","Ngày tt gần nhất","Tiền kỳ tt","Kỳ hạn vay","Lãi tới hạn",
      "Lãi quá hạn","Tổng tiền trả","Tổng kỳ tt","Ngày trả hàng tháng","LAST_PAID",
      "CHARGE_OFF_FLAG","Product","Product scheme","CDL_DESC","Segmantation","PRODUCT_GROUP","Phân loại"];
    const khFields = infoFields.filter(([k]) => !HOPDONG_KEYS.includes(k));
    const hdFields = infoFields.filter(([k]) => HOPDONG_KEYS.includes(k));

    let html = `
      <div class="detail-section">
        <div class="detail-section-title">💬 TIN NHẮN ZALO</div>
        ${buildZaloActions(res || { SHD: row.SHD }, idx, row.SHD)}
      </div>
      <div class="detail-section">
        <div class="detail-section-title">🔎 THÔNG TIN XỬ LÝ</div>
        <div class="detail-grid">
          ${meta.map(([k, v]) => `<div class="k">${k}</div><div class="v ${!v || v === '—' || v === '(chưa lấy được)' ? 'empty' : ''}">${v || '—'}</div>`).join("")}
        </div>
      </div>
    `;

    if (khFields.length) {
      html += `
        <div class="detail-section">
          <div class="detail-section-title">👤 THÔNG TIN KHÁCH HÀNG</div>
          <div class="detail-grid">
            ${khFields.map(([k, v]) => `<div class="k">${k}</div><div class="v">${highlightValue(k, v)}</div>`).join("")}
          </div>
        </div>
      `;
    }

    if (hdFields.length) {
      html += `
        <div class="detail-section">
          <div class="detail-section-title">📄 THÔNG TIN HỢP ĐỒNG</div>
          <div class="detail-grid">
            ${hdFields.map(([k, v]) => `<div class="k">${k}</div><div class="v">${highlightValue(k, v)}</div>`).join("")}
          </div>
        </div>
      `;
    }

    if (!khFields.length && !hdFields.length && !res) {
      html += `<div class="empty-detail">Chưa có dữ liệu — bấm "📋 Cào" hoặc "▶ Chạy"</div>`;
    }

    detailEl.innerHTML = html;
    bindZaloActions(detailEl, results, rows);
  }

  async function readExcel(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", dense: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    if (!data.length) throw new Error("File trống");
    const headers = Object.keys(data[0]);
    const shdKey = headers.find(k => {
      const n = normalize(k);
      return n === "shd" || n === "so hop dong" || n === "contract" || n === "contract no" || n === "so hd";
    });
    if (!shdKey) throw new Error("Không tìm thấy cột SHD");
    const codeKeyCandidates = headers.filter(k => {
      const n = normalize(k);
      return ["code","action","ma","ma code","ma action","trang thai","status",
              "callstatus","call status","call code","action code","ma trang thai",
              "ket qua","result","ghi chu code","note code","callstatus code"].includes(n);
    });
    const codeKey2 = codeKeyCandidates.find(k => normalize(k).includes("code")) || codeKeyCandidates[0] || null;

    rows = data.map(r => {
      const shd = clean(r[shdKey]);
      let rawCode = "", code = null;
      if (codeKey2 && r[codeKey2] !== undefined && r[codeKey2] !== "") {
        const parsed = parseCodeFromCell(r[codeKey2]);
        if (parsed.code) { code = parsed.code; rawCode = parsed.raw; }
        else if (parsed.raw) { rawCode = parsed.raw; }
      }
      if (!code) {
        for (const ck of codeKeyCandidates) {
          if (ck === codeKey2) continue;
          if (r[ck] === undefined || r[ck] === "") continue;
          const parsed = parseCodeFromCell(r[ck]);
          if (parsed.code) { code = parsed.code; rawCode = parsed.raw; break; }
        }
      }
      return { ...r, SHD: shd, _CODE: code, _RAW_CODE: rawCode };
    }).filter(r => r.SHD);

    results = new Array(rows.length);
    completed = success = notFound = errors = active = 0;
    pendingQueue = [];
    retryQueue = [];
    expandedRow = null;
    selectedRowIdx = rows.length ? 0 : null;
    currentBatch = 0;
    totalBatches = Math.ceil(rows.length / dynamicBatchSize);
    logCounter = 0;
    zaloEdits.clear();
    updateUI();
    renderPreview();
    if (isExpanded) renderExpanded();

    const codeCount = rows.filter(r => r._CODE).length;
    const totalCodeInFile = rows.filter(r => r._RAW_CODE).length;
    log(`Đã load ${rows.length} SHD – ${codeCount}/${totalCodeInFile} dòng có CODE`, "ok", true);
    const tabCounts = { LOAN: 0, CRC: 0, VPB: 0 };
    rows.forEach(r => { const t = getTargetType(r.SHD); tabCounts[t] = (tabCounts[t] || 0) + 1; });
    log(`Phân bố: LOAN=${tabCounts.LOAN} | CRC=${tabCounts.CRC} | VPB=${tabCounts.VPB}`, "info", true);
    $("uni_status").textContent = `Đã load ${rows.length} SHD – sẵn sàng`;
  }

  async function runBatch(batchItems, worker, iframePool) {
    pendingQueue = batchItems.map(item => ({ ...item, attempt: 0 }));
    const tasks = iframePool.map(fr => worker(fr));
    await Promise.all(tasks);
  }

  async function startList(isScrapeMode = false) {
    if (!rows.length) return alert("Chưa chọn file Excel");
    readConfig();
    const useFileCode = $("uni_use_file_code")?.checked ?? true;
    const rawQueue = [];
    for (let i = 0; i < rows.length; i++) {
      if (!results[i] || !results[i].GIN) {
        const row = { ...rows[i] };
        if (!useFileCode) row._CODE = null;
        rawQueue.push({ index: i, row });
      }
    }
    const order = { LOAN: 0, CRC: 1, VPB: 2 };
    rawQueue.sort((a, b) => {
      const ta = getTargetType(a.row.SHD);
      const tb = getTargetType(b.row.SHD);
      return (order[ta] ?? 9) - (order[tb] ?? 9);
    });
    if (!rawQueue.length) return alert("Không còn SHD cần chạy");
    running = true; paused = false; stopRequested = false;
    const modeLabel = isScrapeMode ? "CÀO" : "CHẠY & LƯU";
    dynamicBatchSize = Math.min(CONFIG.CONCURRENT, CONFIG.MAX_PARALLEL_SAFE);
    dynamicBatchWait = CONFIG.BATCH_WAIT;
    consecutiveCleanBatches = 0;
    totalBatches = Math.ceil(rawQueue.length / dynamicBatchSize);
    currentBatch = 0;
    logCounter = 0;
    log(`Bắt đầu ${modeLabel} – ${rawQueue.length} SHD | Batch ${dynamicBatchSize} × ${totalBatches} | Code=${actionCode}`, "ok", true);
    const worker = isScrapeMode ? workerScrape : workerList;
    createIframes(dynamicBatchSize);
    let i = 0;
    while (i < rawQueue.length && !stopRequested) {
      const batch = rawQueue.slice(i, i + dynamicBatchSize);
      currentBatch++;
      totalBatches = Math.ceil((rawQueue.length - i) / dynamicBatchSize) + (currentBatch - 1);
      updateUI();
      $("uni_status").textContent = `${modeLabel} – Batch ${currentBatch} (${batch.length} SHD) | Còn ${rawQueue.length - i}`;
      log(`━━━ Batch ${currentBatch} – ${batch.length} SHD ━━━`, "info", true);
      await runBatch(batch, worker, iframes);
      if (stopRequested) break;
      i += batch.length;
      if (i < rawQueue.length && !stopRequested) await sleep(dynamicBatchWait);
    }
    running = false;
    if (!paused) {
      $("uni_status").textContent = `HOÀN THÀNH ${modeLabel}`;
      log(`Xong ${modeLabel} – Thành công: ${success} | Lỗi: ${errors + notFound}`, "ok", true);
    }
    updateUI();
    renderPreview();
    if (isExpanded) renderExpanded();
  }

  async function startNew() {
    readConfig();
    running = true; stopRequested = false;
    activePages = ["loan", "crc", "vpb"];
    round = 0; completed = success = errors = notFound = 0;
    results = [];
    zaloEdits.clear();
    log("=== Bắt đầu quét NEW ===", "ok", true);
    while (!stopRequested) {
      round++;
      $("uni_status").textContent = `Vòng ${round}: Đang quét NEW...`;
      updateUI();
      let allItems = [];
      const stillActive = [];
      for (const key of activePages) {
        if (stopRequested) break;
        const page = PAGES.find(p => p.key === key);
        if (!page) continue;
        try {
          const items = await searchNEWOnPage(page);
          if (items.length) { allItems.push(...items); stillActive.push(key); log(`[${page.name}] tìm thấy ${items.length} NEW`, "ok", true); }
          else log(`[${page.name}] hết NEW`, "warn", true);
        } catch (e) {
          log(`[${page.name}] lỗi quét: ${e.message}`, "err", true);
          stillActive.push(key);
        }
        await sleep(350);
      }
      activePages = stillActive;
      if (!allItems.length || !activePages.length) {
        log("Không còn NEW. Dừng.", "ok", true);
        $("uni_status").textContent = "HOÀN THÀNH – hết NEW";
        break;
      }
      totalBatches = Math.ceil(allItems.length / dynamicBatchSize);
      currentBatch = 0;
      for (let i = 0; i < allItems.length; i += dynamicBatchSize) {
        if (stopRequested) break;
        const batch = allItems.slice(i, i + dynamicBatchSize);
        currentBatch = Math.floor(i / dynamicBatchSize) + 1;
        updateUI();
        log(`━━━ Vòng ${round} – Batch ${currentBatch}/${totalBatches} ━━━`, "info", true);
        pendingQueue = batch.map((item, idx) => ({ index: idx, row: item, attempt: 0 }));
        const tasks = iframes.map(async fr => {
          while (running && !stopRequested) {
            const task = await takeTask();
            if (!task) break;
            active++;
            updateUI();
            const data = await processOneNew(fr, task.row);
            active = Math.max(0, active - 1);
            if (data) { results.push(data); success++; completed++; }
            else { errors++; completed++; }
            updateUI();
            await sleep(150);
          }
        });
        await Promise.all(tasks);
        if (i + dynamicBatchSize < allItems.length) await sleep(dynamicBatchWait);
      }
      if (stopRequested) break;
      await sleep(1000);
    }
    running = false;
    updateUI();
  }

  function getExportData() {
    if (mode === "list") {
      return rows.map((src, i) => {
        const r = results[i] || { ...src, GIN: "chưa chạy" };
        const out = { ...r };
        Object.keys(out).forEach(k => k.startsWith("_") && delete out[k]);
        const ten = getTenFromResult(r);
        if (ten) out["Tên KH"] = ten;
        return out;
      });
    }
    return results.map(r => {
      const out = { ...r };
      Object.keys(out).forEach(k => k.startsWith("_") && delete out[k]);
      const ten = getTenFromResult(r);
      if (ten) out["Tên KH"] = ten;
      return out;
    });
  }

  function exportExcel() {
    const data = getExportData();
    if (!data.length) return alert("Chưa có dữ liệu");
    if (!window.XLSX) { alert("Chưa load XLSX, xuất CSV..."); return exportCSV(); }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const fileName = `Unified_${mode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    log(`Đã xuất Excel: ${fileName} (${data.length} dòng)`, "ok", true);
  }

  function exportCSV() {
    const data = getExportData();
    if (!data.length) return alert("Chưa có dữ liệu");
    const cols = [...new Set(data.flatMap(r => Object.keys(r)))];
    let csv = cols.map(c => `"${c}"`).join(",") + "\n";
    data.forEach(row => {
      csv += cols.map(c => `"${String(row[c] ?? "").replace(/"/g, '""')}"`).join(",") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Unified_${mode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    log(`Đã xuất CSV (${data.length} dòng)`, "ok", true);
  }

  function bind() {
    $("uni_file").onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { await loadXLSX(); await readExcel(f); }
      catch (err) { log(err.message, "err", true); alert(err.message); }
    };
    $("uni_use_file_code").onchange = () => {
      const on = $("uni_use_file_code").checked;
      log(`Note code theo file: ${on ? "BẬT" : "TẮT"}`, "info", true);
    };
    $("uni_run").onclick = async () => {
      if (running) return;
      if (mode === "list") await startList(false);
      else await startNew();
    };
    $("uni_scrape").onclick = async () => {
      if (running) return;
      if (mode !== "list") return alert("Cào chỉ áp dụng cho chế độ Danh sách SHD");
      if (!confirm("Cào thông tin KHÔNG lưu?")) return;
      await startList(true);
    };
    $("uni_pause").onclick = () => {
      paused = true; running = false; stopRequested = true;
      $("uni_status").textContent = "Đã dừng";
      log("Dừng", "warn", true);
    };
    $("uni_expand").onclick = () => {
      if (isExpanded) {
        isExpanded = false;
        document.getElementById("__UNI_EXPANDED")?.remove();
      } else {
        openExpanded();
      }
    };
    $("uni_export_xlsx").onclick = exportExcel;
    $("uni_export_csv").onclick = exportCSV;
    $("uni_reset").onclick = () => {
      if (!confirm("Reset toàn bộ?")) return;
      running = false; stopRequested = true; paused = true;
      rows = []; results = [];
      completed = success = notFound = errors = active = 0;
      pendingQueue = []; retryQueue = [];
      expandedRow = null; selectedRowIdx = null; isExpanded = false;
      currentBatch = 0; totalBatches = 0;
      iframeTab.clear();
      logCounter = 0;
      zaloEdits.clear();
      document.getElementById("__UNI_EXPANDED")?.remove();
      updateUI();
      if ($("uni_preview_wrap")) $("uni_preview_wrap").style.display = "none";
      if ($("uni_preview")) $("uni_preview").innerHTML = "";
      $("uni_log").innerHTML = "";
      $("uni_status").textContent = "Đã reset";
      if ($("uni_file")) $("uni_file").value = "";
      log("Reset xong", "info", true);
    };
    $("uni_close").onclick = () => {
      running = false; stopRequested = true;
      if (uiTimer) clearInterval(uiTimer);
      document.getElementById("__UNI_UI")?.remove();
      document.getElementById("__UNI_STYLE")?.remove();
      document.getElementById("__UNI_EXPANDED")?.remove();
      document.querySelectorAll('[id^="__uni_fr_"]').forEach(el => el.remove());
      document.getElementById("__uni_search_fr")?.remove();
      window.__UNIFIED_DEBT_V1__ = false;
    };
  }

  createUI();
  bind();
  updateUI();
  uiTimer = setInterval(() => { updateUI(); }, 400);
  log("Unified Tool v4.6 – Zalo editable + copy nội dung đã sửa", "ok", true);
  log(`Batch ${CONFIG.MAX_PARALLEL_SAFE} | Timeout ${CONFIG.TIMEOUT}ms | Retry ${CONFIG.MAX_RETRY}`, "ok", true);
})();
