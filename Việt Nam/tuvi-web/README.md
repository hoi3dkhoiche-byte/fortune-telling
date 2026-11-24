# Thiên Kỷ Web — Giao Diện Tử Vi Đẩu Số Vũ Trụ

Giao diện lập lá số, tra cứu dữ kiện cấu trúc và tương tác bàn cờ tinh bàn dựa trên động cơ `@tuvi/core`. Tích hợp cấu hình Thiên Kỷ đang kiểm chứng (`thienky-candidate`) và cấu hình đối chiếu Dataset v4 (`repro-v4`).

---

## 1. Điểm nổi bật & Cải tiến thiết kế

1. **Ba màn hình tập trung tác vụ (SPA)**:
   - **Màn hình 1 (Cosmic Portal)**: Giao diện nhập dữ kiện thanh lịch, huyền bí ở trung tâm không gian với hiệu ứng tinh tú lấp lánh.
     - Hỗ trợ nhập Ngày giờ Dương lịch / Âm lịch (có cờ tháng nhuận).
     - Hỗ trợ chọn nhanh múi giờ IANA hoặc nhập mã IANA tùy chọn.
     - Tùy chọn nâng cao: Quy ước lịch (Trung Quốc / Việt Nam), tọa độ nơi sinh cho hiệu chỉnh giờ mặt trời thực, chọn profile trường phái.
     - **Mở file lá số JSON**: Cho phép tải và hiển thị trực tiếp file kết quả lá số JSON có sẵn qua `FileReader` mà không cần gọi lại API tính toán.
   - **Màn hình 2 (Bàn Cờ Lá Số 4×4)**: Không gian chiêm nghiệm tinh bàn toàn màn hình, có nút quay lại nhập dữ kiện khác hoặc chuyển sang màn dữ kiện.
     - Hiển thị 12 cung dạng bàn cờ truyền thống hoặc danh sách dọc tối ưu cho thiết bị di động.
     - Tự động vẽ đường chiếu Tam hợp và Xung chiếu bằng lớp SVG mỏng nhẹ, tinh tế.
     - Panel xem chi tiết cung vị bên phải (chính tinh, phụ tinh, tứ hóa, đại hạn, tiểu hạn, nguyệt hạn).
   - **Màn hình 3 (Dữ kiện lá số)**: Bảng phân tích dữ kiện có cấu trúc phục vụ nghiên cứu và AI luận giải:
     - Sắp xếp chuẩn tắc theo thứ tự: **Mệnh, Thân và Cục** $\rightarrow$ **Tứ hóa bản mệnh** (Lộc $\rightarrow$ Quyền $\rightarrow$ Khoa $\rightarrow$ Kỵ) $\rightarrow$ **Khoảng tuổi đại hạn** $\rightarrow$ **Mệnh vô chính diệu & Sao mượn**.
     - Mỗi nhận định đều mang `factId` truy nguyên nguồn gốc từ engine.

2. **Bố cục Sao Chuẩn Mực Tử Vi Việt Nam**:
   - Cột phải hiển thị nhóm sát/hung tinh, Hóa Kỵ và sao độ sáng thấp.
   - Cột trái hiển thị nhóm cát tinh và các sao còn lại.
   - Độ sáng hiển thị theo ký hiệu học thuật thanh lịch `(M)`, `(V)`, `(Đ)`, `(B)`, `(H)` thay vì các badge thô kệch.

3. **Chủ đề Vũ Trụ Sâu Thẳm (Cosmic Deep Space)**:
   - Nền không gian đen huyền ảo kết hợp tinh vân tím và bụi sao vàng ấm.
   - Canvas hạt sao tương tác (`#starfield-canvas`): 160+ vì sao nhấp nháy, chòm sao nối theo chuột, sao băng lướt qua bầu trời.
   - Vòng Tinh Bàn Thiên Thể (Cosmic Astrolabe Mandala) xoay chậm 60fps ở trung tâm lá số.

4. **Thông tin kiểm chứng & Xử lý ranh giờ (Verification & Scenario Handling)**:
   - Tách bạch ngày sinh nhập vào khỏi ngày giờ dùng để lập số (bao gồm cờ tháng nhuận, giờ Tý muộn chuyển ngày).
   - Modal xác nhận ranh giờ thông minh:
     - Tự động phát hiện giờ sinh gần ranh giờ (2 phút) hoặc giờ đồng hồ trùng lặp DST.
     - Khi chỉ có 1 kịch bản khả dụng do quy ước lịch Việt/Trung lệch nhau, hiển thị hướng dẫn rõ ràng cho người dùng (có thể mở phương án bị chặn bằng cách chọn quy ước lịch Trung Quốc trong Tùy chọn nâng cao).
   - Mã hóa cảnh báo dạng chuẩn hóa (`CALENDAR_DIVERGENCE_NO_ADAPTER`, `CALENDAR_DIVERGENCE_CHINESE_EXPLICIT`, `SCENARIO_BLOCKED_DIVERGENCE`, `SHIFTED_DATE_DIVERGENCE`, `VIETNAMESE_CALENDAR_MODEL`) để UI dịch đa ngôn ngữ nhất quán.
   - Mục thu gọn **Thông tin kiểm chứng** chứa đầy đủ nguồn, phiên bản, SHA-256 hash của lá số, cảnh báo và chuỗi audit các bước chuẩn hóa (kể cả bước `blocked-scenarios`).

