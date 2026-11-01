# 2CE — chuẩn bị Supabase staging

**Cập nhật:** staging không có SMS dùng `docs/STAGING-EMAIL-AUTH.md`. Bật Email/Password, tắt Phone; cấu hình mode staging-email, project guard và AUTH_MAPPING_KEY trước provisioning. Các mô tả phone provider/phone_confirm bên dưới chỉ áp dụng chế độ phone legacy. Với email mode, SQL kiểm tra UUID/confirmation/format; chạy thêm `scripts/check-staging-accounts.cjs` để đối chiếu HMAC đầy đủ sau khi cấp quyền live. Không cần Twilio. Kết quả 80 tests/4 skipped bên dưới là lịch sử chuẩn bị, xem báo cáo mới cho kết quả hiện tại.

Ngày kiểm tra: 31/10/2026. Trạng thái: hoàn tất chuẩn bị offline; **chưa kết nối project thật, chưa tạo tài khoản, chưa chạy migration cloud và chưa deploy**. Workspace không có `.env`; các biến URL/key/session/origin cũng không có trong process. Không có connector Supabase/Vercel trong phiên này. Các file chuẩn bị mới hiện ở local, cần đưa vào revision chia sẻ trước khi phát hướng dẫn có các công cụ mới cho giảng viên.

## 1. Audit cấu hình và tương thích

| Biến | Yêu cầu |
| --- | --- |
| `SUPABASE_URL` | Project URL HTTPS thực; lấy trong Dashboard, không dùng URL PostgreSQL |
| `SUPABASE_PUBLISHABLE_KEY` | Key publishable hoặc legacy anon của đúng project |
| `SUPABASE_SECRET_KEY` | Secret key backend; nếu không dùng key mới thì đặt `SUPABASE_SERVICE_ROLE_KEY` |
| `SESSION_ENCRYPTION_KEY` | 32 byte ngẫu nhiên, base64 chuẩn; giữ ổn định trong cùng deployment; xoay key làm mất hiệu lực phiên cũ |
| `APP_ORIGIN` | Origin chính xác không slash cuối: local `http://localhost:4173`, staging HTTPS dùng URL ổn định |
| `PORT` | Local mặc định 4173; đổi cùng APP_ORIGIN; Vercel không cần chạy dev server |
| `TEST_MANAGER_PHONE/PASSWORD`, `TEST_EMPLOYEE_PHONE/PASSWORD` | Tài khoản đã tạo trên staging; chỉ đặt trong môi trường operator khi chạy test |
| `TWOCE_LIVE_AUTHORIZED` | Chỉ đặt `dedicated-demo` sau khi được phép kiểm thử đúng project |
| `TEST_EXPECTED_SUPABASE_URL` | Phải khớp SUPABASE_URL tuyệt đối |
| `TEST_API_ORIGIN` | Phải khớp APP_ORIGIN và là HTTPS cho suite live API hiện có |
| `TWOCE_LIVE_WRITE_AUTHORIZED`, `TEST_WEEK` | Chỉ đặt `new-test-week` và thứ Hai chưa tồn tại sau khi được phép ghi dữ liệu kiểm thử |

`SUPABASE_SECRET_KEY` được ưu tiên nếu cả hai biến secret/legacy cùng tồn tại; chỉ cấu hình một loại để tránh nhầm key. Không có biến database password trong ứng dụng. Mật khẩu database dùng riêng cho SQL Editor/CLI của operator, không đưa vào `.env` app nếu không cần.

