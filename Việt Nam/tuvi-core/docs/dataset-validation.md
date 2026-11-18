# Đối chiếu dataset v4

Nguồn: [release v4.0-13d](https://github.com/Renhuai123/ziwei-doushu/releases/tag/v4.0-13d), tạo ngày 15/10/2026. Lấy file có sẵn tại `D:\Tử vi\ziwei-interp-v4-all`, không tải lại toàn bộ dữ liệu và không giải nén 57 GB vào package.

Đã chép vào `data/` chỉ `year-1990.jsonl.zst`, `MANIFEST.json`, `SHA256SUMS.txt`. File năm 1990 nặng **1.957.581 byte**; SHA-256:

```text
d89f446543a2f542c03b8df2e81cfc48cf422b7968bf833d6ceeebfd3f94f4da
```

Hash khớp dòng tương ứng trong `SHA256SUMS.txt`. Manifest ghi content version `ca268829f7a9`, engine commit `c25dd495` của site repo (không nên coi đây là commit của package hiện tại).

Schema thực tế đã đọc: `k`, `y`, `m`, `d`, `h`, `g`, `ms`, `t`, `c`. `h` là chỉ số thời thần 0–11. `ms` là **chính tinh đầu tiên ở Mệnh**, hoặc `null` nếu vô chính diệu. Bản ghi đầu tiên: khóa `1990-01-01-0-male`, `ms = 天府`.

## Chạy đối chiếu

Sau khi build package, tại thư mục package:

```powershell
node dist/scripts/compare-v4.js --input data/year-1990.jsonl.zst --year 1990 --profiles repro-v4,thienky-candidate --output reports/v4-1990.json
```

Script dùng bộ giải nén zstd streaming của Node 24, đặt `ZSTD_d_windowLogMax=27`, tương đương nhu cầu cửa sổ dài được mô tả trong release. Không ghi toàn văn luận giải ra đĩa. Chỉ giữ khóa, ngày, chỉ số giờ, giới tính và `ms` để so sánh.

Script xác nhận checksum trước khi xử lý, từ chối khóa trùng, khóa không khớp trường dữ liệu, ngày không tồn tại và giá trị sao không hợp lệ. Báo cáo ghi số dòng, số khóa, độ phủ năm, kết quả mỗi profile, nhóm ngày tháng nhuận/thường, ranh năm âm và giờ Tý. Nếu dùng `--max-records`, báo cáo có `truncated=true`, không thể coi là đã kiểm cả năm.

## Phạm vi kết luận

- Khớp `ms` chỉ kiểm được **một trường cấu trúc**. Không kiểm đủ mọi sao/cung/độ sáng/tứ hóa và không kiểm nội dung luận giải.
- Chỉ số `h=0` không cho biết sinh lúc 00:30 hay 23:30, nên đối chiếu này **không xác định được quy tắc Tý muộn** của dataset.
- Trường `ms` không chứa độ sáng, nên không xác định được bảng sáng QS/XD2 từ tỷ lệ khớp này.
- So sánh profile nhuận có thể cho thấy khác biệt vị trí sao tại ngày nhuận; vẫn phải xem những trường không bị quan sát trong phép kiểm.
- Khớp dataset chứng minh khả năng tái hiện một phần upstream; không phải xác nhận độc lập phương pháp lập số.

Dữ liệu release theo CC BY 4.0 với ngoại lệ lời giảng được mô tả trong `DATASET-LICENSE` của repo gốc. Công cụ này chỉ sử dụng metadata cấu trúc, không gom hoặc xuất các đoạn trích lời giảng trong `c`.

Kết quả thực thi đầy đủ sẽ được lưu trong `reports/v4-1990.json`; không ghi kết quả giả định trước khi chạy.
