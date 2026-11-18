# Thiên Kỷ Web — Giao Diện Tử Vi Đẩu Số Vũ Trụ

Ứng dụng web hiện đại, đậm chất chiêm tinh vũ trụ (Cosmic Space Theme) kết hợp chuẩn xác thuật toán Tử Vi Đẩu Số của `@tuvi/core` theo hệ phái Thiên Kỷ (dựa trên giáo trình của Thầy Nghê Hải Hà).

---

## 1. Điểm nổi bật & Cải tiến thiết kế

1. **Tách biệt 2 màn hình riêng biệt (Two-Step Flow)**:
   - **Màn hình 1 (Cosmic Portal)**: Giao diện nhập dữ kiện thanh lịch, huyền bí ở trung tâm không gian với hiệu ứng tinh tú lấp lánh.
   - **Màn hình 2 (Bàn Cờ Lá Số 4×4)**: Không gian chiêm nghiệm tinh bàn toàn màn hình, có nút quay lại nhập dữ kiện khác bất cứ lúc nào.
   - **Màn hình 3 (Luận Giải Chuyên Sâu)**: Nút bấm nổi bật **"🔮 Tiến Tới Luận Giải Lá Số ✨"** mở ra bảng luận giải toàn diện theo nguyên lý Thiên Kỷ.

2. **Bố cục Sao Chuẩn Mực Tử Vi Việt Nam**:
   - **Sao Đẹp (Cát tinh, Chính tinh miếu/vượng/đắc, Hóa Lộc/Quyền/Khoa)**: Nằm gọn gàng ở **CỘT TRÁI** màu vàng kim / ngọc bích phát sáng.
   - **Sao Xấu (Sát tinh, Ám tinh, Bại tinh, Hóa Kỵ, Chính tinh hãm)**: Nằm ở **CỘT PHẢI** màu đỏ thẫm / tím huyền bí.

3. **Chủ đề Vũ Trụ Sâu Thẳm (Cosmic Deep Space)**:
   - Nền không gian đen huyền ảo kết hợp tinh vân tím và bụi sao vàng ấm.
   - Canvas hạt sao tương tác (`#starfield-canvas`): 160+ vì sao nhấp nháy, chòm sao nối theo chuột, sao băng lướt qua bầu trời.
   - Vòng Tinh Bàn Thiên Thể (Cosmic Astrolabe Mandala) xoay chậm 60fps ở trung tâm lá số.

4. **Trải nghiệm Nhân Văn & Bỏ Hoàn Toàn Mã JSON Thô**:
   - Gỡ bỏ toàn bộ raw JSON viewer, hash kỹ thuật, JSON pointer gây khô khan.
   - Thay vào đó là luận giải Mệnh - Thân - Cục, Tứ Hóa chuyển vận, Thập niên đại hạn và đạo lý tu thân hành sự.

---

## 2. Cách chạy ứng dụng

Yêu cầu: Node.js (>= 24.14.1)

```powershell
cd "Việt Nam/tuvi-web"
npm test     # Chạy bộ kiểm thử (14 tests)
npm start    # Khởi động máy chủ tại http://localhost:3000
```

---

## 3. Cấu trúc thư mục

```text
Việt Nam/tuvi-web/
├── server.js               # Máy chủ Node.js phục vụ API và Static files
├── package.json            # Cấu hình package & scripts test/start
├── tests/
│   ├── api.test.js         # Kiểm thử API endpoint: /api/natal, /api/sample, /api/profiles
│   └── star-partition.test.js # Kiểm thử quy tắc phân chia sao Cát (Trái) / Sát (Phải)
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
        ├── reading.js      # Luận giải Mệnh, Thân, Cục, Tứ Hóa, Đại hạn
        └── break-ui.js     # Thử nghiệm dữ liệu biên (break-ui skill)
```

---

## 4. Hợp đồng API backend

- `GET /api/health`: Trạng thái máy chủ và phiên bản Node/core.
- `GET /api/profiles`: Danh sách profiles (`thienky-candidate`, `repro-v4`) và bằng chứng kiểm chứng.
- `GET /api/sample`: Trả về lá số mẫu minh họa 1990 với 12 cung đã gắn nhãn Việt.
- `POST /api/natal`:
  - Body: `{ birth: BirthInput, profileId: string, selectedScenario?: ChartReady }`
  - Trả về `200` khi tính toán thành công.
  - Trả về `422` kèm `reason: 'HOUR_BOUNDARY' | 'NEEDS_BIRTH_TIME' | 'CALENDAR_DIVERGENCE'` khi cần người dùng làm rõ dữ kiện.
