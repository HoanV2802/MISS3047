# Tài khoản demo, vận hành và khôi phục

> Quy tắc và thứ tự migration hiện hành: [báo cáo bàn giao](audit/2CE-FULL-SYSTEM-REVIEW.md) và [checklist](HANDOVER-TO-STUDENT.md). Mô tả trước bản submitted_plans bên dưới được giữ để đối chiếu lịch sử.


Staging không SMS sử dụng `docs/STAGING-EMAIL-AUTH.md`: email nội bộ HMAC + `email_confirm:true`, phone chỉ là identifier trong profile. Không đổi danh tính Auth/UUID của tài khoản đang tồn tại tự động; không gửi password reset qua email nội bộ. Mode phone legacy giữ thiết kế cũ.

## Tạo tài khoản trong môi trường tin cậy

Chỉ người vận hành có secret key Supabase mới chạy công cụ provisioning. Không chạy file này trong browser, không thêm secret key vào file frontend, build config public hoặc repo.

1. Sao chép `scripts/accounts.example.json` ra ngoài repo, thay 20 placeholder bằng số điện thoại E.164 do bạn kiểm soát. Không cần điền tên cho NV01–NV18; công cụ dùng hồ sơ gốc.
2. Tạo `.env` ở máy tin cậy theo README; kiểm tra dự án đích là dự án demo dành riêng.
3. Chạy `pnpm install --frozen-lockfile`, áp dụng cả hai migration, rồi:

```sh
node --env-file=.env scripts/provision.cjs \
  --manifest /private/2ce-accounts.json \
  --credentials-out /private/2ce-new-credentials.json \
  --bootstrap --seed-week 2026-10-26
```

Chọn đường dẫn riêng thực tế trên máy của bạn. File credential phải ở ngoài repo, chưa tồn tại. Script tạo quyền `0600`, không ghi đè file cũ, tự sinh mật khẩu 32 ký tự từ dữ liệu ngẫu nhiên và lưu trước mỗi lần tạo Auth account. Không in mật khẩu/token/key ra log. File được thay thế nguyên tử bằng bản tạm quyền 0600 và sync trước mỗi lần tạo Auth user, giữ bản đầy đủ trước đó nếu ghi/rename lỗi. Đường dẫn được kiểm tra qua realpath để chặn symlink dẫn vào repo. Preflight kiểm tra toàn bộ mapping, Auth UUID và admin active trước khi tạo account.

Audit/setup và giới hạn xác minh live: [docs/audit/SUPABASE-SETUP.md](audit/SUPABASE-SETUP.md). Nếu dừng giữa chừng, file có thể chứa mật khẩu đã chuẩn bị cho một tài khoản chưa tạo xong; kiểm tra trạng thái trước khi phân phối.

`--bootstrap` chỉ dùng cho dự án chưa có Admin. Những lần sau có thể bỏ cờ; script không reset mật khẩu hay thay mapping của tài khoản đã có. File credential của lần chạy sau chỉ chứa tài khoản mới, không chứa lại mật khẩu cũ.

`--seed-week` được kiểm tra trước khi tạo account/output; tuần đã có dữ liệu khiến công cụ dừng sớm. Công cụ nhập đúng các đăng ký demo gốc một lần cho tuần chưa có dữ liệu. Nó không xóa hay ghi đè tuần đã tồn tại. Dữ liệu demo khởi đầu ở bước 2. Sau bản sửa eligibility được duyệt, 73 đăng ký gốc tạo 65 phân công và không loại cả 18 nhân viên. Không cần đổi sang bước 1 để né lỗi. Tuần đã lưu không tự thay đổi; Manager phải chủ động chạy lại ở bước được phép. Không thực hiện provisioning/cloud trong nhiệm vụ áp dụng bản sửa này.

## Chia sẻ cho giảng viên

