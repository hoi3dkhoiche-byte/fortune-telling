# Prompt cho agent thiết kế và triển khai giao diện Tử Vi

Bạn là design engineer phụ trách thiết kế và lập trình giao diện cho một công cụ Tử Vi Đẩu Số theo hệ phái Thiên Kỷ. Hãy triển khai sản phẩm chạy được trên code hiện có, kiểm tra trực quan và sửa lỗi đến khi đạt yêu cầu. Đây là yêu cầu thực hiện, không dừng ở kế hoạch hoặc bản mô tả.

## 1. Workspace và phạm vi

Workspace: `C:\Users\ADMIN\Desktop\Tử vi`.

- Lõi đã có: `Việt Nam/tuvi-core`.
- Toàn bộ frontend và server adapter mới đặt tại `Việt Nam/tuvi-web`.
- Đọc AGENTS.md có liên quan, trạng thái Git và cấu trúc thực tế trước khi chỉnh sửa. Giữ nguyên thay đổi đang có của người dùng.
- Tái sử dụng `tuvi-core` qua package/import server. Giữ nguyên thuật toán, vendor, glossary và các kiểm thử của core. Nếu phát hiện lỗi lõi, ghi bằng chứng riêng; không tự sửa luật để giao diện dễ chạy.
- Chạy và xem thử local. Chưa triển khai hosting, đăng công khai, tạo dịch vụ trả phí hay push Git.

## 2. Sử dụng bộ skill đã cài

Bộ tham chiếu: https://github.com/emilkowalski/skills.

Tìm và đọc đúng SKILL.md trong phiên bản đang cài. Ưu tiên:

- `emil-design-eng`: thiết kế tương tác và hoàn thiện giao diện.
- `mobile-native`: rà soát trải nghiệm trên điện thoại.
- `review-animations`: nếu có chuyển động cần đánh giá.
- `break-ui + fix`: kiểm tra các trường hợp dữ liệu khó và sửa các lỗi tìm thấy. Tôi cho phép sửa toàn bộ lỗi giao diện thông thường trong phạm vi này sau khi ghi nhận chúng; không cần dừng để xin xác nhận từng lỗi.

Áp dụng skill khi phù hợp với mục tiêu cụ thể. Chuyển động phải phục vụ tương tác, không làm chậm việc đọc lá số. Nếu tên skill khác ở phiên bản đã cài, chọn skill tương đương thực sự tồn tại.

## 3. Đọc code và dữ liệu trước khi thiết kế

Đọc ít nhất các file sau, không đoán schema từ tên file:

1. `Việt Nam/tuvi-core/README.md` và `package.json`.
2. `src/types.ts`, `src/profiles.ts`, `src/index.ts`.
3. `src/natal.ts`, `src/normalize.ts`, `src/cli.ts`.
4. `src/i18n.ts`, `src/facts.ts`, `i18n/vi.json`.
5. `examples/birth.json`, `examples/birth.output.json`, `examples/chart-ready.json`.
6. `docs/verification.md` để hiểu giới hạn đã được kiểm chứng.

Core hiện là package Node CommonJS, dùng API của Node như `node:crypto`. Không tải thẳng bản build này vào trình duyệt bằng script tag. Nếu đường dẫn hoặc dữ liệu thực tế khác, điều chỉnh theo code đã đọc và ghi rõ phần khác biệt.

## 4. Trải nghiệm sản phẩm

Đây là công cụ lập và đọc lá số dành cho người Việt. Trọng tâm là nhập dữ kiện thuận tiện, đọc lá số rõ ràng, chọn cung để khám phá các quan hệ. Tên làm việc: **Thiên Kỷ**; mô tả: **Lập lá số Tử Vi Đẩu Số**.

Chọn một hướng thiết kế thống nhất: nền ngà ấm, chữ mực đậm, đỏ son tiết chế và xanh ngọc trầm làm điểm nhấn. Cảm giác như một công cụ nghiên cứu phương Đông hiện đại. Ưu tiên chữ có dấu đẹp, mật độ thông tin hợp lý và phân cấp thị giác rõ. Có thể điều chỉnh sắc độ để đạt độ tương phản tốt.

Thiết kế một ứng dụng tập trung vào tác vụ. Dùng không gian cho lá số và thao tác đọc; tránh phần mở đầu chiếm cả màn hình, số liệu quảng cáo, lời chứng thực hoặc thành tích chưa có nguồn. Chỉ dùng biểu tượng và hình ảnh khi chúng giúp hiểu chức năng. Chọn một theme sáng hoàn chỉnh trước.

