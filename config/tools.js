const path = require("path");

// =====================================================
// DANH SÁCH CÁC TOOL ĐƯỢC BẢO VỆ TRONG THƯ MỤC PROTECTED
// =====================================================
const TOOLS = {
    "shd": {
        id: "shd",
        name: "SHD V6",
        file: "shd-v6.js",
        version: "v6",
        description: "Công cụ SHD V6 mới nhất từ SHD License Server",
        guide: "Có 2 cách để chạy SHD V6: Copy mã Loader chạy trên Console hoặc dùng Bookmarklet."
    },
    "gin": {
        id: "gin",
        name: "GIN Tool",
        file: "gin.js",
        version: "v1",
        description: "Công cụ GIN hỗ trợ tự động hóa và xuất dữ liệu Excel/CSV",
        guide: "Có 2 cách để chạy GIN Tool: Dán mã Loader vào Console F12 hoặc bấm Bookmarklet trên trang web cần sử dụng."
    },
    "pan": {
        id: "pan",
        name: "PAN Tool",
        file: "pan.js",
        version: "v1",
        description: "Công cụ PAN phân tích dữ liệu và tự động thao tác",
        guide: "Có 2 cách để chạy PAN Tool: Chạy trực tiếp qua Console hoặc lưu Bookmarklet trên thanh dấu trang."
    }
};

function getTool(toolId) {
    if (!toolId) return null;
    const key = String(toolId).toLowerCase().trim();
    return TOOLS[key] || null;
}

function getAllTools() {
    return Object.values(TOOLS).map(tool => ({
        id: tool.id,
        name: tool.name,
        version: tool.version,
        description: tool.description,
        guide: tool.guide
    }));
}

module.exports = {
    TOOLS,
    getTool,
    getAllTools
};
