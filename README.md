# MimoEDU — Học Toán vui, tiến bộ mỗi ngày!

> Tên thương hiệu trước đây: *Lớp Chúng Tôi*. Thư mục dự án, Firebase project và địa chỉ Vercel giữ nguyên.

Ứng dụng web quản lý lớp học dành cho giáo viên dạy Toán với phong cách **Cartoon UI** thân thiện, hiện đại, kết hợp trình soạn thảo công thức Toán học **KaTeX + Hình học phẳng SVG**, giao bài tập theo bản chụp bất biến (**Snapshot**), tự động chấm câu hỏi khách quan phía server và tích hợp trợ lý AI qua kiến trúc **AIProviderAdapter**.

---

## 1. Kiến trúc & Công nghệ sử dụng

- **Frontend**: React 19 + TypeScript (Strict mode) + Vite + React Router v7 + Tailwind CSS v4 (Cartoon UI Neo-Brutalist Academic).
- **Trình soạn thảo Toán học**:
  - Hỗ trợ nội dung có cấu trúc (`StructuredRichTextDocument` JSON) gồm đoạn văn, tiêu đề, danh sách, căn lề, ảnh minh họa.
  - Công thức Toán học **LaTeX** hiển thị trực tiếp qua **KaTeX** (inline và block) cùng thanh chọn nhanh ký hiệu phân số, căn bậc hai, số mũ, góc, tam giác, pi.
  - Công cụ dựng **Hình học phẳng SVG** (`GeometryBuilderModal` & `GeometryRenderer`): điểm, đoạn thẳng, đường thẳng, tia, góc, tam giác, hình chữ nhật, hình vuông, hình tròn và nhãn đỉnh.
- **Form & Validation**: `react-hook-form` + `zod` (`src/schemas/validation.ts`).
- **Backend & Cơ sở dữ liệu**:
  - **Firebase Authentication** (Google Sign-In dành cho Admin với cơ chế kiểm tra `adminAllowlist`).
  - **Cloud Firestore** lưu trữ 10 collections chính (`adminAllowlist`, `classes`, `students`, `studentCodeIndex`, `homework`, `assignments`, `studentAssignments`, `submissions`, `comments`, `games`, `gameScores`, `aiJobs`) thông qua lớp Repository tập trung (`src/services/firestoreRepository.ts`).
  - **Server-side API (`server.ts`)**:
    - Sinh mã học sinh 6 ký tự duy nhất (`POST /api/admin/generate-student-code`), đảm bảo không trùng lặp và không tái sử dụng mã cũ.
    - Xác thực cổng phụ huynh/học sinh (`POST /api/student-auth/login`) có giới hạn tốc độ (Rate Limit + Cooldown 15 phút khi nhập sai quá 5 lần) và cấp **HMAC-SHA256 Session Token**.
    - Trả dữ liệu cổng học sinh (`GET /api/student-portal/data`) đã **tách bỏ hoàn toàn đáp án chuẩn (`gradingKeySnapshot`) và ghi chú nội bộ (`internalNotes`)**.
    - Chấm điểm tự động phía server (`POST /api/student-portal/submit`) cho câu trắc nghiệm, đúng/sai nhiều mệnh đề, trả lời ngắn và nối cột.
    - Tác vụ AI phía server (`POST /api/ai/parse-homework`, `POST /api/ai/suggest-grading`) qua `AIProviderAdapter` (`src/services/aiAdapter.ts`).

---

## 2. Cấu trúc thư mục

