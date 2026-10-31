# Audit workflow 2CE ↔ BPMN TO-BE ↔ checklist MIS3047

Ngày audit: 31/10/2026. Phạm vi: đọc sơ đồ/source, phân tích demo trên bản sao trong bộ nhớ; không sửa implementation, migration, UI, thuật toán hoặc dữ liệu lưu trữ; không gọi Supabase/Vercel/cloud. File báo cáo này là tài liệu mới duy nhất của audit.

## 1. Kết luận và mức độ bằng chứng

**Chưa thể xác nhận ứng dụng tuân thủ đầy đủ BPMN/MIS3047.** Luồng chính đã có đăng ký, xếp ca, bổ sung, phát hành, xin đổi/nghỉ và xét duyệt; nhưng sơ đồ chưa có bản chuẩn duy nhất, chỉ có hai vai trò nghiệp vụ và chưa thể hiện ba workflow phê duyệt/từ chối hoàn chỉnh.

Các lỗi xác nhận bằng source/tái hiện độc lập:

1. Bổ sung ca có thể vượt quota của bộ phận đã đủ người.
2. Duyệt nghỉ/đổi có thể tự phân công người chưa đăng ký ca, rồi thêm đăng ký thay cho họ.
3. Một số thông báo sau duyệt khẳng định đã đủ người hoặc đã mở bổ sung mà không kiểm tra/thực hiện trạng thái tương ứng.

Các khoảng trống kiểm soát đã xác nhận, nhưng **quy tắc sửa phải được duyệt**: Manager có thể nhảy bước, phát hành lịch hoàn toàn trống với xác nhận thiếu, và xếp ca cho người chưa bấm gửi đăng ký. Không coi việc kiểm thử hiện đang chấp nhận các hành vi này là bằng chứng chúng đúng nghiệp vụ.

Demo được tính lại: **73 đăng ký → 65 phân công; 0 người bị loại; 7 người dưới mục tiêu; 18/21 ca đủ định biên tối thiểu.** Không thể giúp tất cả 18 người đạt 20 giờ bằng dữ liệu đăng ký và quota hiện có. Việc 7 người thiếu mục tiêu không phải sự tái diễn của lỗi eligibility đã sửa.

Phân biệt bằng chứng:

- **Xác nhận:** đọc XML/source hoặc tái hiện bằng hàm hiện tại trên bản sao dữ liệu.
- **Một phần:** chức năng có nhưng thiếu bước/bằng chứng nghiệp vụ.
- **Chưa rõ:** sơ đồ khác phiên bản, thiếu điều kiện hoặc connector; cần chủ quy trình quyết định.
- Checklist MIS3047 dùng đúng các tiêu chí trong yêu cầu hiện tại. Không tìm thấy rubric MIS3047 chính thức riêng trong repository; đây không phải chứng nhận đáp ứng toàn bộ học phần.

## 2. Kiểm kê và giới hạn của BPMN

Nguồn sơ đồ duy nhất trong project: [Xếp ca 2CE TO-BE](</Users/elvyx/Downloads/QLQTKD/Xếp ca 2CE TO-BE>). Đây là XML diagrams.net, không phải file BPMN 2.0 thực thi. XML đọc được toàn bộ bốn trang. Các tài liệu dẫn xuất đã kiểm tra: [bpmn-extract.json](/Users/elvyx/Downloads/QLQTKD/docs/audit/bpmn-extract.json), [BPMN-REVIEW.md](/Users/elvyx/Downloads/QLQTKD/docs/audit/BPMN-REVIEW.md). Không tìm thấy sơ đồ BPMN/PDF/ảnh quy trình hoặc đặc tả MIS3047 khác trong project.

| Trang | Participants/lanes có tên | Gateways | Events và khác biệt đáng chú ý |
| --- | --- | --- | --- |
| `Trang-1` | Pool “Quy trình xếp ca hiện tại 2CE”; Quản lý, Nhân viên | 5 hình thoi ghi X; có cả gateway hợp luồng. Có hai gateway dấu + cho các kiểm tra song song | Start “Lập ca làm việc”, timer không ghi thời lượng, end không nhãn. Đây là hiện trạng AS-IS, không tự dùng làm chuẩn TO-BE |
| `TO-BE` | Pool “Quy trình xếp ca làm việc 2CE (To-Be)”; Quản lý, Nhân viên | 6 node `gwType=exclusive`: 4 phân nhánh, 2 hợp luồng | Start “Lập ca làm việc”, end “Kết thúc”; thiếu người → nhận bổ sung hoặc Quản lý “Nhận ca” → quay lại xếp ca |
| `Bản sao của TO-BE` | Pool không tên; Quản lý, Nhân viên | 6 exclusive: 4 phân nhánh, 2 hợp luồng | Thêm “Xác nhận nhân viên nhận ca” của Quản lý và hai boundary timer không có thời lượng |
| `Page-4` | Hai swimlane Quản lý, Nhân viên; không có pool nghiệp vụ có tên riêng | 6 exclusive: 3 phân nhánh, 3 hợp luồng; một gateway `outline=catching;symbol=multiple` không được tính thêm là XOR | Start “Lập ca làm việc”; end “Kết thúc” và một end ký hiệu terminate. Có message events, timer, nhãn thứ Bảy 07:00/chủ nhật 07:00 và timer “5h” |

`Trang-1` còn có một pool mẫu rời với “Lane 1/2/3”. Đây là template không có vai trò nghiệp vụ được đặt tên; **không tính thành ba người tham gia quy trình**. Data store “CSDL Lịch & Đăng ký” cũng không phải participant. Admin, Bếp, Phục vụ, Pha chế không phải các lane nghiệp vụ riêng trong sơ đồ được cung cấp.

### Hoạt động và luồng thực sự có trong sơ đồ

