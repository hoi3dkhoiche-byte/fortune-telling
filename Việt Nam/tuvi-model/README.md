# @tuvi/model

Lớp model kiểm định sự thật (Fact-Checking) và truy xuất bài giảng Thiên Kỷ cho hệ thống Tử Vi Đẩu Số, tách rời hoàn toàn khỏi lõi tính toán xác định `@tuvi/core`.

## Kiến trúc chính

1. **Claim có cấu trúc (`src/schema.js`, `src/validator.js`)**
   - Mỗi nhận định trong `claims[]` bắt buộc khai báo cả `factIds` lẫn mảng `assertions` dạng `{ subjectId, predicate, objectId?, value? }`.
   - Bộ kiểm định đối chiếu từng `assertion` trực tiếp với `facts` do `@tuvi/core` tính lại từ `natal`, từ chối mọi `factId` gắn thừa không có `assertion`, từ chối `quoteId` ngoài danh sách `retrievedQuotes` (kể cả khi danh sách rỗng).
   - Chuẩn hóa Unicode `NFC` và chính tả tiếng Việt (`hoá/hóa`, `kị/kỵ`, `toạ/tọa`) trước khi quét mâu thuẫn vị trí sao–cung, Tứ Hóa, trạng thái Mệnh vô chính diệu, câu phán đoán định mệnh vô căn cứ và khuyến nghị mê tín/cúng bái.
2. **Quyền riêng tư & Thu gọn ngữ cảnh (`src/context-builder.js`)**
   - Gỡ toàn bộ định danh sinh trực tiếp (`birthInfo`, `lunarInfo`, `normalization.input/chart/audit`, `tz`, `place`, `userName`) và quét chặn ngày giờ sinh tự do trong `question` (ví dụ `5/3/1990`, `lúc 6h sáng`).
   - **Giới hạn trung thực**: tổ hợp cấu trúc sao, Ngũ Hành Cục, Âm/Dương Nam/Nữ và vị trí Mệnh/Thân vẫn có khả năng thu hẹp khoảng thời gian sinh (`structuralReidentificationRisk: 'non-zero'`). Vì vậy mặc định adapter chỉ cho phép kết nối loopback cục bộ (`localhost` / `127.0.0.1`).
   - Tự động chọn lọc `promptFacts` theo cung trọng tâm (Mệnh, Thân, Phúc Đức, Tứ Hóa, `focusPalace` và tam phương tứ chính) kèm thông tin `profile` (`status`, `brightnessSchool`) và `warnings`, giữ kích thước prompt khoảng `5–8 KB` để không bị cắt trên LLM cục bộ.
3. **Kho trích dẫn RAG Thiên Kỷ (`src/rag.js`)**
   - Đánh chỉ mục BM25 toàn bộ **16 bài giảng** (**1.848 câu nguyên văn** có mã `TK.*` duy nhất và mốc thời gian).
4. **Đường ống tự sửa lỗi & Đánh giá không tuần hoàn (`src/pipeline.js`, `eval/run-eval.js`)**
   - Vòng retry bao phủ cả lỗi cú pháp JSON (`JSON_PARSE_ERROR`) lẫn lỗi kiểm định sự thật. Khi hết lượt thử mà chưa hợp lệ, `interpretation` trả về `null` (không bao giờ phát tán nhận định sai ra giao diện).
   - `npm run eval` chạy cả bài kiểm tra đường ống lẫn **bộ đối kháng không tuần hoàn (`ADVERSARIAL_CASES`)** để đo `adversarialRecall` và `falsePositiveRate` thực tế của Validator.

## Lệnh chạy

```powershell
npm run typecheck
npm test
npm run eval
```
