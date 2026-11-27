# Hướng Dẫn Huấn Luyện & Tích Hợp Model (`@tuvi/model`)

Tài liệu này hướng dẫn quy trình khép kín để sinh dữ liệu huấn luyện **SFT + DPO**, kiểm định dữ liệu chưng cất từ Teacher LLM, đóng gói mô hình sau khi train và kết nối trực tiếp vào ứng dụng Web `tuvi-web`.

---

## 1. Sinh bộ dữ liệu huấn luyện chuẩn hóa (SFT + DPO + Distillation Prompts)

Toàn bộ dữ liệu sinh ra đều đi qua `@tuvi/core` $\rightarrow$ `buildAnonymizedContext` (đã gỡ 100% thông tin ngày giờ sinh/tọa độ) $\rightarrow$ `RAG` (1.848 câu giảng Thiên Kỷ) $\rightarrow$ `Fact-Checking Validator`.

```powershell
cd "Việt Nam/tuvi-model"

# Sinh 1.000 mẫu phân tầng (phủ đủ 14 chính tinh, 10 Thiên Can Tứ Hóa, 5 Cục, Vô chính diệu, Tý muộn, lịch Việt/Trung)
npm run build:dataset -- --count=1000 --profile=thienky-candidate --out-dir=./dataset-out
```

Lệnh trên tạo ra 4 file trong `./dataset-out`:
1. `sft_messages.jsonl`: Định dạng OpenAI `messages` (`[system, user, assistant]`) dùng trực tiếp cho **Unsloth / LLaMA-Factory / Axolotl / HuggingFace TRL**. Phần `assistant` gồm khối suy luận 6 bước `<think>...</think>` nối tiếp bởi JSON chuẩn `tuvi.interpretation.v0` đã vượt qua 100% bài kiểm của `validateInterpretation`.
2. `dpo_pairs.jsonl`: Định dạng `{ prompt, chosen, rejected, rejectionCode }` phục vụ huấn luyện **DPO / ORPO**. Mỗi mẫu `rejected` biểu diễn một trong 5 nhóm lỗi thực tế (`STAR_PALACE_CONTRADICTION`, `SIHUA_CONTRADICTION`, `UNKNOWN_FACT_ID`, `DOCTRINE_SUPERSTITION`, `UNGROUNDED_FATALISTIC_CLAIM`) và được đảm bảo bị Validator từ chối.
3. `distill_prompts.jsonl`: Chứa `{ id, systemPrompt, userPrompt, responseJsonSchema, metadata }` kèm **Dynamic JSON Schema** khóa sẵn `enum` của `factIds` và `quoteIds` theo từng lá số để bạn gọi Teacher LLM lớn (ví dụ `Qwen2.5-72B-Instruct` hoặc `DeepSeek-R1`) sinh văn phong phong phú hơn mà không bịa mã dữ kiện.
4. `manifest.json`: Báo cáo thống kê độ phủ sao/can/cục và cam kết toàn vẹn dữ liệu.

---

## 2. Lọc & Kiểm định dữ liệu sinh từ Teacher LLM

Sau khi dùng Teacher Model sinh phản hồi cho `distill_prompts.jsonl` ra file `teacher_raw.jsonl` (định dạng `{ messages: [system, user, assistant] }`), chạy bộ lọc tự động:

```powershell
npm run verify:dataset -- --input=./dataset-out/teacher_raw.jsonl --output=./dataset-out/teacher_clean.jsonl
```

Chỉ những bản ghi thỏa mãn đồng thời **cú pháp JSON**, **khớp 100% `assertions`/`factIds` với lá số**, **trích dẫn đúng `quoteIds`**, **không vi phạm bài trừ mê tín Thiên Kỷ**, và **0 rò rỉ PII** mới được ghi vào `teacher_clean.jsonl`.

---

## 3. Cấu hình huấn luyện khuyến nghị (QLoRA SFT $\rightarrow$ DPO)

- **Base Model khuyến nghị**: `Qwen/Qwen2.5-14B-Instruct` (hoặc `Qwen/Qwen2.5-7B-Instruct` nếu chạy trên GPU 8–12 GB VRAM).
- **Tham số SFT (Unsloth / LLaMA-Factory)**:
  - `cutoff_len`: `8192` (prompt trung bình ~3.750 token + phần `<think>` & JSON output ~900 token).
  - `lora_rank`: `32` hoặc `64`, `lora_alpha`: `64`, `lora_target`: `all`.
  - `learning_rate`: `1.5e-4`, `num_train_epochs`: `2.0`, `lr_scheduler_type`: `cosine`.
  - **Lưu ý quan trọng**: Chỉ tính loss trên lượt `assistant` (`train_on_prompt: false` / `mask_history: true`) để model tập trung học suy luận `<think>` và cấu trúc JSON thay vì học thuộc JSON đầu vào.
- **Tham số DPO**:
  - Nạp adapter SFT ở bước trên, chạy thêm `1 epoch` trên `dpo_pairs.jsonl` với `learning_rate: 5e-6`, `pref_beta: 0.1`.

---

## 4. Đánh giá Model trước & sau khi Train (`Pass@1`, Độ trễ, Phân bố lỗi)

Khi đã chạy model cục bộ qua Ollama hoặc vLLM (`http://127.0.0.1:11434/v1`):

```powershell
# Đánh giá chế độ thường
npm run eval -- --mode=local --model=tuvi-thienky:14b --save-report=./eval/reports/tuvi-14b.json

# Đánh giá bật Constrained Decoding (khóa JSON Schema động theo từng lá số)
npm run eval -- --mode=local --model=tuvi-thienky:14b --structured=1 --save-report=./eval/reports/tuvi-14b-structured.json
```

Báo cáo sẽ đo rõ `passAt1Rate` (tỉ lệ vượt Validator ngay lần sinh đầu tiên), `smokePassRate` (tỉ lệ vượt sau tối đa retry), `avgLatencyMs`, `p95LatencyMs`, và `errorHistogram`.

---

## 5. Đóng gói & Kết nối vào ứng dụng `tuvi-web`

1. Xuất mô hình sang GGUF (ví dụ `Q4_K_M` hoặc `Q5_K_M`) và nạp vào Ollama bằng [Modelfile.example](file:///c:/Users/ADMIN/Desktop/T%E1%BB%AD%20vi/Vi%E1%BB%87t%20Nam/tuvi-model/Modelfile.example):
   ```powershell
   ollama create tuvi-thienky:14b -f Modelfile.example
   ```
2. Khởi chạy `tuvi-web` trỏ vào model vừa tạo:
   ```powershell
   cd "../tuvi-web"
   $env:TUVI_LLM_MODEL="tuvi-thienky:14b"
   $env:TUVI_LLM_STRUCTURED="1"
   npm start
   ```
3. Mở `http://localhost:3000`: màn hình **Dữ kiện lá số** sẽ tự động phát hiện `tuvi-thienky:14b` đang trực tuyến qua `/api/model/status`, tự chọn sẵn chế độ **LLM cục bộ**, cho phép chọn từng cung trọng tâm, xem chuỗi suy luận `<think>` và bấm vào từng `factId` / `quoteId` để đối chiếu trực tiếp.
