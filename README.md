# 2CE — Xếp lịch ca làm việc

Ứng dụng HTML/CSS/JavaScript thuần, Supabase Auth và PostgreSQL. Giao diện Apple × 2CE Coffee và lịch desktop/tablet/mobile được giữ lại. Backend gồm các hàm API chạy trên Vercel; không dùng Express, không có trang đăng ký công khai.

**Bản sửa đã được duyệt và áp dụng:** [eligibility xếp ca ở bước 2](docs/scheduling-fix/README.md). Với 73 đăng ký demo, kết quả hiện là 65 phân công, không còn 0 phân công/18 người bị loại do lỗi xét giờ. UI, quy tắc chuyển bước và migration giữ nguyên. [Báo cáo audit trước đó](docs/audit/READINESS.md) được giữ làm lịch sử.

**Trạng thái:** mã backend, migration và kiểm thử cục bộ đã triển khai. Chưa kết nối hay triển khai dự án Supabase/Vercel thật. Bạn phải cung cấp cấu hình, chạy migration và tạo tài khoản trước khi đăng nhập. Không có mật khẩu mặc định và không có chế độ giả lập được bật trong ứng dụng thật.

## Kiến trúc

```text
Trình duyệt — cookie phiên HttpOnly, SameSite=Strict, Secure trên HTTPS
    ↓ API cùng origin
Vercel /api/auth · /api/workspace · /api/action · /api/admin
    ↓ xác minh Supabase Auth + đọc vai trò đang hiệu lực trong profiles
    ↓ áp dụng quy tắc dùng chung tại shared/domain.js, kiểm tra chủ sở hữu
Supabase PostgreSQL — RLS, khóa tuần, phiên bản, giao dịch, lịch sử duyệt
```

- Token Supabase được mã hóa AES-256-GCM trong `web_sessions`, không gửi cho JavaScript hoặc lưu trong localStorage.
- Trình duyệt chỉ giữ một mã phiên ngẫu nhiên. Cơ sở dữ liệu chỉ lưu SHA-256 của mã này.
- API đọc quyền từ cơ sở dữ liệu cho mỗi yêu cầu; thông tin vai trò gửi từ trình duyệt không có giá trị cấp quyền.
- Chỉ API đáng tin cậy giữ secret key. Không tắt RLS; client không được ghi trực tiếp vào bảng hoặc gọi RPC ghi đặc quyền.
- Mỗi thao tác thay đổi lịch có phiên bản tuần và UUID chống lặp. Lịch, phân công, đơn và nhật ký được lưu trong cùng một giao dịch.
- Mỗi tuần có dữ liệu độc lập. Việc đổi tuần không còn hiển thị cùng một bộ dữ liệu dưới nhãn ngày khác.

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BUSINESS-RULES.md](docs/BUSINESS-RULES.md), [docs/SECURITY.md](docs/SECURITY.md).

## Vai trò

| Chức năng | Admin | Manager | Employee |
| --- | --- | --- | --- |
| Xem và quản lý tài khoản, gán vai trò, khóa tài khoản | Có | Không | Không |
| Tự đổi vai trò hoặc tự khóa chính mình | Không | Không | Không |
| Xem toàn bộ dữ liệu phục vụ xếp lịch | Không | Có | Không |
| Xem lịch cá nhân, tình trạng đủ/thiếu của ca | Không | Có | Có, không lộ hồ sơ người khác |
| Đăng ký/hủy ca, gửi đăng ký | Không | Không | Chỉ chính mình, đúng giai đoạn |
| Xếp ca, đổi bước, phát hành lịch | Không | Có | Không |
| Gửi đơn đổi/nghỉ | Không | Không | Chỉ ca của mình đã phát hành |
| Duyệt/từ chối đơn | Không | Có | Không |
| Quyền đọc nhật ký ở database (chưa có màn hình audit riêng) | Có qua RLS | Có qua RLS | Không |

Admin là vai trò quản trị quyền truy cập mới được thêm theo yêu cầu; không phải cấp quản lý ca thứ hai. Không phát minh quy trình nghiệp vụ mới cho vai trò này.

## Cài đặt từ bản clone

Cần Node.js 24.x, pnpm hoặc npm, và một dự án Supabase riêng cho demo. Repo không chứa tài khoản có thể đăng nhập sẵn.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Nếu chỉ có npm, dùng `npm install` (lockfile chuẩn của repo là `pnpm-lock.yaml`). Runtime của website không có thư viện bên ngoài; hai thư viện dev dùng cho kiểm thử PostgreSQL và trình duyệt.

### Chọn một trong hai cách dùng demo

