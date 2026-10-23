# Kiểm tra ngân hàng câu hỏi N06–N35 (Luyện Toán cùng Mimo)

Ngày kiểm tra: 23/10/2026 · Kiểm tra tự động, **chưa nhập lên Firebase, chưa xuất bản**.
Chi tiết từng câu: `KiemTra_N06-N35_chi-tiet.csv` (mở bằng Excel).

## Kết quả chung
| Hạng mục | Kết quả |
|---|---|
| Số tệp / số câu | 30 tệp · 1 200 câu (40 câu/tệp) |
| Mã và tên chuyên đề so với danh mục 35 chuyên đề | Khớp 30/30 |
| Định dạng JSON, mã câu trùng | Không có lỗi · không trùng mã (kể cả với N01–N05) |
| Đáp án (tính lại bằng chương trình cho cả 1 200 câu) | **Đúng 1 200/1 200**, không có hai phương án cùng đúng |
| Trạng thái trong tệp | `needs_teacher_review` (tệp tự ghi là "bản nháp sinh theo mẫu") |

## Vấn đề cần xử lý
1. **Rất ít dạng bài:** mỗi chuyên đề chỉ có 1–4 mẫu câu, chỉ thay số (N17: 40 câu cùng một mẫu). Học sinh làm vài lượt là gặp lại cùng một dạng.
2. **Mức độ chưa đáng tin:** ở 22/30 chuyên đề, cả 4 mức (nhận biết → thử thách) dùng cùng một mẫu câu, chỉ khác số to hay nhỏ. Riêng N06, N07, N09, N10 mỗi mức có một dạng riêng.
3. **91 câu trùng nội dung** (thêm "(Lượt luyện …)" cho đủ 40 câu): N20 (20 câu), N27 (14), N34 (14), N12 (8), N21 (8), N22–N26, N28 (mỗi chuyên đề 4), N11 (2), N32 (1).
4. **Phương án nhiễu vô lý ở 270 câu (279 phương án):** ví dụ "1 010", "102" (ghép thêm chữ số vào đáp án), học sinh loại trừ được mà không cần tính.
5. **Số vượt phạm vi 100 000 (4 câu):** M3-N18-017, M3-N19-017, M3-N28-026, M3-N28-027.
6. **Cách hỏi chưa phù hợp:**
   - N32 dùng phương án 1/2/3 thay cho chữ "chắc chắn / có thể / không thể" (40 câu).
   - N20 ghi "Ghép … hình tam giác rời nhau", câu chữ mâu thuẫn (20 câu).
   - N27 hỏi "bao nhiêu phút sau 8 giờ", khó hiểu với học sinh lớp 3 (20 câu).
   - N34 hỏi bắt tay đến 14 người (tổ hợp), quá khó với lớp 3 (16 câu).
7. **Nội dung còn thiếu so với tên chuyên đề:** N20 chỉ đếm đỉnh/cạnh tam giác (không có điểm, đoạn thẳng, góc, trung điểm…); N29 chỉ cộng/trừ nhiệt độ (không có đọc nhiệt kế); N31 chỉ có lời văn, chưa có bảng thật; N11 chỉ đến XX.
8. **Lời giải quá ngắn** (86 câu: N09, N14, N15, N25, N29, N31): chỉ có phép tính, chưa giải thích cách làm.
9. **Mỗi chuyên đề chỉ có một kỹ năng** (`N06.practice` …), nên chưa luyện theo từng kỹ năng nhỏ như N01 được.

## Đề xuất
- **Có thể dùng sau khi giáo viên duyệt nhanh** (đáp án đúng, dạng bài ít nhưng hợp lý): N06, N07, N08, N09, N10, N13, N14, N15, N16, N18, N19, N30, N33, N35. Nên sửa phương án nhiễu vô lý trước khi dùng.
- **Cần soạn lại hoặc bổ sung trước khi dùng:** N11, N12, N17, N20, N21, N22, N23, N24, N25, N26, N27, N28, N29, N31, N32, N34.
