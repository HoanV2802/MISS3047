# Bản sửa eligibility — ĐÃ ĐƯỢC DUYỆT VÀ ÁP DỤNG

Người dùng đã phê duyệt đúng thay đổi một điều kiện này. `shared/domain.js` hiện chạy trực tiếp bản sửa; API, frontend và provisioning dùng engine đó. Không còn cờ môi trường để bật bản vá thử nghiệm.

```diff
-    if (!stats.isValid) {
+    if (stats.regHours < 20 || stats.regEvening < 2) {
```

`registration-hours.patch` được giữ làm bằng chứng của đề xuất đã duyệt, không cần áp lại. `load-proposal.cjs` hiện chỉ dựng bản cũ trong VM cho đối chiếu lịch sử; ứng dụng/provisioning không import helper đó. `eligibility.regression.cjs` là entrypoint tương thích gọi regression main; regression đã nằm trong suite backend mặc định.

| Cùng 73 đăng ký, bước 2 | Trước sửa | Sau sửa |
| --- | ---: | ---: |
| Phân công | 0 | 65 |
| Nhân viên bị loại | 18 | 0 |

Danh sách phân công từng ca sau sửa bằng hệt kết quả thuật toán gốc ở bước 1. Ngưỡng đăng ký 20h/2 ca tối, chuyên môn, quota, thứ tự tối → chiều → sáng, ưu tiên ít giờ và tie-break giữ nguyên. `getEmployeeStats()` tiếp tục hiển thị giờ assigned ở giai đoạn đã xếp; không đổi hàm đó để né lỗi.

```sh
pnpm test:scheduling
pnpm test
pnpm test:audit
pnpm test:ui
```

Không chạy live tests/cloud trong nhiệm vụ này. Quy tắc chuyển bước/phát hành lịch trống vẫn giữ nguyên, cần review BPMN riêng. Thuật toán vẫn có 7 nhân viên dưới chỉ tiêu phân công như kết quả cũ ở bước 1; không có tối ưu mới hoặc cam kết mọi người đủ giờ sau phân bổ.

Chi tiết file thay đổi, kết quả kiểm thử và rủi ro còn lại: [docs/scheduling-fix/README.md](../../docs/scheduling-fix/README.md).
