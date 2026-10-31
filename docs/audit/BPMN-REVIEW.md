# Đối chiếu BPMN với workflow hiện tại

Nguồn trực tiếp: file gốc `Xếp ca 2CE TO-BE`, XML diagrams.net gồm bốn trang: `Trang-1`, `TO-BE`, `Bản sao của TO-BE`, `Page-4`. Không có thông tin phiên bản nào được ký duyệt là bản chuẩn duy nhất. `bpmn-extract.json` lưu node/edge để đối chiếu; không thay thế việc duyệt sơ đồ bởi người phụ trách nghiệp vụ.

## Những gì sơ đồ thể hiện

- Trang `TO-BE`: mở cổng (`KnSzwUHtoLSR5JjanBDz-2`) → đăng ký (`0R5DkcErSB7WZhBkDf5F-3`) → kiểm tra (`...-4`) → xếp ca (`...-5`) → kiểm tra nhân sự (`uNgFl485DXKSy4K8R0aB-23`) → nhánh gửi lịch (`0R5DkcErSB7WZhBkDf5F-6`) hoặc tìm/nhận người bổ sung.
- Nhánh thiếu người có thông báo, nhận ca bổ sung và hoạt động Manager “Nhận ca” (`KnSzwUHtoLSR5JjanBDz-19`) khi không có nhân viên nhận ca. Điều này hỗ trợ cách hiểu có ngoại lệ Manager trực tiếp đảm nhiệm ca thiếu sau khi xử lý bổ sung.
- `Page-4` có các mốc “Sáng thứ 7 7 giờ”, “Sáng chủ nhật 7 giờ”, timer “5h”, cùng bước kiểm tra/xếp ca/bổ sung/gửi lịch.
- Một số connector rời hoặc thiếu source/target, các bản sao khác nhau và luật số nhân viên trong annotation không đủ chi tiết để suy ra một state machine hoặc quota theo bộ phận hoàn chỉnh.

## Code đã được kiểm chứng

| Tình huống | Hành vi hiện tại | So với sơ đồ |
| --- | --- | --- |
| Employee/Admin tự đổi bước hoặc phát hành | 403 | Phân quyền đúng: chỉ Manager |
| Manager đổi 1 → 3 trực tiếp | Cho phép | Không có bước kiểm tra/xếp ca được chứng minh đã hoàn tất |
| Manager đổi 1 → 4 trên lịch trống, `acceptMissing:true` | Cho phép, cả 21 ca vẫn trống | Không tìm thấy đường đi bỏ qua toàn bộ kiểm tra/xếp ca/bổ sung như vậy |
| Phát hành còn thiếu sau bổ sung, Manager nhận điều phối | Có thể xác nhận thiếu | Có cơ sở từ nhánh Manager nhận ca; code không ghi nhận ai thay, thời gian chờ hoặc bổ sung đã diễn ra |
| Đăng ký/xếp ca theo các mốc giờ trong Page-4 | Không tự cưỡng chế theo giờ | Timers chưa được hiện thực hóa; mọi bước là điều khiển thủ công |
| Chỉ nhân viên đã bấm gửi mới được xét xếp ca | `isSubmitted` không được thuật toán dùng để lọc | Cần chốt ý nghĩa bước nhận/tổng hợp đơn; không tự thêm điều kiện trong bản vá eligibility |

Đây là **khoảng trống kiểm soát nghiệp vụ**, không phải Employee vượt quyền Manager. Kiểm thử audit ghi nhận hành vi hiện tại, không coi hành vi đó là yêu cầu đúng cần giữ lâu dài.

## Các quyết định cần duyệt trước khi sửa

1. Chọn trang/version BPMN chuẩn và xác nhận ý nghĩa từng bước 1–4.
2. Có bắt buộc 1 → 2 → 3 → 4 không? Trường hợp đủ người ngay có được bỏ bước 3? Quay lại bước 1 có cần lý do/ghi nhận rõ không?
3. Cấm lịch hoàn toàn trống hay cho phép Manager chịu toàn bộ ca? Nếu cho ngoại lệ, cần phân công/ghi nhận bằng chứng gì?
4. Cần thi hành deadline/timer hay vẫn cho thao tác thủ công trong demo?
5. 20h/2 ca tối là điều kiện đăng ký hay cũng là cam kết phân công tối thiểu?

Audit không đổi `server/workflows.cjs`, không tự khóa bước và không thay đổi BPMN. Đề xuất eligibility một điều kiện được tách riêng để không gộp các quyết định trên.
