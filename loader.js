(async () => {

    const LICENSE_SERVER = "https://shd-license-server.onrender.com";

    let license = localStorage.getItem("__SHD_LICENSE__");

    if (!license) {
        license = prompt("Nhập License SHD V6:");

        if (!license) {
            alert("Chưa nhập License.");
            return;
        }

        license = license.trim();

        localStorage.setItem(
            "__SHD_LICENSE__",
            license
        );
    }

    try {

        const response = await fetch(
            `${LICENSE_SERVER}/api/shd/v6`,
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

            localStorage.removeItem(
                "__SHD_LICENSE__"
            );

            alert(
                "License không hợp lệ.\n\n" +
                "Lý do: " +
                data.reason
            );

            return;
        }

        console.log(
            "SHD License OK"
        );

        console.log(
            "Expires:",
            data.expiresAt
        );

        // Chạy SHD V6 trong tab hiện tại
        const script = document.createElement("script");

        script.textContent = data.code;

        document.documentElement.appendChild(
            script
        );

        script.remove();

    } catch (error) {

        console.error(error);

        alert(
            "Không thể kết nối License Server.\n\n" +
            error.message
        );

    }

})();