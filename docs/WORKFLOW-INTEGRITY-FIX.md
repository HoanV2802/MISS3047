# Sửa lỗi integrity workflow 2CE — 31/10/2026

Đã xử lý D1/D2/D3 của audit. Không sửa BPMN, thuật toán xếp ca, UI, schema/migration, authentication hoặc tài nguyên cloud.

## Nguyên nhân và thay đổi

| Lỗi | Nguyên nhân | Bản sửa |
| --- | --- | --- |
| Vượt quota khi bổ sung | Chỉ kiểm tra thiếu toàn ca; Bếp vẫn được nhận khi chỉ thiếu Pha chế | `server/workflows.cjs` kiểm tra số người bộ phận so với max của `SHIFT_CONFIGS` trên snapshot server. Chặn bằng 409 và thông báo tiếng Việt khi hết suất |
| Tự phân công người chưa đăng ký | Approval cũ chọn người cùng bộ phận rảnh ngày rồi tự thêm cả assigned và registered; đổi chéo cũng không kiểm tra đăng ký của người thứ hai | `server/approvals.cjs` kiểm tra đăng ký có sẵn, bộ phận, điều kiện đăng ký 20h/2 tối, tình trạng có ca trong ngày và đơn chờ liên quan của người thay. Người xin đổi phải đăng ký ca đích. Không thêm registration trong approval. Hậu kiểm quota của cả nguồn/đích trước khi sửa state |
| Thông báo sai | Thông điệp tĩnh nói đủ người/mở bổ sung dù không đánh giá staffing hay đổi phase | Phản hồi riêng nghỉ/đổi/đổi chéo/không có người thay; trạng thái mỗi ca lấy từ `evaluateShiftStaffing` sau thay đổi. Không nói đã mở bổ sung khi phase vẫn 4 |

Approval thực tế được chuyển sang module server riêng. `shared/domain.js` giữ nguyên byte, bao gồm thuật toán và các helper lịch sử; helper `approveChangeRequest` cũ không còn được workflow API gọi. Giữ helper lịch sử để bảo toàn so sánh baseline không có nghĩa cho phép dùng lại nó làm đường ghi dữ liệu. Browser không có quyền commit state tự sửa.

Không tìm thấy quy tắc nghiệp vụ được duyệt cho phép tự gán nhân viên bất kỳ chưa đăng ký trong trường hợp khẩn cấp. Nhánh BPMN “Quản lý nhận ca” không định nghĩa quyền đó; bản sửa làm đúng yêu cầu ngăn tự phân công ngoài đăng ký. Xác nhận riêng của người đổi chéo vẫn là câu hỏi BPMN: hiện chỉ cho người đã đăng ký ca nguồn và đủ điều kiện tham gia luồng đổi chéo hiện có, không tạo một workflow phê duyệt mới.

Giữ thứ tự lựa chọn người thay trong danh sách hiện có. Không có người phù hợp thì đơn nghỉ vẫn có thể được duyệt và ca thiếu được báo rõ; không tự mở phase 3. Không áp điều kiện 20h/2 tối như cam kết phân công tối thiểu sau nghỉ; đây vẫn là câu hỏi chưa chốt của BPMN. Không thêm luật cấm hai ca/ngày vào thuật toán hoặc vào việc chọn ca đích của người chủ động xin đổi; kiểm tra rảnh ngày áp dụng cho người được tự động chọn làm người thay/đổi chéo.

## Tính đồng thời, lưu trữ và phản hồi

- Giữ nguyên handler, RPC, migrations và transaction. Handler đọc snapshot authoritative, kiểm tra revision, tính state trên bản sao, rồi `await backend.commit` trước khi trả 200.
- Khóa tuần và kiểm tra revision trong `commit_workspace` chỉ cho một kế hoạch từ cùng revision commit. Yêu cầu thua nhận 409; retry phải đọc lại capacity/eligibility mới.
- Request status, assignments, approval_history và audit_logs được lưu trong cùng transaction. Lỗi ghi approval_history được tiêm trong kiểm thử làm rollback toàn bộ.
- Kết quả lưu audit có thêm `reassignment` gồm replacementId, mutualSwap và staffing các ca bị ảnh hưởng. Không đổi schema hay xóa lịch sử cũ.
- UI hiện có chờ API rồi tải lại workspace, không optimistic-update assignments. Browser test xác nhận lỗi commit không hiện success dialog, request vẫn pending và tồn tại sau reload. Vì đường phản hồi đã đúng, không cần sửa app.js.

## File thay đổi chính xác

Production:

1. `server/workflows.cjs` — import helper; thêm guard quota bổ sung; chuyển approval sang server helper; giữ rejection và phase rules.
2. `server/approvals.cjs` — mới, capacity và approval an toàn, thông báo theo staffing thực tế.

Kiểm thử:

3. `tests/backend/workflow-integrity.test.cjs` — mới, 11 regression tests.
4. `tests/backend/browser.cjs` — thêm lỗi commit/không optimistic-success, từ chối swap chưa đăng ký; fixture swap hợp lệ có đăng ký sẵn trong database kiểm thử.
5. `tests/audit/approved-fix-scope.test.cjs` — kiểm tra hash baseline sau khi hoàn nguyên đúng các thay đổi workflow được phép trong bộ nhớ; tiếp tục bảo vệ UI/auth/schema/scheduling và các nhánh phase/request/reject.

