# Tài Liệu Đặc Tả & Nhật Ký Tiến Độ Dự Án: Lớp Chúng Tôi

## 1. Mục tiêu & Phạm vi hệ thống
**Lớp Chúng Tôi** là ứng dụng web quản lý lớp học Toán dành cho giáo viên và cổng học tập dành cho phụ huynh/học sinh với phong cách thiết kế **Cartoon UI** (Neo-Brutalist Academic).

Hệ thống bao gồm 2 phân hệ độc lập nhưng đồng bộ thời gian thực qua Cloud Firestore:
1. **Phân hệ Admin / Giáo viên (`/admin/*`)**:
   - Đăng nhập bằng Google qua Firebase Authentication, kiểm tra danh sách cấp phép (`adminAllowlist`).
   - Quản lý lớp học, hồ sơ học sinh (kèm sinh mã truy cập 6 ký tự duy nhất phía server).
   - Ngân hàng Bài tập về nhà (BTVN) với trình soạn thảo Toán học (KaTeX + Hình vẽ hình học phẳng SVG) hỗ trợ 5 loại câu hỏi: Trắc nghiệm 1 đáp án, Đúng/Sai nhiều mệnh đề, Trả lời ngắn, Nối cột, Tự luận.
   - Giao bài tập theo lớp hoặc cá nhân học sinh với cơ chế đóng băng đề bài (**Homework Snapshot**) và tách riêng đáp án chuẩn (**Grading Key Snapshot**).
   - Thu bài, tự động chấm phần câu hỏi khách quan, chấm tay câu tự luận, trả điểm và nhận xét.
   - Quản lý nhận xét định kỳ và cấu hình kho trò chơi giáo dục Toán học.
   - Trợ lý AI hỗ trợ chuẩn hóa đề bài từ văn bản thô và gợi ý nhận xét bài làm.
2. **Cổng Phụ huynh / Học sinh (`/portal`)**:
   - Giao diện Mobile-first, đăng nhập bằng mã học sinh 6 ký tự (có giới hạn số lần thử sai, cooldown 15 phút và cấp HMAC Session Token từ server).
   - Xem tổng quan hồ sơ, bài tập cần làm, làm bài & lưu nháp trực tuyến, xem kết quả & lời phê sau khi giáo viên chấm, đọc nhận xét định kỳ và chơi trò chơi Toán học tương tác.

---

## 2. Quy tắc Nghiệp vụ & Bảo mật Dữ liệu

1. **Quản trị viên (Admin Allowlist)**:
   - Không cho phép người dùng tự đăng ký làm Admin.
   - Chỉ email nằm trong collection `adminAllowlist` (hoặc email khởi tạo `dang.nh.aprotrain@gmail.com`) mới vượt qua `RequireAdminGuard` và `isAdmin()` trong `firestore.rules`.
