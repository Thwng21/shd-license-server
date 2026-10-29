const API = "/api/admin";
let allLicenses = [];

function getToken() { return sessionStorage.getItem("admin_token"); }

async function apiRequest(url, options = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    if (response.status === 401) { sessionStorage.removeItem("admin_token"); showLogin(); throw new Error("Hết hạn."); }
    return data;
}

async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const error = document.getElementById("loginError");
    error.textContent = "";
    const btn = document.querySelector("#loginPage button");
    if(btn) { btn.disabled = true; btn.textContent = "Đang kiểm tra..."; }

    try {
        const res = await fetch(`${API}/login`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!data.success) { error.textContent = data.message || "Lỗi đăng nhập."; return; }
        sessionStorage.setItem("admin_token", data.token);
        showDashboard(); await loadLicenses();
    } catch (err) { 
        error.textContent = "Không thể kết nối."; 
    } finally {
        if(btn) { btn.disabled = false; btn.textContent = "Đăng nhập"; }
    }
}

function showDashboard() { document.getElementById("loginPage").style.display = "none"; document.getElementById("dashboard").style.display = "block"; }
function showLogin() { document.getElementById("loginPage").style.display = "block"; document.getElementById("dashboard").style.display = "none"; }
function logout() { sessionStorage.removeItem("admin_token"); showLogin(); }

async function loadLicenses() {
    try {
        const data = await apiRequest(`${API}/licenses`);
        if (!data.success) return;
        allLicenses = data.licenses || [];
        updateStats(allLicenses);
        filterLicenses();
    } catch (error) { console.error(error); }
}

function updateStats(licenses) {
    document.getElementById("total").textContent = licenses.length;
    document.getElementById("pendingStat").textContent = licenses.filter(l => ["PENDING", "WAITING_CONFIRM"].includes(l.status)).length;
    document.getElementById("active").textContent = licenses.filter(l => l.status === "ACTIVE").length;
    document.getElementById("disabled").textContent = licenses.filter(l => l.status === "DISABLED").length;
}

function filterLicenses() {
    const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;

    const filtered = allLicenses.filter(l => {
        const matchKeyword = l.license_key.toLowerCase().includes(keyword) || 
                             (l.phone && l.phone.includes(keyword));
                             
        if (status === "ALL") return matchKeyword;
        if (status === "PENDING") return matchKeyword && (l.status === "PENDING" || l.status === "WAITING_CONFIRM");
        return matchKeyword && l.status === status;
    });
    renderLicenses(filtered);
}

function renderLicenses(licenses) {
    const table = document.getElementById("licenseTable");
    table.innerHTML = "";

    if (licenses.length === 0) {
        table.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Không có đơn hàng.</td></tr>`;
        return;
    }

    licenses.forEach(l => {
        const row = document.createElement("tr");
        const isPending = ["PENDING", "WAITING_CONFIRM"].includes(l.status);
        
        let actionHtml = "";
        if (isPending) {
            actionHtml = `<button class="success" onclick="approveOrder('${l.license_key}')">✓ Duyệt</button>
                          <button class="danger" onclick="rejectOrder('${l.license_key}')">✕ Từ chối</button>`;
        } else if (l.status === "ACTIVE") {
            actionHtml = `
                <span style="color:green;font-weight:bold;margin-right:10px">✓ Đã duyệt</span>
                <button class="warning" onclick="editCode('${l.license_key}', '${l.unlock_code}')">Sửa Code</button>
            `;
        }

        row.innerHTML = `
            <td><strong>${l.license_key}</strong><br><small style="color:#666">${formatDate(l.created_at)}</small></td>
            <td style="font-weight:bold; font-size:14px">${l.phone || "-"}</td>
            <td style="font-weight:bold; color:${isPending ? 'red' : 'green'}">${Number(l.amount).toLocaleString('vi-VN')}đ</td>
            <td>${l.status === "ACTIVE" ? `<code style="background:#e0f2fe; padding:4px; border-radius:4px; font-size:13px; font-weight:bold; color:blue">${l.unlock_code || "Chưa có"}</code>` : "-"}</td>
            <td><span class="badge ${l.status.toLowerCase()}">${l.status}</span></td>
            <td>${actionHtml}</td>
        `;
        table.appendChild(row);
    });
}

async function approveOrder(license) {
    if (!confirm(`Xác nhận đã nhận đủ tiền cho đơn ${license}?`)) return;
    try {
        const data = await apiRequest(`${API}/approve`, { method: "POST", body: JSON.stringify({ license }) });
        if (data.success) {
            alert(`Đã duyệt! Mã Code cấp cho khách là:\n\n${data.license.unlock_code}`);
            loadLicenses();
        } else alert(data.message);
    } catch (err) { alert("Lỗi server"); }
}

async function editCode(license, oldCode) {
    const newCode = prompt(`Nhập mã Code mới cho đơn ${license}:`, oldCode);
    if (!newCode || newCode === oldCode) return;
    
    try {
        const data = await apiRequest(`${API}/update-unlock-code`, {
            method: "POST", body: JSON.stringify({ license, unlockCode: newCode })
        });
        if (data.success) { alert("Đã cập nhật mã!"); loadLicenses(); }
        else alert(data.message);
    } catch (err) { alert("Lỗi server"); }
}

async function rejectOrder(license) {
    if (!confirm(`Từ chối đơn ${license}?`)) return;
    try {
        await apiRequest(`${API}/reject`, { method: "POST", body: JSON.stringify({ license }) });
        loadLicenses();
    } catch (err) { alert("Lỗi server"); }
}

function formatDate(d) { return d ? new Date(d).toLocaleString('vi-VN') : "-"; }

document.addEventListener("DOMContentLoaded", () => {
    if (getToken()) { showDashboard(); loadLicenses(); }
});