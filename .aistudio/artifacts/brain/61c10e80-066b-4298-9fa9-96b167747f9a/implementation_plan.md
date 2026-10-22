# Lớp Chúng Tôi — Hệ Thống Quản Lý Lớp Học, BTVN Toán & Cổng Học Sinh

Ứng dụng quản lý lớp học Toán toàn diện kết nối Giáo viên (Admin) và Phụ huynh/Học sinh thông qua giao diện Cartoon UI thân thiện, hỗ trợ soạn đề Toán chuyên sâu (công thức LaTeX, vẽ hình học phẳng), bóc tách đề từ ảnh/PDF bằng AI, giao nhận bài tập theo snapshot, chấm điểm tự động kết hợp AI gợi ý, nhận xét định kỳ và kho trò chơi học tập.

## User Review & Critical Decisions

> [!IMPORTANT]
> Dưới đây là các quyết định kiến trúc và thiết kế đã được xác nhận từ câu trả lời của bạn để làm cơ sở triển khai toàn bộ hệ thống:

- **Tài khoản Quản trị (Admin Allowlist)**: Khởi tạo quyền quản trị mặc định cho tài khoản Google hiện tại (`dang.nh.aprotrain@gmail.com`) và hỗ trợ quản lý danh sách email được cấp quyền trong hệ thống.
- **Bộ hiển thị Công thức Toán**: Sử dụng **KaTeX** làm engine hiển thị công thức LaTeX (inline & block) tốc độ cao, tối ưu khả năng co giãn trên thiết bị di động kết hợp trình soạn thảo có cấu trúc JSON và canvas vẽ hình học trực quan.
- **Phạm vi triển khai**: Triển khai **Full-Stack End-to-End** đầy đủ tất cả các phân hệ (Landing Page, Admin Dashboard, Quản lý Lớp & Học sinh kèm mã 6 ký tự, Soạn BTVN 5 loại câu hỏi, AI bóc tách đề & giải đề, Giao bài & Snapshot, Cổng Phụ huynh/Học sinh làm bài, Chấm bài & Nhận xét tháng, Kho trò chơi giáo dục, cùng bộ tài liệu `README.md` và `requirement.md` đồng bộ).

---

## 1. Overview & Core Concept

- **What It Does**: Cung cấp môi trường số hóa quy trình dạy và học môn Toán từ khâu quản lý hồ sơ lớp/học sinh, biên soạn bài tập về nhà đa định dạng, chuyển đổi ảnh/PDF đề thi sang câu hỏi có cấu trúc nhờ AI, giao bài tập an toàn (tách biệt đáp án chuẩn), đến việc thu bài, chấm điểm tự động câu khách quan, hỗ trợ chấm tự luận và theo dõi tiến độ học tập hàng tháng.
- **Target Audience / Persona**:
  - **Giáo viên Toán (Admin)**: Sử dụng chủ yếu trên máy tính (Desktop-first) để điều hành lớp học, biên soạn đề Toán có hình học và công thức, chấm bài và gửi nhận xét.
  - **Phụ huynh & Học sinh**: Truy cập nhanh trên điện thoại hoặc máy tính bảng (Mobile-first) chỉ bằng một **Mã truy cập 6 ký tự duy nhất** (không cần tạo tài khoản phức tạp) để làm bài tập, xem điểm, đọc nhận xét của giáo viên và chơi các trò chơi tư duy Toán học.
