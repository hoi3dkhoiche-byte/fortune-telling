# Kiểm chứng phần code trước khi huấn luyện

Ngày kiểm tra: **18/11/2026**. Nguồn đã đọc và thực thi: bản source trong `China/ziwei-doushu-main/ziwei-doushu-main`, không chỉ README hay DeepWiki.

## Kết luận

**Có thể bắt đầu phần code ngay.** Lõi lập lá số chạy được trên CPU, không cần model, GPU, khóa API hoặc dataset 57 GB. Nên giữ engine TypeScript gốc, đặt một lớp adapter/API của mình phía trước. Chưa có lý do kỹ thuật phải viết lại bằng Python ở bước này.

Đã tạo PoC thực thi nhỏ trong thư mục này: đọc ngày lập số và chỉ số thời thần, gọi trực tiếp `generateChart()`, xuất bản mệnh JSON. Đây chưa phải API hay ứng dụng hoàn chỉnh.

## Những gì đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Cài dependencies theo `package-lock.json` | Thành công; 183 packages, bỏ lifecycle scripts |
| `npm run typecheck` của repo | Qua |
| `npm test` của repo | Cả 17 script qua |
| Kiểm tra cấu trúc bản mệnh của repo | 768 đầu vào × 7 bất biến qua |
| PoC gọi engine ngoài Next.js | Xuất thành công lá số 12 cung |
| Kiểm tra hợp đồng đầu vào PoC | 8 nhóm kiểm tra qua |

Môi trường: Node **24.14.1**, npm **11.11.0**; lockfile chốt `iztro 2.6.1`, `lunar-javascript 1.7.7`. Trong môi trường sandbox của agent, `tsx` gặp lỗi `uv_os_get_passwd`; các lượt chạy dùng tsx thành công khi được phép chạy ngoài sandbox. Kiểm tra kiểu dữ liệu chạy được trong sandbox.

**Giới hạn bằng chứng:** 768 trường hợp kiểm tra các bất biến như đủ cung, đúng hướng cung, quan hệ Cơ–Lương/Tử–Phủ. Chúng không phải 768 lá số vàng được chuyên gia xác nhận. Một script kiểm tên gọi báo đã duyệt 0 file; việc toàn bộ suite qua cũng không biến nó thành kiểm chứng đầy đủ.

## Phần nào đã có trong source

| Khối | Dùng được đến đâu |
|---|---|
| `lib/ziwei/algorithm.ts` | `generateChart(birthInfo, { leapMonth })`: sao, cung, độ sáng, tứ hóa bản mệnh, Mệnh–Thân, Cục, khoảng tuổi đại hạn, đối cung/sao mượn |
| `lib/ziwei/patterns.ts` | Hàm chính gọi 41 detector; có điều kiện bắt buộc/cộng điểm/phá cách ở các mẫu hỗ trợ; chưa có fact ID hay rule ID ổn định |
| `lib/ziwei/true-solar-time.ts` | Có hiệu chỉnh kinh độ, phương trình thời gian, offset UTC tường minh và xử lý ranh ngày |
| `lib/ziwei/yunxian-context.ts` | Chọn ngữ cảnh đại hạn theo tuổi/năm, có giai đoạn trước đại hạn |
| `lib/ziwei/sihua.ts`, `shier-shen.ts` | Có các helper bảng tứ hóa/thần sát; cần xét phạm vi sử dụng theo hệ phái |
| Giao diện gốc | Demo Next.js; có thể tham khảo để kiểm hình lá số |

`patterns.ts` có marker `server-only`: khi đóng gói độc lập phải xử lý rõ. Test gốc dùng Node module hooks; không nên tưởng chỉ import là dùng được ở mọi môi trường.

**Phần không có:** public snapshot không có `app/api`; kho đoạn ngữ trong `db-analysis.ts` là `STAR_DB = {}`. Không thể bật demo rồi có sẵn backend luận giải chuyên sâu. Các helper lưu nguyệt/nhật/thời không đủ chứng minh có engine cung vận hạn hoàn chỉnh cho tất cả lớp này.

## Các điểm phải chốt trước API cho người Việt