**Trang-1:** xác định số ca → xác định số nhân viên/ca → thông báo đăng ký → nhân viên đăng ký → timer/tổng hợp đăng ký → kiểm tra giờ, số ca tối thiểu, lịch nghỉ → phân bổ → kiểm tra đủ người. Thiếu thì tìm bổ sung rồi quay lại; đủ thì kiểm tra trùng lịch, điều chỉnh khi cần, gửi lịch. Nhân viên kiểm tra/phản hồi, Quản lý xem xét và điều chỉnh, gửi lịch thay đổi; theo dõi tuần và xử lý thay đổi đột xuất hoặc kết thúc. Một connector còn quay từ phân bổ về gateway hợp kiểm tra; ý nghĩa vòng này chưa rõ.

**TO-BE:** xác định số ca/số người → thông báo mở cổng → đăng ký web → kiểm tra → xếp ca → kiểm tra nhân sự → gửi lịch nếu đủ, hoặc thông báo thiếu. Nhánh bổ sung có nhận ca trên web và Quản lý nhận ca; cả hai quay về xếp ca. Sau nhận lịch: kiểm tra lịch → theo dõi tuần nếu không cần thay đổi, hoặc gửi yêu cầu → Quản lý xem xét → cập nhật → gửi ca làm → kết thúc. Thay đổi đột xuất trong tuần đi vào cùng bước gửi yêu cầu/xét duyệt.

**Bản sao:** giữ luồng trên, bổ sung bước Quản lý “Xác nhận nhân viên nhận ca” trước khi quay về xếp ca; timer tại đăng ký/bổ sung không ghi hạn.

**Page-4:** thêm các sự kiện gửi/nhận thông báo, nhận đăng ký, nhận yêu cầu thay đổi và nhận lịch mới; nêu các mốc giờ và cuộc đua thông điệp/timer khi tìm người bổ sung. Không suy ra chính xác một lịch tự động đầy đủ từ các nhãn này vì một số kết nối chưa gắn node đích.

### XOR, chấp thuận/từ chối và ngoại lệ

Trong trang `TO-BE`, bốn XOR phân nhánh xác định được qua kết nối và nhãn đứng gần nhánh:

| Gateway ID | Điều kiện hiển thị | Đường đi |
| --- | --- | --- |
| `uNgFl485DXKSy4K8R0aB-20` | Tất cả ca đủ / có ca thiếu nhân viên | Gửi lịch / gửi thông báo ca thiếu |
| `uNgFl485DXKSy4K8R0aB-38` | Có / không có nhân viên nhận ca | Nhân viên nhận bổ sung / Quản lý nhận ca; sau đó quay lại xếp ca |
| `0R5DkcErSB7WZhBkDf5F-2` | Có / không có nhu cầu thay đổi | Gửi yêu cầu qua gateway hợp / theo dõi và làm việc |
| `0R5DkcErSB7WZhBkDf5F-8` | Có / không có thay đổi đột xuất | Gửi yêu cầu qua gateway hợp / kết thúc |

Hai node `uNgFl485DXKSy4K8R0aB-33` và `uNgFl485DXKSy4K8R0aB-15` là gateway hợp luồng, không được tính là hai quyết định mới.

Sơ đồ có hoạt động “Xem xét duyệt đổi ca hoặc yêu cầu nghỉ đột xuất”, rồi một đường đi cập nhật/gửi lịch. **Không có XOR kết quả duyệt/từ chối hoặc đường trả đơn bị từ chối được gắn nhãn rõ.** Bước “Kiểm tra” đăng ký cũng không có nhánh không hợp lệ/trả lại rõ ràng. Bản sao có bước xác nhận nhận ca nhưng không có nhánh từ chối tương ứng. Không tự coi các bước đó là ba workflow duyệt/từ chối hoàn chỉnh.

Các ngoại lệ được vẽ: thiếu người, không có người nhận bổ sung, yêu cầu thay đổi lịch và nghỉ đột xuất; bản sao/Page-4 bổ sung timer. Không có đường xử lý lỗi mạng, database hay retry trong sơ đồ; các xử lý kỹ thuật của app là phần bổ sung triển khai.

### Giới hạn ngữ nghĩa

- Không có thông tin ký duyệt/chọn một trang làm chuẩn. Không mặc định `Page-4` là bản mới nhất chỉ vì nằm cuối.
- `TO-BE`/bản sao mỗi trang có một association tới CSDL thiếu source. `Page-4` có ba connector thiếu target: từ timer mở đầu, từ Quản lý nhận ca, và một nhánh gateway kiểm tra nhân sự. Các đường có điểm tọa độ nhưng không gắn node không đủ để khôi phục state machine chắc chắn.
- Nhiều điều kiện là text tự do cạnh đường, không phải biểu thức điều kiện của BPMN thực thi. Không suy ra deadline, default branch, hoặc phủ hết mọi trường hợp chỉ từ XML.
- `TO-BE` đặt “Xếp ca”, kiểm tra nhân sự và cập nhật lịch trong lane Nhân viên; code cho Manager khởi chạy và server thực thi. `Page-4` lại đặt xếp ca/cập nhật trong lane Quản lý. Đây là mâu thuẫn trách nhiệm giữa các bản, không phải bằng chứng phải cấp quyền xếp ca cho Employee.
- Annotation ghi sáng 1 người, chiều 1 người, tối 2–3 người; không nói là Pha chế riêng. Code có quota theo ba bộ phận, tổng sáng 1, chiều 2–3, tối 6–7. Không được tự diễn giải annotation là quota Pha chế để tuyên bố khớp.
- TO-BE ghi kiểm tra số ca tối thiểu nhưng không nêu rõ hai con số 20 giờ/2 tối. Hai số này có trong code và BUSINESS-RULES, được giữ nguyên trong audit.

## 3. Ma trận truy vết BPMN → code