Transport hiện tại gửi key mới trong `apikey`, user JWT trong Bearer; legacy JWT key được hỗ trợ. Điều này phù hợp tài liệu [API keys](https://supabase.com/docs/guides/getting-started/api-keys). Không gửi secret mới dưới dạng Bearer JWT. Không cần bổ sung Supabase SDK để sử dụng REST/Auth hiện tại.

Auth dùng `/auth/v1/token?grant_type=password`, xác minh `/auth/v1/user`, refresh token khi cần và Admin API tạo người dùng. Supabase có [phone/password](https://supabase.com/docs/guides/auth/passwords) và [admin createUser với phone_confirm](https://supabase.com/docs/reference/javascript/auth-admin-createuser). Đây là đối chiếu hợp đồng tài liệu, chưa xác nhận setting/key của một project cụ thể.

Vercel có [Node 24.x](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Repo đã pin `engines.node=24.x`, có `api/[route].js` CommonJS và includeFiles `server/**,shared/domain.js`; helper approvals mới nằm trong bundle dự kiến. Build chỉ tạo bốn tài nguyên frontend. Đây là kiểm tra source/build local; chưa xác minh routing/bundle trong deployment thật.

## 2. Security review

- 12 bảng app có RLS; anon không có quyền đọc dữ liệu app. Authenticated chỉ SELECT theo policy, không ghi trực tiếp. Employee đọc dữ liệu của mình; Manager đọc lịch; Admin quản trị tài khoản, không có quyền điều khiển lịch qua API.
- Bốn RPC đặc quyền chỉ service_role được EXECUTE, SECURITY DEFINER có search_path rỗng. Trigger kiểm tra bộ phận, unique/FK bảo vệ dữ liệu; quota/approval ở server trên snapshot và commit với khóa tuần/revision.
- Secret/service_role bypass RLS: không chia sẻ cho người chỉ dùng giao diện. Service RPC tin state từ backend; đây không phải API được phép mở cho client.
- Cookie phiên opaque, HttpOnly, SameSite=Strict; Secure và `__Host-` trên HTTPS. DB lưu hash session, token mã hóa AES-256-GCM. Hết hạn tuyệt đối 12h, idle 30 phút; API kiểm tra profile active/role mỗi request. Không lưu token trong localStorage.
- POST kiểm tra origin chính xác, JSON và X-2CE-Request; frontend cùng origin. Không cần mở wildcard CORS. Lỗi API được làm sạch; không trả token/stack/database error.
- Public signup và anonymous signup cần tắt **trong Dashboard**, không chỉ bỏ UI. Chưa thể kiểm chứng hai setting này trên cloud. Không thêm SMS OTP, anonymous login hay public signup.
- Provisioning không phải transaction xuyên Auth/Postgres. Nếu tạo Auth thành công nhưng profile thất bại: dừng, kiểm tra UUID/mapping, phục hồi theo `docs/OPERATIONS.md`; không chạy reset hoặc tạo lại mù quáng. Script phát hiện orphan/mapping khác và dừng.
- File credential phải ngoài repo, quyền 0600, thư mục riêng 0700, tên file mới; mật khẩu ngẫu nhiên lưu trước mỗi Auth create. Không gửi credential qua chat/repo/log/screenshot. Không ghi payload đăng nhập hoặc Set-Cookie vào báo cáo live.
- Các tài khoản demo dùng số giả không nhận SMS, nên khôi phục mật khẩu qua số đó không phải luồng được hỗ trợ. Operator quản lý tài khoản demo, không dùng danh tính thật.
- Giới hạn hiện có: chưa có full assignment-version history; quota nằm ở backend, không phải DB constraint tổng hợp; chưa có kiểm chứng IAM/settings cloud hoặc load test PostgreSQL đa máy. Không mở rộng business rules trong nhiệm vụ này.

## 3. Tạo staging — chỉ operator được ủy quyền thực hiện

1. Tạo project riêng trong Supabase Dashboard, tên ví dụ `2ce-staging`, chọn region phù hợp và lưu database password trong password manager. Không dùng project production/shared có dữ liệu khác. Ghi nhận project reference/URL để người phê duyệt xác nhận đúng đích; không ghi key vào tài liệu công khai.
2. Chờ database sẵn sàng; bật Data API với schema public để các endpoint REST/RPC hoạt động. Không expose schema private.
3. Trong Auth configuration, tắt tạo user tự do và anonymous sign-in; bật Phone provider. Giữ xác minh phone. Không cấu hình flow OTP trong app; operator tạo user với `phone_confirm:true`. Nếu Dashboard yêu cầu SMS provider để lưu cấu hình, ghi nhận blocker và giải quyết cấu hình với chủ project; không bịa thông tin SMS hay bật public signup để né lỗi.
4. Site URL là origin staging; local dùng origin chính xác khi đánh giá local. Luồng password không dùng OAuth callback; không cần wildcard redirect. Không tạo deployment để lấy URL khi chưa được phép deploy.
5. Lấy URL/publishable/secret vào password manager hoặc env editor bảo mật. Kiểm tra không nhầm project giữa public key và secret.

### Cấu hình máy tin cậy, không in secret

```sh
git clone https://github.com/HoanV2802/MISS3047.git
cd MISS3047
pnpm install --frozen-lockfile
umask 077
cp .env.example .env
chmod 600 .env
```

Dùng editor bảo mật điền URL/key/origin trong `.env`, không truyền key/password trên command line hoặc dùng shell history. Với máy mới cần Node 24 trên PATH; phiên chuẩn bị này dùng runtime Node 24.22.1 riêng vì `node` chưa có trong PATH mặc định.

Tạo session key trực tiếp vào `.env`, không in ra terminal; chỉ chạy một lần lúc thiết lập mới:

```sh
node -e "const fs=require('node:fs'); fs.chmodSync('.env',0o600); let s=fs.readFileSync('.env','utf8'); s=s.replace(/^SESSION_ENCRYPTION_KEY=.*$/m,'SESSION_ENCRYPTION_KEY='+require('node:crypto').randomBytes(32).toString('base64')); fs.writeFileSync('.env',s,{mode:0o600});"
node --env-file=.env scripts/staging-preflight.cjs
```

Preflight chỉ kiểm tra cú pháp/biến và báo tên biến thiếu/sai, không gọi network và không chứng minh key hợp lệ. Không đặt cờ live để làm preflight xanh; chúng là cấp phép riêng cho test.

### Migration chính xác và xác minh

Sau **ủy quyền migration riêng**, mở SQL Editor của đúng staging. Kiểm tra trước:

```sql
select to_regclass('auth.users'), to_regprocedure('auth.uid()');
select to_regclass('public.employees'), to_regclass('public.profiles');
```

Auth objects phải tồn tại. App tables phải chưa tồn tại trên project mới. Nếu đã có, dừng và đối chiếu migrations; không drop schema/tables hoặc chạy lại file mù quáng.

1. Chạy nguyên nội dung `supabase/migrations/202610310001_backend.sql` một lần; file có BEGIN/COMMIT.
2. Chạy nguyên nội dung `supabase/migrations/202610310002_employees.sql` một lần.
3. Đối chiếu lịch sử phiên bản. Luồng bổ sung có quản lý duyệt cần thêm `supabase/migrations/202611010001_supplement_requests.sql` sau hai phiên bản trên. Với staging đã có hai bản đầu, chỉ áp bản còn thiếu sau khi được phép.
4. Phiên bản backend hiện tại cần thêm `supabase/migrations/202611010002_workspace_actor_binding.sql`. Bản này thay hàm commit 8 tham số bằng hàm 9 tham số trong một giao dịch. Khi triển khai có phê duyệt, tạm ngưng ghi, áp bản SQL rồi chuyển toàn bộ backend sang phiên bản tương ứng trước khi mở ghi. Ghép backend cũ với RPC mới (hoặc ngược lại) khiến lệnh ghi thất bại.
5. Áp tiếp **202611010003_submitted_plans.sql** để lưu snapshot từng ca đã gửi, thời điểm và bảo vệ ca duyệt. Đối chiếu tuần cũ được đánh dấu cần xác nhận. Không dùng backend phiên bản cũ ghi vào schema mới.
6. Chạy `scripts/check-supabase.sql` (chỉ đọc). Kỳ vọng 12 bảng có RLS, 4 RPC definer có search_path rỗng và chỉ service có quyền thực thi trong ba vai trò được kiểm tra, 18 nhân viên và ba quyền nguy hiểm đều false. Các số đếm này giống nhau trước và sau bản bổ sung nên cần đối chiếu phiên bản riêng.
7. Hai cột `bound_commit_installed` và `unbound_commit_removed` phải cùng true. Đối chiếu grants của hàm và lịch sử đủ năm phiên bản; `submitted_plan_columns_installed` phải true.
8. Giữ output schema/boolean/count và thời gian chạy làm bằng chứng riêng; không xuất auth.users tokens hay encrypted_tokens.

SQL Editor không tự tạo lịch sử `supabase_migrations` như CLI. Nếu dùng CLI thay thế, init/link đúng project và dùng quy trình migration của CLI từ đầu; không áp cả hai đường vào cùng project. Migrations hiện có là bootstrap, không phải scripts idempotent. Chưa chạy CLI hay SQL Editor cloud trong nhiệm vụ này.

### Provision 1 Admin, 1 Manager, NV01–NV18

Manifest mới `scripts/accounts.staging.json` có 20 số giả: Admin `+447700900100`, Manager `+447700900101`, NV01–NV18 lần lượt `+447700900102`–`+447700900119`. Dải này thuộc số dành cho kịch/phim của [Ofcom](https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama); không dùng số thuê bao thật và không gửi SMS. Đây chỉ là identifiers, không có mật khẩu dùng chung trong manifest. Supabase chấp nhận các số này trên staging vẫn phải được kiểm chứng thực tế.

Sau **ủy quyền provisioning/seed riêng**, chạy từ repo trên máy tin cậy:

```sh
mkdir -p "$HOME/.2ce-staging"
chmod 700 "$HOME/.2ce-staging"
cp scripts/accounts.staging.json "$HOME/.2ce-staging/accounts.json"
node --env-file=.env scripts/provision.cjs \
  --manifest "$HOME/.2ce-staging/accounts.json" \
  --credentials-out "$HOME/.2ce-staging/credentials-initial.json" \
  --bootstrap --seed-week 2030-01-07
```

Chọn thứ Hai khác nếu tuần đó đã tồn tại; không seed đè. `2030-01-07` là tuần demo cố định để tái lập, cần chọn ngày này trong UI vì app mặc định tuần hiện tại. Không cần điều chỉnh đồng hồ hệ thống.

Script tự tạo mật khẩu mạnh riêng từng user; không in mật khẩu và không reset user đã có. `--bootstrap` dành cho project chưa có Admin. Credential file mới không được tồn tại. Nếu retry, dùng file output mới và đọc hướng dẫn phục hồi trước; bản output sau chỉ chứa tài khoản mới, không thay bản credential trước.

Chạy `scripts/check-staging-identities.sql` trong SQL Editor sau provisioning. Kỳ vọng trên staging riêng: Admin=1, Manager=1, Employee=18, tất cả active; identity_mismatches=0; employees_without_active_profile=0; auth_users_without_profile=0. SQL đối chiếu UUID, phone đã chuẩn hóa và phone_confirmed_at, không in phone/password/token.

Tuần seed kỳ vọng phase=2, revision=1, registrations=73, assignments=65, excluded=0. Provisioning chạy engine trực tiếp và giữ phase=2; Manager bấm generate qua API sẽ chuyển 3 vì còn thiếu ca. Không sửa dữ liệu để làm cả 18 người đạt mục tiêu.

**Kết quả provisioning thực tế hiện tại: chưa chạy; 0 tài khoản cloud được tạo bởi nhiệm vụ này.** Manifest 20 dòng và provisioning logic đã kiểm tra local, không phải 20 user thật.

## 4. Kế hoạch live sau khi được cấp quyền

Giữ tuần seed để trình diễn. Dùng tuần mới `2030-01-14` cho bài tự động ghi; `2030-01-21` và các thứ Hai mới khác cho tình huống kiểm tra riêng. Trước mỗi bài xác nhận tuần chưa tồn tại. Không reset/xóa lịch để chạy lại; ghi lại tuần đã tạo.

Suite hiện có chỉ dùng Manager/Employee; lấy credential tương ứng từ file riêng vào các biến TEST_* bằng env editor. Sau ủy quyền read/auth, đặt `TWOCE_LIVE_AUTHORIZED=dedicated-demo` và URL dự kiến. Đăng nhập là có tác động tạo token/session/rate-limit, dù bài mang tên read-only đối với lịch.

```sh
node --env-file=.env --test tests/backend/live.cjs
```

Để chạy API suite hiện có, cần HTTPS origin được phép và trùng `TEST_API_ORIGIN=APP_ORIGIN`. Local HTTP vẫn chạy app được nhưng suite live API hiện tại sẽ skip. Không bypass gate để gọi HTTP hoặc tự deploy nhằm làm test chạy.

```sh
node --env-file=.env --test tests/audit/live-api.cjs
```

Chỉ sau ủy quyền ghi, đặt thêm `TWOCE_LIVE_WRITE_AUTHORIZED=new-test-week`, `TEST_WEEK=2030-01-14`. Chạy cùng lệnh sẽ tạo tuần mới, ghi đăng ký/đơn/lịch sử và để dữ liệu lại. File test không tự seed/reset/xóa shared data.

| Hạng mục | Tự động hiện có | Phần phải thực hiện thêm trên staging, chưa chạy |
| --- | --- | --- |
| Phone/password | Login Manager/Employee bằng Auth thật | Login Admin và NV02, mật khẩu sai trả lỗi chung, không lộ token |
| Session | API cookie, logout/replay | Reload vẫn login; để idle >30 phút không request rồi gọi auth →401; absolute >12h →401. Không chỉnh giờ production để giả lập live |
| Quyền/unauthorized | Employee/Manager bị cấm Admin; Employee không generate, forged role bị chặn | Admin vào tài khoản được, vào workspace/action lịch bị 403; NV02 không gửi đơn ca NV01; kiểm tra payload giả empId |
| RLS | Anon bị chặn; employee chỉ thấy employee record của mình qua user JWT | Dùng publishable+JWT NV01/NV02 (không service key) đọc registrations/assignments/requests tuần đã seed: chỉ của mình; lọc employee khác →[]; UPDATE profiles/INSERT assignments và gọi commit_workspace →denied; sessions không đọc được. Thực hiện bằng client kiểm thử tin cậy, không nới CSP của app |
| Đăng ký/hủy | Đăng ký, submit, replay/stale, đọc lại | Phase 1 chọn rồi hủy, reload không còn đăng ký; đóng cửa sổ thì bị chặn; không tự giảm chuẩn 20h/2 tối |
| Xếp ca | Generate sau đăng ký | Tuần seed 73→65, 0 loại; chạy lại cùng input cho cùng allocation; ghi phase thực tế |
| Approve/reject | Đơn nghỉ và approval + lịch sử | Tạo đơn khác rồi reject; assignment giữ nguyên, lịch sử có một kết quả. Reload hai tài khoản xác nhận |
| Quota | Chưa có bài live riêng | Tuần riêng phase 3, NV01 nhận chiều thứ Hai; NV02 thử nhận cùng ca →409 dù thiếu Pha chế; verify một Bếp. Lặp tuần khác với hai request cùng revision →một 200/một 409 |
| Replacement | Chưa có bài live riêng | Seed tuần riêng, phát hành; NV01 nghỉ mon-after →chỉ người đã đăng ký/đủ điều kiện. Theo demo NV05 có thể thay, NV03 không được thêm. Ca không có người thay hợp lệ →báo thiếu, không tạo đăng ký. Swap đích chưa đăng ký →409; swap hợp lệ phải giữ quota và đăng ký có sẵn |
| Đồng thời | Stale/replay tuần tự | Hai Manager sessions approve/reject cùng request, cùng revision →một quyết định, một history. Hai approvals tranh người thay →request stale phải đọc lại; không áp cả hai kế hoạch cũ |
| Persistence | Đọc workspace sau ghi; history/audit | Đóng/mở browser, khởi động lại local server; dữ liệu vẫn ở Supabase. Không dùng adapter PGlite cho lần này |
| UI thật | Chưa có; `test:ui` hiện dùng mock identity | Ba roles; desktop 1440:21 ô; tablet 768:9 ô/3 ngày, nút gửi bên phải; mobile 393:3 ô/ngày. Thử chọn/gửi/duyệt/reload và lỗi server; tiếng Việt, không overflow, không optimistic-success |

Mỗi dòng ghi PASS/FAIL/BLOCKED, project reference, code revision, test week, HTTP status/count và thời gian. Không đính kèm HAR chứa token/cookie hoặc screenshot mật khẩu. Không coi suite live hiện có là toàn bộ coverage; các dòng bổ sung là protocol cần thực hiện/ghi bằng chứng sau ủy quyền.

## 5. Vercel và bàn giao giảng viên

Chưa deploy. Sau phê duyệt triển khai staging: import repo `HoanV2802/MISS3047`, chọn revision đã đưa các thay đổi chuẩn bị vào repo, framework Other, Node24, build `node scripts/build.cjs`, output `public`. Giữ `api/[route].js` và includeFiles hiện có; không thêm migration/provision vào buildCommand.

Thêm năm biến runtime bắt buộc qua Vercel environment settings (với một trong hai biến secret); chỉ cho môi trường staging/Preview phù hợp. Không prefix PUBLIC_/NEXT_PUBLIC_. Chọn origin HTTPS ổn định, cập nhật APP_ORIGIN chính xác; preview URL ngẫu nhiên khác origin sẽ bị chặn CSRF. Đặt Supabase Site URL tương ứng. Không bỏ qua Deployment Protection chỉ để test; nếu có protection, operator cần đường truy cập staging được phê duyệt cho bài live.

Sau deploy được phép: kiểm tra /api/auth chưa login→401 (không 503), asset public tải được, /server và .env không public, login nhận cookie Secure/HttpOnly; chạy checklist live và UI thật. Cloud deployment readiness **có điều kiện**, chưa có bằng chứng deployment thành công.

Giảng viên dùng hosted staging chỉ cần URL và tài khoản cấp sẵn qua kênh riêng. Để clone chạy local kết nối database chung:

1. `git clone`, cài Node24/pnpm và dependencies theo phần trên.
2. Người được tin cậy vận hành backend nhận cấu hình staging qua password manager; người chỉ đánh giá UI dùng hosted URL, không nhận secret/service_role.
3. Tạo `.env` quyền0600, origin localhost và session key riêng như hướng dẫn; không chạy migration/bootstrap/seed lại vào database chung.
4. `pnpm dev`, mở đúng `http://localhost:4173`; nhập tài khoản Admin/Manager/Employee đã được cấp. Chọn tuần demo `2030-01-07`.
5. Xem data từ cùng staging. Localhost và 127.0.0.1 là hai origin khác; không chạy web server tĩnh thay Node API. Không đưa credential vào README để giúp clone tự đăng nhập.

## 6. Kết quả và blockers

- Local full suite sau thêm công cụ: 80 passed, 0 failed, 0 skipped; migration/Postgres/RLS ở đây dùng PGlite và Auth fixture, không phải Supabase cloud.
- Offline preflight trong môi trường thực hiện: ready=false, thiếu URL/key/session/origin như dự kiến.
- Live runner với gates tắt: 4 tests, 0 passed, 0 failed, **4 skipped/BLOCKED**; không thực hiện cloud calls.
- Browser 19 checks/27 combinations là kết quả nhiệm vụ trước với identity giả lập; không chạy lại và không gọi là frontend với Supabase thật trong nhiệm vụ này.
- Cloud migration, provisioning, session test thật, RLS trên hosted Postgres, frontend thật và deployment đều **BLOCKED** bởi chưa có project/config/credential và ủy quyền tương ứng.
- Blocker bổ sung: HTTPS endpoint cho live API, cài Node24 trên PATH máy operator, xác nhận phone-provider setting và quyết định kênh bàn giao tài khoản. Không yêu cầu gửi secrets vào chat; chỉ cấu hình trên máy/môi trường tin cậy rồi xác nhận tên project và phạm vi thao tác được phép.

File mới: `scripts/staging-preflight.cjs` (offline, không in giá trị), `scripts/accounts.staging.json` (20 identities giả), `scripts/check-staging-identities.sql` (read-only aggregate), `tests/audit/staging-preflight.test.cjs` (4 tests), tài liệu này. README cập nhật link staging, trạng thái Git và tạo key không in terminal. `.env.example` đã đủ biến cho runtime/suite hiện có nên giữ nguyên. Migrations, server, frontend, thuật toán và BPMN không đổi.
