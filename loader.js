(async () => {

    const LICENSE_SERVER = window.location.origin && window.location.origin.includes("http") 
        ? window.location.origin 
        : "https://shd-license-server.onrender.com";

    const DEFAULT_TOOL = "shd";
    const toolId = window.__TARGET_TOOL__ || DEFAULT_TOOL;

    let license = localStorage.getItem("__APP_LICENSE__") || localStorage.getItem("__SHD_LICENSE__");

    if (!license) {
        license = prompt(`Nhập License để kích hoạt Tool [${toolId.toUpperCase()}]:`);

        if (!license) {
            alert("Bạn chưa nhập License.");
            return;
        }

        license = license.trim();

        // 1 License dùng chung cho mọi tool
        localStorage.setItem("__APP_LICENSE__", license);
        localStorage.setItem("__SHD_LICENSE__", license);
    }

    try {
        const response = await fetch(
            `${LICENSE_SERVER}/api/tool/${toolId}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    license
                })
            }
        );

        const data = await response.json();

        if (!data.valid) {
            if (data.reason === "invalid_license" || data.reason === "expired" || data.reason === "disabled") {
                localStorage.removeItem("__APP_LICENSE__");
                localStorage.removeItem("__SHD_LICENSE__");
            }

            let msg = "License không hợp lệ.";
            if (data.reason === "expired") msg = "License đã hết hạn.";
            if (data.reason === "disabled") msg = "License đang bị tạm khóa.";
            if (data.reason === "pending_approval") msg = "License đang chờ Admin duyệt trong vòng 24h.";
            if (data.reason === "tool_not_found") msg = `Không tìm thấy tool: ${toolId}`;

            alert(`${msg}\n\nVui lòng kiểm tra lại trên hệ thống SHD License.`);
            return;
        }

        console.log(`[SHD License] Kích hoạt thành công Tool: ${data.toolName || toolId}`);
        console.log("Hạn sử dụng:", data.expiresAt);

        // Chạy mã nguồn Tool trong tab hiện tại
        const script = document.createElement("script");
        script.textContent = data.code;
        document.documentElement.appendChild(script);
        script.remove();

    } catch (error) {
        console.error(error);
        alert(
            "Không thể kết nối License Server.\n\n" +
            error.message
        );
    }

})();