Nguồn: [domain](/Users/elvyx/Downloads/QLQTKD/shared/domain.js), [workflow server](/Users/elvyx/Downloads/QLQTKD/server/workflows.cjs), [API handler](/Users/elvyx/Downloads/QLQTKD/server/handler.cjs), [frontend](/Users/elvyx/Downloads/QLQTKD/app.js), [migration lưu trữ](/Users/elvyx/Downloads/QLQTKD/supabase/migrations/202610310001_backend.sql).

Các action dưới đây dùng `POST /api/action`; `GET /api/workspace?week=...` đọc dữ liệu. “Role” là quyền app hiện tại; khác biệt lane được ghi ở cột cuối.

| BPMN activity | Function/API | Role | Hành vi hiện tại | Đối chiếu |
| --- | --- | --- | --- | --- |
| Xác định số ca và số nhân viên | `DAYS`, `SHIFT_CONFIGS`, `emptyState()` | Manager theo BPMN; cấu hình cố định trong app | 21 ca cố định, quota cố định; không có API thiết lập định biên mỗi tuần | Một phần; định biên annotation chưa khớp |
| Thông báo mở cổng đăng ký | `changeWeekStatus(1)` → `phase` | Manager | Đổi phase; nhân viên thấy trạng thái khi tải workspace | Một phần; không có sự kiện thông báo có lưu trạng thái nhận |
| Đăng ký ca trên web | `toggleEmployeeShift()` → `registration` | Employee, chỉ chính mình | Phase 1 thêm/hủy; kiểm tra bộ phận, chống trùng | Phù hợp chức năng chính |
| Kiểm tra đăng ký | `getEmployeeStats()`, `submit`, eligibility trong `runSchedulingAlgorithm()` | Employee gửi; server kiểm tra; Manager chạy xếp | Gửi cần ≥20h/≥2 tối; xếp dùng đăng ký, không dùng assignments vừa xóa | Phù hợp rule code; BPMN không nêu đủ số liệu và nhánh đăng ký sai |
| Nhận/tổng hợp đăng ký | `submit` → `registration_submissions` | Employee/server | Lưu `isSubmitted`; đăng ký chưa gửi vẫn được xét xếp; sửa sau gửi không reset cờ | Một phần; ý nghĩa “gửi/nhận đơn” chưa được cưỡng chế |
| Xếp ca | `triggerAutoScheduling()` → `generate` → `runSchedulingAlgorithm()` | Manager, server thực thi | Phase 1/2/3; cấm phase 4 hoặc còn đơn chờ; ưu tiên ít giờ, tie theo thứ tự đăng ký | Có; lane TO-BE/bản sao khác Page-4/code |
| Kiểm tra số nhân viên | `evaluateShiftStaffing()` | Server; UI đọc | Kiểm tra min theo bộ phận; không phát hiện vượt max | Một phần; min có, quota sơ đồ cần chốt |
| Gửi thông báo ca thiếu | Kết quả `generate`, render ca thiếu/overview | Manager/Employee nhận thông tin trong app | Tự chuyển phase 3 nếu thiếu; hiển thị 3 ca thiếu ở demo | Một phần; không có delivery/read receipt |
| Nhận/đăng ký ca bổ sung | `registration` ở phase 3 | Employee | Đăng ký là được assigned ngay nếu toàn ca còn thiếu | Sai quota bộ phận; không có bước chờ xác nhận của bản sao |
| Xác nhận nhân viên nhận ca — chỉ bản sao | Không có action tương ứng | Manager theo bản sao | Không có pending/approve/reject bổ sung; assigned ngay | Thiếu nếu chọn bản sao làm chuẩn |
| Quản lý “Nhận ca” khi không ai nhận | Chỉ có `acceptMissing` lúc `phase:4` | Manager | Không có bản ghi Manager được phân công ca, thời gian chờ, lý do hay người phụ trách từng ca thiếu | Thiếu bằng chứng thực hiện; xác nhận chung không tương đương nhận ca |
| Gửi/phát hành lịch | `phase:4` hoặc `generate` khi mọi ca đủ | Manager | Nếu thiếu, yêu cầu `acceptMissing:true`; nếu đủ, generate tự phát hành | Một phần; điều kiện đủ/thiếu có, nhưng có thể bỏ các hoạt động trước đó |
| Nhận lịch, kiểm tra, theo dõi tuần | `refreshWorkspace()`, render lịch, `GET workspace` | Employee, Manager | Đọc lịch theo tuần; Employee thấy dữ liệu của mình; không có xác nhận đã nhận/đã đọc | Một phần; draft cũng đọc được, cần chốt thời điểm “nhận lịch” |
| Gửi yêu cầu đổi/nghỉ | `submitChangeRequestForm()` → `request` | Employee, ca của mình | Chỉ phase 4, ca đang assigned, có lý do, không trùng đơn chờ; kiểm tra ca đích | Có; hai loại đơn đi chung bước xét duyệt |
| Xem xét duyệt yêu cầu | `approveChangeRequest()` / `rejectChangeRequest()` → `approve/reject` | Manager | Chỉ đơn chờ ở phase 4; kiểm tra lại nguồn/đích; ngăn duyệt lặp | Chức năng có; sơ đồ thiếu đường từ chối để đối chiếu đầy đủ |
| Cập nhật và gửi lịch mới | `approveChangeRequest()` trong domain, commit server, refresh UI | Manager phê duyệt; server thực thi | Đổi/nghỉ, tìm người thay/đổi chéo, lưu giao dịch; có thể thêm người chưa đăng ký | Lỗi phân công; lane thực thi cũng khác giữa các phiên bản |
| CSDL lịch và đăng ký | `workspace_snapshot`, `commit_workspace` | Server; Manager/Employee theo quyền đọc | Lưu tuần, phase, revision, đăng ký/phân công/đơn/lịch sử | Có cơ chế persistent; chưa kiểm chứng cloud trong audit này |
| Timer thứ Bảy/chủ nhật, 5h và boundary timers | Chưa có scheduler/deadline guard tương ứng | Chưa được hiện thực | Các bước điều khiển thủ công, `now` chỉ dùng ghi thời gian đơn | Thiếu nếu bản có timer được chọn làm chuẩn |
| Kết thúc | Không có phase đóng tuần riêng | Chưa rõ | Phase 4 vẫn cho đơn mới và Manager mở lại; không có event kết thúc được lưu | Chưa rõ: kết thúc một lượt xử lý hay đóng cả tuần? |