```text
/
├── firestore.rules               # Quy tắc bảo mật Cloud Firestore
├── firebase-blueprint.json       # Bản thiết kế schema Firestore
├── server.ts                     # Server Express + API bảo mật cổng học sinh & AI
├── requirement.md                # Tài liệu đặc tả nghiệp vụ, quy trình & nhật ký tiến độ
├── README.md                     # Tài liệu hướng dẫn cài đặt & vận hành
└── src/
    ├── app/                      # AppProvider, Router & Route Guards (RequireAdminGuard)
    ├── components/
    │   ├── editor/               # MathRichEditor, RichContentRenderer, GeometryBuilderModal
    │   ├── layout/               # AdminLayout
    │   └── ui/                   # CartoonIllustrations (SVG Cartoon UI)
    ├── features/
    │   ├── auth/                 # LandingPage, AdminAllowlistPage
    │   ├── dashboard/            # AdminDashboard (Thống kê, Sắp đến hạn, Nút tạo dữ liệu mẫu)
    │   ├── classes/              # Quản lý Lớp học (CRUD, Lưu trữ)
    │   ├── students/             # Quản lý Học sinh & Cấp mã 6 ký tự
    │   ├── homework/             # Kho học liệu Toán 3 (5 dạng câu hỏi Toán + AI Parse)
    │   ├── assignments/          # Giao bài tập & Tạo Snapshot đề bài
    │   ├── grading/              # Thu bài, Chấm điểm tự luận, AI gợi ý nhận xét
    │   ├── comments/             # Nhận xét định kỳ cho Phụ huynh
    │   ├── games/                # Quản lý Kho trò chơi giáo dục
    │   └── student-portal/       # Cổng Phụ huynh/Học sinh (Mobile-first) & Mini-games
    ├── lib/firebase/             # Khởi tạo Firebase Client SDK
    ├── schemas/                  # Zod validation schemas
    ├── services/                 # firestoreRepository, studentPortalService, aiAdapter
    ├── types/                    # Định nghĩa TypeScript interfaces toàn hệ thống
    ├── utils/                    # gradingEngine (chấm điểm khách quan & lọc đáp án)
    └── __tests__/                # Unit tests (Vitest) cho chấm điểm, Zod & Security Rules
```

---

## 3. Hướng dẫn cài đặt & Chạy dự án

### Bước 1: Cài đặt dependencies
```bash
npm install
```

### Bước 2: Cấu hình biến môi trường (`.env`)
Sao chép `.env.example` thành `.env` và cấu hình các biến môi trường phía server:
```dotenv
# Khóa API Claude (chỉ lưu phía server, tuyệt đối không dùng tiền tố VITE_)
ANTHROPIC_API_KEY="YOUR_ANTHROPIC_API_KEY"
AI_PROVIDER="anthropic"          # hoặc "gemini" (cần GEMINI_API_KEY)
AI_MODEL="claude-sonnet-5-5"

# Khóa bí mật ký HMAC Session Token cho Cổng Học Sinh
STUDENT_SESSION_SECRET="lop-chung-toi-hmac-secret-key-2025"

# Email Quản trị viên mặc định được cấp quyền
INITIAL_ADMIN_EMAIL="dang.nh.aprotrain@gmail.com"
```

### Bước 3: Cấu hình Firebase & Google OAuth
1. Dự án đã được kết nối với Firebase thông qua `firebase-applet-config.json`.
2. Trong **Firebase Console > Authentication > Sign-in method**, bật **Google Sign-In**.
3. Sau khi đăng nhập bằng email quản trị mặc định (`dang.nh.aprotrain@gmail.com`), bạn có thể mở mục **Quản trị & AI** (`/admin/settings`) để thêm các email giáo viên khác vào `adminAllowlist`.
4. Để cập nhật quy tắc bảo mật Firestore:
   ```bash
   npx eslint DRAFT_firestore.rules
   ```

### Bước 4: Chạy ứng dụng ở môi trường phát triển
```bash
npm run dev
```
Ứng dụng chạy tại `http://localhost:3000`.

### Bước 5: Chạy kiểm thử tự động (Unit Tests)
```bash
npm test
```

---

## 4. Hướng dẫn triển khai lên Vercel

1. Đẩy mã nguồn lên GitHub repository.
2. Tạo project mới trên **Vercel**, kết nối với repository.
3. Thiết lập các biến môi trường trong **Vercel Project Settings > Environment Variables**:
   - `ANTHROPIC_API_KEY`
   - `AI_PROVIDER` (`anthropic`)
   - `AI_MODEL` (`claude-sonnet-5-5`)
   - `STUDENT_SESSION_SECRET`
   - `INITIAL_ADMIN_EMAIL`
4. Thêm domain Vercel vào **Firebase Console > Authentication > Settings > Authorized domains** để Google Sign-In hoạt động.
5. Nhấn **Deploy**.
