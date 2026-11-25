# @tuvi/model — Lớp Model Luận Giải Tử Vi Thiên Kỷ

Package không phụ thuộc runtime ngoài, triển khai kiến trúc tách đôi **code lập lá số (`@tuvi/core`) — model chỉ luận giải (`@tuvi/model`)** với 6 thành phần đầy đủ:

1. **Claim Schema (`src/schema.js`):** Định nghĩa chuẩn `tuvi.interpretation.v0` bắt buộc mỗi nhận định (`claim`) phải gắn ít nhất 1 `factId` có thật từ `@tuvi/core`.
2. **Fact-Checking Validator (`src/validator.js`):** Kiểm định 5 lớp:
   - Cấu trúc schema `tuvi.interpretation.v0`
   - Tồn tại `factIds` trong `result.facts`
   - Tồn tại `quoteIds` trong trích dẫn RAG
   - Phát hiện ảo giác trực tiếp trong văn bản tiếng Việt (đặt nhầm chính tinh vào cung, sai trạng thái Mệnh vô chính diệu, sai Tứ Hóa)
   - Ràng buộc đạo lý Thiên Kỷ (chặn khuyến nghị cúng sao giải hạn, mua bùa chú, mê tín).
3. **Anonymized Context Builder & PII Firewall (`src/context-builder.js`):**
   - Loại bỏ triệt để `birthInfo`, `lunarInfo`, `normalization`, `userName`, `place` (lat/lon), `tz`, `hash` khỏi ngữ cảnh gửi sang model.
   - Chạy tường lửa `assertNoBirthPii()` trước mọi lời gọi adapter; chặn ngay nếu phát hiện dữ kiện sinh xuất hiện trong prompt.
4. **RAG trên kho 1.848 câu giảng (`src/rag.js`):**
   - Nạp toàn bộ **16 file bài giảng** (`Việt Nam/docs tiếng việt/Bài *.md`) gồm đúng **1.848 câu nguyên văn** kèm mốc thời gian và link Bilibili gốc.
   - Truy xuất theo BM25 kết hợp trọng số thẻ chuyên môn (`<sub>...</sub>`) và tổ hợp sao/cung/Tứ Hóa của lá số.
5. **Model Adapters (`src/adapters/mock.js`, `src/adapters/openai-compatible.js`, `src/pipeline.js`):**
   - `MockModelAdapter`: chạy 100% offline, tất định, neo vào `facts` và trích dẫn bài giảng thật.
   - `OpenAICompatibleAdapter`: kết nối mặc định tới model cục bộ (**Ollama / vLLM / LM Studio** tại `http://127.0.0.1:11434/v1`). Từ chối mọi endpoint từ xa trừ khi bật tường minh `allowRemote: true` (hoặc `TUVI_LLM_ALLOW_REMOTE=1`), kèm vòng tự sửa lỗi (retry) khi Validator phát hiện sai lệch.
6. **Bộ Eval (`eval/run-eval.js`):** Đánh giá tự động trên 10 lá số đa dạng (Mệnh thường, Vô chính diệu mượn sao, tháng nhuận, Tý muộn, lịch Việt `1968-01-29`, lịch Trung...) về độ phủ `factId`, tỷ lệ ảo giác, tỷ lệ trích dẫn, tuân thủ giáo lý và quyền riêng tư.

## Chạy kiểm tra & Eval

```powershell
cd "Việt Nam/tuvi-model"
npm.cmd run typecheck
npm.cmd test
npm.cmd run eval
```

## Cấu hình chạy model cục bộ (Ollama / vLLM)

```powershell
$env:TUVI_MODEL_MODE = "local"
$env:TUVI_LLM_BASE_URL = "http://127.0.0.1:11434/v1"
$env:TUVI_LLM_MODEL = "qwen2.5:14b-instruct"
```