Mọi nhãn và thông báo cho người dùng viết bằng tiếng Việt tự nhiên. Chưa có model luận giải: phần chi tiết chỉ trình bày dữ kiện thật từ engine. Không tạo lời phán, điểm vận may, dự báo sức khỏe/tài chính hay nội dung chatbot giả.

## 5. Bố cục và chức năng

### A. Biểu mẫu lập lá số

- Ngày sinh; lựa chọn dương lịch hoặc âm lịch.
- Với âm lịch: ngày, tháng, năm nhập riêng và lựa chọn tháng nhuận. Không dùng bộ chọn ngày Gregorian để quyết định ngày âm hợp lệ.
- Giờ và phút sinh, có lựa chọn **Chưa rõ giờ sinh**.
- Giới tính Nam/Nữ, ánh xạ sang `male`/`female`.
- Nơi sinh và timezone tại nơi sinh. Danh mục địa điểm phải có nguồn tọa độ/timezone thực. Nếu chưa có danh mục đủ tin cậy, hỗ trợ lựa chọn timezone và nhập tọa độ trong tùy chọn nâng cao; không dựng danh sách địa điểm giả.
- Nút chính **Lập lá số**; nút phụ **Xem lá số mẫu**; hỗ trợ mở một file JSON kết quả có sẵn.
- Hiển thị ngắn gọn quy tắc đang dùng. Profile mặc định `thienky-candidate` phải có nhãn **Đang kiểm chứng**. Profile `repro-v4` dành cho đối chiếu trong tùy chọn nâng cao.
- Không tự lấy timezone của thiết bị làm timezone nơi sinh. Không lấy vị trí hiện tại làm nơi sinh.
- Tên hiển thị, nếu có, là metadata UI riêng và không gửi vào BirthInput của core.

### B. Bảng lá số

Dùng HTML và CSS Grid dựng khung 4 × 4, 12 cung ở vành ngoài và vùng thông tin trung tâm. Ánh xạ theo **branch**, không đặt vị trí theo tên cung hoặc chỉ số phần tử trong mảng:

```text
Hàng 1:  5 Tỵ     6 Ngọ       7 Mùi       8 Thân
Hàng 2:  4 Thìn   [       trung tâm      ] 9 Dậu
Hàng 3:  3 Mão    [       trung tâm      ] 10 Tuất
Hàng 4:  2 Dần    1 Sửu       0 Tý        11 Hợi
```

Mỗi cung trình bày tên cung, can chi, chính tinh, phụ tinh, độ sáng, dấu tứ hóa và khoảng tuổi đại hạn nếu dữ liệu có. Phân cấp chính tinh và phụ tinh rõ ràng, giữ đầy đủ tên sao để có thể đọc và sao chép. Màu sắc có chú giải và không phải dấu hiệu duy nhất để phân biệt dữ liệu.

- Thân là dấu trên một cung, không tạo cung thứ 13.
- Cung vô chính diệu được ghi rõ. Sao mượn trình bày riêng với sao tọa thủ.
- Tứ hóa có thể ở cùng một cung; không gộp mất badge.
- Vùng trung tâm có thông tin ngày giờ, giới tính, Mệnh/Thân, Cục, Mệnh chủ/Thân chủ nếu có. Phân biệt ngày giờ người nhập với ngày giờ đã chuẩn hóa khi chúng khác nhau.
- Bấm cung để chọn; có trạng thái chọn và focus rõ. Dựa vào `relations` để highlight đối cung, tam hợp, tam phương tứ chính; có thể dùng SVG cho đường liên hệ khi được bật.

### C. Chi tiết cung

Hiển thị tên cung, danh sách sao, độ sáng/tứ hóa, quan hệ cung và khoảng tuổi đại hạn. Có thể giải thích ngắn các nhãn giao diện, nhưng không tự thêm kiến thức luận đoán chưa có nguồn.

Các hash, fact ID, JSON raw và audit kỹ thuật đặt trong mục **Thông tin kiểm chứng** có thể thu gọn. Luồng chính dùng nhãn tiếng Việt giúp người đọc lá số.

### D. Responsive