1. **Profile Thiên Kỷ có nguồn xác nhận.** Mặc định repo là QS, tháng nhuận `split`, Tý muộn `next-day`. `school-config.ts` lại gắn nhãn phái Nghê cho `next-month` và `current-day`, còn comment trong `share.ts` có chỗ nói khác. Đã tìm được bằng chứng trực tiếp trong bản chép lời [Bài 04 Thượng, mục §10](../Việt%20Nam/docs%20tiếng%20việt/Bài%2004%20Thượng.md): **00:29:35** nói tháng nhuận tính sang tháng sau, **00:29:59–00:30:41** phân biệt Vãn Tý và đổi ngày sau nửa đêm. Bản Trung văn `China/docs/tianji-ziwei/4上.md` có đoạn tương ứng. Hai quy tắc ứng viên vì vậy có cơ sở để lập profile `next-month` + `current-day`; vẫn nên nghe đối chiếu video trước khi chốt chuẩn, và chưa suy rộng sang bảng sáng/các lựa chọn khác. Tách profile tái hiện dataset v4 và profile hệ phái; không tự xem hai profile là giống nhau. Dataset v4 được công bố dùng mặc định độ sáng cũ XD2.
2. **Lịch âm và giờ là hai bài toán riêng.** Các phép đổi lịch của lõi hiện không nhận timezone. Cần quyết định sản phẩm dùng lịch âm Việt hay quy ước lịch Trung Quốc của nguồn, rồi đối chiếu các ngày khác nhau. Truyền UTC+7 vào hiệu chỉnh giờ mặt trời không tự biến lịch Trung thành lịch Việt.
3. **Không dùng nguyên adapter biểu mẫu gốc.** `share.ts` vẫn dùng kinh tuyến 120° và không dùng đầy đủ phương trình thời gian. Adapter mới phải nhận giờ đồng hồ, ngày, nơi sinh, offset tại thời điểm sinh, chính sách hiệu chỉnh và lịch sử điều chỉnh. Không áp UTC+7 hiện tại cho mọi nơi/mọi năm sinh. Chưa rõ giờ sinh thì trả thiếu dữ kiện hoặc các kịch bản; không mặc định giờ Tý.
4. **Tách bản mệnh khỏi thời điểm phân tích.** JSON gốc có `currentAge`, `currentDaXianIndex`, `palaces[].isCurrentDaXian` phụ thuộc ngày chạy. API cần ngày/năm phân tích tường minh; hash bản mệnh phải loại các trường động này.
5. **Tứ hóa đúng phạm vi hệ phái.** Lõi bản mệnh cố ý không xuất tự hóa hay tứ hóa đại hạn do quan điểm tứ hóa cố định. Đừng đưa mọi helper phi hóa còn tồn tại vào luận Thiên Kỷ một cách tự động. Tứ Trụ phụ trong output dùng thời điểm giữa thời thần, không phải engine Bát Tự chính xác đến phút.

## Phạm vi code nên làm tiếp

Giữ upstream làm nguồn tham chiếu và chốt phiên bản; xây package/service TypeScript riêng với các phần:

1. **Chuẩn hóa đầu vào:** phân biệt âm/dương lịch, giờ đồng hồ/chỉ số giờ, dữ kiện thiếu, quy tắc Tý và nhuận; ghi lại phép chuyển đổi có thể kiểm tra.
2. **Engine adapter:** gọi lõi với cấu hình tường minh; trả dữ kiện bản mệnh và ngữ cảnh đại hạn theo ngày phân tích đã xác định. Bắt đầu bằng bản mệnh và đại hạn; bổ sung lớp vận hạn sau khi kiểm chứng riêng.
3. **Schema JSON có phiên bản:** ID sao/cung cố định, nhãn Hán-Việt từ bảng thuật ngữ đã duyệt, dữ kiện có ID và nguồn; tính sẵn đối cung/tam hợp/tam phương tứ chính bằng code.
4. **API nhỏ:** `POST /v1/charts/natal`; tách endpoint ngữ cảnh thời gian khi phần đó đã kiểm chứng. Dữ liệu trả về cần đủ dựng hình lá số và đủ làm đầu vào LLM sau này.
5. **Bộ lá số vàng:** thu khoảng 30–50 trường hợp độc lập có xác nhận, phủ ngày thường, giờ Tý, tháng nhuận, ranh năm, UTC+7 và cung vô chính diệu. Sau đó mở rộng differential test nếu dùng thêm engine thứ hai.