- **Demo chung đã được triển khai:** xin URL ứng dụng và tài khoản đã cấp qua kênh riêng. Dùng URL đó không cần tạo dự án hay chạy migration/provisioning lần nữa. Chưa có URL demo thật nào được cung cấp trong repository này.
- **Clone chạy backend cục bộ với dự án demo chung:** chỉ người được tin cậy vận hành backend mới nhận cấu hình server qua kênh bảo mật. Giữ nguyên database chung, không bootstrap/seed lại. Tạo khóa session riêng cho backend cục bộ, đặt đúng APP_ORIGIN. Nếu chỉ có quyền dùng ứng dụng, dùng URL demo đã triển khai thay vì xin secret key.
- **Tạo môi trường demo riêng hoàn toàn:** làm tuần tự các bước bên dưới: tạo project trống, cấu hình Auth, chạy 001 → 002, xác minh SQL, provisioning rồi chạy app. Clone code không tự tạo tài khoản Supabase.

### 1. Chuẩn bị Supabase

Trong dự án demo:

1. Bật đăng nhập bằng số điện thoại và mật khẩu trong Supabase Auth.
2. **Tắt cho phép người dùng tự đăng ký** trong cấu hình Auth. Chỉ bỏ trang signup ở frontend là chưa đủ để khóa endpoint signup của Supabase.
3. Giữ yêu cầu xác minh số điện thoại. Công cụ tạo tài khoản tin cậy dùng `phone_confirm: true` cho các số demo do người vận hành kiểm soát. Ứng dụng không sử dụng SMS OTP.
4. Chạy lần lượt hai file trong SQL Editor của một dự án trống, hoặc dùng Supabase CLI migration workflow:
   - `supabase/migrations/202610310001_backend.sql`
   - `supabase/migrations/202610310002_employees.sql`
5. Lấy Project URL, publishable key và **secret key dành riêng backend**. Legacy `anon`/`service_role` JWT cũng được hỗ trợ.

Migration không xóa dữ liệu. Nó cố ý dừng nếu bảng cùng tên đã tồn tại; không áp dụng vào một dự án khác đang có dữ liệu mà chưa xem xét.

### 2. Cấu hình môi trường

| Biến | Mục đích |
| --- | --- |
| `APP_ORIGIN` | Origin chính xác, ví dụ `http://localhost:4173` hoặc URL HTTPS của bản triển khai; không có dấu `/` cuối |
| `SUPABASE_URL` | URL dự án Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key; hoặc legacy anon JWT |
| `SUPABASE_SECRET_KEY` | Secret key chỉ phía server; hoặc dùng `SUPABASE_SERVICE_ROLE_KEY` cho legacy service_role JWT |
| `SESSION_ENCRYPTION_KEY` | Khóa 32 byte ngẫu nhiên, định dạng base64, dùng để mã hóa token |
| `PORT` | Cổng phát triển cục bộ; mặc định 4173 |

Tạo khóa riêng trên máy tin cậy rồi lưu vào `.env`/Vercel Secrets, không đưa vào Git hoặc chat:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

`.env` đã bị Git bỏ qua. Xoay khóa mã hóa sẽ làm phiên cũ không thể đọc được và buộc đăng nhập lại; không làm mất lịch làm việc.

### 3. Tạo tài khoản demo

Không giả định dự án Supabase mới đã có tài khoản. Xem [docs/OPERATIONS.md](docs/OPERATIONS.md) để tạo manifest 20 số điện thoại do bạn kiểm soát: một Admin, một Manager, NV01–NV18.

```sh
node --env-file=.env scripts/provision.cjs \
  --manifest /duong-dan-rieng/accounts.json \
  --credentials-out /duong-dan-rieng/new-credentials.json \
  --bootstrap --seed-week 2026-10-26
```

Công cụ tự sinh mật khẩu mạnh riêng cho tài khoản mới, chỉ ghi vào file quyền `0600` **ngoài repo**; không in mật khẩu ra console. Chuyển thông tin đăng nhập cho giảng viên qua trình quản lý mật khẩu hoặc kênh riêng có mã hóa. Người clone frontend cần kết nối cùng backend đã cấu hình, hoặc tự cấu hình và cấp tài khoản trong dự án demo của mình.

### 4. Chạy cục bộ

```sh
pnpm dev
```

Mở đúng origin đã đặt trong `.env`. Nếu cổng 4173 đang được một preview cũ sử dụng, dừng preview đó hoặc đổi **cả** `PORT` và `APP_ORIGIN`. `python -m http.server` hoặc mở file HTML trực tiếp không thể thay thế API backend.

## Kiểm thử

