# Rà soát bảo mật

Phạm vi: kiểm tra thiết kế, source code, unit/integration tests PostgreSQL cục bộ và UI. Đây không phải một chứng nhận hay penetration test trên hệ thống cloud đã triển khai.

| Rủi ro | Biện pháp trong mã | Kiểm chứng |
| --- | --- | --- |
| Bỏ qua đăng nhập / IDOR | Session ngẫu nhiên, xác minh Auth user, profile active, actor/employee ID suy ra từ server | HTTP unauthorized, own-data isolation, RLS |
| Tự nâng role | Không có public profile-write; quản trị qua API/RPC riêng, không đọc role từ user metadata | Forged-body tests, RLS UPDATE denied, Admin checks |
| Lộ mật khẩu/token | Auth quản lý mật khẩu; token AES-GCM ở server, cookie HttpOnly opaque; không localStorage | Crypto/session tests, browser source scan |
| CSRF/CORS | Strict Origin, JSON + header riêng, SameSite Strict; không Access-Control-Allow-Origin wildcard | HTTP cross-origin tests |
| Stored/DOM XSS | Escape lý do/tên khi render, textContent cho lỗi/status; không eval hoặc handler JavaScript inline; CSP script-src self | Browser nhập chuỗi HTML, source/CSP checks |
| SQL injection | JSON RPC typed parameters; không ghép input người dùng vào SQL | Input tests, constraints; fixed function names |
| Duyệt trùng / mất cập nhật | UUID idempotency, revision, FOR UPDATE, transaction, unique approval | SQL/HTTP duplicate and stale-write tests |
| Brute force | Supabase Auth limits cộng bộ đếm PostgreSQL IP/phone HMAC | SQL rate-limit test; upstream Auth thực tế chưa chạy |
| Secret key bypass RLS | Key chỉ server; client không gọi RPC đặc quyền; API xác minh quyền trước dùng secret; commit kiểm tra lại role | Grants/RLS/API tests; build whitelist |
| Lộ cấu hình qua static hosting | Build whitelist 4 tài nguyên, local server whitelist, env ignored | Source/build review |
| Phiên không kết thúc | Registry phía server, TTL + idle, delete session khi logout/khóa account | Expiry/logout/replay/session tests |
| Tạo account bị lỗi một phần | Không có profile thì không có quyền; preflight phone/NV; giữ lỗi để operator phục hồi | Admin creation with Auth mock + real profile/audit SQL |

## Lưu ý vận hành và giới hạn

- Secret key của Supabase bypass RLS theo thiết kế nhà cung cấp. Vì thế không dùng service-role trực tiếp trong browser, không xuất snapshot đặc quyền hoặc whole appState cho Employee, không bỏ qua lớp xác thực API.
- Phải tắt signup trong Supabase Dashboard. Chỉ không có trang đăng ký là chưa đủ. Mã ứng dụng không thể thay cấu hình dự án khi chưa được cấp quyền quản trị dự án.
- CSP vẫn cho inline **style** để giữ giao diện hiện tại; không cho inline script. HSTS có trên API HTTPS và Vercel mặc định; khi đổi hosting cần cấu hình HTTPS/header tương ứng.
- Tài khoản demo nên ở dự án riêng. Không sử dụng dữ liệu thật/mật khẩu dùng lại cho đánh giá.
- Luồng browser/request chạy trên network mock identity provider trong kiểm thử cục bộ. Kiểm chứng Auth password grant, refresh token reuse, API gateway và chính sách RLS trên Supabase thật còn cần chạy với cấu hình môi trường.
- PGlite kiểm chứng PostgreSQL RLS, grants, functions và rollback nhưng chỉ có một kết nối. Nó không chứng minh hành vi tải cao hoặc mọi tình huống cạnh tranh giữa nhiều instance Vercel. CAS/row-lock có kiểm thử xung đột revision; cần bài tải/concurrency riêng trên staging thật.
- JWT refresh đồng thời dùng refresh behavior của Supabase và CAS ghi encrypted token. Cần giữ cấu hình reuse interval hợp lý của Auth và kiểm tra nhiều tab/instance trên staging.
- Mã không log password/token/key; endpoint chỉ trả thông báo lỗi tiếng Việt, không stack trace/SQL upstream. Nhật ký lỗi bị từ chối không được lưu đầy đủ như một hệ thống SIEM; audit nghiệp vụ ghi các thay đổi thành công trong giao dịch.
- Cần retention/maintenance cho session/rate-limit/audit tùy môi trường; chưa bật cron ngoài yêu cầu.

## Nguồn chính thức đã tham khảo

- [Supabase password-based authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase session model](https://supabase.com/docs/guides/auth/sessions)
- [Supabase administrative account creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API keys: publishable/secret và Authorization header](https://supabase.com/docs/guides/getting-started/api-keys)
- [PGlite: PostgreSQL dùng cho kiểm thử cục bộ](https://pglite.dev/docs/)
