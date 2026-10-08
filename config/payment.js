// =====================================================
// CẤU HÌNH THANH TOÁN & NGÂN HÀNG VIETQR
// =====================================================

module.exports = {
    // Giá 1 tháng sử dụng: 50.000 VNĐ
    PRICE_PER_MONTH: Number(process.env.PRICE_PER_MONTH) || 50000,

    // Mã ngân hàng theo chuẩn VietQR (VD: MB, VCB, TCB, ACB, TPB, VPB, ICB...)
    BANK_ID: process.env.BANK_ID || "VPB",

    // Số tài khoản nhận tiền
    BANK_ACCOUNT: process.env.BANK_ACCOUNT || "210520042026",

    // Tên chủ tài khoản ngân hàng
    ACCOUNT_NAME: process.env.ACCOUNT_NAME || "PHAM HUU THAN THUONG",

    // Hàm tạo link QR Code VietQR tự động điền STK, số tiền, nội dung
    getVietQrUrl(amount, transferContent) {
        const bankId = this.BANK_ID;
        const account = this.BANK_ACCOUNT;
        const name = encodeURIComponent(this.ACCOUNT_NAME);
        const memo = encodeURIComponent(transferContent);
        return `https://img.vietqr.io/image/${bankId}-${account}-compact.png?amount=${amount}&addInfo=${memo}&accountName=${name}`;
    }
};
