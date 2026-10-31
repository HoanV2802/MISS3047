# Kết quả kiểm thử — 31/10/2026

## Đã thực thi

Môi trường: Node.js 24.22.1, PostgreSQL qua PGlite 0.3.16, Playwright 1.64.1 và Chrome trên macOS. Không có Supabase URL/key/tài khoản thật trong môi trường chạy.

| Nhóm | Kết quả | Nội dung |
| --- | --- | --- |
| Unit/contract (`domain`, `session`, `static`) | 19/19 qua | Quy tắc, input, source hash thuật toán gốc, mã hóa/refresh với Auth stub, header/key handling, CSP/source safety |
| Integration SQL/API (`database`, `http`, `admin`) | 20/20 qua | Migration thật, RLS/grants, constraint/FK/uniqueness, transaction rollback, revision/idempotency, Auth adapter + SQL thực, audit/admin |
| Browser E2E cục bộ | 15/15 kiểm tra qua | Frontend thật + handler thật + PostgreSQL cục bộ; identity provider test-only |
| Vai trò × viewport | 27/27 tổ hợp qua | Manager/Employee/Admin × chín kích thước; số ca hiển thị đúng và không tràn trang |
| Live Supabase | 0 qua, **2 bỏ qua** | Thiếu cấu hình và tài khoản thật; không giả kết quả kết nối |
| Build static | Qua | Public chỉ có index.html, style.css, app.js, shared/domain.js |

Lệnh đã chạy:

```sh
node --test tests/backend/*.test.cjs
node tests/backend/browser.cjs
node --test tests/backend/live.cjs
node scripts/build.cjs
```

## Các tình huống đã kiểm tra

- Đăng nhập phone/password hợp lệ/không hợp lệ với identity fixture; cookie HttpOnly/SameSite/Secure, không trả token.
- Hết phiên, refresh access JWT với Auth stub, refresh bị từ chối, inactive profile, logout và replay cookie sau logout.
- Anonymous/không có phiên bị từ chối, CSRF cross-origin, sai method, body quá lớn, JSON sai.
- Phân biệt Admin/Manager/Employee; giả role/employeeId trong body không có tác dụng; direct Employee request đến Admin API nhận 403.
- RLS chỉ đọc nhân viên/đăng ký thuộc chính mình; không thể tự UPDATE role, đọc token/session hoặc gọi RPC đặc quyền bằng authenticated role.
- Đăng ký/hủy, chuyên môn, trùng đăng ký, đủ/thiếu 20h và 2 ca tối, gửi đơn ở sai giai đoạn, ca bổ sung đủ người.
- Phát hành phải xác nhận thiếu người; invalid phase bị từ chối. Lỗi thuật toán phase-2 gốc được tái hiện riêng.
- Leave/swap, người gửi đúng ca của mình, reason/target thiếu, pending duplicate, approval/rejection, review lần hai, lưu assignment/audit/history nguyên tử.
- UUID idempotency và expected revision; cập nhật cũ không ghi đè, lỗi ràng buộc rollback toàn bộ.
- Dữ liệu đăng ký còn sau reload trang; một bài riêng kiểm tra dữ liệu PostgreSQL còn sau đóng/mở lại PGlite lưu file.
- Admin tạo Auth bằng provider stub và lưu profile/audit bằng SQL thật; không ghi password vào profile/RPC, không tự sửa role, kiểm tra role/NV/password.
- Chuỗi HTML trong reason hiển thị như văn bản; không chạy mã. Không có executable inline handler/eval trong browser source; CSP script-src self.
- Chuyển dọc/ngang giữ ngày đã chọn; iPad vẫn có tiến độ/nút gửi bên phải. Lỗi tải dữ liệu có nút retry hoạt động.
- Chín viewport: 320×568, 375×667, 393×852, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080.
- Không có browser runtime errors trong E2E cuối.

Kết quả chi tiết và ảnh do bài UI tạo tại `tests/backend/artifacts/` (Git ignore). Ảnh dài tạm tắt blur của header trong môi trường capture để tránh lỗi compositor của headless Chrome; CSS sản phẩm không thay đổi vì việc chụp ảnh.

## Chưa được kiểm chứng

- Supabase Auth password grant/phone confirmation/refresh thật, PostgREST gateway, áp dụng migration/policy trên cloud.
- Vercel build/deployment và cookie/domain/header trên URL HTTPS thật.
- Tạo bộ 20 tài khoản demo thật, chia sẻ credential, phục hồi orphan account trên provider thật.
- Cạnh tranh nhiều kết nối/instance, tải lớn, refresh nhiều tab trên staging. PGlite chỉ một kết nối; bài CAS không thay cho load test phân tán.
- iPhone/iPad Safari phần cứng thật, virtual keyboard, thiết lập Auth/Supabase Dashboard, CORS của domain triển khai thật.

Không có production deployment, thao tác phá dữ liệu hoặc kết nối cơ sở dữ liệu thật được thực hiện.
