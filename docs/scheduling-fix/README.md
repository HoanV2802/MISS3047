# Áp dụng bản sửa eligibility đã được duyệt

**Đã áp dụng vào main theo phê duyệt của người dùng.** Không thay UI, Auth, RLS/migration, dữ liệu đăng ký mẫu, quy tắc chuyển bước hoặc khả năng phát hành lịch trống. Không có kết nối Supabase, deployment Vercel hay thay đổi cloud trong nhiệm vụ này.

## Thay đổi và nguyên nhân

Thay đúng một điều kiện trong `shared/domain.js`, hàm `runSchedulingAlgorithm()`:

```diff
-    if (!stats.isValid) {
+    if (stats.regHours < 20 || stats.regEvening < 2) {
```

Thuật toán xóa assignments trước khi phân bổ lại. Ở bước 2 trở lên, `getEmployeeStats().isValid` lấy số giờ/ca tối từ assignments vừa bị xóa, nên loại mọi người dù đăng ký hợp lệ. Điều kiện mới dùng hai giá trị đăng ký đã được hàm trả sẵn; không đổi getEmployeeStats hoặc chuyển giả trạng thái sang bước 1.

Các phần còn lại của hàm, quota/cấu hình ca, chuyên môn, thứ tự tối → chiều → sáng, ưu tiên ít giờ và tie-break theo thứ tự đăng ký đều giữ nguyên. Hash test hoàn nguyên đúng một điều kiện trong bản sao rồi so với source trước sửa; không cập nhật/ghi đè golden baseline lịch sử để che thay đổi.

Thay đổi runtime còn lại chỉ là sửa thông báo kết quả seed ở `scripts/provision.cjs` cho đúng trạng thái mới. Logic tạo account, transaction và seed không đổi.

## Đối chiếu trước/sau

| Cùng dữ liệu demo | Trước sửa, bước 2 | Sau sửa, bước 2 | Bản cũ, bước 1 |
| --- | ---: | ---: | ---: |
| Số đăng ký | 73 | 73 | 73 |
| Số phân công | 0 | **65** | 65 |
| Nhân viên bị loại | 18 | **0** | 0 |

Danh sách nhân viên trong từng ca sau sửa giống hệt bản cũ chạy từ bước 1. SHA-256 của toàn bộ allocation sau sửa và bản cũ ở bước 1 cùng là:

`1634329a7d8342f0a65de68f7824d6c8370454f0317600bdbecaaa59a556a5db`

Đã chạy thêm 10 clone độc lập ở bước 2: cả 10 cùng hash này. Regression cũng kiểm tra nhiều clone ở các bước 1/2/3 và chạy lại trên state đã có assignments, với kết quả không đổi và không sửa đăng ký.

Kết quả máy đọc: [results.json](results.json).

## Kết quả kiểm thử thực thi

| Nhóm | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Backend unit/integration (gồm regression main mới) | 42 | 0 | 0 |
| Audit/constraints/scope tests | 23 | 0 | 0 |
| Tổng local suite | **65** | **0** | **0** |
| Regression chuyên biệt (`test:scheduling`, đã nằm trong 42 bài trên) | 3 | 0 | 0 |
| Browser E2E cục bộ | **17** | **0** | **0** |

Lệnh đã chạy:

```sh
node --test --test-concurrency=2 tests/backend/*.test.cjs tests/audit/*.test.cjs
node --test tests/backend/scheduling-regression.test.cjs
node tests/backend/browser.cjs
node scripts/build.cjs
```

Các script tương ứng: `pnpm test`, `pnpm test:audit`, `pnpm test:scheduling`, `pnpm test:ui`, `pnpm build`.

Bài browser dùng frontend/API thật và PostgreSQL cục bộ qua PGlite; identity provider là adapter kiểm thử, không phải Supabase thật. Đã thêm luồng với toàn bộ 73 đăng ký tại bước 2: bấm nút xếp ca → nhận 65 phân công/0 disqualified → reload và mở lại tuần đó → vẫn 65. Các bước đăng nhập, đăng ký/hủy/gửi đơn, đổi/nghỉ, duyệt/từ chối, role boundaries, session hết hạn và retry đều qua.

27 tổ hợp Manager/Employee/Admin với chín viewport vẫn qua: 320×568, 375×667, 393×852, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080. Không có lỗi JavaScript trình duyệt. Lịch desktop/tablet/mobile, lựa chọn ngày và thứ tự hai thẻ trên iPad giữ nguyên.

Không chạy live tests, kể cả chỉ để báo skipped, vì người dùng yêu cầu không kết nối cloud. Kết quả cloud vẫn **chưa xác minh**, không được tính là passed.