### Quyền thực tế

- **Manager:** phase/generate/approve/reject; đọc toàn workspace. Không có action tự đăng ký ca cho Manager.
- **Employee:** registration/submit/request cho `profile.employee_id`; chỉ thấy hồ sơ, đăng ký, phân công và đơn của mình cùng số liệu định biên tổng hợp.
- **Admin:** quản lý tài khoản tại `/api/admin`; không được đọc workspace hay điều khiển lịch qua API. Đây là vai trò quản trị ứng dụng, không phải vai trò nghiệp vụ thứ ba trong BPMN.
- Server xác thực profile active, whitelist payload và kiểm tra role; database kiểm tra role khi commit, RLS ngăn client ghi trực tiếp. Bộ phận là điều kiện kỹ năng đang được mô hình hóa; không có ma trận năng lực/chứng chỉ cá nhân riêng để kiểm chứng sâu hơn.

## 4. Chuyển bước và phát hành

Nguồn trực tiếp: [workflows.cjs:27](/Users/elvyx/Downloads/QLQTKD/server/workflows.cjs:27), [app.js:938](/Users/elvyx/Downloads/QLQTKD/app.js:938).

| Vấn đề | Kết luận từ BPMN | Code hiện tại | Đánh giá |
| --- | --- | --- | --- |
| Nhảy bước tùy ý | Không tìm thấy đường bỏ qua đăng ký/kiểm tra/xếp ca để phát hành. Nhưng cũng không có mapping phase 1–4 chính thức hoặc ma trận reopen | Manager đổi giữa bất kỳ hai phase khác nhau 1–4 | Khoảng trống kiểm soát đã xác nhận; quy tắc chuyển hợp lệ cần duyệt |
| Có bắt buộc đi qua cả 4 phase? | **Không thể kết luận bắt buộc.** Nhánh đủ người gửi lịch trực tiếp; bổ sung chỉ là nhánh thiếu | Generate đủ → 4, thiếu → 3 | Không nên áp máy móc 1→2→3→4 cho mọi lịch |
| Lịch 0 assignments | Không có nhánh riêng cho phép lịch trống; “Quản lý nhận ca” quay về xếp ca, không đi thẳng tới gửi lịch | Phase 1→4 với `acceptMissing:true` thành công dù 21 ca trống | Không có bằng chứng BPMN cho phép; đề xuất quyết định rõ cấm/ngoại lệ, chưa sửa |
| Lịch còn thiếu một phần | Sơ đồ đi qua thông báo, bổ sung, hoặc Quản lý nhận ca, rồi quay lại xếp/kiểm tra | Generate mở phase 3; Manager vẫn có thể phát hành thiếu bằng xác nhận chung | Có cảnh báo/xác nhận, thiếu bằng chứng hoàn tất xử lý ngoại lệ |
| Warning hay blocking? | Sơ đồ không quy định UI confirm, boolean chấp nhận, hoặc chính sách override | Thiếu + chưa xác nhận → 409 `CONFIRM_MISSING`; có xác nhận → phát hành | Hành vi xác nhận có thật; chưa chứng minh là đủ theo BPMN |
| Cá nhân thiếu 20h/2 tối | Không rõ đây chỉ là điều kiện đăng ký hay bảo đảm phân công | Không chặn phát hành theo mục tiêu cá nhân; chỉ xét min staffing của ca | Cần quyết định riêng; không tự hạ chuẩn |

### Prerequisite được server thực sự kiểm tra

| Thao tác/bước | Điều kiện hiện có | Điều kiện nghiệp vụ chưa chứng minh/không được kiểm tra |
| --- | --- | --- |
| Vào phase 1 | Manager, phase đích khác phase hiện tại | Hạn mở cổng; lý do reopen; tình trạng các đơn chờ |
| Vào phase 2 | Manager, phase đích khác hiện tại | Đóng/nhận đủ đơn, deadline, hoàn tất kiểm tra đăng ký |
| Vào phase 3 | Manager đổi phase; hoặc generate còn thiếu | Bắt buộc đã xếp trước đó; deadline bổ sung |
| Generate | Manager, phase không phải 4, không có đơn chờ | Không bắt buộc phase 2; không bắt buộc `isSubmitted`; không lưu event hoàn tất xếp độc lập |
| Vào phase 4 | Manager; nếu ca thiếu thì phải `acceptMissing:true`; hoặc generate mọi ca đủ min | Không kiểm tra lịch khác rỗng, đã xếp, đã bổ sung, đã có người nhận trách nhiệm, đủ mục tiêu cá nhân hoặc đã giải quyết hết đơn chờ qua đường `phase` |
| Gửi đơn | Employee, phase 4, sở hữu assignment, lý do/ca đích hợp lệ, chưa có đơn chờ cùng ca | Cutoff, ảnh hưởng mục tiêu giờ/tối của người liên quan |
| Xét đơn | Manager, phase 4, đơn chờ, assignment nguồn còn tồn tại, ca đích phù hợp | Người thay đã đăng ký/đồng ý, quota max sau thay đổi, hậu kiểm toàn bộ mục tiêu và staffing |

Đổi phase khi còn đơn chờ có thể tạm làm không xét được đơn vì approve/reject chỉ chạy ở phase 4. Manager có thể quay về 4 để xử lý; đây là đường vòng có thể phục hồi, không kết luận là deadlock vĩnh viễn.

