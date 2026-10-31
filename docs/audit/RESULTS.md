# Kết quả audit — 31/10/2026

> Báo cáo lịch sử trước phê duyệt sửa eligibility. Trạng thái hiện tại và kết quả sau áp dụng: [báo cáo bản sửa](../scheduling-fix/README.md). Các số liệu/bảng bên dưới ghi lại thời điểm audit, không phải main hiện tại.

Không có thông tin dự án, tài khoản hoặc ủy quyền cloud. Không kết nối Supabase thật, không migrate/seed/deploy ngoài máy cục bộ.

## Kết quả thực thi

| Nhóm | Passed | Failed | Skipped/blocked | Ghi chú |
| --- | ---: | ---: | ---: | --- |
| Backend suite đang có | 39 | 0 | 0 | Chạy lại trước và sau thay đổi ổn định |
| Audit suite mới | 22 | 0 | 0 | Bao gồm engine đề xuất cách ly, session race, build, provisioning, API/SQL, live gates |
| Tổng local unit/integration | **61** | **0** | **0** | Auth/network/identity có fixture; SQL thật trên PostgreSQL 17.5 qua PGlite |
| Browser E2E cục bộ | **15** | **0** | **0** | Identity adapter kiểm thử; 27 tổ hợp vai trò/viewport, không runtime error |
| Regression eligibility trên main | 0 | **1 lỗi đã biết** | 0 | Cố ý tách khỏi suite xanh: 0 !== 65 |
| Cùng regression trên bản sao áp patch | **1** | 0 | 0 | Chỉ VM trong bộ nhớ, main không sửa |
| Live Auth/RLS/API | 0 | 0 | **4** | Thiếu cấu hình, tài khoản và cờ ủy quyền riêng; không phải passed |

Hai bài regression về session race/build đã đỏ trước sửa (2 failed) và xanh sau sửa. Chúng đã được tính trong 22 bài audit hiện tại, không cộng hai lần. Rủi ro truncate credential file được phát hiện qua source review; bài disk/rename failure và partial provisioning được bổ sung để kiểm tra bản gia cố, không giả là đã có test đỏ trên script cũ.

Các bước đã chạy thêm:

- `pnpm install --offline --frozen-lockfile`: thành công, không đổi dependencies.
- `node scripts/build.cjs`: thành công; output chỉ bốn file cho phép, không giữ marker artifact cũ.
- `git apply --check proposals/scheduling-registration-hours/registration-hours.patch`: patch phù hợp với source hiện tại; **không áp dụng**.
- `scripts/check-supabase.sql`: chạy trên database fixture cục bộ sau cả hai migration. 12 bảng bật RLS, 4 RPC đúng definer/search_path/grants, 18 nhân viên, client role-update/session-read/anonymous employee-read đều false.
- Kiểm tra hash: UI (3 file), domain main, demo JSON và cả hai migration giống hệt trước audit.

## Lệnh tái lập

```sh
pnpm test
pnpm test:audit
pnpm test:ui
pnpm test:live
pnpm build

# Cố ý thất bại khi main chưa được duyệt sửa:
pnpm test:scheduling-red

# Chỉ đánh giá patch trong bản sao bộ nhớ:
TWOCE_TEST_PROPOSAL=1 node --test proposals/scheduling-registration-hours/eligibility.regression.cjs
```

Lượt kết hợp được thực thi bằng:

```sh
node --test --test-concurrency=2 tests/backend/*.test.cjs tests/audit/*.test.cjs
```

Môi trường: Node 24.22.1; PGlite 0.3.16/PostgreSQL 17.5 (WASM); Playwright 1.64.1; Chrome macOS. Bài concurrency xác minh contract revision ở API và row-lock SQL trong PGlite một connection, không phải bài tải PostgreSQL nhiều kết nối thực tế.

Log raw được lưu cục bộ trong `tests/backend/artifacts/audit-*` (Git ignore). Các ảnh E2E cũng ở thư mục đó; bản clone có thể tạo lại bằng `pnpm test:ui`.

## Những gì đã được bổ sung

- Xác nhận riêng dữ liệu 73 đăng ký, 0/18 ở phase 2 so với 65/0 ở phase 1.
- Bản vá một điều kiện: invariant giữa phase, eligibility, quota, chuyên môn, thứ tự, rerun và bảy trường hợp thiếu chỉ tiêu phân công còn nguyên.
- Hai request Auth đồng thời: request touch không làm mất token mới của request refresh.
- Không public file build thừa; API entrypoint lỗi cấu hình dừng ở 503 mà không gọi upstream.
- Provisioning 20 mapping, không reset mật khẩu khi chạy lại, atomic credential replacement, private permissions, symlink vào repo bị chặn, profile failure/orphan được giữ để phục hồi, seed destination đã tồn tại dừng sớm, inactive/mismatched Auth identity dừng trước tạo mới.
- Đọc/ghi theo hai tuần độc lập, hai write cùng revision có một winner, RPC đặc quyền không thể gọi bằng anon/authenticated, safe 503 không xóa cookie đang hợp lệ.
- Ghi nhận rõ Manager nhảy bước/phát hành empty schedule hiện vẫn được cho phép — đây là test mô tả defect/behavior, không là BPMN signoff.

## Chưa được kiểm chứng thật

Supabase Auth phone/password, refresh và reuse interval, admin creation khi signup tắt, không phát OTP trên project cụ thể, PostgREST key gateway, RLS/grants trên cloud, phân quyền ba role tại URL HTTPS thật, persistence/approval/rejection trên project thật, nhiều instance, Vercel function tracing/routes/timeouts/preview domains, thiết bị Safari thật.

Bốn bài live sẽ chỉ được bật sau khi operator được phép cấu hình đúng dự án demo; bài ghi cần một cờ và tuần mới riêng. Chi tiết tại [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Không dùng việc skipped để kết luận backend đã chạy Supabase thành công.
