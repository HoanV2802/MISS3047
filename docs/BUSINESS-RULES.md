# Quy tắc giữ nguyên và những thay đổi có chủ đích

## Thuật toán gốc

Các hàm lịch sử tính toán/xếp ca/duyệt nằm trong `shared/domain.js`. Chỉ `runSchedulingAlgorithm()` có một điều kiện eligibility được sửa theo phê duyệt; getEmployeeStats, isDeptAllowed, evaluateShiftStaffing, approveChangeRequest và rejectChangeRequest giữ nguyên. Kiểm thử so hash với bản audit gốc sau khi hoàn nguyên đúng một điều kiện trong bản sao để chứng minh không có thay đổi khác. Luồng duyệt thực tế hiện gọi server/approvals.cjs để kiểm tra đăng ký, điều kiện người thay và quota; không gọi approveChangeRequest lịch sử trong domain. Hàm lịch sử được giữ để so sánh, không phải đường ghi dữ liệu được API sử dụng. State thay đổi được server lưu giao dịch.

- 18 nhân viên và bộ phận không đổi.
- Sáng 09–13 (4h), chiều 13–17 (4h), tối 17–23 (6h).
- Đăng ký cần ít nhất 20h và 2 ca tối.
- Sáng chỉ Pha chế; chiều Bếp/Pha chế; tối cả ba bộ phận.
- Quota và thứ tự xét tối → chiều → sáng không đổi. Ưu tiên nhân viên đang được phân công ít giờ; tie giữ thứ tự đăng ký. Database lưu position riêng để không thay đổi tie-break.
- Duyệt đổi/nghỉ chỉ phân công người thay đã đăng ký ca, đủ điều kiện đăng ký 20h/2 tối, phù hợp bộ phận và rảnh ngày đó theo luật người thay hiện có; người đổi chéo cũng phải đăng ký ca nguồn. Không chọn người có đơn chờ liên quan. Ca đích của người xin đổi phải có đăng ký sẵn. Không tạo đăng ký thay người khác; không thêm luật cấm hai ca/ngày vào thuật toán xếp ca.
- Manager vẫn được chọn lại bất kỳ bước hợp lệ nào trong bốn bước, kể cả mở lại; không tự thay thành một quy trình chỉ tiến một chiều.
- Phát hành khi thiếu người vẫn được phép với xác nhận rõ ràng của Manager, kiểm tra lại trên server.

## Thay đổi để bảo vệ luồng hiện có

1. Mỗi tuần lưu dữ liệu độc lập. Bản trước chỉ đổi nhãn ngày trên cùng state; đây là thay đổi lưu trữ bắt buộc, có chủ đích.
2. Backend thực thi các điều kiện trước đây chỉ được UI thể hiện: chỉ Employee đăng ký cho mình, gửi đăng ký trong bước 1, gửi đơn cho ca được phân công khi lịch đã phát hành; chỉ Manager xếp/duyệt/phát hành.
3. Đơn đã duyệt/từ chối không được xét lần hai; không tạo hai đơn đang chờ cho cùng NV/ca/tuần. Ca đích được kiểm tra lại lúc duyệt để tránh dùng trạng thái cũ.
4. Không chạy xếp lại trên lịch đang phát hành hoặc còn đơn chờ. Manager phải xử lý đơn và mở lại bước trước; bảo vệ này ngăn xóa phân công đang được yêu cầu xét duyệt.
5. Yêu cầu UUID/revision, khóa tuần và transaction bổ sung an toàn đồng thời, không thay tiêu chí chọn ứng viên.
6. Cờ có đơn chờ được suy ra từ các đơn còn chờ, tránh xóa dấu chờ của người khác sau khi duyệt một đơn.

## Lỗi gốc và trạng thái xử lý

### Lỗi 1: xếp ca từ bước 2 trở lên loại toàn bộ nhân viên — ĐÃ SỬA THEO PHÊ DUYỆT

Tái hiện trước sửa: nhập dữ liệu đăng ký hợp lệ → ở bước 2 → bấm Xếp ca. Hàm đầu tiên xóa assignments. `getEmployeeStats()` tính theo assignments khi phase >= 2, vì vậy mọi người đều có 0h/0 ca tối và bị loại. Demo ban đầu phase=2 cũng có hành vi này.

Bản sửa đã được duyệt: thay đúng `if (!stats.isValid)` bằng `if (stats.regHours < 20 || stats.regEvening < 2)` trong runSchedulingAlgorithm. Không đổi getEmployeeStats hoặc mutation/workflow guards.

Regression trên main xác nhận 73 đăng ký tạo 65 phân công, 0 người bị loại ở bước 2; danh sách theo từng ca bằng kết quả engine gốc ở bước 1. Không sửa migration/seed JSON hoặc tự cập nhật dữ liệu đã lưu. Bản cũ chỉ được dựng trong bộ nhớ để chứng minh root cause. Xem [báo cáo áp dụng](scheduling-fix/README.md).

### Lỗi 2: bổ sung ca có thể vượt quota một bộ phận — ĐÃ SỬA

Tái hiện: ca chiều đã có một Bếp nhưng thiếu Pha chế → một Bếp khác chưa đăng ký bấm bổ sung. Logic gốc chỉ xét thiếu toàn ca và chuyên môn được phép, nên vẫn thêm Bếp thứ hai. Một số luồng đổi ca cũng không kiểm tra quota tối đa ở ca đích.

Server kiểm tra max quota bộ phận từ SHIFT_CONFIGS trên snapshot tin cậy trước khi bổ sung; xét duyệt kiểm tra quota của các ca sau thay đổi. Không thay schema hoặc giá trị quota. Revision và khóa tuần hiện có ngăn hai kế hoạch từ cùng phiên bản cùng commit. Xem WORKFLOW-INTEGRITY-FIX.md để biết kết quả kiểm thử và giới hạn còn lại.

### Hành vi gốc: isSubmitted chưa tham gia lọc ứng viên

Chọn đủ ca hợp lệ nhưng chưa bấm gửi → Manager chạy thuật toán từ bước 1: nhân viên vẫn có thể được xếp vì code gốc xét giờ/ca tối, không lọc isSubmitted. Cờ gửi đơn được lưu bền vững nhưng migration không tự thêm điều kiện lọc mới. Nếu quy trình yêu cầu bắt buộc phải gửi, cần thống nhất và sửa riêng, có kiểm thử bổ sung.
