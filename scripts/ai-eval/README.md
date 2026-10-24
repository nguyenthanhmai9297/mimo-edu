# Thử AI thật: ảnh/PDF → bài tập

Đề mẫu tự soạn (không có dữ liệu học sinh) cùng đáp án biết trước, dùng để đo AI nhận diện và giải đề đúng bao nhiêu câu.

1. Thêm khóa vào `.env.local` ở thư mục gốc (tệp này bị git bỏ qua; không dán khóa vào chat hay mã nguồn):
   `ANTHROPIC_API_KEY=...`
2. Chạy thử, chưa tốn phí: `npx tsx scripts/ai-eval/runSample.ts`
3. Gọi AI thật (tốn phí, khoảng 0,05–0,15 USD mỗi lần): `npx tsx scripts/ai-eval/runSample.ts --confirm-cost`
   - `--no-solve`: chỉ nhận diện, không giải đề
   - `--sample <tên>`: dùng đề khác trong `samples/` (cần `<tên>.answers.json`)

Script gọi thẳng bộ xử lý AI trên máy, không qua server, nên không ghi gì lên Firebase. Kết quả đầy đủ nằm trong `out/` (bị git bỏ qua). Ảnh đề được xuất từ `samples/de-lop3-mau-01.html`.
