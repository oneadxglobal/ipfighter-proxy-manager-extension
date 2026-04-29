# IPFighter Proxy Manager

IPFighter Proxy Manager là tiện ích mở rộng quản lý proxy chuyên nghiệp, hoạt động đa nền tảng trên cả Chrome (Manifest V3) và Firefox. Công cụ cung cấp khả năng điều hướng proxy thông minh, bảo vệ quyền riêng tư mạnh mẽ và hệ thống luật (rule-engine) chi tiết.

## Tính năng nổi bật

- **Quản lý Đa Proxy:** Dễ dàng thêm, sửa, xóa và chuyển đổi giữa nhiều proxy cùng lúc (hỗ trợ HTTP, HTTPS, SOCKS4, SOCKS5).
- **Xác thực Proxy:** Hỗ trợ các proxy yêu cầu tài khoản (username/password).
- **Smart Rule Engine:** Khả năng định tuyến lưu lượng (routing) mạnh mẽ thông qua Tên miền, Wildcard, Regex, và dải mạng CIDR.
- **Vượt rào (Anti-Detect):** Chủ động fake (chống theo dõi) Múi giờ (Timezone), Ngôn ngữ tĩnh (Language) và Tọa độ vị trí (Geolocation) khớp hoàn toàn với thông tin từ Proxy.
- **Chống Rò rỉ WebRTC & DNS:** Ép toàn bộ giao thức mạng đánh qua đường ống proxy, vô hiệu hóa WebRTC nội bộ và DNS Prefetching chống rò rỉ IP thật.
- **Tương thích Đa trình duyệt:** Cùng một mã nguồn duy nhất nhưng có thể tự động build chuẩn file riêng biệt cho Chrome (MV3) và Firefox (MV2).
- **Giao diện Hiện đại:** Thiết kế chuẩn Glassmorphism trong suốt, Dark mode tạo sự cao cấp và thân thiện với người dùng.

## Hướng dẫn Cài đặt

### Dành cho Chrome
1. Mở trình duyệt và truy cập vào `chrome://extensions/`
2. Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Nhấn vào **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục `dist/chrome` từ mã nguồn dự án này.

### Dành cho Firefox
1. Mở trình duyệt và truy cập `about:debugging#/runtime/this-firefox`
2. Nhấn vào **Load Temporary Add-on...** (Tải Tiện ích Tạm thời).
3. Chọn file `manifest.json` nằm bên trong thư mục `dist/firefox`.

## Hướng dẫn Sử dụng Chi tiết

### 1. Quản lý Proxy cơ bản
- **Bật/Tắt Proxy:** Nhấn vào biểu tượng tiện ích, sử dụng công tắc (toggle) ở góc phải trên cùng để bật/tắt kết nối qua proxy một cách nhanh chóng.
- **Thêm Proxy Mới:** 
  - Trong giao diện Popup, chọn nút **"Add proxy"**.
  - Chọn giao thức: ở version hiện tại Chrome chỉ cho phép cấu hình với giao thức HTTP
  - Chọn định dạng nhập (ví dụ: `host:port:username:pass`).
  - Nhập thông tin proxy, có thể thiết lập thêm **Ngày hết hạn (Expired date)**, **Gắn thẻ (Tag)** và **Ghi chú (Note)** để dễ quản lý.
  - Nhấn **"Add Proxy"** để lưu lại.
- **Sử dụng Proxy:** Tại danh sách proxy, chọn một proxy bất kỳ để kết nối. Bạn cũng có thể xem nhanh các proxy ở tab **Recently Used** (Dùng gần đây) hoặc **Pinned** (Đã ghim).

### 2. Thiết lập Smart Rules (Luật Thông minh)
Hệ thống Rule Engine cho phép bạn tùy chỉnh việc định tuyến proxy linh hoạt mà không cần bật proxy cho toàn bộ trình duyệt.
- Mở **Smart Rules** từ giao diện Popup hoặc trang Options (Settings).
- Thêm luật mới để chỉ định các **Tên miền (Domain)**, **Wildcard (*.example.com)**, hoặc **Regex** sẽ đi qua proxy cụ thể nào, hoặc đi qua kết nối trực tiếp (Direct/Bypass).

### 3. Tùy chỉnh Settings & Anti-Detect (Bảo vệ Quyền riêng tư)
Truy cập phần **Settings** (Cài đặt) để bật/tắt các tính năng bảo mật nâng cao:
- **WebRTC Protection:** Ngăn chặn rò rỉ IP thật qua giao thức WebRTC (được khuyến nghị bật).
- **DNS Leak Protection:** Vô hiệu hóa DNS Prefetching.
- **Timezone Spoofing:** Tự động đồng bộ múi giờ của trình duyệt với múi giờ của proxy.
- **Language Spoofing:** Tự động thay đổi ngôn ngữ trình duyệt khớp với vị trí của proxy.
- **Geolocation Spoofing:** Mô phỏng tọa độ vị trí theo IP của proxy.

## Hướng dẫn Build

Nếu bạn muốn chỉnh sửa mã nguồn, hãy đảm bảo máy tính đã cài đặt [Node.js](https://nodejs.org/).

```bash
# Cài đặt thư viện cần thiết
npm install

# Khởi chạy script build (Kết quả sẽ xuất ra dist/chrome và dist/firefox)
npm run build
```

## Tính năng Bảo mật & Privacy

Khác với các tiện ích Proxy thông thường, IPFighter can thiệp sâu vào các hàm API hệ thống của trình duyệt (như `Intl.DateTimeFormat`, `navigator.language`, `navigator.geolocation`) ngay ở mili-giây đầu tiên tải trang. Việc này giúp bảo đảm 100% đồng bộ giữa vị trí vật lý thực của proxy và dấu vân tay trình duyệt (browser fingerprint) đang xuất ra.

## Giấy phép
Giấy phép MIT
