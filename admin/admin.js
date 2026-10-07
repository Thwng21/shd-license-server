const API = "/api/admin";

let token = sessionStorage.getItem("admin_token");


function showDashboard() {

    document.getElementById("loginPage").style.display = "none";

    document.getElementById("dashboard").style.display = "block";

    loadLicenses();
}


function showLogin() {

    document.getElementById("loginPage").style.display = "block";

    document.getElementById("dashboard").style.display = "none";
}


async function login() {

    const username =
        document.getElementById("username").value.trim();

    const password =
        document.getElementById("password").value;

    const error =
        document.getElementById("loginError");

    error.textContent = "";

    try {

        const response = await fetch(
            `${API}/login`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

        const data = await response.json();

        if (!data.success) {

            error.textContent =
                data.message || "Đăng nhập thất bại.";

            return;
        }

        token = data.token;

        sessionStorage.setItem(
            "admin_token",
            token
        );

        showDashboard();

    } catch (error) {

        error.textContent =
            "Không thể kết nối server.";
    }
}


function logout() {

    sessionStorage.removeItem("admin_token");

    token = null;

    showLogin();
}


async function apiRequest(
    url,
    options = {}
) {

    options.headers = {

        ...(options.headers || {}),

        "Authorization":
            `Bearer ${token}`,

        "Content-Type":
            "application/json"
    };

    const response =
        await fetch(url, options);

    if (response.status === 401) {

        logout();

        throw new Error(
            "Phiên đăng nhập đã hết hạn."
        );
    }

    return response.json();
}


async function loadLicenses() {

    try {

        const data =
            await apiRequest(
                `${API}/licenses`
            );

        if (!data.success) {

            alert(data.message);

            return;
        }

        renderLicenses(data.licenses);

    } catch (error) {

        console.error(error);

        alert(error.message);
    }
}


function renderLicenses(licenses) {

    const table =
        document.getElementById("licenseTable");

    table.innerHTML = "";

    let active = 0;
    let disabled = 0;
    let expired = 0;

    const now = new Date();

    licenses.forEach(license => {

        let status =
            license.status;

        if (
            status === "ACTIVE" &&
            new Date(license.expires_at) < now
        ) {

            status = "EXPIRED";

            expired++;

        } else if (
            status === "ACTIVE"
        ) {

            active++;

        } else if (
            status === "DISABLED"
        ) {

            disabled++;
        }


        let badgeClass =
            status.toLowerCase();


        const row =
            document.createElement("tr");

        row.innerHTML = `

            <td>${license.id}</td>

            <td>
                <strong>${license.license_key}</strong>
            </td>

            <td>
                <span class="badge ${badgeClass}">
                    ${status}
                </span>
            </td>

            <td>
                ${formatDate(license.expires_at)}
            </td>

            <td>
                ${formatDate(license.created_at)}
            </td>

            <td>

                ${
                    status === "ACTIVE"
                    ?
                    `
                    <button
                        class="danger"
                        onclick="disableLicense('${license.license_key}')"
                    >
                        Disable
                    </button>
                    `
                    :
                    `
                    <button
                        class="success"
                        onclick="enableLicense('${license.license_key}')"
                    >
                        Enable
                    </button>
                    `
                }

                <button
                    class="warning"
                    onclick="extendLicense('${license.license_key}')"
                >
                    + Ngày
                </button>

            </td>
        `;

        table.appendChild(row);
    });


    document.getElementById("total").textContent =
        licenses.length;

    document.getElementById("active").textContent =
        active;

    document.getElementById("disabled").textContent =
        disabled;

    document.getElementById("expired").textContent =
        expired;
}


async function createLicense() {

    const days =
        prompt(
            "License có thời hạn bao nhiêu ngày?",
            "30"
        );

    if (!days) return;

    const result =
        await apiRequest(
            `${API}/create`,
            {
                method: "POST",

                body: JSON.stringify({
                    days: Number(days)
                })
            }
        );

    if (!result.success) {

        alert(result.message);

        return;
    }

    alert(
        "License mới:\n\n" +
        result.license
    );

    loadLicenses();
}


async function disableLicense(license) {

    if (
        !confirm(
            `Disable license?\n\n${license}`
        )
    ) return;

    const result =
        await apiRequest(
            `${API}/disable`,
            {
                method: "POST",

                body: JSON.stringify({
                    license
                })
            }
        );

    alert(
        result.success
            ? "Đã disable license."
            : result.message
    );

    loadLicenses();
}


async function enableLicense(license) {

    const result =
        await apiRequest(
            `${API}/enable`,
            {
                method: "POST",

                body: JSON.stringify({
                    license
                })
            }
        );

    alert(
        result.success
            ? "Đã enable license."
            : result.message
    );

    loadLicenses();
}


async function extendLicense(license) {

    const days =
        prompt(
            "Gia hạn thêm bao nhiêu ngày?",
            "30"
        );

    if (!days) return;

    const result =
        await apiRequest(
            `${API}/extend`,
            {
                method: "POST",

                body: JSON.stringify({
                    license,
                    days: Number(days)
                })
            }
        );

    alert(
        result.success
            ? `Đã gia hạn thêm ${days} ngày.`
            : result.message
    );

    loadLicenses();
}


function formatDate(date) {

    return new Date(date)
        .toLocaleString("vi-VN");
}


if (token) {

    showDashboard();

} else {

    showLogin();
}