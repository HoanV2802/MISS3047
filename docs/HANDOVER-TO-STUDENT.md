# Checklist bàn giao 2CE · 01/11/2026

## COMPLETED AND LOCALLY VERIFIED

- [x] Demo thử riêng Nhân viên, Quản lý, Admin. Đăng ký đủ 20 giờ và 2 ca tối, gửi, sửa nháp và gửi lại. Xếp tuần dùng bản đã gửi gần nhất.
- [x] Đơn bổ sung có chọn, bỏ chọn, gửi, rút, duyệt hoặc từ chối. Xếp lại giữ trước chỗ đã duyệt. Lệnh nghỉ/đổi hợp lệ có lịch sử quyết định. Xung đột hoặc lịch cũ cần xác nhận được báo rõ.
- [x] So ưu tiên theo giờ dưới mục tiêu, mốc gửi riêng từng ca và mã NV. Chạy tuần khác giữ dữ liệu tuần trước. Test giữ guard NV01 → NV03, RBAC và chống ghi đè.
- [x] Kiểm thử local và Chrome, gồm desktop/tablet/mobile. Admin offline chỉ đọc và báo lỗi khi thử lưu. Xem [tổng kết kỹ thuật](audit/2CE-FULL-SYSTEM-REVIEW.md).

## IMPLEMENTED BUT CLOUD NOT VERIFIED

- [ ] Xác minh Auth email/password qua số định danh, mapping UUID/profile, cookie HttpOnly, refresh, CSRF, giới hạn đăng nhập và thu hồi phiên với project của người nhận.
- [ ] Xác minh đủ năm phiên bản SQL, RLS với JWT thực, hai kết nối PostgreSQL tranh chấp đồng thời, lịch sử sau sao lưu/khôi phục và cấu hình Vercel Preview.
- [ ] Chứng minh quản trị thật (tạo/sửa/khóa/mở và liên kết NV) bằng tài khoản thử được cho phép. Dùng adapter offline không chứng minh Auth thật.

## REQUIRED SUPABASE/DEPLOYMENT SETUP

1. Clone theo [README](../README.md). Cài Node 24.x, pnpm 11.25.0 và chạy `pnpm install --frozen-lockfile`. Xem demo ngay bằng `pnpm run demo:offline`. Không cần Supabase cho bước này.
2. Nếu cần staging riêng: tạo project, copy .env.example sang .env, cấu hình key/URL/origin và mode staging-email. Bật Email/Password, tắt signup/Phone/anonymous. Preflight không xác nhận được cài đặt Dashboard.
3. Sau phê duyệt migration, dùng đúng thứ tự ở [runbook](SUPABASE-STAGING.md). Dừng ghi và sao lưu trước nâng cấp. Chỉ sau phê duyệt **riêng** mới provision và cân nhắc seed tuần trống. Không sao chép .env hoặc mật khẩu của người bàn giao.
4. Chạy `pnpm run dev`, thử/login/đăng xuất bằng danh tính đã cấp. Triển khai chỉ ở lần được phê duyệt riêng; dùng secret server, kiểm đăng nhập theo origin thật.

## BUSINESS/BPMN DECISIONS FOR THE STUDENT

- Xác nhận trang BPMN chuẩn, lane chịu trách nhiệm, nhánh từ chối và timer. Phân biệt hai vai trò nghiệp vụ với role Admin kỹ thuật.
- Chốt điều kiện phát hành thiếu/rỗng, ai chịu trách nhiệm khi thiếu người và thời hạn nhận đơn. Nêu đúng các luật gửi đơn, công bằng và giữ suất đã được triển khai; không dùng các câu hỏi mở cũ để mô tả hành vi hiện tại.
- Chuẩn bị minh chứng học phần từ lần demo của chính chủ dự án và rubric thật. Bàn giao này là phần mềm và kiểm thử kỹ thuật.

## KNOWN LIMITATIONS

- Demo chạy trong bộ nhớ. Khởi động lại máy chủ demo sẽ tạo lại dữ liệu mẫu. Chạy bản clone mới trong tiến trình riêng hoặc lưu kết quả trước khi dừng bản cũ.
- Không có trần giờ tuần, tự đóng theo deadline, bảng chấm công hay tính lương. Lịch sử theo tuần là phân công kế hoạch, không xác nhận giờ thực làm.
- Snapshot cũ không chứng minh được lần gửi sẽ yêu cầu xác nhận lại trước khi xếp lại. Ca bảo vệ mâu thuẫn phải đối soát có thẩm quyền. Mốc gửi cũ không biết giữ ở nhóm cũ và phân xử bằng mã NV.
- Auth user và profile không được tạo trong một giao dịch chung. Không xóa hoặc reset khi provisioning gặp lỗi. Lỗi mạng/409 cần tải lại để xem trạng thái đã lưu.
