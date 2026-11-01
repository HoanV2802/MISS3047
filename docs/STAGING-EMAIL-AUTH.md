# 2CE demo: phone identifier → Supabase Email/Password

> Quy tắc và thứ tự migration hiện hành: [báo cáo bàn giao](audit/2CE-FULL-SYSTEM-REVIEW.md) và [checklist](HANDOVER-TO-STUDENT.md). Mô tả trước bản submitted_plans bên dưới được giữ để đối chiếu lịch sử.


Đây là chiến lược **chỉ dành cho staging**, cho tài khoản demo được cấp sẵn. Người dùng vẫn nhập số điện thoại và mật khẩu ở form tiếng Việt hiện tại. **Không xác minh quyền sở hữu số điện thoại.** Không SMS, OTP, email delivery, public signup hoặc khôi phục mật khẩu tự phục vụ.

## Dashboard Supabase — không cần Twilio

1. Chọn project staging riêng được chủ dự án xác nhận. Giữ Data API/public schema và các migration/RLS hiện có.
2. Trong Authentication → Sign In / Providers (tên menu có thể thay đổi), **bật Email provider/password sign-in** và **tắt Phone provider**. Không nhập Twilio/SMS credentials, không bật Phone MFA.
3. Tắt **Allow new users to sign up** và Anonymous sign-ins. Backend không có signup endpoint, nhưng Dashboard vẫn phải khóa signup của Supabase.
4. Có thể giữ Confirm email bật: provisioning dùng trusted Admin API với `email_confirm:true`, không gửi confirmation email. Không dùng inviteUserByEmail, OTP, magic link hay resetPasswordForEmail cho các identity demo.
5. Không cần cấu hình SMTP cho luồng tạo user đã xác nhận và password login này. Nếu có email security-notification hooks/settings, tắt việc gửi cho project demo này; không trông chờ email tới tên miền nội bộ.
6. Site URL/APP_ORIGIN đặt đúng staging origin; local dùng localhost đúng cổng. Không nới CORS/CSRF hay dùng wildcard để né lỗi.

