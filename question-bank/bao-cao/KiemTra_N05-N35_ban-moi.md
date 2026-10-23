# Kiểm tra bộ câu hỏi N05–N35 (bản mới, 23/10/2026)

Phạm vi: 31 tệp `MimoEDU_Toan3_N05…N35_40cau.json` ở thư mục chính `question-bank/`.
Không kiểm tra: `backup-old/`, `archive/`, tệp tổng hợp cũ. Chưa nhập Firebase, chưa xuất bản.

## Đạt
- 31 chuyên đề × 40 câu = **1 240 câu**; mỗi mức độ 10 câu.
- Mã/tên chuyên đề khớp danh mục 35 chuyên đề (31/31).
- Bộ kiểm tra nhập của hệ thống: **0 lỗi** ở cả 31 tệp (chỉ cảnh báo "chưa approved" – đúng như mong muốn).
- Không trùng mã câu (kể cả với N01–N04), không trùng datasetId, mã câu liên tục 001–040.
- Không còn câu trùng nội dung / câu độn "(Lượt luyện …)".
- Đáp án: 514 câu được chương trình tính lại độc lập – khớp 100 %; 710 lời giải có phép tính được kiểm tra – không có phép tính sai; lời giải nào cũng dẫn đến đúng đáp án đã chọn.
- Các trường thêm (`grade`, `publicationStatus`, `topics`) không ảnh hưởng việc nhập; mọi câu nhập vào đều ở trạng thái **nháp**.

## Cần giáo viên lưu ý
1. **N05 không thay đổi** – giống hệt bản trong `backup-old/` (trạng thái `reviewed_draft`).
2. **Mức độ chưa phân hóa thật ở 23/31 chuyên đề** (N07–N10, N12–N15, N21–N35): cả 4 mức dùng cùng các mẫu câu, chỉ đổi số.
   Ví dụ N30 mức "thử thách": "Có 12 quả bóng đỏ và 16 quả bóng xanh. Số bóng xanh nhiều hơn bóng đỏ bao nhiêu quả?"
3. **Ít dạng bài**: N33 chỉ 2 mẫu; N19, N21–N31, N34, N35 mỗi chuyên đề 4 mẫu.
4. **M3-N28-037**: số 110 000 vượt phạm vi 100 000 của lớp 3.
5. **177 lời giải rất ngắn** (dưới 30 ký tự), nhiều ở N14, N15 (32 câu mỗi chuyên đề), N28 (20), N08 (16).
6. **N33 dãy nhân đôi** (2, 4, 8, 16 …; 11, 22, 44, 88 …) – nên cân nhắc có hợp lớp 3 không; số tới 176.
7. Câu mới dùng lại mã M3-N06-001… như bản nháp cũ: nếu bản cũ từng được nhập thử, hệ thống sẽ báo "trùng mã" khi nhập.

## Kết luận
Về kỹ thuật: **sẵn sàng nhập dưới dạng nháp**. Về nội dung: cần giáo viên duyệt, ưu tiên các mục 2, 3, 4.