- **Key Value**: Loại bỏ rào cản đăng nhập cho học sinh nhỏ tuổi và phụ huynh mà vẫn đảm bảo bảo mật phiên làm việc phía server; đồng thời tiết kiệm tối đa thời gian soạn đề và chấm bài cho giáo viên nhờ bộ công cụ Toán học chuyên biệt và trợ lý AI.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Landing Page & Xác thực hai luồng**:
   - Người dùng truy cập trang chủ Cartoon UI sinh động giới thiệu tính năng cho Giáo viên và Phụ huynh.
   - **Luồng Giáo viên**: Nhấn *"Đăng nhập Quản trị"* bằng Google (Firebase Auth). Hệ thống đối chiếu với `adminAllowlist` (mặc định cấp quyền cho `dang.nh.aprotrain@gmail.com`). Nếu hợp lệ, chuyển vào Admin Workspace; nếu chưa có quyền, hiển thị màn hình thông báo từ chối truy cập rõ ràng.
   - **Luồng Phụ huynh/Học sinh**: Nhập trực tiếp **Mã học sinh 6 ký tự** ngay trên cổng đăng nhập học sinh. Server kiểm tra giới hạn số lần thử (rate-limit/cooldown), xác thực mã và cấp session token an toàn chỉ cho phép truy cập dữ liệu của đúng học sinh đó.
2. **Quản lý Lớp học & Hồ sơ Học sinh**:
   - Giáo viên tạo lớp học (ví dụ: *Toán 5A - Tư duy*, mã lớp, khối, năm học, lịch học), tìm kiếm và lưu trữ lớp (không xóa cứng khi đã có dữ liệu học tập).
   - Khi thêm học sinh mới và gán vào lớp, hệ thống gọi API server sinh mã 6 ký tự duy nhất toàn hệ thống (không trùng lặp, không tái sử dụng mã cũ). Giáo viên nhấn một chạm để sao chép mã và hướng dẫn gửi cho phụ huynh.
3. **Soạn BTVN Thủ công & Bóc tách Đề bằng AI**:
   - Giáo viên soạn đề với 5 loại câu hỏi bắt buộc: *Trắc nghiệm 1 đáp án*, *Trắc nghiệm nhiều đáp án*, *Đúng/Sai nhiều mệnh đề (tính điểm từng ý)*, *Trả lời ngắn (chuẩn hóa chuỗi/số)*, và *Tự luận (Rich-text + LaTeX + Hình học + Ảnh)*.
   - **Công cụ Toán & Hình học**: Chèn công thức KaTeX trực tiếp kèm preview; mở bảng vẽ hình học tương tác để dựng điểm ($A, B, C...$), đoạn thẳng, tia, đường thẳng, góc, tam giác, tứ giác, đường tròn và chèn thẳng hình vẽ có cấu trúc vào đề.
   - **Tạo BTVN từ Ảnh/PDF bằng AI**: Tải lên ảnh chụp hoặc file PDF đề Toán, bật/tắt tùy chọn *"AI giải đề"*. Backend phân tích qua AI Adapter, trích xuất danh sách câu hỏi đúng schema 5 loại câu. Giáo viên kiểm tra trên màn hình Preview đối chiếu, chỉnh sửa từng câu/đáp án rồi mới lưu thành bản nháp hoặc xuất bản.
4. **Giao bài (Snapshot), Làm bài & Chấm điểm**:
   - Giáo viên chọn đề BTVN, chọn lớp hoặc nhóm học sinh, đặt hạn nộp. Hệ thống tạo bản **Snapshot đề bài** độc lập (ẩn toàn bộ đáp án chuẩn và lời giải khỏi phía học sinh).
   - Học sinh vào cổng Mobile-first, thấy thông báo bài mới/sắp hết hạn, mở giao diện làm bài (hỗ trợ lưu nháp tự động, gõ công thức/vẽ hình cho câu tự luận) và xác nhận nộp bài.
   - Hệ thống **chấm tự động phía server** cho 4 loại câu khách quan. Với câu tự luận, giáo viên chấm tay hoặc bấm *"AI Gợi ý chấm"* để nhận điểm đề xuất kèm nhận xét chi tiết theo rubric, sau đó duyệt và công bố kết quả.