---

## 2. Cách chạy ứng dụng & Kiểm thử

Yêu cầu môi trường: **Node.js (>= 20.x hoặc >= 24.14.1)**

```powershell
# 1. Build lõi tuvi-core trước (nếu chưa build)
cd "Việt Nam/tuvi-core"
npm.cmd run build

# 2. Chuyển sang thư mục tuvi-web
cd "../tuvi-web"

# 3. Chạy toàn bộ bài kiểm thử tự động (26/26 tests passed)
npm.cmd test

# 4. Khởi chạy máy chủ giao diện
npm.cmd start
# -> Ứng dụng sẵn sàng tại: http://localhost:3000
```

---

## 3. Cấu trúc thư mục

```text
Việt Nam/tuvi-web/
├── server.js               # Máy chủ Node.js phục vụ API và Static files bảo mật (chống traversal, giới hạn 1MB)
├── package.json            # Cấu hình package & scripts test/start
├── tests/
│   ├── api.test.js         # Kiểm thử API endpoint: /api/natal, /api/sample, /api/profiles, bảo mật
│   ├── reading.test.js     # Kiểm thử dữ kiện của màn tổng hợp, factId và sao mượn
│   └── star-partition.test.js # Kiểm thử nhóm sao trái/phải, tứ hóa và hiển thị ngày tháng
└── public/
    ├── index.html          # Khung ứng dụng 3 màn hình SPA
    ├── assets/
    │   ├── cosmic-bg.jpg   # Ảnh nền vũ trụ sâu thẳm 4K
    │   └── celestial-emblem.jpg # Vòng thiên thể Astrolabe Mandala
    ├── css/
    │   └── styles.css      # Hệ thống CSS Cosmic Theme, Glassmorphism, Responsive Mobile
    └── js/
        ├── app.js          # Điều phối chính & chuyển đổi màn hình
        ├── starfield.js    # Canvas hiệu ứng hạt sao và sao băng tương tác
        ├── state.js        # Quản lý trạng thái ứng dụng trung tâm
        ├── api.js          # Client gọi API có chống race-condition & AbortController
        ├── form.js         # Xử lý form ngày giờ, mở file JSON & modal kịch bản ranh giờ
        ├── chart.js        # Bàn cờ 4x4, phân cột sao trái/phải, đường liên hệ SVG
        ├── details.js      # Cột chi tiết cung đang chọn
        ├── reading.js      # Màn dữ kiện Mệnh, Thân, Cục, Tứ Hóa, Đại hạn
        └── verification.js # Hiển thị nguồn, hash, cảnh báo chuẩn hóa và chuỗi audit
```

---

## 4. Hợp đồng API backend

- `GET /api/health`: Trạng thái máy chủ, server time và phiên bản Node/core.
- `GET /api/profiles`: Danh sách profiles (`thienky-candidate`, `repro-v4`) và bằng chứng kiểm chứng.
- `GET /api/sample`: Trả về lá số mẫu minh họa 1990 với 12 cung đã gắn nhãn Việt.
- `POST /api/natal`:
  - Nhận payload `{ birth: BirthInput, profileId?: string, selectedScenario?: ChartReady, selectedInstant?: string }`.
  - Trả `200` cùng `normalization.input`, `chart`, `audit` và `warnings` khi lập số thành công.
  - Trả `422` với `reason` khi cần bổ sung giờ, nơi sinh, quy ước lịch hoặc xác nhận ranh giờ và thay đổi đồng hồ địa phương.
  - Gửi lại dữ kiện sinh và `selectedScenario` từ phản hồi khi xác nhận ranh giờ. Với giờ đồng hồ xảy ra hai lần, gửi lại cả chart và instant từ cùng một phần tử `scenarioOptions`.
  - Trả `400` cho JSON hỏng, payload sai kiểu hoặc lựa chọn không hợp lệ, và `413` khi body vượt 1 MiB.
  - Static file server bảo mật: kiểm tra path traversal bằng `realpath`, cô lập phạm vi thư mục `public/`.