Tuần chưa có dữ liệu mặc định trả về phase 2 (`emptyState`, default của `weekly_schedules` và `workspace_snapshot`). Vì vậy chỉ nhìn phase 2 không chứng minh phase 1/đợt đăng ký đã thực sự diễn ra. Cần chốt riêng trạng thái khởi tạo tuần trong mapping BPMN.

## 5. Bảy nhân viên dưới mục tiêu

Nguồn: [demo-data.json](/Users/elvyx/Downloads/QLQTKD/scripts/demo-data.json), [employees.cjs](/Users/elvyx/Downloads/QLQTKD/server/employees.cjs), [domain.js:128](/Users/elvyx/Downloads/QLQTKD/shared/domain.js:128). Chạy hàm hiện tại trên bản sao demo ở phase 2. Giữ nguyên 20h/2 tối, quota, đăng ký, thứ tự ngày và ca.

“Thiếu giờ” dưới đây là khoảng cách tới 20h; không có nghĩa luôn có thể bù bằng một ca dài đúng số giờ đó.

| ID | Bộ phận | Giờ đăng ký | Tối đăng ký | Giờ phân công | Tối phân công | Thiếu yêu cầu | Đăng ký không được xếp và nguyên nhân trực tiếp |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| NV01 | Bếp | 22 | 3 | 16 | 2 | 4h; đủ tối | Tối thứ Bảy: quota Bếp 2 đã dành cho NV04/NV03; trước ca họ có 8h/10h, NV01 có 16h |
| NV03 | Bếp | 22 | 3 | 16 | 2 | 4h; đủ tối | Tối Chủ nhật: quota 2 dành cho NV06/NV05, đang có 10h/12h; NV03 đang có 16h |
| NV04 | Bếp | 20 | 2 | 14 | 1 | 6h và 1 tối | Tối Chủ nhật: cùng quota với NV03; NV04 đang có 14h, cao hơn hai người được chọn |
| NV05 | Bếp | 22 | 3 | 18 | 3 | 2h; đủ tối | Chiều thứ Hai: chỉ 1 Bếp; NV01 và NV05 đều 0h, tie giữ thứ tự đăng ký nên NV01 được chọn |
| NV06 | Bếp | 20 | 2 | 16 | 2 | 4h; đủ tối | Chiều thứ Ba: chỉ 1 Bếp; NV03 và NV06 đều 0h, tie theo thứ tự đăng ký chọn NV03 |
| NV17 | Pha chế | 20 | 2 | 16 | 2 | 4h; đủ tối | Sáng thứ Hai: chỉ 1 Pha chế; NV10 và NV17 đều 0h, tie theo thứ tự đăng ký chọn NV10 |
| NV18 | Pha chế | 20 | 2 | 16 | 2 | 4h; đủ tối | Sáng thứ Ba: chỉ 1 Pha chế; NV10 có 4h, NV18 có 6h nên NV10 được ưu tiên |

Còn một đăng ký bị bỏ của NV02 ở chiều thứ Bảy: NV06 có 6h được chọn thay NV02 có 16h; NV02 vẫn kết thúc với 20h/2 tối. Tổng cộng 8 đăng ký không được phân công giải thích đúng chênh lệch 73−65.

### Phân loại nguyên nhân

- **Đăng ký không đủ điều kiện cá nhân:** không có trong 7 người; cả 18 nhân viên đều đăng ký ≥20h và ≥2 tối, không ai bị loại sai.
- **Không sẵn sàng/xung đột:** demo không chứa lịch bận/nghỉ độc lập. Không có bằng chứng 7 trường hợp bị loại do xung đột; các ca bị bỏ đều do quota. Thuật toán chính không có kiểm tra cấm mọi trường hợp hai ca/ngày; không tự thêm ràng buộc đó khi phân tích.
- **Bộ phận/kỹ năng:** các đăng ký trên đều đúng bộ phận. Tuy nhiên, chỗ trống của Phục vụ không thể bù bằng nhân viên Bếp/Pha chế nếu giữ kỹ năng hiện tại.
- **Quota và phân bố đăng ký:** là giới hạn có thật, không giải được chỉ bằng chạy lại thuật toán.
- **Giới hạn thuật toán:** xét ngày thứ Hai→Chủ nhật, trong ngày tối→chiều→sáng; ưu tiên số giờ đã xếp thấp, tie giữ thứ tự đăng ký. Không nhìn trước số cơ hội còn lại, không tối ưu số người đạt 20h/2 tối, và không có hậu xử lý hoán đổi. Điều này ảnh hưởng người nào chịu thiếu; chưa đủ cơ sở gọi mọi shortfall là bug thuật toán.

### Chứng minh giới hạn sức chứa

| Bộ phận | Số người | Nhu cầu để tất cả đạt 20h | Giờ tối đa từ đăng ký hiện có, giữ quota | Hệ quả |
| --- | ---: | ---: | ---: | --- |
| Bếp | 6 | 120h | 100h | Thiếu ít nhất 20h trong nhóm, dù đổi thứ tự phân công |
| Phục vụ | 3 | 60h | 72h | Có giờ vượt 20h, nhưng không chuyển được sang bộ phận khác |
| Pha chế | 9 | 180h | 172h | Thiếu ít nhất 8h trong nhóm |

Bếp có tối đa 7 suất chiều ×4h +12 suất tối có người đăng ký ×6h =100h. Tối thứ Hai và thứ Năm mỗi ca chỉ có một Bếp đăng ký, dù quota tối cần hai.

Pha chế có tổng 180h đăng ký, nhưng sáng thứ Hai và thứ Ba mỗi ca có hai người tranh một suất: phải bỏ ít nhất 2×4h, nên còn tối đa 172h. Không có suất đăng ký nào khác có thể thêm vượt mức đó mà không vượt quota.

