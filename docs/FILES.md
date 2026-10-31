# Các file thay đổi

## Sửa

- `index.html`: phone/password login, Admin view, lịch sử đơn cá nhân, vùng báo lỗi/loading; giữ IDs và layout cũ, thay inline executable handlers bằng data attributes.
- `app.js`: bỏ Auth/seed/ghi state giả ở browser; thêm API adapters, session restore, server response synchronization, loading/retry, event delegation, Admin và lịch sử đơn; giữ các renderer và responsive day/group selection.
- `style.css`: bổ sung trạng thái API/Admin/history dùng design tokens sẵn có, không thiết kế lại dashboard.
- `REDESIGN-NOTES.md`: đánh dấu báo cáo UI trước backend là tài liệu lịch sử.
- Test UI/hashes/results trước backend được chuyển vào `tests/legacy/`; các bài kiểm thử mới nằm riêng.

## Thêm

- `shared/domain.js`: cấu hình ca và sáu hàm nghiệp vụ gốc, cùng factory state.
- `api/[route].js`: entrypoint Vercel.
- `server/handler.cjs`: routing, giới hạn body, Origin/CSRF, authorization và request/response.
- `server/supabase.cjs`: Auth/PostgREST, phiên mã hóa, logout, account administration.
- `server/workflows.cjs`: trusted workflow validation, nguyên tắc sở hữu và lọc dữ liệu đầu ra.
- `server/validation.cjs`: typed input, phone/week/UUID validation, permission/error helpers.
- `server/static.cjs`: các security header/CSP dùng bởi server cục bộ.
- `server/employees.cjs`: 18 hồ sơ gốc, chỉ dùng ở server/operator/tests, không nằm trong build public.
- `supabase/migrations/202610310001_backend.sql`: schema, constraints, RLS, RPC giao dịch, session/rate-limit/audit.
- `supabase/migrations/202610310002_employees.sql`: import 18 nhân viên gốc, không password/account.
- `scripts/dev.cjs`, `scripts/build.cjs`: server phát triển và build whitelist.
- `scripts/provision.cjs`, `scripts/accounts.example.json`, `scripts/demo-data.json`: provisioning tin cậy và dữ liệu demo gốc.
- `package.json`, `pnpm-lock.yaml`, `.env.example`, `.gitignore`, `.vercelignore`, `vercel.json`: cài đặt/cấu hình/deploy.
- `tests/backend/`: unit, SQL/API integration, browser E2E cục bộ và live test có điều kiện.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/BUSINESS-RULES.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/TEST-RESULTS.md`, `docs/FILES.md`: tài liệu triển khai và bàn giao.

`public/`, `node_modules/` và `tests/backend/artifacts/` là đầu ra/dependency được Git ignore. Chưa có Git repository/remote trong thư mục gốc nên không tạo commit hoặc PR. Không có `.env` thật, credential thật, migration cloud hay deployment production được tạo.