5. **Nhận xét Định kỳ & Kho Trò chơi Toán học**:
   - Giáo viên lập nhận xét tháng (Điểm mạnh, Cần cải thiện, Mức độ hoàn thành BTVN, Gợi ý luyện tập) ở chế độ Nháp hoặc Đã công bố.
   - Giáo viên quản lý kho trò chơi tương tác qua URL HTTPS iframe (Số học, Phép tính, Hình học, Tư duy logic, Ôn tập), kiểm tra khả năng nhúng và sắp xếp thứ tự hiển thị cho học sinh giải trí sau giờ học.

### Visual Identity & Theme (Cartoon UI System)

- **Aesthetic Direction**: **Playful Educational Cartoon UI (Neo-Brutalist Soft Cartoon)** — kết hợp đường viền rõ nét (`2px solid`), góc bo tròn thân thiện (`rounded-2xl` / `rounded-3xl`), hiệu ứng đổ bóng khối cứng nhẹ tạo cảm giác xúc giác như sách minh họa và thẻ bài học tập (`shadow-[0_4px_0_0_#1E293B]`), nhưng giữ bố cục bảng biểu và dữ liệu gọn gàng, dễ đọc.
- **Color Palette & Mood (60-30-10 Discipline)**:
  - **60% Dominant Canvas**: Kem giấy ấm áp, dịu mắt cho việc đọc đề Toán lâu (`#FFFDF7` / `--background`) kết hợp bề mặt trắng tinh khiết (`#FFFFFF`) cho khung nội dung.
  - **30% Structural Surfaces & Borders**: Viền mực xanh đen đậm tạo nét vẽ hoạt hình (`#1E293B`), nền phụ xanh da trời nhạt (`#F0F7FF`) và vàng nắng nhạt (`#FEF9C3`) cho các khu vực phân tách.
  - **10% Semantic & Action Accents**:
    - Primary Action: Xanh Toán học tươi sáng (`#2563EB` với viền `#1E293B`).
    - Secondary / Reward Accent: Cam Năng động (`#F97316`) và Vàng Sao (`#EAB308`).
    - Semantic States (luôn đi kèm nhãn văn bản + biểu tượng rõ ràng): Hoàn thành/Đúng (`#16A34A`), Sắp đến hạn/Đang làm (`#D97706`), Quá hạn/Cần sửa (`#DC2626`).
- **Typography & Hierarchy (2+1 Font Rule)**:
  - **Display & Headings**: `Plus Jakarta Sans` (Bold / ExtraBold) tạo nét chữ tròn trịa, hiện đại, thân thiện với lứa tuổi học sinh và rõ ràng trên tiêu đề.
  - **Body Prose**: `DM Sans` (Regular / Medium) tối ưu độ dễ đọc cho đề bài tiếng Việt và hướng dẫn.
  - **Math & Tabular Metrics**: `KaTeX_Main` cho biểu thức Toán học và `JetBrains Mono` (`tabular-nums`) cho mã học sinh 6 ký tự, điểm số, bộ đếm thời gian và bảng thống kê.
- **Component Styling & Layout**:
  - **Admin Workspace (Desktop-first 1440px)**: Sidebar điều hướng cố định bên trái (`260px`) + Top Header hiển thị ngữ cảnh trang và thao tác chính + Khung làm việc rộng rãi hỗ trợ chia 2 cột khi soạn đề/xem trước hoặc chấm bài.
  - **Student/Parent Portal (Mobile-first)**: Tối ưu vùng chạm ngón cái ($\ge 44\times 44\text{px}$), thanh điều hướng cố định dưới đáy (Bottom Navigation Bar 5 tab: *Tổng quan, Bài tập, Nhận xét, Trò chơi, Hồ sơ*) chiếm dưới 15% chiều cao màn hình mobile, tự động mở rộng thành bố cục đa cột trên màn hình lớn.