## Phạm vi được giữ nguyên

`before-hashes.json` ghi lại trước khi áp dụng. Test `approved-fix-scope.test.cjs` xác nhận:

- `app.js`, `index.html`, `style.css` giữ nguyên từng byte.
- `server/workflows.cjs` giữ nguyên từng byte: không đổi bước được phép, guard xếp lại, xác nhận thiếu người hoặc khả năng phát hành lịch trống.
- Auth/session/validation/handler, hai migration, demo JSON và `vercel.json` giữ nguyên.
- Domain chỉ khác điều kiện đã duyệt; script provision chỉ khác dòng message kết quả.

Build public đã được tạo lại bằng script hiện có để chứa domain đã sửa. Không đổi cấu hình hosting hoặc dependency.

## File thay đổi

### Runtime

- `shared/domain.js`: đúng một điều kiện eligibility đã duyệt.
- `scripts/provision.cjs`: message kết quả seed; không đổi quy trình/logic.

### Kiểm thử và công cụ chạy test

- `tests/backend/domain.test.cjs`: thay assertion giữ lỗi cũ bằng 65 phân công; hash guard cho phép đúng điều kiện đã duyệt, giữ kiểm tra toàn bộ phần còn lại.
- `tests/backend/scheduling-regression.test.cjs` **mới**: before/after, tính xác định, API workflow ở bước 2 và guard lịch đã phát hành.
- `tests/backend/browser.cjs`: thêm luồng 73 đăng ký/bước 2 và kiểm tra persistence sau reload.
- `tests/audit/scheduling-proposal.test.cjs`: test main đã sửa, bản cũ được dựng trong VM chỉ để so sánh; giữ constraints, ưu tiên và shortfalls gốc.
- `tests/audit/provision.test.cjs`: seed mới phải có 65 phân công/0 disqualified.
- `tests/audit/approved-fix-scope.test.cjs` **mới**: kiểm tra phạm vi byte-for-byte như trên.
- `proposals/scheduling-registration-hours/load-proposal.cjs`: historical loader, không còn áp bản vá thử nghiệm.
- `proposals/scheduling-registration-hours/eligibility.regression.cjs`: entrypoint tương thích trỏ vào regression main.
- `tests/audit/live-api.cjs`: chỉ cập nhật comment không còn gọi lỗi là chưa được duyệt; không chạy hoặc đổi logic cloud test.
- `package.json`: đổi tên script test:scheduling-red thành test:scheduling, regression đã vào suite chuẩn.

### Tài liệu

- `README.md`, `docs/BUSINESS-RULES.md`, `docs/OPERATIONS.md`: trạng thái sửa và kết quả seed mới.
- `docs/audit/SUPABASE-SETUP.md`: bỏ hướng dẫn chuyển về bước 1 để né lỗi.
- `docs/audit/READINESS.md`, `RESULTS.md`, `FILES.md`: thêm nhãn báo cáo lịch sử, giữ số liệu audit gốc.
- `proposals/scheduling-registration-hours/README.md`: đánh dấu đã được duyệt/áp dụng.
- `docs/scheduling-fix/README.md`, `before-hashes.json`, `results.json` **mới**: báo cáo này và bằng chứng đối chiếu.

Raw test logs/ảnh/build output nằm trong các thư mục đã Git ignore, không phải source thay đổi nghiệp vụ.

## Rủi ro còn lại

- 7 nhân viên NV01, NV03, NV04, NV05, NV06, NV17, NV18 vẫn nhận dưới chỉ tiêu phân công 20h/2 ca tối, giống hệt kết quả thuật toán gốc ở bước 1. Tất cả người được chọn vẫn đạt điều kiện đăng ký. Đây không phải bài tối ưu toàn cục và chưa được sửa thêm.
- `isSubmitted` chưa được thuật toán dùng để lọc ứng viên, và các hạn chế bổ sung/đổi ca đã nêu trong Business Rules giữ nguyên.
- Manager vẫn có thể nhảy bước/phát hành empty schedule với xác nhận; các bài mô tả hành vi này vẫn qua. Chưa giải quyết phần review BPMN theo yêu cầu.
- Tuần đã lưu không tự được tính lại hoặc backfill. Khi cần, Manager chủ động chạy lại ở bước hợp lệ; không sửa dữ liệu cloud trong nhiệm vụ này.
- Không xác minh Supabase thật, Vercel hoặc Safari phần cứng thật.

## Git

`git rev-parse --show-toplevel` và `git status --short` đều trả về “not a git repository”. Vì repository chưa được cấu hình nên không tạo commit, không tự init Git hoặc gắn remote. File patch gốc được giữ làm bằng chứng của thay đổi đã duyệt.