Desktop: biểu mẫu gọn, lá số làm vùng chính, bảng chi tiết bên cạnh. Màn hình vừa: xếp lại để bảng lá số có đủ chiều rộng. Mobile: chọn một cách đọc thực sự khả dụng; có thể cho vùng lá số cuộn riêng và thêm chế độ danh sách 12 cung hoặc chi tiết cung đã chọn. Giữ lựa chọn cung đồng bộ giữa các chế độ.

Không ép toàn bộ nội dung lá số thành chữ li ti để vừa màn hình. Kiểm tra nội dung dài, chữ Hán-Việt có dấu, cung nhiều sao và bảng chi tiết dài.

## 6. Stack và tích hợp thật

Ưu tiên **HTML + CSS + JavaScript ES modules** cho frontend. Viết server Node nhỏ để phục vụ file tĩnh và API cùng origin; dùng Node phiên bản phù hợp với core. Chia module theo trách nhiệm, chẳng hạn `form.js`, `chart.js`, `details.js`, `api.js`, `state.js` và `styles.css`. Tái sử dụng cấu trúc phù hợp nếu workspace đã có; chỉ thêm dependency có lý do cụ thể.

API tối thiểu cần triển khai thật:

- `GET /api/profiles`: trả các profile được hỗ trợ.
- `POST /api/natal`: nhận `{ birth: BirthInput, profileId: string, selectedScenario?: ChartReady }`.

Luồng server:

1. Kiểm tra request và lấy preset qua `getProfile(profileId)`.
2. Gọi `normalizeBirth(birth, profile)`.
3. Nếu `needs`, trả envelope tương ứng, giữ `reason`, `scenarios`, `audit`, `warnings`; không gọi `computeNatal` để bịa kết quả. Riêng khi reason là `HOUR_BOUNDARY` và người dùng đã gửi `selectedScenario`, server phải chuẩn hóa lại input gốc, xác nhận scenario thuộc đúng tập vừa tính, rồi mới cho phép tính nó. Ghi việc người dùng chọn vào normalization audit. Input/profile thay đổi phải được kiểm lại từ đầu.
4. Nếu `ok`, gọi `computeNatal(normalized.chart, profile)`, tạo envelope `{ status: "ok", ...result, normalization: { chart, audit, warnings } }`.
5. Có thể bổ sung `displayNatal: decorateNatal(result.natal)` để frontend nhận nhãn trực tiếp, vẫn giữ bản `natal` gốc.
6. Input sai trả lỗi có cấu trúc. Định nghĩa HTTP status rõ, frontend đọc cả envelope lỗi thay vì chỉ kiểm tra `response.ok` rồi bỏ mất thông tin cần làm rõ.

Đọc shape trả về thực tế của các hàm trước khi viết adapter. `computeNatal()` không tự có field `status`; đó là trách nhiệm lớp API. Không chạy shell/subprocess theo chuỗi do trình duyệt gửi vào.

Contract BirthInput hiện có:

```ts
{
  calendar: 'solar' | 'lunar';
  date: string; // YYYY-MM-DD; với lunar đây là ngày âm
  isLeap?: boolean; // lunar bắt buộc; solar phải bỏ field này
  time: string | null; // HH:mm; null khi chưa rõ giờ
  tz: string; // IANA timezone đã được người dùng chọn/xác nhận
  place?: { lat: number; lon: number };
  gender: 'male' | 'female';
  calendarConvention?: 'chinese' | 'vietnamese';
}
```

`hourBranch` 0–11 là đầu vào ChartReady sau chuẩn hóa, không thay thế giờ đồng hồ trong biểu mẫu. Phạm vi ngày dương core hiện hỗ trợ 1900–2050.

Tên cung/sao raw trong `natal` vẫn là Trung văn. Dùng `decorateNatal()` hoặc nhãn có sẵn trong `labels`. Nếu join ở frontend, dùng định danh/`sourceName` đúng cung và đúng sao; không làm mất độ sáng phụ thuộc vị trí. Nhãn chưa biết phải giữ nguồn và trạng thái unknown. Không dùng LLM dịch nhãn lúc chạy.

## 7. Xử lý trạng thái và dữ kiện chưa rõ

Có đủ trạng thái ban đầu, mẫu minh họa, đang tính, kết quả, dữ kiện cần làm rõ và lỗi API. Đánh dấu dữ liệu mẫu rõ ràng; không khiến người dùng tưởng đó là lá số vừa tính từ biểu mẫu.

Xử lý đầy đủ các reason thực tế:

- `NEEDS_BIRTH_TIME`: yêu cầu bổ sung giờ hoặc giải thích còn thiếu giờ; không mặc định 00:00.
- `NEEDS_BIRTH_PLACE`: bổ sung dữ liệu nơi sinh phục vụ hiệu chỉnh.
- `HOUR_BOUNDARY`: trình bày các ChartReady scenario do backend trả, nêu khác nhau ở ngày/chi giờ. Chỉ tính một scenario khi người dùng chủ động chọn; nếu cần luồng xác nhận API riêng thì bổ sung adapter kiểm tra scenario, không tin một cờ "confirmed" từ client để bỏ qua validation.
- `CALENDAR_CONFIRMATION`, `CALENDAR_DIVERGENCE`: giải thích hai quy ước đang khác. Mặc định không gửi `calendarConvention` để core phát hiện khác biệt; chỉ gửi khi người dùng đã chọn rõ. Không âm thầm đổi sang Chinese cho request thành công. Lịch Việt trên ngày lệch hiện chưa được engine hỗ trợ đầy đủ, phải giữ trạng thái đó trung thực.
- `AMBIGUOUS_LOCAL_TIME`, `NONEXISTENT_LOCAL_TIME`: hiển thị vấn đề đồng hồ lịch sử/DST và hướng dẫn kiểm tra lại. Không tự chọn offset hoặc cộng/trừ một giờ.

Sửa dữ kiện không được làm lá số cũ trông như kết quả của dữ kiện mới. Xử lý request cũ trả chậm để nó không ghi đè request mới. Nếu giữ kết quả cũ trong lúc tính, gắn nhãn rõ là kết quả trước đó.

Không hiển thị nút chức năng chưa được nối thật. Không tự bật hiệu chỉnh giờ mặt trời, tự áp giờ của máy người dùng hoặc quảng cáo độ chính xác 100%.

## 8. Hoàn thiện và kiểm tra

- Bàn phím thao tác được toàn bộ form và chọn cung; label và thông báo lỗi gắn đúng trường.
- Chuyển động ngắn, hỗ trợ `prefers-reduced-motion`; nội dung đọc được ngay.
- Kiểm tra desktop và viewport mobile khoảng 360–390 px; không tràn ngang cả trang. Nếu chỉ có giả lập, ghi rõ chưa thử trên thiết bị thật.
- Kiểm tra lá số mẫu thật, cung nhiều sao, vô chính diệu, nhãn dài/unknown, thiếu giờ, tháng nhuận, gần ranh giờ, lệch lịch, lỗi kết nối và phản hồi đến sai thứ tự.
- Test API những luồng có ý nghĩa: `ok`, `needs`, input sai, profile không tồn tại. Kiểm tra hành vi UI chính bằng công cụ trình duyệt nếu có.
- Giữ nguyên và chạy các kiểm thử core hiện có khi cần xác nhận tích hợp; không làm yếu test hoặc đổi expected để che lỗi.
- Dùng `break-ui + fix` để ghi nhận và sửa các lỗi UI còn lại trong phạm vi.

Không lưu lịch sử ngày giờ sinh lên dịch vụ ngoài hoặc localStorage tự động. Nếu thêm chức năng nhớ/lưu, phải là thao tác chủ động có cách xóa; giai đoạn này không cần tài khoản hay database.

## 9. Tiêu chí bàn giao

Tôi cần một bản local hoàn chỉnh: đẹp, đọc lá số thuận tiện và dùng được với engine thật. Hãy:

1. Hoàn thành mã trong `Việt Nam/tuvi-web` cùng lệnh cài/chạy rõ ràng.
2. Có chế độ xem lá số mẫu/mở JSON và biểu mẫu gọi API thật, dùng chung bộ renderer.
3. Thể hiện đúng vị trí 12 cung và dữ kiện engine, có nhãn Hán-Việt.
4. Xử lý các trạng thái `needs` đúng phạm vi backend; không giả luận giải AI.
5. Kiểm tra, chụp ảnh desktop/mobile nếu công cụ hỗ trợ và sửa lỗi trước khi bàn giao.
6. Viết README ngắn: cách chạy, module chính, hợp đồng API, kiểm tra đã chạy và giới hạn còn lại.

Chốt vài quyết định thiết kế cần thiết rồi bắt tay triển khai. Tự xử lý các lựa chọn kỹ thuật thông thường theo brief này; chỉ hỏi khi thiếu thông tin thực sự ngăn cản công việc, đồng thời tiếp tục các phần độc lập.