Điều kiện hoàn thành giai đoạn này: cùng input + profile + phiên bản nguồn cho cùng bản mệnh; từ chối input sai/mơ hồ; bộ ca vàng đạt; nhãn Việt được duyệt; app truy vết được mọi phép đổi ngày/giờ. Khi đó mới nối RAG/LLM và xây tập eval để quyết định có cần train.

Mã dữ kiện giúp truy vết, nhưng chỉ kiểm tra ID tồn tại chưa xác nhận được ý nghĩa câu văn. Giai đoạn LLM nên có claim dạng cấu trúc `(sao, quan hệ, cung, lớp thời gian)` để validator đối chiếu giá trị thật.

## Dữ liệu local có thể dùng trong giai đoạn này

- `China/docs/tianji-ziwei/entries.jsonl`: parse được **1.848** bản ghi, tất cả có `t_hms`; có 19 mục thuộc nhóm phong thủy. Dùng để truy nguồn quy ước và thiết kế test, không coi mọi câu giảng là luật thực thi ngay.
- `Việt Nam/docs tiếng việt`: **16** bài dịch Markdown, kèm tài liệu phương pháp luận; có thể khởi tạo glossary nhưng cần duyệt thuật ngữ.
- Các file cổ thư trong source có tổng **75 paragraph IDs**; chưa phải toàn văn ba sách chỉ vì tên file mang tên sách.
- Chưa thấy dataset v3/v4 `.tar`/`.zst` trong workspace. Điều này không cản chạy engine. Phong thủy/dương trạch mới có tư liệu và mô tả; chưa có engine đọc sơ đồ nhà.

Giữ thông báo MIT của source khi tái sử dụng; giấy phép corpus/dataset là phần riêng, cần đọc đúng file khi bước vào giai đoạn dữ liệu.

## Cách chạy PoC

Chạy trong thư mục workspace `C:\Users\ADMIN\Desktop\Tử vi`:

```powershell
node --import './China/ziwei-doushu-main/ziwei-doushu-main/node_modules/tsx/dist/loader.mjs' './engine-poc/probe.ts' './engine-poc/input.example.json' './engine-poc/output.example.json'
node './engine-poc/verify.cjs'
node './China/ziwei-doushu-main/ziwei-doushu-main/node_modules/typescript/bin/tsc' --project './engine-poc/tsconfig.json'
```

Nếu cần cài lại dependencies, chạy `npm.cmd ci --ignore-scripts --no-audit --no-fund` tại thư mục repo gốc trước. PoC dùng dependencies từ repo, không có package riêng.

Input mẫu dùng ngày lập số **1990-01-01**, **giờ Ngọ (index 6)**, nam, bảng sáng QS và tháng nhuận split. Đây là quy ước mẫu để kiểm thực thi, **chưa mang nhãn preset Thiên Kỷ được xác nhận**. `hourBranch` là 0–11, không phải giờ đồng hồ. Ngày đã phải xử lý Tý trước; PoC không tự đổi giờ hay lịch âm.

Output giữ chữ Trung văn của engine để đối chiếu; sắp xếp cung theo `branch` 0–11; bỏ ba trường phụ thuộc ngày chạy. `localSourceSha256` là hash các file lõi được dùng cùng lockfile, không phải commit Git hay chứng thực toàn bộ mã đã cài. Chưa có nhãn Việt, fact IDs, RAG, API hoặc lời luận trong PoC.

Nguồn trực tuyến đối chiếu: [repo gốc](https://github.com/Renhuai123/ziwei-doushu). Bản online đã có cập nhật nghiên cứu ngày 13/11/2026 mà local README chưa có; các kết luận khả năng chạy ở trên dựa trên code local đã kiểm thử.
