# tuvi-core

Package TypeScript chạy trên CPU để lập lá số, chuẩn hóa ngày giờ và xuất dữ kiện có ID. Chưa có API, web, RAG hoặc model. Toàn bộ mã mới nằm tại `Việt Nam/tuvi-core`; lúc chạy không import sang thư mục `China` hay `engine-poc`.

## Chạy ngay

Đứng trong thư mục này, dùng Node **24.14.1** (đã ghi `.node-version` và `.nvmrc`):

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npm.cmd test
npm.cmd run verify:vendor
node dist/src/cli.js chart --input examples/chart-ready.json --profile repro-v4 --output examples/chart.output.json
node dist/src/cli.js chart --input examples/birth.json --profile thienky-candidate --output examples/birth.output.json
node dist/src/cli.js batch --input examples/batch.jsonl --profile repro-v4 --output examples/batch.output.jsonl
```

CLI có thể chạy trực tiếp như trên, không cần cài global. `bin` tên `tuvi` cũng đã khai báo nếu sau này cài/link package vào project khác. Dùng lệnh `node` khi cần stdout chỉ có JSON; npm có thể thêm banner của nó.

## Đầu vào

**Chart-ready** dùng ngày dương lịch đã xử lý quy tắc ngày và **chi giờ 0–11**, không phải giờ đồng hồ:

```json
{ "year": 1990, "month": 1, "day": 1, "hourBranch": 6, "gender": "male" }
```

**Birth input** dùng giờ đồng hồ và IANA timezone:

```json
{
  "calendar": "solar",
  "date": "1990-01-01",
  "time": "12:30",
  "tz": "Asia/Ho_Chi_Minh",
  "place": { "lat": 10.7769, "lon": 106.7009 },
  "gender": "male",
  "calendarConvention": "chinese"
}
```

Phạm vi ngày dương hiện tại **1900–2050**. `time: null` nghĩa là chưa biết giờ. Input âm lịch dùng `calendar: "lunar"`, ngày âm trong `date` và bắt buộc `isLeap: true|false` để phân biệt tháng nhuận. Không truyền trường chưa hỗ trợ như `name`, `clockHour` hoặc giá trị giới tính khác rồi mong code tự đoán.

`calendarConvention: "chinese"` là lựa chọn tường minh để dùng lịch của engine upstream (UTC+8). `calendarConvention: "vietnamese"` kích hoạt adapter lịch Việt theo mô hình thiên văn cố định UTC+7 (`vietnamese-astronomical-utc+7`), cho phép lập số theo ngày âm lịch Việt Nam trên toàn bộ giai đoạn 1900–2050 kể cả ~3,5–4% ngày lệch lịch (ví dụ `1968-01-29` = Mùng 1 Tết Mậu Thân tại miền Bắc). Nếu không chọn `calendarConvention`, code so lịch Trung với mô hình thiên văn UTC+7 và trả `CALENDAR_DIVERGENCE` khi hai lịch khác nhau để người dùng xác nhận tường minh.

> **Lưu ý lịch sử về múi giờ âm lịch tại Việt Nam:** Mô hình `vietnamese` tính sóc và tiết khí cố định ở **UTC+7** (phù hợp với miền Bắc từ ngày 08/08/1967 theo Quyết định 121-CP và cả nước sau năm 1975). Trước ngày 08/08/1967 tại miền Bắc, và trong giai đoạn **01/01/1960 – 13/06/1975 tại miền Nam** (Việt Nam Cộng Hòa dùng múi giờ chính thức UTC+8), lịch in lưu hành tại chỗ tính theo kinh tuyến 120°Đ (UTC+8, trùng quy ước lịch Trung Quốc — ví dụ Tết Mậu Thân 1968 tại Hà Nội là 29/01 nhưng tại Sài Gòn là 30/01). Với hồ sơ sinh ghi theo âm lịch tại miền Nam giai đoạn 1960–1975 hoặc trước 1967, cần xác minh tờ lịch gia đình thực dùng; nhiều trường hợp quy ước `chinese` (UTC+8) mới khớp ngày âm đã ghi.

## Profile tường minh

| Profile | Độ sáng | Tháng nhuận | Tý muộn | Giờ mặt trời | Trạng thái |
|---|---|---|---|---|---|
| `repro-v4` | XD2 | split | next-day | none | repro |
| `thienky-candidate` | XD2 tạm chọn | next-month | current-day | none | candidate |

`repro-v4` đã khớp **trường chính tinh Mệnh** của đủ 8.760 khóa năm 1990. Profile ứng viên lệch 328 khóa trong tháng nhuận; đây là khác quy tắc, không phải lý do sửa ứng viên để ép khớp dataset.

Hai quy tắc ứng viên có nguồn trong Bài 04 Thượng, 00:29:35 và 00:29:59–00:30:41. Chưa profile nào được gắn `confirmed`. Dataset chỉ có chi giờ, nên không xác định được Tý sớm hay muộn; trường `ms` cũng không xác định được bảng sáng. Xem [báo cáo dataset](docs/dataset-validation.md).

`--profile-file profile.json` nhận đầy đủ các field `id`, `brightnessSchool`, `leapMonth`, `lateZi`, `solarTime`, `status`; không dùng đồng thời với `--profile`. `solarTime` hỗ trợ `none`, `longitude`, `longitude+eot` và hai chế độ sau cần `place`. Chế độ `none` giữ giờ đồng hồ đã nhập; IANA được dùng để kiểm tính tồn tại/duy nhất và ghi offset. Hiệu chỉnh kinh độ/EOT dùng offset IANA tại thời điểm sinh, bao gồm dịch chuyển DST/lịch sử, tránh trừ hai lần.

Timezone là dữ kiện người nhập chọn, code không suy múi giờ từ tọa độ. `Asia/Ho_Chi_Minh` theo lịch sử Sài Gòn trong tzdb, không đại diện mọi miền Việt Nam trong quá khứ. Với hồ sơ lịch sử thuộc quy ước khác, cần xác nhận timezone tương ứng; có thể dùng IANA dạng `Etc/GMT-7` khi đã xác nhận offset cố định +07:00. Dấu trong tên `Etc/GMT` theo quy ước IANA nên đảo với dấu offset thông thường.

## Kết quả và trạng thái cần làm rõ

`computeNatal(chartReady, profile)` trả bản mệnh, hash chuẩn hóa, profile, provenance, nhãn Việt, facts và quan hệ cung. Bản mệnh loại ba trường phụ thuộc ngày chạy; mảng cung sắp theo địa chi 0–11. Hash bao gồm toàn bộ giá trị profile, snapshot vendor, fingerprint dependency runtime trong lockfile và dữ kiện bản mệnh. Nhãn/facts không tham gia hash bản mệnh, được nhận diện bằng phiên bản schema/glossary riêng.

Facts có ID ngữ nghĩa như `STAR.TIANLIANG@PALACE.MING` và `SIHUA.KE.TIANLIANG@PALACE.MING`, loại nhận định, subject/predicate/object và JSON Pointer về dữ kiện gốc. Có đối cung, tam hợp, tam phương tứ chính, tứ hóa **bản mệnh**, khoảng tuổi đại hạn và sao mượn. Sao mượn được ghi thành quan hệ mượn, không biến thành sao tọa thủ thật. Tên chưa có trong glossary giữ nguyên và đánh dấu unknown.

Các field phụ `lunarInfo.fourPillars`/`fourPillarsLunar` giữ theo upstream: chúng dùng điểm giữa thời thần, không tính Tứ Trụ chính xác đến phút ở ranh tiết khí. Không dùng chúng làm đầu ra Bát Tự đã được xác nhận.

`normalizeBirth(birth, profile)` trả `ok` hoặc `needs`, kèm audit. Các lý do hiện có:

- `NEEDS_BIRTH_TIME`, `NEEDS_BIRTH_PLACE`.
- `HOUR_BOUNDARY`: gần ranh giờ/ngày hoặc hiệu chỉnh làm đổi lá số; trả các kịch bản ChartReady khác nhau.
- `CALENDAR_CONFIRMATION`, `CALENDAR_DIVERGENCE`.
- `AMBIGUOUS_LOCAL_TIME`, `NONEXISTENT_LOCAL_TIME`: đồng hồ trùng/không tồn tại do đổi giờ.

Mọi cảnh báo (`warnings`) được trả về dưới dạng mã chuẩn hóa (như `CALENDAR_DIVERGENCE_CHOICE_REQUIRED`, `CALENDAR_DIVERGENCE_CHINESE_EXPLICIT`, `CALENDAR_DIVERGENCE_VIETNAMESE_ADAPTER`, `SCENARIO_BLOCKED_DIVERGENCE:<date>`, `SHIFTED_DATE_DIVERGENCE`, `VIETNAMESE_CALENDAR_MODEL`) để lớp giao diện/API dịch thuật nhất quán. Khi kịch bản ranh giờ bị chặn do quy ước lịch khác nhau, bước `blocked-scenarios` sẽ được ghi nhận vào chuỗi `audit` để giữ toàn vẹn dấu vết kiểm chứng.

Mặc định khoảng gần ranh là 2 phút, có thể đặt `--boundary-minutes 0` để tắt tường minh. CLI trả exit **0** khi thành công, **2** khi cần làm rõ, **1** khi lỗi. Batch xuất một envelope mỗi dòng, giữ số dòng nguồn, tiếp tục sau dòng sai; exit 1 ưu tiên hơn 2. Output không được trùng input.

## Dùng từ TypeScript hoặc Python

```ts
import { computeNatal, getProfile, normalizeBirth } from '@tuvi/core';
const result = computeNatal(
  { year: 1990, month: 1, day: 1, hourBranch: 6, gender: 'male' },
  getProfile('repro-v4'),
);
```

Python có thể gọi CLI bằng `subprocess.run([...], capture_output=True, text=True, encoding="utf-8")` rồi đọc JSON/JSONL. Kiểm tra `returncode`, gồm mã 2, trước khi lấy dữ liệu huấn luyện. Không dùng shell ghép chuỗi ngày giờ vào lệnh.

## Đối chiếu dữ liệu local và hai mô hình lịch

Đã chép riêng file năm 1990 khoảng 2 MB từ `D:\Tử vi\ziwei-interp-v4-all`, kèm manifest/checksum/giấy phép. `.zst` bị loại khỏi Git để không đưa corpus vào commit; script đọc streaming, không giải nén toàn văn ra đĩa.

```powershell
node dist/scripts/compare-v4.js --input data/year-1990.jsonl.zst --year 1990 --profiles repro-v4,thienky-candidate --output reports/v4-1990.json
node dist/scripts/calendar-diff.js --from 1950 --to 2026 --output reports/calendar-diff-1950-2026.json
```

Kết quả đã lưu ở `reports/`. Mô hình Việt UTC+7 có kiểm tra vài mốc độc lập và ca nhuận phức tạp 2033; chưa phải tái dựng mọi lịch Việt chính thức qua lịch sử. Xem [bằng chứng và phần chưa kiểm chứng](docs/verification.md).

## Nguồn và việc còn lại

`vendor/ziwei` là 10 file sao chép nguyên trạng từ source zip [Renhuai123/ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu), giữ MIT trong `vendor/LICENSE`; `manifest.json` chứa SHA-256 từng file và snapshot. Zip không cung cấp commit nên `sourceCommit` để null, không đoán commit. Các dependency ghim phiên bản trong lockfile; ba override giữ `lunar-lite`, `lunar-typescript` và Babel runtime cùng phiên bản lockfile nguồn. `verify:vendor` phát hiện thay đổi vendor. `patterns.ts` chỉ lưu nguồn, chưa import vào runtime, nên marker `server-only` của nó không được thực thi.

Mã đang được theo dõi trong Git của workspace. Adapter lịch Việt (`vietnamese-adapter.ts`) đã phủ toàn bộ giai đoạn 1900–2050 cho mô hình thiên văn UTC+7, nhưng chưa có 30–50 lá số vàng được người am hiểu xác nhận độc lập; không gọi các test hồi quy là golden độc lập. Chưa làm định vị cung vận hạn theo năm phân tích (đại hạn hiện tại / lưu niên), detector cách cục trong facts và module Dương Trạch Bát Quái.