- **Interactive Feedback & Motion**: Phản hồi nút bấm lún xuống tức thì (`active:translate-y-0.5`, $\le 150\text{ms}$), thông báo trạng thái lưu bài tự động, skeleton loading khi tải dữ liệu, và hộp thoại xác nhận rõ ràng trước khi nộp bài hoặc thu hồi bài tập.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Tách biệt Đáp án Chuẩn khỏi Snapshot Đề Giao cho Học sinh**
  - *Chosen Approach*: Lưu đề gốc tại `homework` (gồm cả câu hỏi và đáp án chuẩn dành cho Admin). Khi giao bài vào `assignments`, hệ thống tạo bản sao câu hỏi dành cho học sinh (`publicQuestionsSnapshot`) đã loại bỏ hoàn toàn trường đáp án đúng và lời giải, đồng thời lưu đáp án chuẩn ở nhánh bảo mật chỉ Server/Admin đọc được.
  - *Why*: Ngăn chặn tuyệt đối việc học sinh hoặc người dùng mở DevTools trình duyệt để xem trước đáp án đúng khi chưa nộp bài hoặc chưa được giáo viên cho phép công bố.
- **Decision 2: Xác thực Mã Học sinh 6 Ký tự qua Server Session Token & Rate-Limiting**
  - *Chosen Approach*: Bảng tra cứu `studentCodeIndex` và logic kiểm tra mã được thực thi qua API server-side kèm bộ đếm giới hạn số lần nhập sai theo IP/client (cooldown khi nhập sai liên tiếp). Khi đúng mã, server trả về token phiên làm việc có chữ ký HMAC gắn với `studentId`.
  - *Why*: Tuân thủ nghiêm ngặt yêu cầu bảo mật: không cho phép client truy vấn toàn bộ danh sách `students` để dò mã và không chỉ lưu `studentId` thuần vào `localStorage` làm cơ chế xác thực.
- **Decision 3: Trình soạn thảo Toán JSON + Công cụ Dựng Hình Học SVG Có Cấu Trúc**
  - *Chosen Approach*: Lưu toàn bộ nội dung câu hỏi và bài làm tự luận dưới dạng cấu trúc JSON Document (hỗ trợ đoạn văn, in đậm/nghiêng, căn lề, danh sách, node công thức KaTeX, node ảnh và node bản vẽ hình học SVG có tọa độ điểm/đối tượng).
  - *Why*: Đảm bảo hiển thị đồng nhất 100% giữa màn hình giáo viên soạn đề và màn hình học sinh làm bài trên điện thoại, đồng thời cho phép chỉnh sửa lại công thức hoặc nhãn điểm hình học bất cứ lúc nào.
- **Decision 4: Kiến trúc AI Adapter Đa Nhà Cung Cấp (Provider-Agnostic)**
  - *Chosen Approach*: Xây dựng tầng giao tiếp `AIProviderAdapter` phía server tách biệt khỏi logic nghiệp vụ, mặc định kết nối Gemini (`gemini-3.8-flash` cho tác vụ trích xuất nhanh/chi phí thấp và hỗ trợ nâng cấp model cho đề phức tạp) với bộ kiểm tra Zod Schema nghiêm ngặt trước khi trả kết quả về giao diện Preview.
  - *Why*: Giấu kín hoàn toàn API key ở server, đảm bảo dữ liệu AI trả về luôn đúng cấu trúc 5 loại câu hỏi và dễ dàng mở rộng sang các nhà cung cấp khác khi cần.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT APPLICATION (React + TS)                         │
