# Tinh Gọn Thông Tin Lớp Học — Lớp Chúng Tôi

Cập nhật mô hình dữ liệu và giao diện Quản lý Lớp học theo đúng yêu cầu: chỉ giữ lại 4 trường thông tin dành cho giáo viên (**Tên lớp học**, **Khối / Lớp**, **Năm học**, **Mô tả lớp học**) và loại bỏ hoàn toàn các trường không cần thiết (**Mã lớp**, **Môn học**, **Lịch học**, **Ngày bắt đầu**, **Ngày kết thúc**).

### User Review & Critical Decisions

> [!IMPORTANT]
> Toàn bộ biểu mẫu Tạo/Sửa Lớp học, thẻ hiển thị lớp học, hộp thoại xem chi tiết lớp, dữ liệu mẫu và quy tắc bảo mật Firestore sẽ được đồng bộ để chỉ yêu cầu và hiển thị 4 trường thông tin này.

- **Các trường thông tin Lớp học giữ lại**:
  1. **Tên lớp học** (`name` — bắt buộc)
  2. **Khối / Lớp** (`grade` — bắt buộc)
  3. **Năm học** (`schoolYear` — bắt buộc)
  4. **Mô tả lớp học** (`description` — tùy chọn)
  *(Kèm trạng thái hệ thống `status`, `createdAt`, `updatedAt` phục vụ lọc lớp đang hoạt động / lưu trữ).*
- **Các trường bị loại bỏ**: Mã lớp (`code`), Môn học (`subject`), Lịch học (`scheduleText`), Ngày bắt đầu (`startDate`), Ngày kết thúc (`endDate`).

---

### 1. Overview & Core Concept

- **What It Does**: Đơn giản hóa quy trình tạo và chỉnh sửa lớp học cho giáo viên dạy Toán, giúp biểu mẫu gọn nhẹ, tập trung đúng vào 4 thông tin cốt lõi của lớp.
- **Target Audience / Persona**: Giáo viên quản trị trên phân hệ Admin và phụ huynh/học sinh khi xem thông tin lớp học của mình trên Cổng Học Sinh.
- **Key Value**: Thao tác tạo lớp nhanh hơn, thẻ lớp học trên giao diện thoáng và rõ ràng hơn, đồng thời không phát sinh lỗi ràng buộc dữ liệu thừa trên Firestore.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. Giáo viên nhấn **Tạo Lớp Học Mới** hoặc **Sửa**: Modal hiển thị đúng 4 ô nhập liệu: **Tên lớp học**, **Khối / Lớp**, **Năm học**, và **Mô tả lớp học**.
  2. Danh sách thẻ lớp học và Modal xem chi tiết lớp chỉ hiển thị Tên lớp, Khối/Lớp, Năm học, Trạng thái, Mô tả lớp học, sĩ số học sinh và số bài tập đã giao.
  3. Thanh tìm kiếm lớp học lọc theo Tên lớp, Khối/Lớp, Năm học hoặc Mô tả.
- **Visual Identity & Theme**:
  - Giữ nguyên phong cách **Cartoon UI (Neo-Brutalist Academic)** với nền kem `#FFFDF8`, viền `#1E1B4B` 2px sắc nét, typography `Fredoka` + `Plus Jakarta Sans`, và hiển thị thông tin dạng văn bản phân tách bằng dấu `·` (Zero-Pill Discipline).
- **Interactive Feedback & Motion**:
  - Kiểm tra dữ liệu tức thì bằng Zod schema rút gọn; phản hồi lưu dữ liệu thời gian thực qua Firestore `onSnapshot`.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Loại bỏ các trường dư thừa ở cả tầng Giao diện, Schema và Firestore Security Rules**
  - *Chosen Approach*: Cập nhật đồng bộ kiểu `ClassRoom`, `classFormSchema`, hàm tạo/cập nhật trong Repository, dữ liệu mẫu và hàm kiểm tra `isValidClassRoom` trong `firestore.rules`.
  - *Why*: Đảm bảo khi giáo viên tạo hoặc sửa lớp học với 4 trường thông tin mới, Firestore Security Rules xác thực thành công 100% mà không yêu cầu các trường cũ như `code` hay `subject`.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                        QUẢN LÝ LỚP HỌC (TINH GỌN)                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Biểu mẫu Lớp học (Modal Tạo / Chỉnh sửa)                                │
│  ├── Tên lớp học (name *)                                                │
│  ├── Khối / Lớp (grade *)                                                │
│  ├── Năm học (schoolYear *)                                              │
│  └── Mô tả lớp học (description)                                         │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Xác thực Zod (classFormSchema) & Repository                             │
│  ├── Kiểm tra hợp lệ 4 trường: name, grade, schoolYear, description      │
│  └── Lưu trữ vào Cloud Firestore (classes/{classId})                     │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Firestore Security Rules (isValidClassRoom)                             │
│  └── Chỉ yêu cầu: name, grade, schoolYear, status, createdAt, updatedAt  │
│      (cho phép tùy chọn description)                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Thực thể `ClassRoom` gồm: `id`, `name`, `grade`, `schoolYear`, `description?`, `status` (`active` | `archived`), `createdAt`, `updatedAt`.
- **Interactive Component & State Mapping**:
  - Form tạo/sửa lớp học khởi tạo mặc định với 4 trường, validate qua `classFormSchema`, gọi `createClassRoom` / `updateClassRoom` và tự động cập nhật danh sách lớp học cũng như bộ kiểm thử đơn vị (Vitest).