Kiểm tra bổ sung trong bộ nhớ duyệt **576 tổ hợp chọn người**, giữ nguyên người đăng ký, bộ phận và quota mỗi ca: tối đa 15/18 người có thể đồng thời đạt cả hai mục tiêu; hiện tại là 11/18. Đây chỉ là so sánh theo số người đạt chuẩn, **không phải phương án công bằng hơn hoặc thuật toán được đề xuất áp dụng**: các tổ hợp đó có thể dồn thiếu giờ nặng vào ít người. Không áp bất kỳ tổ hợp nào vào dữ liệu thật.

Ví dụ trade-off cần hiểu đúng: chuyển sáng thứ Ba từ NV10 sang NV18 giúp NV18 lên 20h nhưng NV10 xuống 16h. Không phải cải thiện giúp cả hai cùng đạt chuẩn.

### Ba ca còn thiếu nhân sự

| Ca | Bộ phận thiếu | Đủ ứng viên trong đăng ký hiện tại? |
| --- | --- | --- |
| Tối thứ Hai (`mon-eve`) | 1 Bếp | Không; chỉ một Bếp đăng ký |
| Tối thứ Năm (`thu-eve`) | 1 Bếp, 1 Phục vụ | Không; mỗi bộ phận chỉ một người đăng ký |
| Tối thứ Sáu (`fri-eve`) | 1 Phục vụ | Không; chỉ một Phục vụ đăng ký |

Đây là 3 ca thiếu, tổng 4 vị trí thiếu. Xếp lại cùng đăng ký không thể tự tạo thêm người hợp lệ cho các vị trí này. Cần nhân viên chủ động đăng ký thêm hoặc phương án nghiệp vụ được duyệt; không tự gán ca chưa đăng ký.

## 6. Checklist MIS3047

| Tiêu chí được yêu cầu | BPMN | Implementation | Kết luận audit |
| --- | --- | --- | --- |
| ≥3 vai trò quy trình nghiệp vụ | Chỉ Quản lý và Nhân viên | Có Manager/Employee/Admin, nhưng Admin quản trị tài khoản | **Chưa đạt bằng chứng ba vai trò nghiệp vụ** |
| ≥3 XOR decision gateways | TO-BE và bản sao có 4 XOR phân nhánh thực sự; không tính hai merge thành quyết định | Có các điều kiện staffing, thay đổi/nghỉ, bổ sung và validation | **Đạt về số gateway của sơ đồ**; tính nhất quán/ngữ nghĩa vẫn cần chuẩn hóa |
| ≥3 workflow duyệt/từ chối | Một hoạt động xét duyệt gộp đổi/nghỉ, không có nhánh reject rõ; bản sao thêm xác nhận nhận ca nhưng không có reject | Hai loại đơn đổi/nghỉ dùng chung cơ chế approve/reject. Bổ sung assigned ngay; quản trị tài khoản là CRUD | **Chưa chứng minh đạt**. Không tính kiểm tra đăng ký hoặc phát hành lịch là workflow duyệt thứ ba khi chưa có mô hình đó |
| Persistent workflow state | Có CSDL lịch/đăng ký | PostgreSQL lưu phase, revision, registrations, assignments, submissions, requests, approval history | **Có ở source/schema và bằng chứng local trước đó**; không xác nhận trạng thái cloud |
| Role-based permissions | Hai lane có tên, trách nhiệm một số task mâu thuẫn giữa trang | Server/RPC/RLS tách quyền; ownership Employee; Admin không điều khiển lịch | **Đạt ở quyền API đã kiểm tra**, còn cần chốt lane chủ trì task |
| Traceable user actions | Không mô hình chi tiết audit | Audit actor/request/action/week/fingerprint/result/time; approval_history lưu người duyệt/kết quả/thời gian | **Có nhưng một phần**: không có snapshot trước/sau đầy đủ hay provenance có cấu trúc cho người thay tự chọn; lỗi bị từ chối trước commit không vào audit_logs |
| Exception handling | Thiếu người, bổ sung, Quản lý nhận ca, đổi/nghỉ; timers ở một số bản | 4xx/5xx an toàn, revision conflict, UUID idempotency, khóa tuần/transaction, duplicate-request guard, cảnh báo thiếu | **Một phần**: thiếu deadline, nhận ca của Manager, xác nhận bổ sung; lỗi quota/phân công và thông báo sau duyệt cần xử lý |

Không coi ba bộ phận của Employee là ba role độc lập; không coi data store/hệ thống tự động là một business participant được vẽ nếu sơ đồ không có lane đó. Việc tách hai loại đơn thành hai workflow riêng để chấm điểm cũng cần người phụ trách môn xác nhận.

### Persistence và khả năng truy vết: giới hạn thực tế

Migration tạo các bảng `weekly_schedules`, `shifts`, `shift_registrations`, `shift_assignments`, `registration_submissions`, `change_requests`, `approval_history`, `audit_logs`. `commit_workspace` khóa tuần, kiểm tra revision/idempotency, lưu các thay đổi và audit cùng giao dịch. Client không được ghi trực tiếp.

Tuy nhiên registrations/assignments được xóa và chèn lại khi commit. Audit kết quả có details về phase/shift/request, và thông điệp sau duyệt, nhưng không lưu một diff phân công đầy đủ có cấu trúc. Do đó xác định ai đã bấm gì là có; tái dựng chính xác mọi phiên bản lịch và chứng minh ai đã chủ động đăng ký một ca được thêm bởi người thay tự động thì chưa đầy đủ.

Không chạy migration hoặc kiểm tra live trong audit này. Kết quả local trước đây dùng PostgreSQL/PGlite và giả lập identity provider, không thay thế kiểm chứng Supabase triển khai thật.

## 7. Lỗi xác nhận và khoảng trống cần phân biệt

### Lỗi xác nhận

