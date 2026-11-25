# Bằng chứng và giới hạn kiểm chứng

## Đã thực thi

- Ngày kiểm tra 18/11/2026: **42/42 test qua**, build/typecheck qua, 10 file vendor khớp hash. Một lượt `npm ci --offline --ignore-scripts` trong thư mục cài sạch cũng thành công; ví dụ chart, birth và batch đã được thực thi. Runtime Node 24.14.1, ICU 78.2, tzdb 2025c.
- Test package gồm hash/cấu hình, nhãn Việt/dữ kiện, lịch, IANA, chuẩn hóa input, streaming dataset và CLI. Test ngày chạy giả lập 2030/2040 xác nhận bản mệnh và hash không phụ thuộc thời điểm hiện tại.
- Đối chiếu đủ 8.760 khóa năm 1990, checksum file nguồn khớp: `repro-v4` khớp trường `ms` 8.760/8.760; `thienky-candidate` khớp 8.432/8.760, lệch 328, toàn bộ nằm trong tháng nhuận.
- So hai mô hình lịch trên 28.124 ngày từ 1950–2026: 1.137 ngày khác nhau; năm 1990 không khác. Đây là so sánh **lịch Trung upstream (UTC+8) với mô hình thiên văn cố định UTC+7**, chưa phải tái dựng mọi lịch chính thức từng lưu hành ở từng miền Việt Nam qua lịch sử. Cụ thể, Việt Nam mới chuyển tính âm lịch sang UTC+7 ở miền Bắc từ ngày 08/08/1967 (Quyết định 121-CP), trong khi miền Nam giai đoạn 1960–1975 dùng giờ chính thức UTC+8 nên lịch âm lưu hành tại miền Nam giai đoạn đó khớp với lịch UTC+8 (`calendarConvention: "chinese"`).

Không dùng tỷ lệ trên để tuyên bố toàn bộ lá số chính xác 100%.

## Nguồn độc lập dùng trong kiểm tra

- Mùng 1 Tết Ất Tỵ là 29/01/2025: [Báo Chính phủ, bản tin ngày 29/01/2025](https://baochinhphu.vn/mung-1-tet-nguyen-dan-at-ty-tai-nan-giao-thong-giam-o-ca-3-tieu-chi-102250129175001894.htm).
- Lịch Trung 2033, gồm nhuận tháng 11 bắt đầu 22/12/2033: [bảng lịch HKO](https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/2033e.pdf). Hai ngày được kiểm có cùng kết quả ở mô hình UTC+7; bảng HKO không được xem là lịch Việt cho mọi ngày.
- Lịch sử múi giờ Sài Gòn: [IANA tzdb, tệp asia](https://data.iana.org/time-zones/tzdb/asia). Runtime dùng ICU/tzdata đi kèm Node và ghi phiên bản thực tế vào audit; không tự tải tzdb mới khi chạy.
- Sự kiện thiên văn: [Astronomy Engine](https://github.com/cosinekitty/astronomy), MIT, phiên bản ghim 2.1.19. Code gán tháng Việt là phần triển khai riêng dựa trên sóc, đông chí và trung khí; không chép mã Hồ Ngọc Đức.

## Chưa hoàn thành kiểm chứng chuyên gia

Chưa có 30–50 lá số vàng độc lập được chuyên gia xác nhận. Lá số 1990 trong unit test là **baseline hồi quy của upstream**, không được gọi là golden độc lập. Các fixture đồ thị dùng để kiểm facts cũng chỉ là dữ liệu tổng hợp cho phần mềm.

Trước khi đánh dấu một profile `confirmed`, cần tập lá số có nguồn độc lập với: ngày giờ gốc, nơi sinh, quy ước lịch, múi giờ lịch sử, profile đầy đủ, hình/JSON tham chiếu, người kiểm tra và ngày kiểm. Các nhóm bắt buộc: ngày thường; Tý sớm/muộn và ranh tháng/năm; đầu/cuối tháng nhuận; ranh năm âm; Mệnh vô chính diệu; các can tứ hóa; người sinh tại Việt Nam qua các giai đoạn múi giờ.

`thienky-candidate` giữ trạng thái ứng viên: hai quy tắc nhuận/Tý có cơ sở bản chép lời Bài 04 Thượng, nhưng bảng sáng XD2 và các quy ước còn lại chưa được xác nhận toàn bộ.
