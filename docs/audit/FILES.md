# File thay đổi trong lượt audit

> Báo cáo lịch sử trước phê duyệt sửa eligibility. Trạng thái hiện tại và kết quả sau áp dụng: [báo cáo bản sửa](../scheduling-fix/README.md). Các số liệu/bảng bên dưới ghi lại thời điểm audit, không phải main hiện tại.

## File đã sửa

| File | Thay đổi |
| --- | --- |
| `server/supabase.cjs` | Request không refresh chỉ cập nhật last_seen, không làm mất token được refresh đồng thời |
| `scripts/build.cjs` | Đọc nguồn trước, tạo lại output public từ whitelist, loại file thừa |
| `scripts/provision.cjs` | Preflight trước side effect, testable entrypoint, sử dụng writer nguyên tử, clone seed gốc |
| `tests/backend/live.cjs` | Bổ sung yêu cầu ủy quyền staging và xác nhận đúng project URL trước kết nối |
| `package.json` | Pin Node 24.x, thêm test:audit/test:scheduling-red và mở rộng lệnh live có guard |
| `.env.example` | Placeholder/cờ live read/write và URL dự án/API mong đợi; không có secret thật |
| `.gitignore`, `.vercelignore` | Bỏ cache pnpm; không upload proposal vào deploy |
| `README.md` | Phân biệt demo chung/dự án mới, runtime, lệnh test và báo cáo audit mới |
| `docs/OPERATIONS.md` | Atomic credential writes, canonical path, preflight và liên kết operator checklist |

## File mới

- `scripts/provision-lib.cjs`: validate manifest/identity mapping và ghi credential an toàn.
- `scripts/check-supabase.sql`: kiểm tra read-only sau migration, không thay database.
- `proposals/scheduling-registration-hours/README.md`, `registration-hours.patch`, `load-proposal.cjs`, `eligibility.regression.cjs`: đề xuất chưa áp dụng, loader cách ly và regression đỏ/xanh.
- `tests/audit/build.test.cjs`, `contracts.test.cjs`, `entrypoint.test.cjs`, `live-gate.test.cjs`, `provision.test.cjs`, `scheduling-proposal.test.cjs`, `session-race.test.cjs`: 22 kiểm thử audit.
- `tests/audit/live-gate.cjs`, `live-api.cjs`: guard và test cloud chỉ chạy với ủy quyền rõ ràng.
- `docs/audit/READINESS.md`, `RESULTS.md`, `SUPABASE-SETUP.md`, `BPMN-REVIEW.md`, `FILES.md`: báo cáo và hướng dẫn.
- `docs/audit/bpmn-extract.json`, `unchanged-baseline.json`: bằng chứng đọc sơ đồ và hash các file được giữ nguyên.

## Giữ nguyên

`app.js`, `index.html`, `style.css`, `shared/domain.js`, `scripts/demo-data.json`, hai migration SQL, `server/handler.cjs`, `server/workflows.cjs`, `server/validation.cjs`, `api/[route].js`, `vercel.json`.

Ảnh/log/build output là artifact được Git ignore. Không tạo `.env`, credential thật, commit/PR, migration cloud hoặc deployment. Không merge/apply patch thuật toán; chỉ chạy `git apply --check`.
