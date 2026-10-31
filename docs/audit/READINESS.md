# Backend audit và mức sẵn sàng tích hợp — 31/10/2026

> Báo cáo lịch sử trước phê duyệt sửa eligibility. Trạng thái hiện tại và kết quả sau áp dụng: [báo cáo bản sửa](../scheduling-fix/README.md). Các số liệu/bảng bên dưới ghi lại thời điểm audit, không phải main hiện tại.

**Kết luận:** có thể chuyển sang cấu hình một Supabase demo riêng và kiểm thử staging có ủy quyền. Chưa đủ bằng chứng nghiệm thu hoặc triển khai production: chưa có kết nối Auth/PostgREST/Vercel thật, lỗi xếp ca main chưa được duyệt sửa và workflow có khoảng trống so với BPMN.

Không rebuild backend hoặc thiết kế lại UI. Không kết nối/migrate/seed/deploy cloud. Hai migration, dữ liệu demo, `shared/domain.js`, `app.js`, `index.html`, `style.css` giữ nguyên byte-for-byte; hash tại `unchanged-baseline.json` và bài kiểm thử audit xác nhận.

## Phát hiện ưu tiên

| Mức | Phát hiện | Tình trạng |
| --- | --- | --- |
| P1 | Engine ở phase >=2 xóa assignments rồi xét assigned hours: 73 đăng ký → 0 phân công, 18 bị loại | Tái hiện độc lập. Patch riêng một điều kiện cho 65 phân công, **chưa áp dụng** |
| P1 | Manager được nhảy bước hoặc phát hành lịch 21 ca trống khi acceptMissing=true | Xác minh bằng test. Không phù hợp rõ ràng với chuỗi kiểm tra/xếp ca trong sơ đồ; chờ chốt BPMN |
| P1 | Chưa có dự án/tài khoản/ủy quyền live, chưa kiểm tra Vercel routing/HTTPS thật | 4 bài live bị chặn và được báo skipped, không báo passed |
| P2 | Request không refresh có thể thắng CAS, khiến token mới từ request refresh không được lưu | Test đỏ tái hiện trước sửa; đã sửa request thường chỉ touch last_seen, CAS/revision dành cho token thực sự đổi; test xanh |
| P2 | Build không xóa file thừa public cũ, có thể phát hành artifact không nằm trong whitelist | Test đỏ trước sửa; đã rebuild riêng output public từ đúng 4 nguồn; test xanh |
| P2 | Provisioning truncate file credential trước khi ghi lại: lỗi/gián đoạn có thể mất các mật khẩu đã tạo | Đổi sang temp-file 0600 + sync + atomic rename trước mỗi Auth create. Có bài disk-failure/partial-profile/symlink tests |
| P2 | Preflight cũ kiểm tra seed week quá muộn và không xử lý rõ inactive/mismatched identities | Kiểm tra seed, toàn bộ mapping/Auth UUID và admin active trước khi tạo account/output; không reset/delete tự động |
| P2 | Thuật toán tham lam vẫn để 7 NV dưới chỉ tiêu phân công; bổ sung có thể vượt quota bộ phận; isSubmitted chưa lọc ứng viên | Hành vi gốc, không thuộc patch eligibility. Đã ghi tách biệt, không tự đổi luật |

## Các lớp đã rà soát