| ID | Mức ưu tiên | Bằng chứng | Ảnh hưởng | Đề xuất tối thiểu, chưa áp dụng |
| --- | --- | --- | --- | --- |
| D1 | P1 | [workflows.cjs:49](/Users/elvyx/Downloads/QLQTKD/server/workflows.cjs:49): chiều thứ Hai assigned `NV01` Bếp, thiếu Pha chế; NV02 Bếp đăng ký bổ sung được, resulting Bếp=2 dù max=1 | Vượt quota bộ phận, có thể vẫn thiếu bộ phận khác | Khi bổ sung kiểm tra đúng bộ phận còn thiếu và max ngay trước commit; giữ cơ chế revision hiện có |
| D2 | P1 | [domain.js:233](/Users/elvyx/Downloads/QLQTKD/shared/domain.js:233), [domain.js:277](/Users/elvyx/Downloads/QLQTKD/shared/domain.js:277): duyệt NV01 nghỉ chiều thứ Hai tự chọn NV03; NV03 không đăng ký ca này trước duyệt nhưng được thêm cả assigned và registered | Gán ca không có đăng ký/đồng ý, làm thay đổi bằng chứng đăng ký; đổi chéo cũng có thể chuyển người thứ hai không có yêu cầu riêng | Chỉ chọn người thay đã chủ động đăng ký ca nguồn; không tạo đăng ký thay họ. Nếu không có, trả tình trạng thiếu cần xử lý. Đổi chéo cần điều kiện chấp thuận của người thứ hai được duyệt nghiệp vụ |
| D3 | P2 | [domain.js:247](/Users/elvyx/Downloads/QLQTKD/shared/domain.js:247), [domain.js:289](/Users/elvyx/Downloads/QLQTKD/shared/domain.js:289): thông báo “cả 2 ca đều đủ”/“ca làm vẫn đủ” không kiểm tra staffing; [domain.js:291](/Users/elvyx/Downloads/QLQTKD/shared/domain.js:291) nói “mở bổ sung” nhưng phase vẫn 4 | Người dùng có thể hiểu nhầm mức staffing và cổng đăng ký đang mở | Tạo thông báo từ `evaluateShiftStaffing` của các ca bị ảnh hưởng; chỉ nói đã mở khi trạng thái thực sự mở. Không tự đổi quy tắc phase trong bản sửa thông báo |

### Khoảng trống xác nhận nhưng chưa chốt quy tắc sửa

- **G1:** Manager nhảy phase và phát hành lịch trống có xác nhận; không có bằng chứng hoàn tất các task bắt buộc.
- **G2:** `isSubmitted` không quyết định ứng viên; sửa đăng ký sau gửi không reset cờ. Cần chốt “gửi” là cam kết nộp đơn hay chỉ dấu UI.
- **G3:** Không lưu người phụ trách/assignment của Manager cho từng ca thiếu; `acceptMissing` là boolean, không phải thực hiện bước “Nhận ca”.
- **G4:** Không có workflow Manager xác nhận bổ sung như bản sao; không có deadline/timer như Page-4.
- **G5:** Thiếu vai trò nghiệp vụ thứ ba và workflow duyệt/từ chối thứ ba được định nghĩa đầy đủ theo checklist.
- **G6:** Kiểm tra min staffing không kiểm tra max; luồng đổi không hậu kiểm tất cả mục tiêu/ca sau thay đổi. Không được coi duyệt xong là tự động thỏa mọi ràng buộc. Việc thiếu validator riêng ở swap chưa đủ chứng minh chính nhánh swap làm vượt max: đổi chéo cùng bộ phận thường giữ nguyên số người bộ phận đó. Tái hiện vượt max đã xác nhận ở D1 thuộc luồng bổ sung.

Không đánh dấu lỗi eligibility cũ là lỗi còn tồn tại. Không khẳng định 7 shortfalls đều là bug, hoặc giả định Manager có quyền nhận mọi ca thay cho nhân viên khi chưa có định biên/khả năng được mô hình hóa.

## 8. Các quyết định nghiệp vụ cần duyệt

1. Trang nào là TO-BE chuẩn? Giải quyết task ở lane Nhân viên so với lane Quản lý; nối rõ connector và các nhánh từ chối.
2. Annotation quota là toàn ca hay riêng bộ phận? Nếu toàn ca, code hiện khác sơ đồ; giữ nguyên quota hiện tại cho tới khi duyệt.
3. Mapping chính thức giữa task và phase 1–4; prerequisite nào bắt buộc; trường hợp đủ người có thể đi thẳng phát hành; quyền reopen và cách xử lý đơn chờ.
4. Lịch hoàn toàn trống có bao giờ hợp lệ? Nếu ngoại lệ, ai thực sự làm từng ca và bằng chứng nào cần lưu? Boolean chấp nhận có đủ không?
5. Thiếu một phần thì phải bổ sung trong bao lâu, có bắt buộc Manager nhận ca, warning/confirm/block theo điều kiện nào?
6. ≥20h/≥2 tối là điều kiện đăng ký hay bảo đảm phân công? Nếu dữ liệu không khả thi, quy trình xử lý ra sao mà không hạ chuẩn và không tự gán ca?
7. Đã bấm gửi mới được xếp hay mọi lựa chọn đang lưu đều có hiệu lực? Sửa sau gửi có phải gửi lại?
8. Nhận bổ sung là assigned ngay hay phải Manager xác nhận? Có đường từ chối/đăng ký lại nào?
9. Người bị đổi chéo phải đồng ý riêng không; người thay được chọn trong tập đăng ký nào; kiểm tra tác động giờ/tối và quota ở mức cảnh báo hay chặn?
10. Có thực thi thứ Bảy/chủ nhật 07:00 và chờ 5h không; timezone, tuần được lập, thứ tự mở/đóng cụ thể? Không suy ra lịch vận hành chỉ từ nhãn.
11. “Gửi/nhận” cần thông báo trong app hay gửi chủ động, có lưu delivery/read receipt không? Kết thúc là kết thúc một đơn, một lần xử lý hay khóa tuần?
12. Ba business roles và ba approval/rejection workflows phải thuộc chính quy trình này hay được tính trên nhiều quy trình của hệ thống theo rubric môn? Chưa dùng Admin/CRUD để thay cho bằng chứng đó.

