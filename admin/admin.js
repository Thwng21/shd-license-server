const API = "/api/admin";

let allLicenses = [];


// =====================================================
// TOKEN
// =====================================================

function getToken() {

    return sessionStorage.getItem(
        "admin_token"
    );
}


// =====================================================
// API REQUEST
// =====================================================

async function apiRequest(
    url,
    options = {}
) {

    const token = getToken();

    const headers = {

        "Content-Type":
            "application/json",

        ...(options.headers || {})
    };


    if (token) {

        headers.Authorization =
            `Bearer ${token}`;
    }


    const response =
        await fetch(
            url,
            {
                ...options,
                headers
            }
        );


    const data =
        await response.json();


    if (response.status === 401) {

        sessionStorage.removeItem(
            "admin_token"
        );

        showLogin();

        throw new Error(
            data.message ||
            "Phiên đăng nhập hết hạn."
        );
    }


    return data;
}


// =====================================================
// LOGIN
// =====================================================

async function login() {

    const username =
        document
            .getElementById("username")
            .value
            .trim();

    const password =
        document
            .getElementById("password")
            .value;


    const error =
        document.getElementById(
            "loginError"
        );

    error.textContent = "";


    if (!username || !password) {

        error.textContent =
            "Vui lòng nhập username và password.";

        return;
    }


    try {

        const response =
            await fetch(
                `${API}/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok ||
            !data.success) {

            error.textContent =
                data.message ||
                "Đăng nhập thất bại.";

            return;
        }


        sessionStorage.setItem(
            "admin_token",
            data.token
        );


        showDashboard();

        await loadLicenses();


    } catch (err) {

        console.error(err);

        error.textContent =
            "Không thể kết nối server.";
    }
}


// =====================================================
// SHOW DASHBOARD
// =====================================================

function showDashboard() {

    document
        .getElementById("loginPage")
        .style.display = "none";


    document
        .getElementById("dashboard")
        .style.display = "block";
}


// =====================================================
// SHOW LOGIN
// =====================================================

function showLogin() {

    document
        .getElementById("loginPage")
        .style.display = "block";


    document
        .getElementById("dashboard")
        .style.display = "none";
}


// =====================================================
// LOGOUT
// =====================================================

function logout() {

    sessionStorage.removeItem(
        "admin_token"
    );

    showLogin();
}


// =====================================================
// LOAD LICENSES
// =====================================================

async function loadLicenses() {

    try {

        const data =
            await apiRequest(
                `${API}/licenses`
            );


        if (!data.success) {

            alert(
                data.message ||
                "Không thể tải License."
            );

            return;
        }


        allLicenses =
            data.licenses || [];


        updateStats(
            allLicenses
        );


        filterLicenses();


    } catch (error) {

        console.error(error);
    }
}


// =====================================================
// UPDATE STATS
// =====================================================

function updateStats(
    licenses
) {

    const now =
        new Date();


    const total =
        licenses.length;


    const active =
        licenses.filter(
            license =>
                license.status ===
                "ACTIVE" &&
                new Date(
                    license.expires_at
                ) >= now
        ).length;


    const disabled =
        licenses.filter(
            license =>
                license.status ===
                "DISABLED"
        ).length;


    const expired =
        licenses.filter(
            license =>
                license.status ===
                    "ACTIVE" &&
                new Date(
                    license.expires_at
                ) < now
        ).length;


    document
        .getElementById("total")
        .textContent = total;


    document
        .getElementById("active")
        .textContent = active;


    document
        .getElementById("disabled")
        .textContent = disabled;


    document
        .getElementById("expired")
        .textContent = expired;
}


// =====================================================
// SEARCH + FILTER
// =====================================================

function filterLicenses() {

    const keyword =
        document
            .getElementById(
                "searchInput"
            )
            .value
            .trim()
            .toLowerCase();


    const status =
        document
            .getElementById(
                "statusFilter"
            )
            .value;


    const now =
        new Date();


    const filtered =
        allLicenses.filter(
            license => {


                // SEARCH

                const matchKeyword =
                    license.license_key
                        .toLowerCase()
                        .includes(
                            keyword
                        );


                // STATUS

                let matchStatus = true;


                if (
                    status ===
                    "ACTIVE"
                ) {

                    matchStatus =
                        license.status ===
                        "ACTIVE" &&
                        new Date(
                            license.expires_at
                        ) >= now;
                }


                else if (
                    status ===
                    "DISABLED"
                ) {

                    matchStatus =
                        license.status ===
                        "DISABLED";
                }


                else if (
                    status ===
                    "EXPIRED"
                ) {

                    matchStatus =
                        license.status ===
                            "ACTIVE" &&
                        new Date(
                            license.expires_at
                        ) < now;
                }


                return (
                    matchKeyword &&
                    matchStatus
                );
            }
        );


    renderLicenses(
        filtered
    );
}


// =====================================================
// RENDER LICENSE TABLE
// =====================================================

function renderLicenses(
    licenses
) {

    const table =
        document.getElementById(
            "licenseTable"
        );


    table.innerHTML = "";


    if (
        licenses.length === 0
    ) {

        table.innerHTML = `

            <tr>

                <td
                    colspan="6"
                    style="
                        text-align:center;
                        color:#777;
                        padding:30px;
                    "
                >
                    Không tìm thấy License.
                </td>

            </tr>

        `;

        return;
    }


    licenses.forEach(
        license => {

            const row =
                document.createElement(
                    "tr"
                );


            const statusInfo =
                getStatusInfo(
                    license
                );


            row.innerHTML = `

                <td>
                    ${license.id}
                </td>


                <td>

                    <strong>
                        ${license.license_key}
                    </strong>

                </td>


                <td>

                    <span
                        class="badge
                        ${statusInfo.className}"
                    >
                        ${statusInfo.label}
                    </span>

                </td>


                <td>
                    ${formatDate(
                        license.expires_at
                    )}
                </td>


                <td>
                    ${formatDate(
                        license.created_at
                    )}
                </td>


                <td>

                    ${
                        license.status ===
                        "DISABLED"

                        ? `
                            <button
                                class="success"
                                onclick="enableLicense(
                                    '${license.license_key}'
                                )"
                            >
                                Enable
                            </button>
                        `

                        : `
                            <button
                                class="danger"
                                onclick="disableLicense(
                                    '${license.license_key}'
                                )"
                            >
                                Disable
                            </button>
                        `
                    }


                    <button
                        class="warning"
                        onclick="extendLicense(
                            '${license.license_key}'
                        )"
                    >
                        Gia hạn
                    </button>

                </td>

            `;


            table.appendChild(
                row
            );
        }
    );
}


// =====================================================
// GET STATUS
// =====================================================

function getStatusInfo(
    license
) {

    if (
        license.status ===
        "DISABLED"
    ) {

        return {

            label: "Disabled",

            className:
                "disabled"
        };
    }


    if (
        new Date(
            license.expires_at
        ) < new Date()
    ) {

        return {

            label: "Expired",

            className:
                "expired"
        };
    }


    return {

        label: "Active",

        className:
            "active"
    };
}


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(
    date
) {

    if (!date) {

        return "-";
    }


    return new Date(
        date
    ).toLocaleString(
        "vi-VN"
    );
}


// =====================================================
// CREATE LICENSE
// =====================================================

async function createLicense() {

    const input =
        prompt(
            "Nhập số ngày sử dụng:"
        );


    if (input === null) {

        return;
    }


    const days =
        Number(input);


    if (
        !Number.isInteger(days) ||
        days <= 0
    ) {

        alert(
            "Số ngày không hợp lệ."
        );

        return;
    }


    try {

        const data =
            await apiRequest(
                `${API}/create`,
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            days
                        })
                }
            );


        if (!data.success) {

            alert(
                data.message ||
                "Không thể tạo License."
            );

            return;
        }


        alert(

            "License đã được tạo!\n\n" +

            "License: " +
            data.license +
            "\n\n" +

            "Expires: " +
            formatDate(
                data.expiresAt
            )
        );


        await loadLicenses();


    } catch (error) {

        console.error(error);
    }
}


// =====================================================
// DISABLE LICENSE
// =====================================================

async function disableLicense(
    license
) {

    const confirmDisable =
        confirm(
            `Disable License?\n\n${license}`
        );


    if (!confirmDisable) {

        return;
    }


    try {

        const data =
            await apiRequest(
                `${API}/disable`,
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            license
                        })
                }
            );


        if (!data.success) {

            alert(
                data.message ||
                "Không thể disable."
            );

            return;
        }


        await loadLicenses();


    } catch (error) {

        console.error(error);
    }
}


// =====================================================
// ENABLE LICENSE
// =====================================================

async function enableLicense(
    license
) {

    const confirmEnable =
        confirm(
            `Enable License?\n\n${license}`
        );


    if (!confirmEnable) {

        return;
    }


    try {

        const data =
            await apiRequest(
                `${API}/enable`,
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            license
                        })
                }
            );


        if (!data.success) {

            alert(
                data.message ||
                "Không thể enable."
            );

            return;
        }


        await loadLicenses();


    } catch (error) {

        console.error(error);
    }
}


// =====================================================
// EXTEND LICENSE
// =====================================================

async function extendLicense(
    license
) {

    const input =
        prompt(
            `Gia hạn License:\n\n${license}\n\nNhập số ngày:`
        );


    if (input === null) {

        return;
    }


    const days =
        Number(input);


    if (
        !Number.isInteger(days) ||
        days <= 0
    ) {

        alert(
            "Số ngày không hợp lệ."
        );

        return;
    }


    try {

        const data =
            await apiRequest(
                `${API}/extend`,
                {
                    method: "POST",

                    body:
                        JSON.stringify({

                            license,

                            days

                        })
                }
            );


        if (!data.success) {

            alert(
                data.message ||
                "Không thể gia hạn."
            );

            return;
        }


        alert(

            "Gia hạn thành công!\n\n" +

            "License: " +
            license +
            "\n\n" +

            "Expires: " +
            formatDate(
                data.expiresAt
            )
        );


        await loadLicenses();


    } catch (error) {

        console.error(error);
    }
}


// =====================================================
// AUTO LOGIN
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const token =
            getToken();


        if (!token) {

            return;
        }


        showDashboard();


        try {

            await loadLicenses();

        } catch (error) {

            console.error(error);

            logout();
        }

    }
);