Tài liệu:

6. `docs/BUSINESS-RULES.md` — cập nhật trạng thái sửa và đường approval authoritative.
7. `docs/WORKFLOW-INTEGRITY-FIX.md` — báo cáo này.

Bằng chứng kiểm thử tạo/cập nhật:

- `tests/backend/artifacts/workflow-integrity-local.txt` — mới.
- `tests/backend/artifacts/workflow-integrity-browser.txt` — mới.
- `tests/backend/artifacts/browser-results.json` — kết quả browser mới.
- `tests/backend/artifacts/manager-393.png`, `manager-768.png`, `manager-1440.png` — ảnh mới của ca kiểm thử; ảnh Employee/Admin được tạo lại nhưng hash không đổi.

Audit gốc `docs/audit/WORKFLOW-BPMN-2026-10-31.md` giữ nguyên để lưu bằng chứng trước sửa. Không có Git repository được cấu hình; không tạo commit/init repository.

## Kiểm thử đã chạy

Runtime Node 24.22.1 cục bộ.

| Lần chạy | Kết quả |
| --- | --- |
| Domain regression sau guard/approval ban đầu | 13 passed, 0 failed, 0 skipped |
| Integrity tests ban đầu | 9 passed, 0 failed, 0 skipped |
| Full backend + audit trước test cạnh tranh approval bổ sung | 74 passed, 0 failed, 0 skipped |
| Integrity tests sau thêm hai approvals cạnh tranh | 10 passed, 0 failed, 0 skipped |
| **Full backend + audit trên bản cuối**: `node --test tests/backend/*.test.cjs tests/audit/*.test.cjs` | **76 passed, 0 failed, 0 skipped** |
| Browser lần khởi chạy trong môi trường hạn chế | Không chạy được: `listen EPERM 127.0.0.1`; không tính là test pass |
| Browser với quyền chạy localhost/Chrome, chạy lại trên bản cuối: `node tests/backend/browser.cjs` | **19 checks passed, 0 failed, 0 browser runtime errors; 27 role/viewport combinations** |
| Live Supabase/production | Không chạy; không có kết luận về cloud |

11 tests mới kiểm tra:

1. Quota bộ phận, ca đầy, đăng ký trùng, ca sai, sai bộ phận và quyền đăng ký.
2. Người thay có đăng ký/đủ điều kiện; không tạo registration; đầu vào không bị sửa.
3. Không chọn người chưa đăng ký, bận cùng ngày, thiếu điều kiện hoặc có đơn nghỉ chờ liên quan.
4. Swap hợp lệ, ca đích chưa đăng ký bị chặn, thông báo thiếu theo thực tế.
5. Không chuyển người đổi chéo chưa đăng ký/bận; không vượt quota đích; thất bại không sửa input.
6. Reject giữ assignments, thông báo riêng và chặn xét lại đơn đã xử lý.
7. Không di chuyển người đổi chéo đang có đơn chờ trên ca họ rời đi.
8. Hai bổ sung tranh suất cuối: 200/409, retry/reload không vượt quota.
9. Approve/reject đồng thời: một quyết định, một approval_history, idempotent retry.
10. Lỗi database sau tính approval: HTTP 500 không có success message, rollback toàn bộ trạng thái/lịch sử.
11. Hai approvals tranh cùng người thay: một kế hoạch stale bị từ chối; sau đọc lại không phân công người thay hai ca cùng ngày.

Concurrency dùng hai request HTTP handler đồng thời với barrier ép đọc cùng revision; database PGlite thực thi migrations/RPC thật. Đây là chứng minh kiểm soát revision/transaction local, không phải load test đa máy chủ PostgreSQL production. Identity provider được giả lập; browser dùng ứng dụng/API thật với database local.

Existing tests tiếp tục kiểm tra ownership request, Admin/Manager/Employee, CSRF/RLS, stale writes, idempotency và persistence. Browser kiểm tra đăng ký/gửi/nghỉ/đổi/reject/reload, lỗi lưu và mất kết nối, mobile/tablet/desktop, thứ tự panel tablet và overflow.

Demo vẫn **73 registrations → 65 assignments, 0 bị loại sai, 7 người dưới mục tiêu**; kiểm thử deterministic và so allocation baseline tiếp tục đạt. SHA bảo vệ index.html/style.css/app.js, domain, authentication, migrations và seed đều đạt.

## Các quyết định chưa thay đổi

Manager nhảy bước; phát hành lịch trống có xác nhận; số vai trò/workflow; ý nghĩa submit; xác nhận riêng của người đổi chéo; guarantee phân công 20h/2 tối; timers; quản lý nhận ca thiếu; chiến lược tối ưu hóa đều tiếp tục chờ BPMN được duyệt.

UI vẫn cho gửi đề nghị đổi tới một số ca chưa đăng ký; approval nay từ chối rõ ràng thay vì tự tạo registration. Cải thiện danh sách lựa chọn trên UI có thể được xem xét riêng. Không bổ sung dữ liệu khả dụng/skills mới; chỉ dùng đăng ký, bộ phận, assignments và pending requests đã có. Chưa có cam kết rằng dữ liệu thiếu đăng ký sẽ đạt định biên sau duyệt nghỉ.

Thay đổi giới hạn ở workflow server/test/docs; không deploy, không migrate cloud, không sửa sơ đồ BPMN.