## 9. Khuyến nghị theo thứ tự và giới hạn thay đổi

| Thứ tự | Việc đề xuất | Thay đổi tối thiểu sau khi được duyệt | Kiểm tra chấp nhận cần bổ sung |
| --- | --- | --- | --- |
| 1 — P1 | Xử lý D1/D2, giữ nguyên thuật toán xếp ca | Guard bổ sung theo bộ phận; giới hạn người thay trong đăng ký hợp lệ, không tự thêm đăng ký; kiểm tra ảnh hưởng quota khi xét đổi | Ca thiếu Pha chế không nhận thêm Bếp; duyệt nghỉ không gán NV03 chưa đăng ký; người đổi chéo có điều kiện chấp thuận rõ; hai thao tác đồng thời không vượt quota |
| 2 — P1 | Chốt G1/G3 và chính sách phát hành | Một bảng transition/prerequisite ở server theo BPMN được duyệt; lưu lý do/người nhận trách nhiệm khi override nếu được phép. Khuyến nghị chặn lịch 0 assignments trừ ngoại lệ được định nghĩa rõ | Nhảy bước thiếu điều kiện bị từ chối; đủ người không bị ép đi qua bổ sung; lịch rỗng/thiếu dùng đúng chính sách đã duyệt; reopen không bỏ quên đơn chờ |
| 3 — P1 | Chuẩn hóa BPMN và bằng chứng MIS3047 | Chọn một bản chuẩn, thống nhất lanes/quotas, ghi nhánh approve/reject và vai trò thật. Chỉ bổ sung vai trò/workflow nếu nghiệp vụ thực sự có và được duyệt | Đếm ≥3 vai trò nghiệp vụ/≥3 workflow hoàn chỉnh trên phạm vi rubric đã xác nhận, có mapping tới quyền/API |
| 4 — P2 | Làm rõ submit/xác nhận bổ sung | Guard `isSubmitted` hoặc điều chỉnh ý nghĩa cờ theo quyết định; thêm pending-review bổ sung chỉ nếu chọn bản có bước này | Chưa gửi/sửa sau gửi/đăng ký bổ sung có kết quả đúng quy trình được duyệt |
| 5 — P2 | Sửa D3, tăng truy vết | Thông báo tính từ staffing thực tế; ghi diff/provenance người thay và lý do override có cấu trúc | Nội dung thông báo khớp trạng thái thực; truy được tác nhân và đăng ký gốc, không chỉ dựa vào thông điệp tự do |
| 6 — P2 | Timer/notifications khi bản chuẩn yêu cầu | Deadline guard/event và trạng thái thông báo tối thiểu theo thời gian đã duyệt | Trước/đúng/sau deadline, timeout bổ sung, gửi/nhận lỗi và retry |
| 7 — P3 | Cải thiện phân bổ sau một quyết định riêng | Trước hết báo cáo tính khả thi và cơ hội đăng ký bổ sung; đánh giá mục tiêu công bằng trước khi đề xuất thuật toán | Giữ ≥20h/≥2 tối, quota và quyền chọn ca; so sánh cả số người đạt chuẩn lẫn mức thiếu nặng nhất; kết quả deterministic |

Không có patch, migration hoặc thay đổi workflow/thuật toán nào được áp dụng trong audit. Dữ liệu 73 đăng ký không được sửa để tạo một kết quả đẹp hơn.

## 10. Kiểm chứng và giới hạn kết quả

Trong audit này đã chạy **14 kiểm tra assertion trên bản sao trong bộ nhớ, đều đạt**, gồm:

- 73 đăng ký/65 phân công/0 bị loại; danh sách đúng 7 người thiếu; tất cả đăng ký đủ eligibility.
- Phân công từ generate nằm trong đăng ký, không trùng, đúng bộ phận và không vượt quota.
- 10 lần chạy độc lập có cùng toàn bộ kết quả; 3 ca thiếu đúng như bảng, generate chuyển phase 3.
- Employee/Admin bị chặn action của Manager; phát hành thiếu chưa xác nhận bị chặn.
- Tái hiện hành vi hiện tại: nhảy 1→3, lịch trống 1→4 có xác nhận, xếp người chưa submit.
- Tái hiện lỗi quota bổ sung và chọn NV03 chưa đăng ký khi duyệt nghỉ.
- Kiểm tra lại trade-off NV10/NV18, tránh kết luận sai rằng chuyển một ca giúp cả hai đạt chuẩn.

Ngoài ra duyệt 576 tổ hợp trong bộ nhớ để phân tích giới hạn phân bổ. Không lưu hoặc áp các phân công thay thế.

**65 local tests và 17 browser checks** là kết quả đã ghi của lần sửa trước, tham chiếu [results.json](/Users/elvyx/Downloads/QLQTKD/docs/scheduling-fix/results.json); không báo là vừa chạy lại toàn bộ trong audit này. Không chạy build, provision, migration, browser mutation hoặc live tests. Các assertion tái hiện bug “đạt” nghĩa là xác nhận đúng hành vi quan sát, không có nghĩa hành vi đó đáp ứng nghiệp vụ.

Giới hạn còn lại: chưa có bản BPMN được chọn làm chuẩn; chưa có rubric MIS3047 ngoài checklist người dùng; chưa kiểm chứng cloud; chưa có lịch bận/kỹ năng cá nhân riêng; tính khả thi được tính theo đăng ký/quota hiện có, không bao gồm các ràng buộc nghiệp vụ chưa được mô hình hóa.