2. **Mã truy cập học sinh 6 ký tự**:
   - Sinh phía server (`POST /api/admin/generate-student-code`), chỉ dùng bộ ký tự rõ ràng `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
   - Lưu cố định trong `students/{id}.accessCode` và đánh chỉ mục tại `studentCodeIndex/{code}` để đảm bảo duy nhất trên toàn hệ thống, kể cả khi học sinh đã lưu trữ/ngừng học.
3. **Bảo mật Đề bài & Đáp án (Zero Answer Leak)**:
   - Khi giao bài, hệ thống tách câu hỏi hiển thị (`homeworkSnapshot`) và đáp án chuẩn (`gradingKeySnapshot`).
   - API `/api/student-portal/data` tuyệt đối không trả về `gradingKeySnapshot` hay `internalNotes` của học sinh về trình duyệt.
4. **Cơ chế Lưu nháp & Chấm điểm**:
   - Học sinh có thể lưu nháp nhiều lần khi bài tập chưa nộp hoặc chưa khóa.
   - Khi nộp bài (`POST /api/student-portal/submit`), server đối chiếu `gradingKeySnapshot` để chấm điểm tức thì các câu khách quan. Nếu bài tập có câu tự luận, trạng thái chuyển sang `submitted` (chờ giáo viên chấm tự luận); nếu chỉ gồm câu khách quan, trạng thái tự động hoàn tất (`graded`).
5. **Kiến trúc Trợ lý AI (`AIProviderAdapter`)**:
   - Toàn bộ lệnh gọi AI đi qua server (`/api/ai/*`), khóa `GEMINI_API_KEY` chỉ nằm trên server.
   - AI chỉ đóng vai trò gợi ý (chuẩn hóa câu hỏi hoặc gợi ý nhận xét); giáo viên luôn kiểm duyệt trước khi lưu.

---

## 3. Lộ trình Triển khai & Nhật ký Tiến độ (Progress Log)

| Giai đoạn | Hạng mục công việc | Trạng thái | Ghi chú kỹ thuật |
| :--- | :--- | :---: | :--- |
| **Giai đoạn 1** | Khởi tạo dự án, cấu hình Tailwind Cartoon UI, cài đặt Firebase, KaTeX, React Hook Form, Zod, Vitest | **Hoàn thành** | Thiết lập design tokens trong `src/index.css` và cấu hình шрифт Fredoka / Plus Jakarta Sans. |
| **Giai đoạn 2** | Thiết kế Firestore Schema (`firebase-blueprint.json`) & Bảo mật (`firestore.rules`) | **Hoàn thành** | Kiểm tra bằng `@firebase/eslint-plugin-security-rules` (0 lỗi) và triển khai lên Cloud Firestore. |
| **Giai đoạn 3** | Xây dựng lớp Repository (`firestoreRepository.ts`) & Dữ liệu mẫu (`seedSampleClassroomData`) | **Hoàn thành** | Hỗ trợ khởi tạo nhanh dữ liệu mẫu thực tế trên Firestore chỉ với 1 cú nhấp chuột. |
| **Giai đoạn 4** | Xây dựng trình soạn thảo Toán học (`MathRichEditor`, `GeometryBuilderModal`, `RichContentRenderer`) | **Hoàn thành** | Hỗ trợ chèn công thức LaTeX (KaTeX) và dựng hình học phẳng SVG trực quan. |
| **Giai đoạn 5** | Phát triển Phân hệ Admin (Dashboard, Lớp học, Học sinh, BTVN, Giao bài, Chấm bài, Nhận xét, Trò chơi, Cài đặt) | **Hoàn thành** | Đầy đủ luồng CRUD, bộ lọc, sao chép mã 6 ký tự và tích hợp AI. |
| **Giai đoạn 6** | Phát triển Server API & Cổng Phụ huynh/Học sinh (`/portal`) | **Hoàn thành** | Rate-limiting, HMAC Session Token, làm BTVN 5 dạng câu hỏi, xem điểm và chơi 2 trò chơi Toán học. |
| **Giai đoạn 7** | Kiểm thử tự động (Vitest) & Đồng bộ tài liệu (`README.md`, `requirement.md`) | **Hoàn thành** | Đầy đủ unit tests cho `gradingEngine`, `validation` và `firestore.rules`. |

---

## 4. Các giới hạn hiện tại & Hướng mở rộng tiếp theo
- **Giới hạn bản Demo**:
  - Một tài khoản học sinh và phụ huynh hiện dùng chung mã 6 ký tự với cùng quyền xem/làm bài để tối ưu sự tiện lợi.
  - Hình vẽ hình học trong trình soạn thảo hiện tập trung vào hình học phẳng cơ bản cấp Tiểu học & THCS (điểm, đoạn thẳng, tia, góc, tam giác, tứ giác, đường tròn).
- **Hướng mở rộng**:
  - Tách mã phụ huynh (chỉ xem báo cáo & nhận thông báo Zalo/Email) và mã học sinh (làm bài).
  - Bổ sung xuất báo cáo kết quả học tập ra file PDF/Excel theo tháng.
