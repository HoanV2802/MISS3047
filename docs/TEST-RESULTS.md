# Kết quả kiểm thử — 01/11/2026

## Lần xác minh bàn giao

Đã chạy trên macOS với Node.js 26.13.0, PGlite và Playwright đã cài sẵn trong workspace, cùng Chrome cục bộ. Dự án khai báo Node.js 24.x; môi trường này không có Node 24 hoặc pnpm, nên xác minh này không thay thế lần chạy bằng Node 24/pnpm trên máy của người nhận. Không có Supabase URL/key/tài khoản thật được dùng.

| Nhóm | Kết quả | Nội dung |
| --- | --- | --- |
| Backend/unit/integration (`tests/backend/*.test.cjs`) | 74 qua, 0 lỗi, 0 bỏ qua | Workflow, planning, migrations/PGlite, RLS/RPC, sessions, API, admin và provisioning safety |
| Audit/handover (`tests/audit/*.test.cjs`) | 45 qua, 0 lỗi, 0 bỏ qua | Build, contracts, regressions, handover, staging preflight, concurrency và provisioning |
| Node test suites tổng | **119 qua, 0 lỗi, 0 bỏ qua** | Backend + audit |
| Browser E2E cục bộ | **23 kiểm tra qua, 0 lỗi** | Frontend/API/PostgreSQL PGlite; test identity provider |
| Vai trò × viewport | **27/27 tổ hợp qua** | Manager/Employee/Admin × chín kích thước; không tràn trang |
| Build static | Qua | `public` được tạo từ các nguồn được cho phép |
| Live Supabase | Không chạy | Không có staging authorization hoặc credentials; không suy diễn kết quả hosted |

Các lệnh thực tế đã chạy:

```sh
node --test tests/backend/*.test.cjs
node --test tests/audit/*.test.cjs
node tests/backend/browser.cjs
node scripts/build.cjs
```

`pnpm` không có trong PATH ở môi trường xác minh; các script tương ứng đã được chạy trực tiếp bằng Node. Không cài dependency hoặc dùng thông tin đăng nhập đám mây.

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

Kết quả chi tiết và ảnh do bài UI tạo tại `tests/backend/artifacts/` (Git ignore).

## Chưa được kiểm chứng

- Supabase Auth password grant/phone confirmation/refresh thật, PostgREST gateway, áp dụng migration/policy trên cloud.
- Vercel build/deployment và cookie/domain/header trên URL HTTPS thật.
- Tạo bộ 20 tài khoản demo thật, chia sẻ credential, phục hồi orphan account trên provider thật.
- Cạnh tranh nhiều kết nối/instance, tải lớn, refresh nhiều tab trên staging. PGlite chỉ một kết nối; bài CAS không thay cho load test phân tán.
- iPhone/iPad Safari phần cứng thật, virtual keyboard, thiết lập Auth/Supabase Dashboard, CORS của domain triển khai thật.

Không có production deployment, thao tác phá dữ liệu hoặc kết nối cơ sở dữ liệu thật được thực hiện.
