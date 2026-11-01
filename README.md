# 2CE Coffee · Đăng ký và xếp ca theo tuần

2CE giúp nhân viên chọn ca rảnh, gửi đơn, xem lịch cá nhân và xin bổ sung/nghỉ/đổi. Quản lý xem đăng ký, xếp lịch, kiểm tra định biên, duyệt đơn và phát hành theo tuần. Admin quản lý tài khoản, vai trò, trạng thái và liên kết với mã nhân viên. **Giờ được xếp là giờ theo kế hoạch**. Ứng dụng chưa có chấm công hay tính lương.

Bắt đầu với [checklist bàn giao](docs/HANDOVER-TO-STUDENT.md). [Báo cáo kỹ thuật](docs/audit/2CE-FULL-SYSTEM-REVIEW.md) giải thích dòng dữ liệu, quy tắc và bằng chứng local.

## Clone và chạy demo trên máy

Dùng Node.js **24.x**, pnpm **11.25.0** (lockfile v9), với các dependency phát triển. Chạy trong Terminal:

```sh
git clone https://github.com/HoanV2802/MISS3047.git
cd MISS3047
pnpm install --frozen-lockfile
pnpm run demo:offline
```

Mở **http://127.0.0.1:4180**. Terminal hiển thị tài khoản và mật khẩu thử trên máy. Hai tài khoản thường dùng là **0900000003** (NV01 – Bếp) và **0900000002** (Quản lý). Admin demo **0900000001** xem danh sách mẫu; thử ghi sẽ báo rõ thay đổi chưa lưu. Dùng một cửa sổ riêng tư cho vai trò thứ hai để giữ hai phiên đăng nhập độc lập.

1. Vào tuần hiện tại bằng NV01. Chọn chiều thứ Hai, chiều thứ Tư, tối thứ Ba và tối thứ Năm. Đây là bản nháp 20 giờ, 2 tối. Bấm **Gửi Đơn Đăng Ký Ca Làm**.
2. Bỏ một ca. Màn hình hiện thay đổi chưa gửi. Quản lý vẫn xếp theo bản hợp lệ vừa gửi. Chọn thêm ca đủ điều kiện rồi gửi lại để thay thế bản cũ. Sang tuần kế tiếp ở màn hình Quản lý có sẵn mẫu 73 lượt đăng ký đã gửi để thử xếp cho 18 người.
3. Để thử bổ sung, chạy `pnpm run demo:offline --supplements` (hoặc `node scripts/offline-demo.cjs --supplements`) và mở **http://127.0.0.1:4181**. NV01 chọn tối thứ Hai rồi gửi đơn. Có thể rút khi chờ. Quản lý duyệt rồi xếp lại, ô đã duyệt vẫn giữ chỗ. Tải lại cửa sổ nhân viên để thấy thay đổi.

Demo dùng API Node thật với PostgreSQL nhúng PGlite và danh tính thử. Dữ liệu giữ qua tải lại trang trong cùng lần chạy; **dừng tiến trình làm mất dữ liệu demo trong bộ nhớ**. Để thử phiên bản vừa clone, dùng tiến trình mới. Backend Supabase dùng cơ sở dữ liệu bền của dự án được cấu hình.

## Quy tắc của bản bàn giao

- **Bước 1 — đăng ký.** Chọn/bỏ ca chỉ sửa bản nháp. Gửi thành công cần ≥20 giờ và ≥2 ca tối. Snapshot đã gửi vẫn có hiệu lực nếu nhân viên sửa nháp hoặc gửi lại thất bại. Gửi lại thành công cập nhật đúng tuần/người. Ca giữ nguyên giữ mốc ưu tiên cũ. Ca rút khỏi bản đã gửi rồi thêm lại nhận mốc mới.
- **Bước 2 — xếp.** Server giữ trước mọi ca bổ sung đã duyệt, cộng cả giờ và trừ suất tương ứng. Nếu dữ liệu mâu thuẫn với bảo vệ, báo xung đột và giữ lịch đã lưu. Với suất còn lại chỉ xét ca trong bản đã gửi hợp lệ, đúng bộ phận. Theo thứ tự ngày thứ Hai → Chủ nhật, mỗi ngày tối → chiều → sáng. Dưới 20 giờ được ưu tiên, người ít giờ hơn trước. Khi cùng dưới ngưỡng và bằng giờ, hoặc cả hai đã đạt ngưỡng, xét thời điểm gửi thành công **riêng cho ô ca** rồi mã NV tăng dần. Ba khung giờ 09–13h, 13–17h, 17–23h không giao nhau. Không có trần giờ tuần trong chính sách hiện tại.
- **Bước 3 — bổ sung.** Gửi một hoặc nhiều ca còn suất, từng ca chờ Quản lý duyệt. Chỉ khi duyệt thành công và còn quota mới ghi phân công và bảo vệ ca đó. Một suất bổ sung đã duyệt được giữ ngay cả khi người nhận chưa có 20 giờ. Hủy/sửa phân công được bảo vệ đi qua đơn nghỉ/đổi được duyệt và ghi lịch sử.
- **Bước 4 — lịch phát hành.** Nhân viên xem lịch và có thể xin nghỉ/đổi cho ca của mình. Ca muốn đổi sang phải nằm trong bản đã gửi. Người thay cần đúng bộ phận, đủ điều kiện và đã gửi đăng ký cho ca nguồn. Quản lý có thể từ chối. Lịch giữa các tuần độc lập; chạy lại đúng cùng đầu vào cho cùng phân công. Với bộ mẫu hiện tại: 73 đăng ký → 65 phân công, 3 ca còn thiếu.

