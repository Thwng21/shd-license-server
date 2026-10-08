(async () => {

  /* =========================================================
     GIN AUTO FULL V7
     
     FIX:
     - UI không giật / không re-render liên tục
     - UI update theo batch ~250ms
     - Progress = SHD hoàn thành thực tế
     - GIN thống kê theo results cuối cùng
     - SĐT đọc được nhiều dạng HTML
     - Không mất kết quả với 1500+ SHD
     - Giữ nguyên SHD trùng
     - XLSX + CSV fallback
     - Concurrent 3
     ========================================================= */

  if (window.__GIN_AUTO_FULL_V7__) {
    alert("GIN AUTO FULL V7 đang chạy.");
    return;
  }

  window.__GIN_AUTO_FULL_V7__ = true;

  /* =========================================================
     CONFIG
     ========================================================= */

  const CONFIG = {

    CONCURRENT: 3,

    RETRY: 2,

    DELAY: 350,

    RETRY_DELAY: 1200,

    /*
      UI chỉ render tối đa khoảng 4 lần/giây.
      Điều này giúp panel đứng yên khi chạy.
    */
    UI_INTERVAL: 250,

    /*
      Active timer chỉ cập nhật thời gian
      khi thực sự cần.
    */
    ACTIVE_TIMER_INTERVAL: 1000,

    INCLUDE_PHONE: true,

    INCLUDE_ID: true,

    XLSX_CDN:
      "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"

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


  /*
    UI dirty flag.

    Không cập nhật DOM ngay lập tức
    sau từng request.
  */

  let uiDirty = true;

  let uiTimer = null;

  let activeTimer = null;


  /*
    Map SHD đang chạy.
  */

  const activeMap = new Map();


  /* =========================================================
     HELPERS
     ========================================================= */

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


  const clean = value =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();


  const normalize = value =>
    clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.:_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();


  const escapeHtml = value =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");


  function markUIDirty() {
    uiDirty = true;
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

      const script =
        document.createElement("script");

      script.src =
        CONFIG.XLSX_CDN;

      script.onload = () => {

        if (window.XLSX) {
          resolve();
        } else {
          reject(
            new Error(
              "Không tìm thấy XLSX"
            )
          );
        }

      };

      script.onerror = () => {

        reject(
          new Error(
            "Không tải được SheetJS"
          )
        );

      };

      document.head.appendChild(script);

    });

  }


  /* =========================================================
     UI
     ========================================================= */

  function createUI() {

    document
      .getElementById("__GINAUTO_V7_UI")
      ?.remove();

    document
      .getElementById("__GINAUTO_V7_STYLE")
      ?.remove();


    const style =
      document.createElement("style");

    style.id =
      "__GINAUTO_V7_STYLE";

    style.textContent = `

      #__GINAUTO_V7_UI {

        position: fixed;

        z-index: 2147483647;

        right: 16px;

        top: 16px;

        width: 460px;

        height: 760px;

        max-height: calc(100vh - 32px);

        overflow: hidden;

        background: #f8f9fa;

        color: #212529;

        border: 1px solid #dee2e6;

        border-radius: 9px;

        box-shadow:
          0 8px 30px rgba(0,0,0,.18);

        font:
          13px
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          Arial,
          sans-serif;

        contain: layout paint style;

      }


      #__GINAUTO_V7_UI * {
        box-sizing: border-box;
      }


      #ga7_header {

        height: 45px;

        display: flex;

        align-items: center;

        padding: 0 14px;

        background: #212529;

        color: #fff;

        font-size: 15px;

        font-weight: 700;

        flex-shrink: 0;

      }


      #ga7_body {

        height: calc(100% - 45px);

        padding: 12px;

        overflow-y: auto;

        overflow-x: hidden;

        overscroll-behavior: contain;

      }


      .ga7_card {

        background: #fff;

        border: 1px solid #e3e6e8;

        border-radius: 7px;

        padding: 9px 10px;

        margin-bottom: 8px;

      }


      .ga7_stats {

        display: grid;

        grid-template-columns:
          repeat(3, 1fr);

        gap: 7px;

      }


      .ga7_label {

        font-size: 10px;

        color: #6c757d;

        text-transform: uppercase;

        font-weight: 600;

      }


      .ga7_number {

        font-size: 19px;

        font-weight: 700;

        margin-top: 2px;

      }


      .ga7_green {
        color: #198754;
      }


      .ga7_red {
        color: #dc3545;
      }


      .ga7_yellow {
        color: #b58105;
      }


      .ga7_blue {
        color: #0d6efd;
      }


      #ga7_current {

        height: 83px;

        background: #fff;

        border: 1px solid #dee2e6;

        border-radius: 7px;

        padding: 10px;

        margin-top: 9px;

        overflow: hidden;

      }


      #ga7_current_shd {

        height: 21px;

        font-size: 14px;

        font-weight: 700;

        margin-top: 4px;

        overflow: hidden;

        text-overflow: ellipsis;

        white-space: nowrap;

      }


      #ga7_current_status {

        height: 35px;

        margin-top: 4px;

        font-size: 12px;

        line-height: 1.45;

        overflow: hidden;

      }


      #ga7_active {

        height: 120px;

        overflow-y: auto;

        overflow-x: hidden;

        margin-top: 8px;

        background: #fff;

        border: 1px solid #e3e6e8;

        border-radius: 7px;

        padding: 4px;

        contain: content;

      }


      .ga7_active_item {

        height: 25px;

        display: flex;

        align-items: center;

        justify-content: space-between;

        gap: 8px;

        padding: 3px 7px;

        border-bottom: 1px solid #f1f3f5;

        font-size: 11px;

      }


      .ga7_active_item:last-child {
        border-bottom: 0;
      }


      .ga7_active_shd {

        overflow: hidden;

        text-overflow: ellipsis;

        white-space: nowrap;

        flex: 1;

        min-width: 0;

      }


      .ga7_active_time {

        flex-shrink: 0;

        color: #6c757d;

      }


      .ga7_progress {

        height: 8px;

        background: #e9ecef;

        border-radius: 5px;

        overflow: hidden;

        margin-top: 10px;

      }


      #ga7_progress_fill {

        width: 0%;

        height: 100%;

        background: #198754;

        transform:
          translateZ(0);

        transition:
          width .18s ease;

      }


      #ga7_percent {

        text-align: center;

        margin-top: 5px;

        font-size: 11px;

        color: #6c757d;

        height: 16px;

      }


      .ga7_buttons {

        display: grid;

        grid-template-columns:
          1fr 1fr;

        gap: 7px;

        margin-top: 9px;

      }


      .ga7_button {

        border: 1px solid #ced4da;

        background: #fff;

        border-radius: 6px;

        padding: 8px 9px;

        cursor: pointer;

        font-size: 12px;

        font-weight: 600;

      }


      .ga7_button:hover {
        background: #f1f3f5;
      }


      .ga7_button:disabled {

        opacity: .55;

        cursor: not-allowed;

      }


      .ga7_start {

        background: #212529;

        color: #fff;

        border-color: #212529;

      }


      .ga7_export {

        width: 100%;

        margin-top: 7px;

        background: #198754;

        color: #fff;

        border-color: #198754;

      }


      .ga7_csv {

        width: 100%;

        margin-top: 7px;

      }


      .ga7_reset {

        width: 100%;

        margin-top: 7px;

        color: #dc3545;

      }


      .ga7_close {

        width: 100%;

        margin-top: 7px;

      }


      #ga7_log {

        background: #111827;

        color: #d1d5db;

        border-radius: 6px;

        padding: 8px;

        height: 180px;

        overflow: auto;

        font:
          11px/1.45
          Consolas,
          Monaco,
          monospace;

        contain: content;

      }


      .ga7_ok {
        color: #75b798;
      }


      .ga7_error {
        color: #ea868f;
      }


      .ga7_warn {
        color: #ffda6a;
      }


      .ga7_info {
        color: #9ec5fe;
      }


      .ga7_file {

        width: 100%;

        font-size: 12px;

      }


      .ga7_hint {

        color: #6c757d;

        font-size: 11px;

        margin-top: 5px;

        line-height: 1.4;

      }

    `;

    document.head.appendChild(style);


    const box =
      document.createElement("div");

    box.id =
      "__GINAUTO_V7_UI";

    box.innerHTML = `

      <div id="ga7_header">
        GIN AUTO FULL from WGnouht...
      </div>

      <div id="ga7_body">

        <input
          id="ga7_file"
          class="ga7_file"
          type="file"
          accept=".xlsx,.xls,.csv"
        >

        <div class="ga7_hint">
          UI được cố định kích thước và cập nhật theo nhịp,
          tránh giật khi nhiều SHD chạy đồng thời.
        </div>


        <div
          class="ga7_stats"
          style="margin-top:9px"
        >

          <div class="ga7_card">
            <div class="ga7_label">
              Tổng SHD
            </div>
            <div
              id="ga7_total"
              class="ga7_number"
            >
              0
            </div>
          </div>


          <div class="ga7_card">
            <div class="ga7_label">
              Đã xong
            </div>
            <div
              id="ga7_done"
              class="ga7_number ga7_blue"
            >
              0
            </div>
          </div>


          <div class="ga7_card">
            <div class="ga7_label">
              Đang chạy
            </div>
            <div
              id="ga7_active_count"
              class="ga7_number"
            >
              0
            </div>
          </div>


          <div class="ga7_card">
            <div class="ga7_label">
              GIN có
            </div>
            <div
              id="ga7_yes"
              class="ga7_number ga7_green"
            >
              0
            </div>
          </div>


          <div class="ga7_card">
            <div class="ga7_label">
              Không có
            </div>
            <div
              id="ga7_no"
              class="ga7_number ga7_yellow"
            >
              0
            </div>
          </div>


          <div class="ga7_card">
            <div class="ga7_label">
              Lỗi
            </div>
            <div
              id="ga7_error"
              class="ga7_number ga7_red"
            >
              0
            </div>
          </div>

        </div>


        <div id="ga7_current">

          <div class="ga7_label">
            Đang thực hiện
          </div>

          <div id="ga7_current_shd">
            Chưa bắt đầu
          </div>

          <div id="ga7_current_status">
            Hãy chọn file Excel.
          </div>

        </div>


        <div class="ga7_progress">
          <div
            id="ga7_progress_fill"
          ></div>
        </div>


        <div id="ga7_percent">
          0%
        </div>


        <div id="ga7_active">
          <div style="color:#6c757d;font-size:11px;padding:5px">
            Không có SHD đang chạy
          </div>
        </div>


        <div class="ga7_buttons">

          <button
            id="ga7_start"
            class="ga7_button ga7_start"
          >
            ▶ Bắt đầu
          </button>


          <button
            id="ga7_pause"
            class="ga7_button"
          >
            ⏸ Tạm dừng
          </button>

        </div>


        <button
          id="ga7_export"
          class="ga7_button ga7_export"
        >
          ↓ Xuất Excel
        </button>


        <button
          id="ga7_csv"
          class="ga7_button ga7_csv"
        >
          ↓ Xuất CSV dự phòng
        </button>


        <button
          id="ga7_reset"
          class="ga7_button ga7_reset"
        >
          ↺ Reset
        </button>


        <button
          id="ga7_close"
          class="ga7_button ga7_close"
        >
          ✕ Đóng
        </button>


        <div
          class="ga7_label"
          style="margin-top:12px;margin-bottom:5px"
        >
          Nhật ký
        </div>


        <div id="ga7_log"></div>

      </div>

    `;

    document.body.appendChild(box);

  }


  /* =========================================================
     DOM HELPER
     ========================================================= */

  function $(id) {
    return document.getElementById(id);
  }


  /* =========================================================
     LOG
     
     Log cũng được giới hạn.
     Không để 1500+ SHD làm DOM phình quá lớn.
     ========================================================= */

  function log(message, cls = "") {

    const el =
      $("ga7_log");

    if (!el)
      return;


    const line =
      document.createElement("div");

    line.className =
      cls;

    line.textContent =
      `[${new Date().toLocaleTimeString()}] ${message}`;


    el.appendChild(line);


    /*
      Giữ tối đa 500 dòng log.
    */

    while (
      el.children.length > 500
    ) {

      el.removeChild(
        el.firstElementChild
      );

    }


    el.scrollTop =
      el.scrollHeight;

  }


  /* =========================================================
     STATUS
     ========================================================= */

  function setStatus(message) {

    const el =
      $("ga7_current_status");

    if (el) {
      el.textContent =
        message;
    }

  }


  /* =========================================================
     UI UPDATE
     
     Đây là phần quan trọng nhất chống giật.
     
     Không gọi updateUI() liên tục.
     ========================================================= */

  function updateUI(force = false) {

    if (!force && !uiDirty)
      return;


    const total =
      rows.length;


    const percent =
      total
        ? Math.floor(
            completed /
            total *
            100
          )
        : 0;


    const els = {

      total: $("ga7_total"),

      done: $("ga7_done"),

      yes: $("ga7_yes"),

      no: $("ga7_no"),

      error: $("ga7_error"),

      active: $("ga7_active_count"),

      fill: $("ga7_progress_fill"),

      percent: $("ga7_percent")

    };


    if (els.total)
      els.total.textContent =
        total;


    if (els.done)
      els.done.textContent =
        completed;


    if (els.yes)
      els.yes.textContent =
        success;


    if (els.no)
      els.no.textContent =
        notFound;


    if (els.error)
      els.error.textContent =
        errors;


    if (els.active)
      els.active.textContent =
        active;


    if (els.fill)
      els.fill.style.width =
        percent + "%";


    if (els.percent)
      els.percent.textContent =
        `${percent}% — ${completed}/${total}`;


    uiDirty = false;

  }


  /* =========================================================
     UI TICK
     ========================================================= */

  uiTimer =
    setInterval(() => {

      if (
        window.__GIN_AUTO_FULL_V7__
      ) {

        updateUI();

      }

    }, CONFIG.UI_INTERVAL);


  /* =========================================================
     ACTIVE DISPLAY
     
     Chỉ render khi danh sách active thay đổi,
     KHÔNG render mỗi giây.
     ========================================================= */

  let activeRenderDirty = true;


  function markActiveDirty() {

    activeRenderDirty = true;

  }


  function renderActive(force = false) {

    if (
      !force &&
      !activeRenderDirty
    ) {
      return;
    }


    const el =
      $("ga7_active");

    if (!el)
      return;


    if (!activeMap.size) {

      el.innerHTML =
        `<div style="color:#6c757d;font-size:11px;padding:5px">
          Không có SHD đang chạy
        </div>`;

      activeRenderDirty = false;

      return;

    }


    const fragment =
      document.createDocumentFragment();


    for (
      const [index, item]
      of activeMap.entries()
    ) {

      const div =
        document.createElement("div");

      div.className =
        "ga7_active_item";


      const shd =
        document.createElement("span");

      shd.className =
        "ga7_active_shd";

      shd.textContent =
        `#${index + 1} ${item.shd}`;


      const time =
        document.createElement("span");

      time.className =
        "ga7_active_time";

      const seconds =
        Math.floor(
          (
            Date.now() -
            item.started
          ) / 1000
        );


      time.textContent =
        `${seconds}s`;


      div.appendChild(shd);

      div.appendChild(time);

      fragment.appendChild(div);

    }


    el.replaceChildren(
      fragment
    );


    activeRenderDirty = false;

  }


  /*
    Timer này chỉ cập nhật số giây
    trong các dòng hiện có.
    
    Không rebuild danh sách.
  */

  activeTimer =
    setInterval(() => {

      if (
        !window.__GIN_AUTO_FULL_V7__
      ) {
        return;
      }


      const el =
        $("ga7_active");

      if (!el)
        return;


      const items =
        el.querySelectorAll(
          ".ga7_active_item"
        );


      if (!items.length)
        return;


      let i = 0;


      for (
        const item
        of activeMap.values()
      ) {

        const time =
          items[i]
            ?.querySelector(
              ".ga7_active_time"
            );


        if (time) {

          const seconds =
            Math.floor(
              (
                Date.now() -
                item.started
              ) / 1000
            );


          time.textContent =
            `${seconds}s`;

        }


        i++;

      }

    }, CONFIG.ACTIVE_TIMER_INTERVAL);


  /* =========================================================
     ACTIVE
     ========================================================= */

  function addActive(
    index,
    shd
  ) {

    activeMap.set(
      index,
      {
        shd,
        started:
          Date.now()
      }
    );


    active++;

    markActiveDirty();

    markUIDirty();

  }


  function removeActive(
    index
  ) {

    activeMap.delete(
      index
    );


    active--;

    if (active < 0)
      active = 0;


    markActiveDirty();

    markUIDirty();

  }


  /*
    Render active theo tick UI.
  */

  const originalUpdateUI =
    updateUI;


  /*
    Không cần override.
    Chỉ render ở interval riêng.
  */

  setInterval(() => {

    if (
      window.__GIN_AUTO_FULL_V7__
    ) {

      renderActive();

    }

  }, CONFIG.UI_INTERVAL);


  /* =========================================================
     ADD VALUE
     ========================================================= */

  function addValue(
    out,
    key,
    value
  ) {

    key =
      clean(key);

    value =
      clean(value);


    if (
      !key ||
      !value
    ) {
      return;
    }


    if (!out[key]) {

      out[key] =
        value;

      return;

    }


    if (
      normalize(out[key]) ===
      normalize(value)
    ) {

      return;

    }


    const old =
      String(out[key])
        .split(" // ")
        .map(clean)
        .filter(Boolean);


    if (
      !old.some(
        x =>
          normalize(x) ===
          normalize(value)
      )
    ) {

      out[key] =
        old
          .concat(value)
          .join(" // ");

    }

  }


  /* =========================================================
     PHONE DETECTION
     ========================================================= */

  function isPhoneHeader(
    label
  ) {

    const n =
      normalize(label);


    return (

      n === "sdt" ||

      n === "so dt" ||

      n === "so dien thoai" ||

      n === "dien thoai" ||

      n === "phone" ||

      n === "mobile" ||

      n.includes("so dien thoai") ||

      n.includes("dien thoai")

    );

  }


  /* =========================================================
     ID DETECTION
     ========================================================= */

  function isIdHeader(
    label
  ) {

    const n =
      normalize(label);


    return (

      n.includes("cmnd") ||

      n.includes("cccd") ||

      n.includes("can cuoc") ||

      n.includes("chung minh")

    );

  }


  /* =========================================================
     SENSITIVE
     ========================================================= */

  function isSensitive(
    label
  ) {

    /*
      Theo CONFIG hiện tại,
      phone + ID đều được phép lấy.
    */

    if (
      isPhoneHeader(label)
    ) {

      return !CONFIG.INCLUDE_PHONE;

    }


    if (
      isIdHeader(label)
    ) {

      return !CONFIG.INCLUDE_ID;

    }


    return false;

  }


  /* =========================================================
     EXTRACT PHONE VALUE
     
     Cực kỳ quan trọng:
     lấy cả:
     - textContent
     - innerText
     - input.value
     - textarea.value
     - option
     - href
     - data-phone
     - title
     ========================================================= */

  function extractCellValue(
    cell
  ) {

    if (!cell)
      return "";


    /*
      input / textarea / select
    */

    const formElement =
      cell.matches?.(
        "input,textarea,select"
      )
        ? cell
        : cell.querySelector?.(
            "input,textarea,select"
          );


    if (
      formElement
    ) {

      const value =
        clean(
          formElement.value
        );

      if (value)
        return value;

    }


    /*
      Link.
    */

    const link =
      cell.querySelector?.(
        "a"
      );


    if (link) {

      const text =
        clean(
          link.innerText ||
          link.textContent
        );


      if (text)
        return text;


      const href =
        clean(
          link.getAttribute(
            "href"
          )
        );


      if (
        href &&
        !/^javascript:/i.test(
          href
        )
      ) {

        return href;

      }

    }


    /*
      data-phone / data-value
    */

    const dataPhone =
      cell.getAttribute?.(
        "data-phone"
      );


    if (
      clean(dataPhone)
    ) {

      return clean(
        dataPhone
      );

    }


    const dataValue =
      cell.getAttribute?.(
        "data-value"
      );


    if (
      clean(dataValue)
    ) {

      return clean(
        dataValue
      );

    }


    /*
      title / aria-label
    */

    const title =
      cell.getAttribute?.(
        "title"
      );


    if (
      clean(title)
    ) {

      return clean(
        title
      );

    }


    const aria =
      cell.getAttribute?.(
        "aria-label"
      );


    if (
      clean(aria)
    ) {

      return clean(
        aria
      );

    }


    /*
      innerText trước.
    */

    const text =
      clean(
        cell.innerText ||
        cell.textContent
      );


    return text;

  }


  /* =========================================================
     GET SECTION
     ========================================================= */

  function getSectionName(
    table
  ) {

    let current =
      table.previousElementSibling;


    let count = 0;


    while (
      current &&
      count < 12
    ) {

      const text =
        clean(
          current.innerText
        );


      if (
        text &&
        /^(H1|H2|H3|H4|H5|H6)$/
          .test(
            current.tagName
          )
      ) {

        return text;

      }


      if (
        text &&
        text.length < 120 &&
        (
          normalize(text)
            .includes("thong tin") ||

          normalize(text)
            .includes("lien he") ||

          normalize(text)
            .includes("nguoi") ||

          normalize(text)
            .includes("ho gia dinh")
        )
      ) {

        return text;

      }


      current =
        current.previousElementSibling;


      count++;

    }


    return "";

  }


  /* =========================================================
     EXTRACT INFO BLOCKS
     ========================================================= */

  function extractInfoBlocks(
    doc,
    out
  ) {

    const selectors = [

      ".gin-info-list",

      "[class*='gin-info']",

      "[class*='thong-tin']",

      "[class*='thongtin']",

      "[class*='information']",

      "[class*='info-list']"

    ];


    const containers = [];


    selectors.forEach(
      selector => {

        doc
          .querySelectorAll(
            selector
          )
          .forEach(
            el => {

              if (
                !containers.includes(el)
              ) {

                containers.push(el);

              }

            }
          );

      }
    );


    containers.forEach(
      box => {

        box
          .querySelectorAll("li")
          .forEach(
            li => {

              const label =
                li.querySelector(
                  ".gin-info-list__label"
                ) ||
                li.querySelector(
                  "[class*='label']"
                ) ||
                li.querySelector(
                  "label"
                );


              const value =
                li.querySelector(
                  ".gin-info-list__value"
                ) ||
                li.querySelector(
                  "[class*='value']"
                );


              if (
                label &&
                value
              ) {

                const k =
                  clean(
                    label.textContent
                  );


                const v =
                  extractCellValue(
                    value
                  );


                if (
                  k &&
                  v &&
                  !isSensitive(k)
                ) {

                  addValue(
                    out,
                    k,
                    v
                  );

                }


                /*
                  PHONE tổng hợp
                */

                if (
                  isPhoneHeader(k) &&
                  CONFIG.INCLUDE_PHONE
                ) {

                  addValue(
                    out,
                    "SỐ ĐIỆN THOẠI",
                    v
                  );

                }

              }

            }
          );


        /*
          Dạng:
          <div>
             <div>Họ tên</div>
             <div>Nguyễn...</div>
          </div>
        */

        box
          .querySelectorAll("div")
          .forEach(
            el => {

              const children =
                [...el.children];


              if (
                children.length !== 2
              ) {
                return;
              }


              const key =
                clean(
                  children[0].innerText
                );


              const value =
                extractCellValue(
                  children[1]
                );


              if (
                !key ||
                !value ||
                key.length > 150 ||
                value.length > 2000
              ) {

                return;

              }


              if (
                !isSensitive(key)
              ) {

                addValue(
                  out,
                  key,
                  value
                );

              }


              if (
                isPhoneHeader(key) &&
                CONFIG.INCLUDE_PHONE
              ) {

                addValue(
                  out,
                  "SỐ ĐIỆN THOẠI",
                  value
                );

              }

            }
          );

      }
    );

  }


  /* =========================================================
     EXTRACT TABLES
     ========================================================= */

  function extractTables(
    doc,
    out
  ) {

    const tables =
      [
        ...doc.querySelectorAll(
          "table"
        )
      ];


    tables.forEach(
      (
        table,
        tableIndex
      ) => {

        const trs =
          [
            ...table.querySelectorAll(
              "tr"
            )
          ];


        if (!trs.length)
          return;


        /*
          Tìm header.
        */

        let headerRow =
          trs.find(
            tr =>
              tr.querySelector(
                "th"
              )
          );


        if (!headerRow) {

          headerRow =
            trs[0];

        }


        let headers =
          [
            ...headerRow
              .querySelectorAll(
                "th,td"
              )
          ]
          .map(
            cell =>
              clean(
                extractCellValue(
                  cell
                )
              )
          );


        if (!headers.length)
          return;


        headers =
          headers.map(
            (
              h,
              i
            ) =>
              h ||
              `Cột ${i + 1}`
          );


        const section =
          getSectionName(
            table
          ) ||
          `Bảng ${tableIndex + 1}`;


        /*
          Header normalized
        */

        const normalizedHeaders =
          headers.map(
            normalize
          );


        /*
          Index phone.
        */

        const phoneIndexes = [];


        normalizedHeaders.forEach(
          (
            h,
            i
          ) => {

            if (
              isPhoneHeader(h)
            ) {

              phoneIndexes.push(i);

            }

          }
        );


        /*
          Index name.
        */

        const nameIndexes = [];


        normalizedHeaders.forEach(
          (
            h,
            i
          ) => {

            if (
              h === "ho ten" ||
              h === "ho va ten" ||
              h === "ten"
            ) {

              nameIndexes.push(i);

            }

          }
        );


        /*
          Index relation.
        */

        const relationIndexes = [];


        normalizedHeaders.forEach(
          (
            h,
            i
          ) => {

            if (
              h === "loai" ||
              h === "quan he" ||
              h === "moi quan he"
            ) {

              relationIndexes.push(i);

            }

          }
        );


        /*
          Read rows.
        */

        trs.forEach(
          (
            tr,
            rowIndex
          ) => {

            if (
              tr === headerRow
            ) {

              return;

            }


            const cells =
              [
                ...tr.querySelectorAll(
                  "td"
                )
              ];


            if (!cells.length)
              return;


            const values =
              cells.map(
                extractCellValue
              );


            if (
              values.every(
                x => !clean(x)
              )
            ) {

              return;

            }


            /*
              PHONE
            */

            phoneIndexes.forEach(
              index => {

                const value =
                  clean(
                    values[index]
                  );


                if (
                  value &&
                  CONFIG.INCLUDE_PHONE
                ) {

                  addValue(
                    out,
                    "SỐ ĐIỆN THOẠI",
                    value
                  );

                }

              }
            );


            /*
              NAME
            */

            nameIndexes.forEach(
              index => {

                const value =
                  clean(
                    values[index]
                  );


                if (value) {

                  addValue(
                    out,
                    "DANH SÁCH HỌ TÊN",
                    value
                  );

                }

              }
            );


            /*
              RELATION
            */

            relationIndexes.forEach(
              index => {

                const value =
                  clean(
                    values[index]
                  );


                if (value) {

                  addValue(
                    out,
                    "QUAN HỆ",
                    value
                  );

                }

              }
            );


            /*
              Từng cell.
            */

            values.forEach(
              (
                value,
                i
              ) => {

                if (!value)
                  return;


                const header =
                  headers[i] ||
                  `Cột ${i + 1}`;


                /*
                  STT bỏ.
                */

                if (
                  normalize(header) ===
                  "stt"
                ) {

                  return;

                }


                /*
                  Phone:
                  vẫn lưu field riêng
                  và field theo section.
                */

                if (
                  isPhoneHeader(
                    header
                  )
                ) {

                  if (
                    CONFIG.INCLUDE_PHONE
                  ) {

                    addValue(
                      out,
                      "SỐ ĐIỆN THOẠI",
                      value
                    );

                  }

                }


                /*
                  ID
                */

                if (
                  isIdHeader(header) &&
                  CONFIG.INCLUDE_ID
                ) {

                  addValue(
                    out,
                    header,
                    value
                  );

                }


                /*
                  Field bình thường.
                */

                const key =
                  `${section} - ${header}`;


                addValue(
                  out,
                  key,
                  value
                );

              }
            );

          }
        );

      }
    );

  }


  /* =========================================================
     SPECIAL CONTACT INFORMATION
     ========================================================= */

  function extractContactInformation(
    doc,
    out
  ) {

    const cards =
      [
        ...doc.querySelectorAll(
          ".card-body"
        )
      ];


    cards.forEach(
      card => {

        const text =
          clean(
            card.innerText
          );


        if (!text)
          return;


        const normalizedText =
          normalize(text);


        if (
          !normalizedText.includes(
            "so dien thoai"
          )
        ) {

          return;

        }


        const tables =
          [
            ...card.querySelectorAll(
              "table"
            )
          ];


        tables.forEach(
          table => {

            const trs =
              [
                ...table.querySelectorAll(
                  "tr"
                )
              ];


            if (!trs.length)
              return;


            const firstCells =
              [
                ...trs[0]
                  .querySelectorAll(
                    "th,td"
                  )
              ];


            const headers =
              firstCells.map(
                cell =>
                  normalize(
                    extractCellValue(
                      cell
                    )
                  )
              );


            const phoneIndex =
              headers.findIndex(
                isPhoneHeader
              );


            const nameIndex =
              headers.findIndex(
                h =>
                  h === "ho ten" ||
                  h === "ho va ten" ||
                  h === "ten"
              );


            if (
              phoneIndex < 0 &&
              nameIndex < 0
            ) {

              return;

            }


            trs
              .slice(1)
              .forEach(
                tr => {

                  const cells =
                    [
                      ...tr.querySelectorAll(
                        "td"
                      )
                    ];


                  const values =
                    cells.map(
                      extractCellValue
                    );


                  if (
                    !values.length
                  ) {

                    return;

                  }


                  if (
                    phoneIndex >= 0 &&
                    values[phoneIndex]
                  ) {

                    addValue(
                      out,
                      "SỐ ĐIỆN THOẠI",
                      values[phoneIndex]
                    );

                  }


                  if (
                    nameIndex >= 0 &&
                    values[nameIndex]
                  ) {

                    addValue(
                      out,
                      "DANH SÁCH HỌ TÊN",
                      values[nameIndex]
                    );

                  }

                }
              );

          }
        );

      }
    );

  }


  /* =========================================================
     PHONE FALLBACK
     
     Nếu parser không tìm được header,
     vẫn tìm các node có class / aria / data
     liên quan phone.
     ========================================================= */

  function extractPhoneFallback(
    doc,
    out
  ) {

    if (!CONFIG.INCLUDE_PHONE)
      return;


    const selectors = [

      "[class*='phone']",

      "[class*='mobile']",

      "[class*='sdt']",

      "[class*='dien-thoai']",

      "[class*='dienthoai']",

      "[data-phone]",

      "[aria-label*='phone']",

      "[aria-label*='điện thoại']"

    ];


    const seen =
      new Set();


    selectors.forEach(
      selector => {

        try {

          doc
            .querySelectorAll(
              selector
            )
            .forEach(
              el => {

                if (
                  seen.has(el)
                ) {

                  return;

                }


                seen.add(el);


                const value =
                  extractCellValue(
                    el
                  );


                if (!value)
                  return;


                /*
                  Chỉ giữ giá trị có khả năng
                  là số điện thoại.
                */

                const digits =
                  value.replace(
                    /[^0-9+]/g,
                    ""
                  );


                if (
                  digits.length >= 8 &&
                  digits.length <= 15
                ) {

                  addValue(
                    out,
                    "SỐ ĐIỆN THOẠI",
                    value
                  );

                }

              }
            );

        } catch (_) {}

      }
    );

  }


  /* =========================================================
     RESULT DETECTION
     ========================================================= */

  function detectResult(
    doc,
    shd
  ) {

    const bodyText =
      clean(
        doc.body?.innerText ||
        ""
      );


    const target =
      normalize(shd);


    /*
      Table có ít nhất 2 row.
    */

    const tables =
      [
        ...doc.querySelectorAll(
          "table"
        )
      ];


    const dataTables =
      tables.filter(
        table =>
          table.querySelectorAll(
            "tr"
          ).length >= 2
      );


    /*
      Card có SHD.
    */

    const cards =
      [
        ...doc.querySelectorAll(
          ".card-body"
        )
      ];


    const usefulCards =
      cards.filter(
        card => {

          const txt =
            clean(
              card.innerText
            );


          return (
            txt.length > 20 &&
            normalize(txt)
              .includes(target)
          );

        }
      );


    /*
      SHD xuất hiện.
    */

    const shdFound =
      Boolean(
        target &&
        normalize(bodyText)
          .includes(target)
      );


    /*
      Explicit no result.
    */

    const noResultPatterns = [

      "khong tim thay",

      "khong co du lieu",

      "khong co ket qua",

      "no result",

      "not found",

      "không tìm thấy",

      "không có dữ liệu",

      "không có kết quả"

    ];


    const explicitNo =
      noResultPatterns.some(
        x =>
          normalize(bodyText)
            .includes(
              normalize(x)
            )
      );


    /*
      Ưu tiên kết quả thực.
    */

    if (
      dataTables.length > 0 &&
      shdFound
    ) {

      return true;

    }


    if (
      usefulCards.length > 0
    ) {

      return true;

    }


    if (
      shdFound &&
      !explicitNo
    ) {

      return true;

    }


    return false;

  }


  /* =========================================================
     PARSE PAGE
     ========================================================= */

  function parsePage(
    doc,
    shd
  ) {

    const out = {};


    const found =
      detectResult(
        doc,
        shd
      );


    if (!found) {

      return {

        found: false,

        data: out

      };

    }


    extractInfoBlocks(
      doc,
      out
    );


    extractTables(
      doc,
      out
    );


    extractContactInformation(
      doc,
      out
    );


    extractPhoneFallback(
      doc,
      out
    );


    /*
      Nếu có kết quả nhưng parser
      chưa lấy được field nào,
      vẫn GIN = có.
    */

    out.GIN =
      "có";


    return {

      found: true,

      data: out

    };

  }


  /* =========================================================
     SEARCH
     ========================================================= */

  async function search(
    shd
  ) {

    const input =
      document.querySelector(
        "#searchInput"
      );


    if (!input) {

      throw new Error(
        "Không tìm thấy #searchInput"
      );

    }


    const form =
      input.closest(
        "form"
      );


    if (!form) {

      throw new Error(
        "Không tìm thấy form tìm kiếm"
      );

    }


    const action =
      form.action ||
      location.href;


    const method =
      (
        form.method ||
        "GET"
      ).toUpperCase();


    const url =
      new URL(
        action,
        location.href
      );


    const options = {

      credentials:
        "include",

      redirect:
        "follow",

      headers: {

        "X-Requested-With":
          "XMLHttpRequest",

        "Accept":
          "text/html,application/xhtml+xml"

      }

    };


    if (
      method === "GET"
    ) {

      url.searchParams.set(
        input.name ||
        "q",
        shd
      );


      options.method =
        "GET";

    } else {

      options.method =
        method;


      const fd =
        new FormData(
          form
        );


      fd.set(
        input.name ||
        "q",
        shd
      );


      options.body =
        fd;

    }


    const response =
      await fetch(
        url.href,
        options
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }


    const html =
      await response.text();


    if (
      !html ||
      html.length < 100
    ) {

      throw new Error(
        "Phản hồi rỗng"
      );

    }


    const doc =
      new DOMParser()
        .parseFromString(
          html,
          "text/html"
        );


    return parsePage(
      doc,
      shd
    );

  }


  /* =========================================================
     PROCESS ONE
     
     Quan trọng:
     Hàm này KHÔNG tự tăng completed.
     
     Worker sẽ là nơi duy nhất
     quyết định trạng thái cuối cùng.
     ========================================================= */

  async function processOne(
    row,
    rowIndex
  ) {

    const shd =
      clean(
        row.SHD
      );


    addActive(
      rowIndex,
      shd
    );


    $("ga7_current_shd")
      .textContent =
      `SHD: ${shd}`;


    let lastError =
      null;


    try {

      if (!shd) {

        return {

          ...row,

          GIN:
            "không",

          TRẠNG_THÁI:
            "SHD trống",

          __ERR:
            "SHD trống"

        };

      }


      for (
        let attempt = 1;
        attempt <=
          CONFIG.RETRY + 1;
        attempt++
      ) {

        try {

          setStatus(
            `Đang truy vấn... lần ${attempt}`
          );


          log(
            `${shd} → truy vấn lần ${attempt}`,
            "ga7_info"
          );


          const response =
            await search(
              shd
            );


          /*
            FOUND
          */

          if (
            response &&
            response.found
          ) {

            const data =
              response.data ||
              {};


            const fieldCount =
              Object.keys(data)
                .filter(
                  k =>
                    k !== "GIN"
                )
                .length;


            log(
              `${shd} → GIN CÓ → ${fieldCount} trường`,
              "ga7_ok"
            );


            return {

              ...row,

              ...data,

              GIN:
                "có",

              TRẠNG_THÁI:
                "Đã tìm thấy",

              __ERR:
                ""

            };

          }


          /*
            NOT FOUND
          */

          log(
            `${shd} → KHÔNG CÓ KẾT QUẢ`,
            "ga7_warn"
          );


          return {

            ...row,

            GIN:
              "không",

            TRẠNG_THÁI:
              "Không tìm thấy",

            __ERR:
              ""

          };


        } catch (
          error
        ) {

          lastError =
            error;


          log(
            `${shd} → lỗi lần ${attempt}: ${error.message}`,
            "ga7_warn"
          );


          if (
            attempt <=
            CONFIG.RETRY
          ) {

            await sleep(
              CONFIG.RETRY_DELAY *
              attempt
            );

          }

        }

      }


      /*
        Hết retry.
      */

      log(
        `${shd} → LỖI SAU ${CONFIG.RETRY + 1} LẦN`,
        "ga7_error"
      );


      return {

        ...row,

        GIN:
          "lỗi",

        TRẠNG_THÁI:
          "Lỗi truy vấn",

        __ERR:
          lastError?.message ||
          "Không xác định"

      };


    } finally {

      removeActive(
        rowIndex
      );

    }

  }


  /* =========================================================
     FINALIZE RESULT
     
     Đây là nơi DUY NHẤT tính:
     completed
     success
     notFound
     errors
     
     => giao diện và file thống nhất.
     ========================================================= */

  function finalizeResult(
    index,
    result
  ) {

    results[index] =
      result;


    completed++;


    const gin =
      normalize(
        result?.GIN
      );


    if (
      gin === "co" ||
      gin === "có"
    ) {

      success++;

    } else if (
      gin === "khong" ||
      gin === "không"
    ) {

      notFound++;

    } else {

      errors++;

    }


    markUIDirty();

  }


  /* =========================================================
     WORKER
     ========================================================= */

  async function worker(
    workerId
  ) {

    while (
      running &&
      !stopRequested
    ) {

      /*
        Pause:
        không lấy SHD mới.
      */

      if (paused) {
        break;
      }


      const index =
        nextIndex;


      if (
        index >= rows.length
      ) {

        break;

      }


      nextIndex++;


      const row =
        rows[index];


      try {

        const result =
          await processOne(
            row,
            index
          );


        /*
          Chỉ finalize sau khi
          request hoàn tất.
        */

        finalizeResult(
          index,
          result
        );


        const shd =
          clean(
            row.SHD
          );


        setStatus(
          `${shd} hoàn thành — ` +
          `${completed}/${rows.length}`
        );


      } catch (
        error
      ) {

        const result = {

          ...row,

          GIN:
            "lỗi",

          TRẠNG_THÁI:
            "Lỗi worker",

          __ERR:
            error?.message ||
            "Worker error"

        };


        finalizeResult(
          index,
          result
        );


        log(
          `${row.SHD} → Worker error: ${error.message}`,
          "ga7_error"
        );

      }


      if (
        CONFIG.DELAY > 0 &&
        running &&
        !paused &&
        !stopRequested
      ) {

        await sleep(
          CONFIG.DELAY
        );

      }

    }

  }


  /* =========================================================
     START
     ========================================================= */

  async function startProcessing() {

    if (!rows.length) {

      alert(
        "Bạn chưa chọn file Excel."
      );

      return;

    }


    if (
      running &&
      !paused
    ) {

      return;

    }


    /*
      Nếu chạy lại từ đầu sau khi hoàn tất.
    */

    if (
      completed >= rows.length &&
      !active
    ) {

      results =
        new Array(
          rows.length
        );


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


    setStatus(
      "Đang khởi động..."
    );


    log(
      `BẮT ĐẦU — ${rows.length} SHD — CONCURRENT=${CONFIG.CONCURRENT}`,
      "ga7_ok"
    );


    const workers = [];


    for (
      let i = 0;
      i < CONFIG.CONCURRENT;
      i++
    ) {

      workers.push(
        worker(i + 1)
      );

    }


    await Promise.all(
      workers
    );


    /*
      Nếu pause.
    */

    if (paused) {

      setStatus(
        `ĐÃ TẠM DỪNG — ${completed}/${rows.length}`
      );


      log(
        `TẠM DỪNG — ${completed}/${rows.length}`,
        "ga7_warn"
      );


      markUIDirty();

      return;

    }


    /*
      Stop.
    */

    if (stopRequested) {

      running = false;


      setStatus(
        `ĐÃ DỪNG — ${completed}/${rows.length}`
      );


      markUIDirty();

      return;

    }


    /*
      Hoàn thành.
    */

    running = false;


    if (
      completed >= rows.length
    ) {

      setStatus(
        `HOÀN THÀNH — ${completed}/${rows.length}`
      );


      $("ga7_current_shd")
        .textContent =
        "Đã xử lý toàn bộ";


      log(
        `HOÀN THÀNH — ${completed} SHD`,
        "ga7_ok"
      );

    }


    markUIDirty();

    updateUI(
      true
    );


    renderActive(
      true
    );

  }


  /* =========================================================
     PAUSE
     ========================================================= */

  function pauseProcessing() {

    if (!running)
      return;


    paused = true;


    /*
      Request hiện tại vẫn chạy.
      Worker không nhận SHD mới.
    */

    setStatus(
      `Tạm dừng nhận SHD mới — ${completed}/${rows.length}`
    );


    log(
      "TẠM DỪNG — request đang chạy sẽ hoàn tất",
      "ga7_warn"
    );


    markUIDirty();

  }


  /* =========================================================
     RESET
     ========================================================= */

  function resetAll() {

    if (
      !confirm(
        "Bạn có chắc muốn reset tiến trình?"
      )
    ) {

      return;

    }


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


    $("ga7_total")
      .textContent =
      "0";


    $("ga7_done")
      .textContent =
      "0";


    $("ga7_yes")
      .textContent =
      "0";


    $("ga7_no")
      .textContent =
      "0";


    $("ga7_error")
      .textContent =
      "0";


    $("ga7_active_count")
      .textContent =
      "0";


    $("ga7_current_shd")
      .textContent =
      "Chưa bắt đầu";


    $("ga7_current_status")
      .textContent =
      "Đã reset";


    $("ga7_progress_fill")
      .style.width =
      "0%";


    $("ga7_percent")
      .textContent =
      "0%";


    $("ga7_active")
      .innerHTML =
      `<div style="color:#6c757d;font-size:11px;padding:5px">
        Không có SHD đang chạy
      </div>`;


    $("ga7_log")
      .innerHTML =
      "";


    $("ga7_file")
      .value =
      "";


    uiDirty = false;

    activeRenderDirty = false;


    log(
      "Đã reset.",
      "ga7_info"
    );

  }


  /* =========================================================
     READ EXCEL
     ========================================================= */

  async function readExcel(
    file
  ) {

    const buffer =
      await file.arrayBuffer();


    const workbook =
      XLSX.read(
        buffer,
        {
          type:
            "array",

          dense:
            true
        }
      );


    if (
      !workbook.SheetNames.length
    ) {

      throw new Error(
        "File không có worksheet."
      );

    }


    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ];


    const data =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          defval: "",
          raw: false
        }
      );


    if (!data.length) {

      throw new Error(
        "Worksheet không có dữ liệu."
      );

    }


    const headers =
      Object.keys(
        data[0]
      );


    const shdKey =
      headers.find(
        key =>
          normalize(key) ===
          "shd"
      );


    if (!shdKey) {

      throw new Error(
        "Không tìm thấy cột SHD."
      );

    }


    /*
      KHÔNG loại SHD trùng.
      
      Mỗi dòng Excel =
      một kết quả tương ứng.
    */

    rows =
      data
        .map(
          row => ({

            ...row,

            SHD:
              clean(
                row[shdKey]
              )

          })
        )
        .filter(
          row =>
            Boolean(
              row.SHD
            )
        );


    results =
      new Array(
        rows.length
      );


    completed = 0;

    success = 0;

    notFound = 0;

    errors = 0;

    active = 0;

    nextIndex = 0;

    paused = false;

    running = false;

    stopRequested = false;

    fileLoaded = true;


    $("ga7_total")
      .textContent =
      rows.length;


    $("ga7_done")
      .textContent =
      "0";


    $("ga7_yes")
      .textContent =
      "0";


    $("ga7_no")
      .textContent =
      "0";


    $("ga7_error")
      .textContent =
      "0";


    $("ga7_active_count")
      .textContent =
      "0";


    $("ga7_current_shd")
      .textContent =
      "Sẵn sàng";


    setStatus(
      `Đã đọc ${rows.length} SHD`
    );


    $("ga7_progress_fill")
      .style.width =
      "0%";


    $("ga7_percent")
      .textContent =
      `0% — 0/${rows.length}`;


    log(
      `ĐỌC FILE THÀNH CÔNG — ${rows.length} SHD`,
      "ga7_ok"
    );


    markUIDirty();

  }


  /* =========================================================
     EXPORT DATA
     ========================================================= */

  function getExportRows() {

    return rows.map(
      (
        source,
        index
      ) => {

        const result =
          results[index];


        if (result) {

          return {
            ...result
          };

        }


        return {

          ...source,

          GIN:
            "chưa chạy",

          TRẠNG_THÁI:
            "Chưa xử lý",

          __ERR:
            ""

        };

      }
    );

  }


  /* =========================================================
     COLUMNS
     ========================================================= */

  function getColumns(
    data
  ) {

    const set =
      new Set();


    data.forEach(
      row => {

        Object.keys(
          row
        ).forEach(
          key => {

            if (
              key === "__ERR"
            ) {

              return;

            }


            set.add(
              key
            );

          }
        );

      }
    );


    const columns =
      [...set];


    const priority = [

      "SHD",

      "GIN",

      "TRẠNG_THÁI",

      "Họ và tên",

      "Ngày sinh",

      "Giới tính",

      "Địa chỉ",

      "SỐ ĐIỆN THOẠI",

      "DANH SÁCH HỌ TÊN",

      "QUAN HỆ"

    ];


    const ordered = [];


    priority.forEach(
      key => {

        if (
          columns.includes(key)
        ) {

          ordered.push(
            key
          );

        }

      }
    );


    columns.forEach(
      key => {

        if (
          !ordered.includes(key)
        ) {

          ordered.push(
            key
          );

        }

      }
    );


    /*
      Nếu dữ liệu có field SDT
      nhưng chưa có SỐ ĐIỆN THOẠI,
      vẫn đưa field SDT lên gần đầu.
    */

    const phoneColumns =
      columns.filter(
        isPhoneHeader
      );


    phoneColumns.forEach(
      key => {

        if (
          !ordered.includes(key)
        ) {

          ordered.push(
            key
          );

        }

      }
    );


    return ordered;

  }


  /* =========================================================
     EXPORT XLSX
     ========================================================= */

  async function exportXLSX() {

    const data =
      getExportRows();


    if (!data.length) {

      alert(
        "Chưa có dữ liệu."
      );

      return;

    }


    const btn =
      $("ga7_export");


    btn.disabled =
      true;


    btn.textContent =
      "⏳ Đang tạo Excel...";


    try {

      /*
        Cho browser một nhịp render
        trước khi bắt đầu tạo workbook.
      */

      await sleep(50);


      const columns =
        getColumns(
          data
        );


      /*
        AOA.
      */

      const aoa =
        new Array(
          data.length + 1
        );


      aoa[0] =
        columns;


      for (
        let i = 0;
        i < data.length;
        i++
      ) {

        const row =
          data[i];


        const output =
          new Array(
            columns.length
          );


        for (
          let j = 0;
          j < columns.length;
          j++
        ) {

          output[j] =
            row[
              columns[j]
            ] ?? "";

        }


        aoa[i + 1] =
          output;

      }


      const ws =
        XLSX.utils.aoa_to_sheet(
          aoa,
          {
            dense:
              true
          }
        );


      /*
        Column width.
        Chỉ sample tối đa 100 dòng.
      */

      ws["!cols"] =
        columns.map(
          column => {

            let max =
              String(
                column
              ).length;


            const sampleCount =
              Math.min(
                data.length,
                100
              );


            for (
              let i = 0;
              i < sampleCount;
              i++
            ) {

              const len =
                String(
                  data[i][column] ??
                  ""
                ).length;


              if (
                len > max
              ) {

                max = len;

              }

            }


            return {

              wch:
                Math.min(
                  Math.max(
                    max + 2,
                    12
                  ),
                  55
                )

            };

          }
        );


      const wb =
        XLSX.utils.book_new();


      XLSX.utils.book_append_sheet(
        wb,
        ws,
        "KET QUA"
      );


      /*
        Summary lấy trực tiếp
        từ counter cuối.
      */

      const summary = [

        [
          "THỐNG KÊ"
        ],

        [
          "Tổng SHD",
          rows.length
        ],

        [
          "Đã hoàn thành",
          completed
        ],

        [
          "GIN có",
          success
        ],

        [
          "Không tìm thấy",
          notFound
        ],

        [
          "Lỗi",
          errors
        ],

        [
          "Chưa xử lý",
          Math.max(
            0,
            rows.length -
            completed
          )
        ]

      ];


      const summaryWS =
        XLSX.utils.aoa_to_sheet(
          summary,
          {
            dense:
              true
          }
        );


      summaryWS["!cols"] = [

        {
          wch:
            25
        },

        {
          wch:
            20
        }

      ];


      XLSX.utils.book_append_sheet(
        wb,
        summaryWS,
        "THONG KE"
      );


      const filename =
        `GIN_KET_QUA_${
          new Date()
            .toISOString()
            .slice(
              0,
              10
            )
        }.xlsx`;


      if (
        typeof XLSX.writeFileXLSX ===
        "function"
      ) {

        XLSX.writeFileXLSX(
          wb,
          filename,
          {
            compression:
              true
          }
        );

      } else {

        XLSX.writeFile(
          wb,
          filename,
          {
            bookType:
              "xlsx",

            compression:
              true
          }
        );

      }


      log(
        `XUẤT EXCEL THÀNH CÔNG — ${data.length} dòng / ${columns.length} cột`,
        "ga7_ok"
      );


      setStatus(
        `Đã xuất Excel — ${data.length} dòng`
      );


    } catch (
      error
    ) {

      console.error(
        error
      );


      log(
        `XUẤT EXCEL LỖI: ${error.message}`,
        "ga7_error"
      );


      alert(
        "Xuất Excel bị lỗi:\n\n" +
        error.message +
        "\n\n" +
        "Hãy thử 'Xuất CSV dự phòng'."
      );


    } finally {

      btn.disabled =
        false;

      btn.textContent =
        "↓ Xuất Excel";

    }

  }


  /* =========================================================
     CSV
     ========================================================= */

  function csvEscape(
    value
  ) {

    const text =
      String(
        value ?? ""
      );


    if (
      /["\n\r,]/.test(
        text
      )
    ) {

      return (
        '"' +
        text.replace(
          /"/g,
          '""'
        ) +
        '"'
      );

    }


    return text;

  }


  function exportCSV() {

    const data =
      getExportRows();


    if (!data.length) {

      alert(
        "Chưa có dữ liệu."
      );

      return;

    }


    const columns =
      getColumns(
        data
      );


    const lines =
      new Array(
        data.length + 1
      );


    lines[0] =
      columns
        .map(
          csvEscape
        )
        .join(",");


    for (
      let i = 0;
      i < data.length;
      i++
    ) {

      const row =
        data[i];


      lines[i + 1] =
        columns
          .map(
            column =>
              csvEscape(
                row[column] ??
                ""
              )
          )
          .join(",");

    }


    const blob =
      new Blob(
        [
          "\uFEFF" +
          lines.join(
            "\r\n"
          )
        ],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const a =
      document.createElement(
        "a"
      );


    a.href =
      url;


    a.download =
      `GIN_KET_QUA_${
        new Date()
          .toISOString()
          .slice(
            0,
            10
          )
      }.csv`;


    document.body.appendChild(
      a
    );


    a.click();


    a.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      2000
    );


    log(
      `ĐÃ XUẤT CSV — ${data.length} dòng`,
      "ga7_ok"
    );


    setStatus(
      `Đã xuất CSV — ${data.length} dòng`
    );

  }


  /* =========================================================
     EVENTS
     ========================================================= */

  function bindEvents() {

    $("ga7_file")
      .addEventListener(
        "change",
        async event => {

          const file =
            event.target
              .files[0];


          if (!file)
            return;


          try {

            await readExcel(
              file
            );


          } catch (
            error
          ) {

            console.error(
              error
            );


            log(
              `Lỗi đọc Excel: ${error.message}`,
              "ga7_error"
            );


            alert(
              "Không đọc được file:\n\n" +
              error.message
            );

          }

        }
      );


    $("ga7_start")
      .addEventListener(
        "click",
        startProcessing
      );


    $("ga7_pause")
      .addEventListener(
        "click",
        pauseProcessing
      );


    $("ga7_export")
      .addEventListener(
        "click",
        exportXLSX
      );


    $("ga7_csv")
      .addEventListener(
        "click",
        exportCSV
      );


    $("ga7_reset")
      .addEventListener(
        "click",
        resetAll
      );


    $("ga7_close")
      .addEventListener(
        "click",
        () => {

          running = false;

          paused = true;

          stopRequested = true;


          if (uiTimer) {

            clearInterval(
              uiTimer
            );

          }


          if (activeTimer) {

            clearInterval(
              activeTimer
            );

          }


          document
            .getElementById(
              "__GINAUTO_V7_UI"
            )
            ?.remove();


          document
            .getElementById(
              "__GINAUTO_V7_STYLE"
            )
            ?.remove();


          window.__GIN_AUTO_FULL_V7__ =
            false;

        }
      );

  }


  /* =========================================================
     INIT
     ========================================================= */

  createUI();


  try {

    await loadXLSX();


    log(
      "SheetJS 0.20.3 đã sẵn sàng.",
      "ga7_ok"
    );


  } catch (
    error
  ) {

    log(
      error.message,
      "ga7_error"
    );


    alert(
      "Không tải được thư viện Excel:\n\n" +
      error.message
    );


    return;

  }


  bindEvents();


  updateUI(
    true
  );


  renderActive(
    true
  );


  log(
    "GIN AUTO FULL V7 đã sẵn sàng.",
    "ga7_ok"
  );


})();