├───────────────────┬──────────────────────────────────┬───────────────────────────────┤
│   PUBLIC LANDING  │      ADMIN / TEACHER PORTAL      │    STUDENT / PARENT PORTAL    │
│  ┌─────────────┐  │  ┌────────────┐ ┌─────────────┐  │  ┌─────────────────────────┐  │
│  │ Cartoon Hero│  │  │ Dashboard  │ │ Class &     │  │  │ 6-Char Code Login Gate  │  │
│  │ & Features  │  │  │ & KPIs     │ │ Student CRUD│  │  └────────────┬────────────┘  │
│  ├─────────────┤  │  ├────────────┤ ├─────────────┤  │               ▼               │
│  │ Admin Google│  │  │ Math/Geom  │ │ AI Quiz OCR │  │  ┌─────────────────────────┐  │
│  │ Sign-In CTA │  │  │ Homework Ed│ │ & Preview   │  │  │ Mobile-First 5 Tabs:    │  │
│  ├─────────────┤  │  ├────────────┤ ├─────────────┤  │  │ • Tổng quan  • Bài tập  │  │
│  │ Student Code│  │  │ Assignment │ │ Auto/AI     │  │  │ • Nhận xét   • Trò chơi │  │
│  │ Quick Entry │  │  │ & Snapshot │ │ Grading Hub │  │  │ • Hồ sơ & Lịch học      │  │
│  └─────────────┘  │  └────────────┘ └─────────────┘  │  └─────────────────────────┘  │
└─────────┬─────────┴─────────────────┬────────────────┴───────────────┬───────────────┘
          │                           │                                │
          ▼                           ▼                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                      SERVICE & REPOSITORY LAYER + ZOD VALIDATION                     │
└─────────────────────────┬────────────────────────────────────────┬───────────────────┘
                          │                                        │
        (Firebase SDK + Security Rules)               (REST API + Signed Student Token)
                          ▼                                        ▼