Cơ sở: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords) và [Admin createUser/email_confirm](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Việc Dashboard/key/project thật chấp nhận cấu hình này vẫn cần kiểm thử sau ủy quyền; chưa có cloud connection trong nhiệm vụ này.

## Mapping và ranh giới tin cậy

`server/demo-auth.cjs` chuẩn hóa số bằng cùng hàm E.164 của backend, sau đó tính:

```text
HMAC-SHA256(AUTH_MAPPING_KEY, normalizedPhone).hex + @2ce-staging.invalid
```

Tên miền `.invalid` dành cho tên không hợp lệ/không vận hành theo [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606). Không giả danh địa chỉ email thật và không phụ thuộc DNS/MX hay delivery. Local part là 64 ký tự hex; không chứa số điện thoại. Mapping là hàm xác định phía server, không cần bảng/column mới chứa email.

`profiles.phone` UNIQUE và `profiles.id` FK → `auth.users.id` vẫn là mapping ownership có lưu trữ. Auth email là duy nhất trong Supabase. Sau khi Supabase kiểm tra password thành công, backend kiểm tra profile active, UUID, phone chuẩn hóa, email dự kiến và confirmation. Không khớp thì không tạo session.

Backend không đọc/so sánh plaintext password lưu riêng. Password chỉ đi tới `/auth/v1/token?grant_type=password` dưới trường `email,password`; provisioning tới Admin API. HMAC key không phải password hashing key và không thay thế Supabase xác thực.

Email nội bộ/token/key không trả trong login, `/api/auth`, `/api/admin` hoặc workspace. Profile schema không thêm email. JWT/email chỉ nằm trong session ciphertext server; browser nhận opaque HttpOnly cookie. Người vận hành Supabase đáng tin cậy có thể thấy Auth identities trong Dashboard; đó không phải frontend của 2CE.

Rate limit IP và phone chuẩn hóa chạy trước Auth cho cả số có/không có tài khoản. Unknown phone, sai password, Auth banned, profile thiếu/khóa, mapping sai và identity chưa xác nhận trả cùng HTTP401/code/message: “Số điện thoại hoặc mật khẩu không hợp lệ.” Không thêm endpoint kiểm tra số tồn tại. Lỗi cú pháp số vẫn là validation400; quá giới hạn là429; sự cố dịch vụ là503. Không cam kết constant-time đối với network/Auth, nhưng không cung cấp nhánh tra cứu tồn tại qua nội dung/status lỗi đăng nhập.

## Cấu hình server chỉ cho staging

Giữ URL/key/session/origin trong `.env` quyền0600 hoặc secret settings. Thêm:

```dotenv
TWOCE_AUTH_MODE=staging-email
TWOCE_ENV=staging
TWOCE_STAGING_SUPABASE_URL=https://YOUR_STAGING_PROJECT.supabase.co
AUTH_MAPPING_KEY=
```

`TWOCE_STAGING_SUPABASE_URL` phải trùng project origin thực của SUPABASE_URL. `AUTH_MAPPING_KEY` là 32 byte ngẫu nhiên/base64 chuẩn, **riêng với SESSION_ENCRYPTION_KEY**. Cấu hình sai/mode lạ/không staging sẽ fail closed với503. `VERCEL_ENV=production` bị cấm cho mode này; khi triển khai staging dùng Preview deployment với origin ổn định, không cố deploy production để chạy demo. Không có cờ env là chế độ phone legacy để tránh đổi phương thức xác thực của môi trường cũ ngoài phạm vi.

Từ `.env.example` mới, thêm mode/project bằng editor riêng; tạo khóa mapping cho project mới, không in ra stdout:

```sh
node -e "const fs=require('node:fs'); fs.chmodSync('.env',0o600); let s=fs.readFileSync('.env','utf8'); if(!/^AUTH_MAPPING_KEY=/m.test(s)) throw Error('Add AUTH_MAPPING_KEY first'); s=s.replace(/^AUTH_MAPPING_KEY=.*$/m,'AUTH_MAPPING_KEY='+require('node:crypto').randomBytes(32).toString('base64')); fs.writeFileSync('.env',s,{mode:0o600});"
node --env-file=.env scripts/staging-preflight.cjs
```

Lệnh tạo key chỉ dùng **trước provisioning lần đầu**. Backup key trong password manager; các backend dùng cùng project phải nhận cùng AUTH_MAPPING_KEY. Không tự đổi key: mapping email sẽ đổi và user đã provision không đăng nhập được. Session key có thể xoay riêng, không làm thay đổi mapping. Nếu mất key, phục hồi backup; thay key/migrate identities cần kế hoạch riêng được duyệt, giữ UUID và relations.

## Provision 20 demo accounts — sau ủy quyền riêng

Giữ migrations001/002 hiện tại; không có migration mới cho phương thức này. Bộ `scripts/accounts.staging.json` dùng số giả Admin, Manager, NV01–NV18. Password được sinh ngẫu nhiên riêng từng account, chỉ lưu file0600 ngoài repo như trước.

```sh
mkdir -p "$HOME/.2ce-staging"
chmod 700 "$HOME/.2ce-staging"
cp scripts/accounts.staging.json "$HOME/.2ce-staging/accounts.json"
node --env-file=.env scripts/provision.cjs \
  --manifest "$HOME/.2ce-staging/accounts.json" \
  --credentials-out "$HOME/.2ce-staging/credentials-email-initial.json" \
  --bootstrap --seed-week 2030-01-07
```

Trong mode staging-email, payload Auth là `{email,password,email_confirm:true}`; không có `phone`/`phone_confirm`. Profile vẫn lưu phone identifier, UUID Auth, role và employeeId. File credentials vẫn chỉ có phone/password/role/employeeId, không có email mapping. Admin UI tạo account cũng sử dụng mode tương tự, không cần thay form.

Chạy lại kiểm tra UUID/email/confirmation/profile trước khi bỏ qua user có sẵn. Key khác, email/UUID sai, Auth orphan hoặc identity Phone legacy trùng số đều dừng; không reset password, xóa user hoặc thay UUID tự động. Auth và profile vẫn không là distributed transaction: khi tạo Auth xong nhưng profile thất bại, dùng file credential riêng để phục hồi mapping dưới quyền operator, không tạo lại mù quáng.

Sau ủy quyền đọc project, cấu hình các live gates hiện có và chạy:

```sh
node --env-file=.env scripts/check-staging-accounts.cjs
```

Verifier chỉ đọc, đối chiếu chính xác HMAC/UUID/phone/confirmation và in count/mode, không in mapping. Yêu cầu `TWOCE_LIVE_AUTHORIZED=dedicated-demo` và `TEST_EXPECTED_SUPABASE_URL` khớp. SQL `check-staging-identities.sql` chỉ kiểm tra UUID/confirmation/email shape cho email mode, không chứng minh HMAC ownership vì khóa mapping không đưa vào database/SQL output.

Không provision hay chạy verifier cloud trong nhiệm vụ này. Các live tests giữ gate; bài Auth trực tiếp đã cập nhật để chọn email/password theo mode. Tên biến TEST_*_PHONE vẫn giữ nguyên vì người dùng nhập phone identifier.

## Recovery do quản trị viên vận hành

Không có public password recovery hoặc email reset. Người được quyền vận hành dùng `profiles.phone → profiles.id` để tìm đúng Auth UUID; xác minh role/employeeId qua kênh cấp tài khoản, không coi biết số điện thoại là chứng minh danh tính.

Sau phê duyệt reset cụ thể: trusted Admin API `updateUserById`/`PUT /auth/v1/admin/users/{uuid}` đặt password ngẫu nhiên mới trực tiếp, không gửi email. Thu hồi các `web_sessions` của user để buộc đăng nhập lại; ghi audit actor Admin, UUID đích và loại thao tác, không ghi password/email/key. Chuyển password qua kênh riêng. Không đổi phone, internal email, mapping key, UUID hoặc cấp role trong thao tác reset. API/Admin UI hiện tại không tự reset password của account có sẵn; operator thực hiện bằng công cụ tin cậy, không có endpoint reset công khai được thêm.

## File và phạm vi thay đổi

- Mới `server/demo-auth.cjs`: staging guard, HMAC email, identity payload.
- Sửa `server/supabase.cjs`: chọn config/mode, normalize phone, email password grant, ownership/confirmation checks, uniform failures; Admin creation dùng email mode.
- Sửa `scripts/provision.cjs`, `scripts/provision-lib.cjs`: tạo/check email identity, không thay profile schema hoặc credential-output policy.
- `.env.example`, `scripts/staging-preflight.cjs`: biến/kiểm tra cấu hình mode mới.
- Mới `scripts/check-staging-accounts.cjs`; sửa SQL kiểm tra identity từ bước chuẩn bị trước để hỗ trợ cả hai mode.
- Mới `tests/backend/demo-auth.test.cjs` và `tests/legacy/auth-transport-baseline.json`; cập nhật scope test để cho phép thay đổi auth/provision được yêu cầu và tiếp tục hash-protect transport/session/rateLimit. Các baseline UI/scheduler/schema vẫn được bảo vệ.
- Cập nhật `tests/backend/live.cjs`, test SQL trong `tests/audit/staging-preflight.test.cjs`, README/Operations/staging docs; tài liệu này mô tả thiết kế và settings mới.
- Các file chuẩn bị staging chưa commit từ nhiệm vụ trước được giữ lại, không coi tất cả untracked files là mới trong nhiệm vụ này.

Không sửa frontend HTML/CSS/app.js, workflow/approval/scheduling, handler CSRF/cookie, RLS, migrations, business thresholds hoặc BPMN. Không deploy/push/provision cloud.

## Kết quả kiểm thử

Chạy `node --test tests/backend/*.test.cjs tests/audit/*.test.cjs`: **90 passed, 0 failed, 0 skipped**. Gồm 10 bài mới về mapping/normalization, staging guard, email password grant qua HTTP handler, cookie/ciphertext, uniform errors, rate limit trước Auth, provisioning 20 identity/retry/ownership/key-change, Admin creation, bảo vệ session transport, gate verifier, client không được chọn email/signup/CSRF. Có kiểm tra phát hiện identity Phone legacy trước tạo tài khoản mới.

Chạy `node tests/backend/browser.cjs`: **19 checks passed, 0 runtime errors**, 27 role/viewport combinations. Tất cả kiểm tra là local với Auth transport giả lập; không phải bằng chứng Supabase cloud đã chấp nhận email `.invalid` hoặc Dashboard đã cấu hình đúng. Browser regression dùng identity adapter local hiện có, còn email-mode/ownership được kiểm tra qua SupabaseBackend + HTTP handler trong regression mới.

Chạy live runner với cờ ủy quyền tắt: **0 passed, 0 failed, 4 skipped/BLOCKED**, không gọi cloud. Không tạo/migrate/reset tài khoản thật. Full local suite trong lượt phát triển lần lượt đạt 88, 89 rồi 90 tests khi thêm coverage; không có assertion thất bại ở những lần chạy này.

Logs local: `tests/backend/artifacts/email-auth-local.txt`, `email-auth-live-blocked.txt`; browser output tại `browser-results.json`. Artifact logs được gitignore; không chứa credentials thật. `git diff` xác nhận UI/scheduling/workflow/approval/migrations/handler/Vercel configuration không thay đổi.
