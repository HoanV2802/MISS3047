# Checklist Supabase thật và Vercel

Chưa có credential/ủy quyền cloud trong lượt audit. Các lệnh dưới đây **chỉ dành cho operator được phép**, trên một dự án demo/staging riêng. Không tự chạy vào môi trường chung hoặc production.

## A. Dùng demo chung đã tồn tại

1. Xin URL ứng dụng đã deploy và tài khoản cấp sẵn qua kênh riêng. Không có URL/credential thật trong repo để tự suy ra.
2. Đăng nhập ở URL đó; không chạy lại migration, bootstrap hay seed trên project chung.
3. Nếu cần clone và chạy backend cục bộ, phải là người được tin cậy giữ secret key. Nhận cấu hình server qua kênh bảo mật, giữ database chung hiện tại, tạo khóa mã hóa session cục bộ và đặt APP_ORIGIN chính xác. Người chỉ cần đánh giá giao diện nên dùng URL demo, không nhận secret key.

## B. Tạo dự án demo mới hoàn toàn

- [ ] Cài Node.js **24.x**, pnpm; chạy `pnpm install --frozen-lockfile`.
- [ ] Tạo dự án Supabase riêng và xác nhận tên/project URL trước mọi thao tác.
- [ ] Bật Phone provider cho đăng nhập mật khẩu.
- [ ] Tắt public signup và anonymous signup trong Auth Dashboard; không tắt xác minh số toàn cục để làm demo.
- [ ] Áp dụng `202610310001_backend.sql` trước, rồi `202610310002_employees.sql`. Không chạy vào project đã có các bảng cùng tên.
- [ ] Chạy read-only `scripts/check-supabase.sql`. Kỳ vọng 12 bảng RLS bật, 4 RPC đặc quyền chỉ service_role EXECUTE, search_path rỗng, 18 nhân viên; client không UPDATE profiles hoặc đọc sessions.
- [ ] Điền `.env` theo `.env.example`: URL, publishable key, server secret key, khóa session base64 32 byte, APP_ORIGIN và PORT. Không gửi chúng vào Git/chat/issue.
- [ ] Sao chép `scripts/accounts.example.json` ra thư mục riêng, thay đủ 20 số do operator kiểm soát. Một Admin, một Manager, đúng NV01–NV18, không gắn employeeId cho Admin/Manager, không thêm password vào manifest.
- [ ] Provision vào project đó, ghi credential file mới ngoài repo trong thư mục riêng quyền `0700`:

```sh
node --env-file=.env scripts/provision.cjs \
  --manifest /duong-dan-rieng/accounts.json \
  --credentials-out /duong-dan-rieng/new-credentials.json \
  --bootstrap --seed-week 2026-10-26
```

- [ ] Xác nhận 20 Auth identities và 20 profiles đúng mapping. Chuyển credential bằng password manager/kênh mã hóa riêng.
- [ ] Chạy `pnpm dev`, mở **đúng APP_ORIGIN**; thử ba vai trò, reload và logout. `localhost` khác `127.0.0.1` đối với origin/cookie.
- [ ] Bản sửa eligibility đã được duyệt và áp dụng sau audit: seed gốc 73 đăng ký ở phase 2 cho 65 phân công. Không cần chuyển phase 1 để né lỗi. Không tự seed lại hoặc sửa tuần đã có dữ liệu; xem `docs/scheduling-fix/README.md`.

### Signup bị khóa và tài khoản admin-created

Admin create-user là endpoint đặc quyền khác signup công khai. Tài liệu hỗ trợ auto-confirm phone; mã nguồn Auth hiện tại thực hiện tạo identity/ConfirmPhone trong giao dịch admin, không gọi gửi SMS ở nhánh này. Vì vậy payload `{phone,password,phone_confirm:true}` phù hợp cho số demo được operator kiểm soát, dù public signup bị khóa. Đây là **xác minh hợp đồng/tài liệu/mã nguồn**, chưa phải kết quả chạy project thật. Vẫn phải bật Phone provider và đáp ứng cấu hình nhà cung cấp yêu cầu.