- Cấu hình backend đã triển khai kết nối dự án demo chung; frontend gọi API cùng domain.
- Chuyển thông tin đăng nhập qua trình quản lý mật khẩu hoặc kênh mã hóa riêng. Không đưa file credential vào repo, README, issue, PR, screenshot hay URL.
- Nếu giảng viên chạy clone bằng localhost, họ cần backend/env hợp lệ do người vận hành cấu hình riêng, hoặc một dự án demo riêng và chạy migration/provisioning. Không thể có tài khoản Supabase tạo sẵn chỉ bằng clone code.
- Không phát secret key của dự án chung như một phần tài liệu công khai. Nếu giao cả quyền vận hành môi trường cho giảng viên, chuyển secret qua kênh bảo mật và xoay sau đánh giá.

## Tạo/sửa tài khoản trong Admin UI

Admin có thể tạo người dùng, đổi vai trò hoặc khóa/mở tài khoản khác. Vai trò Employee yêu cầu một mã NV chưa được tài khoản khác sử dụng. Admin không được tự đổi quyền/khóa chính mình; database không cho loại bỏ Admin hoạt động cuối cùng. Khóa một tài khoản cũng xóa các session ứng dụng của tài khoản đó.

Mật khẩu tài khoản mới được gửi thẳng từ form qua HTTPS đến Auth API của server, không lưu trong profiles hoặc audit. Form chỉnh sửa không đổi số điện thoại/mật khẩu; những thao tác phục hồi danh tính cần công cụ Supabase Auth đáng tin cậy, có kiểm tra người sở hữu số điện thoại.

## Phục hồi lỗi tạo account/profile

Supabase Auth Admin API và giao dịch PostgreSQL không phải một giao dịch phân tán. Nếu Auth account tạo xong nhưng profile thất bại, user đó không được cấp quyền ứng dụng và không thể vào dashboard.

- Dừng và kiểm tra Auth Users, profiles và log phản hồi trên máy tin cậy; không in secret hoặc mật khẩu.
- Xác nhận phone, UUID và employee mapping. Giữ mật khẩu từ file riêng nếu dùng script provisioning.
- Với đúng Auth UUID đã tạo, một operator tin cậy có thể hoàn tất `manage_profile` bằng RPC service-role dưới actor Admin phù hợp; tham số được mô tả trong migration. Không thêm policy cho phép user tự tạo profile/role.
- Không tự động xóa Auth user để “sửa nhanh”, không reset mật khẩu tài khoản đã tồn tại mà chưa xác minh. Script cố ý dừng khi gặp account không có profile để người vận hành quyết định.

## Khôi phục dữ liệu demo không phá lịch hiện có

Cách mặc định là tạo dự án demo riêng mới, chạy migration/provisioning, hoặc seed vào một tuần trống. Không có nút reset hoặc script âm thầm DELETE dữ liệu dùng chung.

Nếu cần khôi phục chính một tuần đã có dữ liệu: xuất backup trước, xác nhận phạm vi với người sở hữu dự án, chuẩn bị migration/recovery riêng và xin phê duyệt trước khi thực thi. Lịch sử audit/duyệt không nên bị xóa để che thao tác. Tài liệu này không thực hiện thao tác phá dữ liệu.

## Phiên và secret

- Session 12h tối đa, 30 phút idle; logout thu hồi session ứng dụng ngay.
- Đổi vai trò/khóa tài khoản có hiệu lực khi request tiếp theo kiểm tra profile. Không tin role cũ trong cookie/client state.
- Khi secret lộ, xoay Supabase secret trong Dashboard và cập nhật môi trường triển khai. Xoay `SESSION_ENCRYPTION_KEY` để buộc đăng nhập lại nếu cần.
- Dọn session đã hết hạn và bản ghi login_limits quá cũ có thể làm bằng maintenance job đáng tin cậy sau khi xem xét chính sách lưu trữ. Không log phone/password/token trong job.
- Không có giám sát tự động hoặc deployment nào được bật bởi lần triển khai mã này.
