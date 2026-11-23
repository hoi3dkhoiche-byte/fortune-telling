# Thiên Kỷ Web — Giao Diện Tử Vi Đẩu Số Vũ Trụ

Giao diện lập và tra cứu dữ kiện lá số bằng `@tuvi/core`. Có cấu hình Thiên Kỷ đang kiểm chứng và cấu hình đối chiếu dataset v4.

---

## 1. Điểm nổi bật & Cải tiến thiết kế

1. **Ba màn hình**:
   - **Màn hình 1 (Cosmic Portal)**: Giao diện nhập dữ kiện thanh lịch, huyền bí ở trung tâm không gian với hiệu ứng tinh tú lấp lánh.
   - **Màn hình 2 (Bàn Cờ Lá Số 4×4)**: Không gian chiêm nghiệm tinh bàn toàn màn hình, có nút quay lại nhập dữ kiện khác bất cứ lúc nào.
   - **Dữ kiện lá số** hiển thị Mệnh, Thân, Cục, Tứ Hóa và khoảng tuổi đại hạn từ facts của core.

2. **Bố cục Sao Chuẩn Mực Tử Vi Việt Nam**:
   - Cột phải hiển thị nhóm sát/hung tinh, Hóa Kỵ và sao độ sáng thấp.
   - Cột trái hiển thị các sao còn lại. Độ sáng lấy từ dữ liệu engine khi có.

3. **Chủ đề Vũ Trụ Sâu Thẳm (Cosmic Deep Space)**:
   - Nền không gian đen huyền ảo kết hợp tinh vân tím và bụi sao vàng ấm.
   - Canvas hạt sao tương tác (`#starfield-canvas`): 160+ vì sao nhấp nháy, chòm sao nối theo chuột, sao băng lướt qua bầu trời.
   - Vòng Tinh Bàn Thiên Thể (Cosmic Astrolabe Mandala) xoay chậm 60fps ở trung tâm lá số.

4. **Thông tin kiểm chứng**:
   - Bàn lá số tách dữ kiện sinh khỏi ngày giờ lập số, bao gồm cờ tháng nhuận.
   - Mục thu gọn chứa cấu hình, phiên bản nguồn, hash, cảnh báo và các bước chuẩn hóa hoặc xác nhận.

---

## 2. Cách chạy ứng dụng

Yêu cầu: Node.js (>= 24.14.1)

```powershell
cd "Việt Nam/tuvi-core"
npm.cmd ci
npm.cmd run build
cd "../tuvi-web"
npm.cmd test
npm.cmd start
```

---

## 3. Cấu trúc thư mục

```text
Việt Nam/tuvi-web/
├── server.js               # Máy chủ Node.js phục vụ API và Static files
├── package.json            # Cấu hình package & scripts test/start
├── tests/
│   ├── api.test.js         # Kiểm thử API endpoint: /api/natal, /api/sample, /api/profiles
│   ├── reading.test.js     # Kiểm thử dữ kiện của màn tổng hợp
│   └── star-partition.test.js # Kiểm thử nhóm sao, sao mượn và ngày hiển thị
└── public/
    ├── index.html          # Khung ứng dụng 3 màn hình
    ├── assets/
    │   ├── cosmic-bg.jpg   # Ảnh nền vũ trụ sâu thẳm 4K
    │   └── celestial-emblem.jpg # Vòng thiên thể Astrolabe
    ├── css/
    │   └── styles.css      # Hệ thống CSS Cosmic Theme, Glassmorphism, Responsive
    └── js/
        ├── app.js          # Điều phối chính & chuyển đổi màn hình
        ├── starfield.js    # Canvas hiệu ứng hạt sao và sao băng
        ├── state.js        # Quản lý trạng thái ứng dụng
        ├── api.js          # Client gọi API có chống race-condition
        ├── form.js         # Xử lý form ngày giờ & kịch bản ranh giờ
        ├── chart.js        # Bàn cờ 4x4, phân cột sao trái/phải, đường liên hệ SVG
        ├── details.js      # Chi tiết cung đang chọn
        ├── reading.js      # Màn dữ kiện Mệnh, Thân, Cục, Tứ Hóa, Đại hạn
        └── verification.js # Thông tin nguồn, cảnh báo và audit
```

---

## 4. Hợp đồng API backend

- `GET /api/health`: Trạng thái máy chủ và phiên bản Node/core.
- `GET /api/profiles`: Danh sách profiles (`thienky-candidate`, `repro-v4`) và bằng chứng kiểm chứng.
- `GET /api/sample`: Trả về lá số mẫu minh họa 1990 với 12 cung đã gắn nhãn Việt.
- `POST /api/natal`:
  - Nhận `{ birth: BirthInput, profileId?: string, selectedScenario?: ChartReady, selectedInstant?: string }`.
  - Trả `200` cùng `normalization.input`, `chart`, `audit` và `warnings` khi lập số thành công.
  - Trả `422` với `reason` khi cần bổ sung giờ, nơi sinh, quy ước lịch hoặc xác nhận ranh giờ và thay đổi đồng hồ địa phương.
  - Gửi lại dữ kiện sinh và `selectedScenario` từ phản hồi khi xác nhận ranh giờ. Với giờ đồng hồ xảy ra hai lần, gửi lại cả chart và instant từ cùng một phần tử `scenarioOptions`.
  - Trả `400` cho JSON hoặc lựa chọn sai, và `413` khi body vượt 1 MiB. Trang và API phục vụ cùng origin.
