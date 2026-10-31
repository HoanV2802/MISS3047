# Thiết kế backend và cơ sở dữ liệu

## Ranh giới tin cậy

Browser không giữ token Supabase và không gọi Data API với secret. Mọi thao tác nghiệp vụ đi qua API cùng origin. API xác minh phiên với Supabase Auth, đọc `profiles` mới nhất, kiểm tra vai trò/chủ sở hữu, tải snapshot đáng tin cậy rồi áp dụng hàm nghiệp vụ dùng chung.

Service/secret key chỉ nằm trong biến môi trường server và công cụ operator. Service role có quyền bypass RLS theo thiết kế Supabase, vì vậy **các kiểm tra trong API là ranh giới bảo mật bắt buộc**; RLS/grants chặn người dùng tự gọi Data API để đi vòng. Không có policy public-write và không tắt RLS.

Các RPC snapshot/commit/admin/rate-limit là `SECURITY DEFINER`, `search_path=''`, không được cấp EXECUTE cho PUBLIC, anon hay authenticated. Chỉ service_role được gọi. `commit_workspace` kiểm tra lại actor/role đang hoạt động trong database trước khi ghi.

## Bảng dữ liệu

| Bảng | Khóa/quan hệ | Vai trò |
| --- | --- | --- |
| `profiles` | UUID → `auth.users`; unique phone, employee_id | Danh tính ứng dụng, vai trò, trạng thái hoạt động; không có mật khẩu |
| `employees` | NV01–NV18, tên/bộ phận gốc | Tách hồ sơ nhân sự khỏi Auth identity |
| `weekly_schedules` | Thứ Hai của tuần | Giai đoạn 1–4, revision, timestamps |
| `shifts` | (week_start, id ca) | 21 khóa ca hợp lệ/tuần |
| `shift_registrations` | Unique (tuần, ca, NV), FK kép đến shifts | Đăng ký; identity position giữ thứ tự ứng viên |
| `shift_assignments` | Unique (tuần, ca, NV), FK kép đến shifts | Phân công; position giữ thứ tự gốc |
| `registration_submissions` | (tuần, NV) | Đã gửi, bị loại, lý do |
| `change_requests` | UUID; FK ca nguồn/đích cùng tuần | Loại đơn, lý do, trạng thái; một đơn chờ/ca/NV |
| `approval_history` | Unique request_id | Người duyệt, kết quả, thời điểm |
| `audit_logs` | Unique (actor, request_id) | Thao tác, fingerprint, kết quả, bước trước/sau, đối tượng, thời điểm |
| `web_sessions` | SHA-256 mã phiên → profile | Token được mã hóa, thời hạn, lần truy cập gần nhất |
| `login_limits` | Khóa HMAC không lộ số điện thoại/IP | Đếm đăng nhập theo cửa sổ 5 phút |

Ràng buộc gồm ngày đầu tuần, định dạng mã nhân viên/ca/số điện thoại, vai trò, kiểu/trạng thái đơn, lý do không trống, FK, uniqueness và trigger kiểm tra chuyên môn cho đăng ký/phân công. Định biên của thuật toán gốc không bị thay bằng các giới hạn SQL mới làm đổi hành vi duyệt/bổ sung.

## Authentication

1. POST `/api/auth` với `action=login`, số điện thoại và mật khẩu; server chuẩn hóa số Việt Nam sang +84, hoặc chấp nhận E.164 hợp lệ.
2. Rate limit bền vững: 30 lần/IP và 10 lần/số điện thoại trong 5 phút. Khóa rate-limit là HMAC với khóa server.
3. Server gọi Supabase password grant. Không lưu mật khẩu vào bảng ứng dụng.
4. Profile phải tồn tại và active. Token chỉ được mã hóa trong server-side session; browser nhận cookie ngẫu nhiên HttpOnly.
5. Mỗi request tìm session qua hash, kiểm tra thời hạn, xác minh Auth user, refresh token nếu access JWT đã hết hạn, đọc lại profile. CAS revision ngăn response refresh cũ ghi đè token mới.
6. Phiên có thời hạn tối đa 12 giờ và hết hạn sau 30 phút không hoạt động. Khi reload, GET `/api/auth` khôi phục người dùng; frontend tải snapshot của tuần đang xem.
7. Logout xóa session ứng dụng trên server và cookie. Mã cookie cũ không thể dùng lại. Đây là thu hồi phiên của ứng dụng; không phải thao tác sign-out toàn bộ các client Supabase khác.

Cookie HTTPS có tên `__Host-2ce_session`, Secure, Path=/, không Domain. Cục bộ HTTP dùng tên `2ce_session`. Không dùng localStorage để giữ phiên hoặc quyền.

## API

| Endpoint | Yêu cầu | Phạm vi |
| --- | --- | --- |
| `POST /api/auth` | login/logout | Login có rate limit, logout luôn xóa đúng phiên |
| `GET /api/auth` | Cookie phiên | Profile hiện tại, không trả token |
| `GET /api/workspace?week=YYYY-MM-DD` | Manager/Employee | Snapshot đúng quyền; Employee chỉ có ID/dữ liệu của mình và tổng định biên |
| `POST /api/action` | Cookie + UUID + revision | phase/generate/registration/submit/request/approve/reject |
| `GET /api/admin` | Admin | Thông tin tài khoản hệ thống |
| `POST /api/admin` | Admin | Tạo profile/Auth account, đổi vai trò, khóa/mở tài khoản khác |

POST yêu cầu Origin bằng APP_ORIGIN, JSON và header `X-2CE-Request: 1`; không mở CORS cross-origin. Trình duyệt không thể chọn actor hoặc employee_id cho thao tác nghiệp vụ. Trường không biết bị từ chối.

Mã lỗi: 400 input, 401 thiếu/hết phiên, 403 sai quyền/origin, 404 không có tài nguyên, 409 trùng/phiên bản cũ/trạng thái xung đột, 413 body quá lớn, 422 vi phạm nghiệp vụ/ràng buộc, 429 quá nhiều lần thử, 503 upstream/cấu hình chưa sẵn sàng.

## Giao dịch và chống ghi đè

Snapshot được tính trên server; client không gửi cả appState để ghi. Mỗi command có expected revision. RPC khóa row tuần, kiểm tra revision rồi cập nhật đăng ký, phân công, trạng thái đơn, lịch sử duyệt và audit trong cùng giao dịch. Bất kỳ lỗi nào đều rollback toàn bộ.

UUID chống lặp có phạm vi actor và fingerprint của command. Gửi lại cùng command không xếp lịch/duyệt lần hai. Cùng UUID nhưng nội dung khác bị từ chối. Hai command cùng revision chỉ một command có thể ghi; command kia nhận 409 và UI tải lại.

## Frontend

Giữ lịch và DOM IDs của thiết kế trước. `appState` là view model từ server; `EMPLOYEES` được nạp theo quyền. Quy tắc thống kê dùng `shared/domain.js`; các hàm ghi cũ được thay bằng API adapters cùng tên. Không còn seed hoặc đăng nhập giả trong browser.

Các inline event handler được đổi thành thuộc tính dữ liệu và một bộ phân phối sự kiện có danh sách hàm cho phép, không eval. Nhờ vậy CSP chỉ cho chạy script cùng origin mà vẫn giữ các nút, form, dialog và trạng thái focus.

Các thay đổi bổ sung theo yêu cầu: form Admin cùng design system, lịch sử đơn cá nhân, trạng thái tải/lỗi, chặn gửi trùng và thông báo xung đột. Tablet vẫn có ca cá nhân bên trái, tiến độ/nút gửi bên phải.