Quản lý hiện vẫn có thể chuyển bước thủ công và xác nhận phát hành lịch thiếu/rỗng. Chủ dự án quyết định BPMN, timer, các điều kiện công bố và tiêu chí môn học. Nguồn chính là [bộ xếp lịch](server/planning.cjs), [workflow và RBAC](server/workflows.cjs), [duyệt nghỉ/đổi](server/approvals.cjs), [định biên](shared/domain.js). Hàm xếp cũ trong shared/domain.js phục vụ đối chiếu lịch sử; nút xếp lịch, seed và demo hiện gọi server/planning.cjs.

## Kết nối với Supabase riêng của người nhận

1. Tạo project **staging riêng** trong tài khoản của người nhận. Ghi nhận đúng Project URL. Bật Email/Password, tắt Phone/SMS, public signup và anonymous signup trong Dashboard. Số điện thoại trên form là mã đăng nhập: server chuẩn hóa số → tạo email nội bộ bằng HMAC → Supabase Auth kiểm mật khẩu. Không xác minh quyền sở hữu điện thoại. [Thiết lập Auth](docs/STAGING-EMAIL-AUTH.md).
2. Trong clone mới tạo cấu hình riêng bằng `cp .env.example .env` rồi `chmod 600 .env`. Đặt `APP_ORIGIN=http://localhost:4173`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` và `SESSION_ENCRYPTION_KEY`. Với demo email đặt `TWOCE_ENV=staging`, `TWOCE_AUTH_MODE=staging-email`, `TWOCE_STAGING_SUPABASE_URL` bằng đúng URL project và `AUTH_MAPPING_KEY`. Hai khóa ứng dụng là hai giá trị ngẫu nhiên độc lập 32 byte dạng Base64 cho project mới. Sao lưu bằng kênh riêng. Để trống biến TEST và cờ live. Chạy `node --env-file=.env scripts/staging-preflight.cjs`.
3. **Chỉ sau phê duyệt của chủ project**, đối chiếu lịch sử migration và áp đúng một lần các bản còn thiếu theo thứ tự dưới đây. API và RPC phải cùng phiên bản. Tạm dừng ghi khi nâng cấp. Đọc [runbook](docs/SUPABASE-STAGING.md) trước thao tác trên dự án có dữ liệu.

   1. `supabase/migrations/202610310001_backend.sql`
   2. `supabase/migrations/202610310002_employees.sql`
   3. `supabase/migrations/202611010001_supplement_requests.sql`
   4. `supabase/migrations/202611010002_workspace_actor_binding.sql`
   5. `supabase/migrations/202611010003_submitted_plans.sql`

4. Kiểm tra bằng `scripts/check-supabase.sql` (chỉ đọc). Với project mới, tài khoản đăng nhập chưa tồn tại dù có 18 dòng nhân sự. **Chỉ khi được phê duyệt cấp tài khoản riêng**, operator dùng Admin API qua `scripts/provision.cjs`, manifest `scripts/accounts.staging.json` và đường dẫn file credentials mới trong thư mục riêng ngoài repo. Xem [quy trình cấp tài khoản và đối soát](docs/STAGING-EMAIL-AUTH.md). Bỏ tùy chọn seed tuần nếu chỉ được phép tạo tài khoản. Không gửi key, file mật khẩu hoặc .env qua Git.
5. Chạy `pnpm run dev`, mở **http://localhost:4173** đúng origin đã cấu hình và dùng tài khoản staging được operator cấp. Nếu chạy demo chung chỉ cần URL và tài khoản đã cấp; không bootstrap lại. Nếu cấp tài khoản bị ngắt, giữ file riêng, đối chiếu UUID/profile và audit trước khi chạy lại.

## Kiểm thử và triển khai sau bàn giao

```sh
pnpm test
pnpm run test:audit
pnpm run test:ui
pnpm run build
```

Bộ trình duyệt dùng Chrome cục bộ. Trên máy khác macOS đặt `CHROME_PATH` tới Chrome/Chromium đã cài. Những test có chữ live là bộ riêng có cờ ủy quyền; kết quả local không thay cho hosted Auth/RLS.

Để triển khai sau khi được phép: import repo vào Vercel, dùng Node 24, cấu hình build `node scripts/build.cjs` và output `public` theo `vercel.json`. Chỉ cấp secret ở môi trường server. Đặt APP_ORIGIN/Site URL khớp HTTPS và dùng **Preview staging** cho chế độ staging-email (có guard chặn Vercel Production). Xác minh cookie, đăng nhập ba role, quyền truy cập, lưu lịch sau reload và RLS với JWT ít quyền trước khi chia sẻ. Chưa có bằng chứng deployment hoặc kết nối cloud trong lượt bàn giao này.