┌───────────────────────────────────────────┐    ┌─────────────────────────────────────┐
│        FIREBASE CLOUD INFRASTRUCTURE      │    │     SERVER-SIDE API (/api/*)        │
│  • Firebase Auth (Google Sign-In)         │    │  • /api/student-auth/verify-code    │
│  • Cloud Firestore:                       │    │    (Rate-limit, Cooldown, Token)    │
│    - adminAllowlist, classes, students    │    │  • /api/admin/generate-student-code │
│    - studentCodeIndex (Protected)         │    │    (Unique 6-char Server Generator) │
│    - homework, assignments, submissions   │    │  • /api/student-portal/*            │
│    - studentAssignments, comments, games  │    │    (Scoped Read/Submit & Auto-Grade)│
│    - aiJobs                               │    │  • /api/ai/parse-homework (OCR/PDF) │
│                                           │    │  • /api/ai/suggest-grading (Essay)  │
└───────────────────────────────────────────┘    └──────────────────┬──────────────────┘
                                                                    │
                                                                    ▼
                                                 ┌─────────────────────────────────────┐
                                                 │    AI PROVIDER ADAPTER (@google/    │
                                                 │    genai Gemini + Schema Validator) │
                                                 └─────────────────────────────────────┘
```

### Data Model & State (Firestore Collections)

1. **`adminAllowlist`**: Lưu danh sách email được phép truy cập phân hệ Admin (khởi tạo mặc định với `dang.nh.aprotrain@gmail.com`), trạng thái kích hoạt và thời gian cấp quyền.
2. **`classes`**: Lưu thông tin lớp học (`name`, `code`, `grade`, `subject: "Toán"`, `schoolYear`, `description`, `scheduleText`, `startDate`, `endDate`, `status: 'active' | 'archived'`, `createdAt`, `updatedAt`).
3. **`students` & `studentCodeIndex`**:
   - `students`: Hồ sơ học sinh (`fullName`, `nickname`, `avatarUrl`, `grade`, `classIds[]`, `dob`, `internalNotes` [chỉ Admin đọc], `status: 'active' | 'dropped' | 'archived'`, `accessCode`, `createdAt`, `updatedAt`).
   - `studentCodeIndex`: Ánh xạ mã 6 ký tự (`code` làm Document ID) tới `studentId` và trạng thái vĩnh viễn để đảm bảo không bao giờ tái sử dụng mã cũ.
4. **`homework`**: Đề BTVN gốc (`title`, `description`, `subject`, `grade`, `questions[]` theo JSON schema 5 loại câu hỏi kèm đáp án chuẩn & rubric, `attachments[]`, `answerSource: 'teacher' | 'ai'`, `aiSolverEnabled`, `status: 'draft' | 'published' | 'archived'`).
5. **`assignments` & `studentAssignments`**:
   - `assignments`: Đợt giao bài (`homeworkId`, `title`, `targetType: 'class' | 'students'`, `classIds[]`, `studentIds[]`, `assignedAt`, `dueAt`, `instructions`, `publicQuestionsSnapshot` [đã lược bỏ đáp án đúng], `gradingKeySnapshot` [chỉ Admin/Server truy cập], `status`).
   - `studentAssignments`: Theo dõi tiến độ từng học sinh (`assignmentId`, `studentId`, `status: 'assigned' | 'in_progress' | 'submitted' | 'graded' | 'returned'`, `score`, `maxScore`, `isPublished`, `updatedAt`).
6. **`submissions`**: Bài làm của học sinh (`assignmentId`, `studentId`, `answers` theo từng `questionId`, `questionResults` chấm điểm từng câu/ từng ý đúng-sai, `totalScore`, `maxScore`, `teacherFeedback`, `aiGradingSuggestions`, `submittedAt`, `gradedAt`).
7. **`comments`**: Nhận xét theo bài nộp và Nhận xét định kỳ hàng tháng (`studentId`, `type: 'submission' | 'monthly'`, `month`, `year`, `strengths`, `improvements`, `completionRate`, `practiceSuggestions`, `status: 'draft' | 'published'`).
8. **`games` & `aiJobs`**:
   - `games`: Kho trò chơi (`title`, `description`, `embedUrl` [bắt buộc HTTPS], `category`, `thumbnailUrl`, `order`, `status: 'draft' | 'published' | 'archived'`).
   - `aiJobs`: Nhật ký xử lý AI (`taskType`, `provider`, `model`, `status`, `durationMs`, `createdAt`).

### Interactive Component & State Mapping

- **Trình soạn thảo Toán & Hình học (`MathRichEditor` & `GeometryCanvasModal`)**:
  - Cho phép định dạng văn bản (đậm, nghiêng, căn lề trái/giữa/phải, danh sách), chèn công thức LaTeX render bằng KaTeX, tải ảnh minh họa và mở bảng vẽ hình học phẳng (dựng điểm có nhãn $A, B, C...$, đoạn thẳng, tia, đường thẳng, góc có ký hiệu cung, tam giác, tứ giác, đường tròn). Lưu xuất ra cấu trúc JSON chuẩn để hiển thị đồng bộ ở cả Admin và Học sinh.
- **Bộ máy Chấm điểm Trung tâm (`gradingEngine`)**:
  - Dùng chung duy nhất một module chấm điểm phía server và unit test:
    1. *Trắc nghiệm 1 đáp án*: Khớp `selectedOptionId === correctOptionId`.
    2. *Trắc nghiệm nhiều đáp án*: Khớp chính xác tập hợp toàn bộ phương án đúng.
    3. *Đúng/Sai nhiều ý*: Tính điểm độc lập cho từng mệnh đề đúng/sai hoặc theo quy tắc điểm thành phần.
    4. *Trả lời ngắn*: Chuẩn hóa khoảng trắng, chữ hoa/thường và dấu thập phân (`,` / `.`), đối chiếu với danh sách các đáp án tương đương.
    5. *Tự luận*: Lưu nội dung JSON của học sinh, hỗ trợ gọi `/api/ai/suggest-grading` để AI phân tích lời giải Toán và đề xuất điểm + nhận xét cho giáo viên duyệt.
- **Tài liệu hóa & Nhật ký Tiến độ (`README.md` & `requirement.md`)**:
  - Thiết lập và cập nhật tự động trạng thái triển khai các module, hướng dẫn cấu hình Firebase/OAuth/AI, cùng nhật ký thay đổi nghiệp vụ trong `README.md` và `requirement.md`.