```sh
pnpm test
pnpm test:ui
pnpm test:audit
pnpm test:scheduling
pnpm test:live
pnpm build
```

- `pnpm test`: unit tests và integration tests PostgreSQL cục bộ bằng PGlite. Kiểm tra RLS/grants/transaction là SQL thật; Auth/network là fixture khi cần.
- `pnpm test:ui`: ứng dụng + API + PostgreSQL cục bộ trong Chrome. **Identity provider được thay bằng adapter kiểm thử**, không tuyên bố Supabase Auth thật đã chạy. `CHROME_PATH` có thể trỏ đến Chrome khác với vị trí mặc định trên macOS.
- `pnpm test:audit`: kiểm thử bổ sung về phiên đồng thời, provisioning, migration/RPC, tuần độc lập và các ràng buộc của thuật toán đã sửa. Bản lỗi cũ chỉ được dựng trong bộ nhớ để so sánh.
- `pnpm test:scheduling`: regression trực tiếp trên main đã sửa, gồm 73 → 65 phân công ở bước 2, tính xác định và guard của workflow.
- `pnpm test:live`: kiểm thử Supabase/Auth/API thật, chỉ chạy khi được cho phép rõ ràng và URL dự án khớp. Mặc định bỏ qua. Bài ghi tùy chọn chỉ tạo một tuần chưa tồn tại khi có cờ cho phép riêng; không reset/xóa dữ liệu. Xem hướng dẫn đầy đủ tại `docs/audit/SUPABASE-SETUP.md`.
- `pnpm build`: chỉ sao chép bốn tài nguyên frontend vào `public/`; server, SQL, bản dữ liệu demo và file cấu hình không được public.

Kết quả sau khi áp dụng bản sửa: [docs/scheduling-fix/README.md](docs/scheduling-fix/README.md). Kết quả audit trước bản sửa: [docs/audit/RESULTS.md](docs/audit/RESULTS.md). Kết quả trước audit: [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md). Kiểm thử UI cũ trước backend được lưu tại `tests/legacy/`, không dùng làm kết quả cho bản mới.

## Triển khai Vercel

1. Đẩy mã lên repo do bạn quản lý. Thư mục làm việc hiện tại chưa là Git repository; lần triển khai này không tự tạo commit hay remote.
2. Import vào Vercel. `vercel.json` cấu hình API Node, lệnh build và thư mục public.
3. Thiết lập biến môi trường phía server, gồm `APP_ORIGIN` đúng URL HTTPS. Không thêm tiền tố `PUBLIC_`/`NEXT_PUBLIC_` vào các secret.
4. Chạy migration và provisioning trong môi trường tin cậy trước khi kiểm tra đăng nhập.
5. Cấu hình Site URL/Auth trong Supabase theo URL của ứng dụng. Preview Vercel cần origin và cấu hình riêng cho môi trường preview; không dùng wildcard CORS.
6. Kiểm tra login, refresh, logout, quyền của ba vai trò, đăng ký và duyệt đơn bằng tài khoản demo riêng. Dùng checklist trong `docs/audit/SUPABASE-SETUP.md`; mọi lần chạy live cần cờ cho phép và URL dự án mong đợi.

Chưa thực hiện deployment, migration trên cloud hoặc tạo tài khoản thật. Việc triển khai production và mọi thao tác khôi phục dữ liệu thật cần được phê duyệt riêng.

## Hạn chế quan trọng

- Lỗi eligibility ở bước 2 đã được sửa đúng một điều kiện. Thuật toán tham lam vẫn có thể phân công dưới 20h/2 ca tối cho một số nhân viên; quota, ưu tiên và các ràng buộc gốc không được tối ưu lại. Việc nhảy bước/phát hành lịch trống vẫn giữ nguyên để review BPMN riêng. Xem `docs/BUSINESS-RULES.md`.
- Giao diện chỉ tính và hiển thị dữ liệu; thay đổi `appState` trên console không ghi được vào server.
- Chưa có tài khoản demo thật cho đến khi người vận hành chạy provisioning. Không gửi secret hoặc mật khẩu vào repo.
- Chưa xác nhận hoạt động trên Supabase/Vercel thật, Safari thiết bị thật hoặc bàn phím iOS. UI đã được kiểm tra bằng các kích thước màn hình trong Chrome.
- Danh tính Supabase Auth và profile ứng dụng thuộc hai dịch vụ; nếu tạo Auth thành công nhưng tạo profile thất bại, tài khoản đó không có quyền ứng dụng. Quy trình phục hồi được ghi trong Operations, không âm thầm xóa hay reset tài khoản.