- **Auth/session:** password grant đúng endpoint; không mật khẩu mặc định; token mã hóa AES-GCM trong DB, cookie opaque HttpOnly; 12h absolute/30 phút idle, xác minh user/profile mỗi request, logout xóa session ứng dụng. Refresh race đã sửa cục bộ; provider refresh/multi-instance thật còn cần staging.
- **Authorization/ownership:** Admin chỉ account; Manager điều khiển lịch/duyệt; Employee chỉ hồ sơ/đăng ký/đơn của mình. Actor và employee ID lấy từ profile phía server, không từ request body. Có test sửa body, truy cập chéo, tự nâng role, replay và invalid state.
- **RLS/RPC:** 12 bảng có RLS, không public write. Bốn RPC đặc quyền bị revoke EXECUTE khỏi PUBLIC/anon/authenticated, chỉ service_role được gọi, search_path rỗng. Client không UPDATE profiles hay đọc web_sessions. Service key cố ý bypass RLS; quyền nghiệp vụ vẫn phải do API kiểm tra, không coi key đó là policy cho người dùng.
- **Transactions:** row lock theo tuần, expected revision, UUID/fingerprint và unique constraints chống ghi đè/duyệt lặp. Approval/assignment/history/audit được lưu nguyên tử; lỗi rollback. Test hai command cùng revision chỉ có một winner; PGlite không chứng minh tải nhiều kết nối cloud.
- **Errors/cookies/CSRF:** lỗi tiếng Việt và status phù hợp, không raw SQL/stack/key; upstream lỗi trả 503 và không xóa session còn hợp lệ. POST yêu cầu exact Origin, JSON + header riêng, SameSite Strict; HTTPS dùng Secure __Host cookie.
- **API keys:** publishable/secret mới dùng apikey, không giả chúng là JWT; legacy anon/service_role JWT cũng có nhánh hỗ trợ. Tài liệu/source contract đã đối chiếu, chưa phải live gateway proof.
- **Provisioning:** đúng 1 Admin, 1 Manager, NV01–NV18 từ hồ sơ gốc; phone normalized, phone_confirm:true, mật khẩu ngẫu nhiên, file ngoài repo và không log password. Nếu Auth thành công mà profile thất bại, không cấp quyền ứng dụng, giữ credential để operator phục hồi. Không thể gọi hai dịch vụ này thành một distributed transaction.
- **Deploy:** API CJS/runtime dependencies local/Node built-ins, Vercel includeFiles và outputDirectory được source-review. Pin Node 24.x thay vì range >=22, build sạch whitelist, env/proposals/store không public. Frozen-lock install offline và static build đã chạy; chưa chạy platform build/deploy thật.

## Lỗi xếp ca và provisioning

Xem [đề xuất độc lập](../../proposals/scheduling-registration-hours/README.md). Main hiện vẫn tạo 0 assignments/18 disqualified khi provisioning chạy engine ở phase 2; test provisioning xác nhận đúng ảnh hưởng đó. Không sửa dữ liệu seed để né lỗi. Nếu duyệt patch, những tuần được seed mới sẽ có 65 phân công; tuần đã lưu không tự sửa hoặc migrate.

## BPMN

Đã đọc cả bốn trang trong file diagrams.net gốc. [BPMN review](BPMN-REVIEW.md) trích node/đường đi và liệt kê quyết định còn thiếu. Thiếu người có nhánh Manager nhận ca, nhưng không đủ cơ sở kết luận quyền phát hành lịch hoàn toàn trống và bỏ các bước là đúng quy trình. Không áp rule transition mới trong audit.

## Mức xác minh

- PostgreSQL **17.5 qua PGlite**: cả hai migration theo thứ tự, RLS/grants/definer flags, constraints, atomic commit, state persistence và read-only verification script đã chạy.
- Auth/API cục bộ: dùng fixture network/identity có khai báo. Không suy diễn thành Supabase Auth thật đã chạy.
- Tài liệu chính thức: kiểm tra [Auth createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [admin source](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [signup config](https://supabase.com/docs/guides/auth/general-configuration), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Cấu hình project và phiên bản triển khai thật vẫn phải xác nhận.

## Hạn chế còn lại

Auth user + profile không nguyên tử giữa hai dịch vụ; bootstrap profile/audit cũng dùng các request riêng. Hai operator đồng thời vẫn có thể gặp orphan identity khi một profile không commit; preflight không thay thế xử lý lỗi. Không tự delete/reset để chữa. Role revocation/concurrency, refresh nhiều tab và runtime timeout/provider settings trên cloud cần nghiệm thu staging.

Chỉ sửa các lỗi ổn định đã xác minh, không thay đổi RPC schema hay business algorithm. Audit không phải pentest hoặc chứng nhận bảo mật. Danh sách file: [FILES.md](FILES.md). Kết quả cụ thể: [RESULTS.md](RESULTS.md). Các bước operator: [SUPABASE-SETUP.md](SUPABASE-SETUP.md).