Nguồn: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [adminUserCreate](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [cấu hình signup](https://supabase.com/docs/guides/auth/general-configuration), [phone/password](https://supabase.com/docs/guides/auth/passwords).

Không dùng `/signup`, OTP hoặc cấu hình SMS auto-confirm toàn cục trong ứng dụng. Kiểm tra Auth logs của staging khi provisioning và đăng nhập để xác nhận không phát sinh nhánh OTP ngoài dự kiến.

### Key mới và legacy

`sb_publishable_*`/`sb_secret_*` đi trong header `apikey`; chỉ user JWT hoặc legacy JWT mới đi trong Authorization Bearer. Bộ transport đã được kiểm thử hợp đồng cho hai kiểu này. Không đưa key vào frontend. Nguồn: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## C. Chạy live checks sau khi có ủy quyền

Điền tài khoản kiểm thử trong `.env` bằng kênh riêng, không in ra terminal logs. Thêm:

```dotenv
TWOCE_LIVE_AUTHORIZED=dedicated-demo
TEST_EXPECTED_SUPABASE_URL=https://DUNG_PROJECT.supabase.co
TEST_API_ORIGIN=https://DUNG_URL_STAGING
```

`TEST_EXPECTED_SUPABASE_URL` phải trùng chính xác SUPABASE_URL. `TEST_API_ORIGIN` phải là HTTPS và bằng APP_ORIGIN. Nếu chưa deploy staging, hai bài direct Auth/RLS vẫn có thể chạy; hai bài API sẽ bị bỏ qua. Quyền thực tế của operator vẫn phải được cấp, không chỉ đặt cờ trong file.

```sh
pnpm test:live
```

Hai bài đầu xác minh Auth/RLS thật. Bài API read/session kiểm tra cookie/session, Admin restrictions, body giả role và logout replay; nó không ghi lịch nhưng Auth login/logout vẫn tạo/thu hồi phiên như bình thường.

Bài persistence/approval có ghi chỉ chạy khi được cho phép thêm:

```dotenv
TWOCE_LIVE_WRITE_AUTHORIZED=new-test-week
TEST_WEEK=2030-01-07
```

Chọn một thứ Hai **chưa có dữ liệu**, không dùng tuần người khác đang làm. Bài này từ chối tuần đã tồn tại, tạo tuần mới, đăng ký/gửi đơn, xếp ca theo luồng kiểm thử hiện có; regression phase 2 của main được kiểm tra riêng cục bộ, phát hành, gửi/duyệt nghỉ, kiểm tra audit/history và reload. Nó không DELETE/reset; giữ nguyên tuần và audit sau bài test. Mỗi lần chạy tiếp cần chọn tuần trống khác. Nếu test dừng giữa chừng, giữ dữ liệu để điều tra; không tự dọn database.

Trước nghiệm thu, còn cần kiểm tra refresh thật qua thời điểm JWT hết hạn, hai tab/instance, role Admin thật, từ chối đơn và đổi ca thật, browser reload trên URL HTTPS, cùng lỗi upstream. Các bài cục bộ không thay được những kiểm tra này.

## D. Vercel

1. Dùng repo do bạn quản lý, runtime 24.x (đã pin trong package.json), build command `node scripts/build.cjs`, output `public`.
2. Root `api/[route].js` là Node serverless entrypoint; includeFiles bao gồm `server/**` và `shared/domain.js`. Tất cả phụ thuộc runtime là module Node có sẵn/CJS local; hai package chỉ dành cho test.
3. Tạo cấu hình Preview và Production riêng. APP_ORIGIN phải khớp domain dùng để truy cập; không thêm wildcard CORS để sửa lỗi origin. Domain HTTPS dùng cookie Secure `__Host-2ce_session`; local HTTP dùng cookie riêng.
4. Preview phải dùng project demo và secret riêng phù hợp; không tự nối production DB vào preview.
5. Xem build output: chỉ index.html, style.css, app.js, shared/domain.js. Build giờ loại file thừa từ output cũ; server/SQL/provisioning/proposals/env không được public.
6. Chạy một preview được ủy quyền rồi smoke test cả bốn API. Audit này **chưa chạy `vercel build` hoặc deployment trên nền tảng**, nên package/routing/function bundle/HTTPS thực tế còn phải xác nhận ở preview.

Nguồn cấu hình: [Vercel config](https://vercel.com/docs/project-configuration/vercel-json), [Node runtime](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Range `>=22` có thể chọn LTS mới hơn phiên bản đã test; pin 24.x để giảm khác biệt.
