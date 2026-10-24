import { describe, it, expect } from 'vitest';
import { createRichTextFromPlain, gradeSingleQuestion } from '../utils/gradingEngine';
import type { HomeworkQuestion } from '../types/domain';

/** Short answers as grade-3 pupils write them, graded against one key answer. */
const grade = (
  acceptableAnswers: string[],
  studentText: string,
  options: Pick<HomeworkQuestion, 'unitMode' | 'acceptEquivalentFractions'> = {}
) => {
  const q: HomeworkQuestion = {
    id: 'q1',
    order: 1,
    type: 'short_answer',
    prompt: createRichTextFromPlain('Câu hỏi'),
    points: 1,
    acceptableAnswers,
    ...options,
  };
  return gradeSingleQuestion(q, { questionId: 'q1', type: 'short_answer', shortAnswerText: studentText }).isCorrect;
};

describe('Chấm câu trả lời ngắn – đáp án Toán lớp 3', () => {
  it('chấp nhận các cách viết số có hàng nghìn', () => {
    for (const s of ['1000', '1 000', '1.000', ' 1 000 ', '1000.']) expect(grade(['1000'], s), s).toBe(true);
    for (const s of ['12345', '12 345', '12.345']) expect(grade(['12 345'], s), s).toBe(true);
    expect(grade(['100 000'], '100000')).toBe(true);
    expect(grade(['1 000 000'], '1.000.000')).toBe(true);
  });

  it('không nhầm số thập phân với dấu phân cách hàng nghìn', () => {
    expect(grade(['2,5'], '2.5')).toBe(true);
    expect(grade(['2,5'], '2,50')).toBe(true);
    expect(grade(['2,5'], '25')).toBe(false);
    expect(grade(['1000'], '1,000')).toBe(false); // dấu phẩy là dấu thập phân: 1,000 = 1
    expect(grade(['1000'], '100')).toBe(false);
    expect(grade(['1000'], '10 00')).toBe(false); // nhóm không đủ 3 chữ số
    expect(grade(['0,125'], '0.125')).toBe(true);
    expect(grade(['125'], '0.125')).toBe(false);
    expect(grade(['1 000,5'], '1.000,5')).toBe(true);
  });

  it('chấp nhận phân số và phép tính viết có hoặc không có dấu cách', () => {
    expect(grade(['3/4'], '3 / 4')).toBe(true);
    expect(grade(['3 / 4'], '3/4')).toBe(true);
    expect(grade(['3/4'], '4/3')).toBe(false);
    expect(grade(['3/4'], '6/8')).toBe(false); // phân số khác cách viết thì giáo viên tự thêm đáp án
    expect(grade(['12 : 3 = 4'], '12:3=4')).toBe(true);
    expect(grade(['12 : 3'], '12 ÷ 3')).toBe(true);
    expect(grade(['3 × 4'], '3 x 4')).toBe(true);
    expect(grade(['3 × 4'], '3*4')).toBe(true);
    expect(grade(['5 - 3'], '5-3')).toBe(true);
    expect(grade(['-5'], '− 5')).toBe(true);
  });

  it('chấp nhận đơn vị viết liền hoặc cách số', () => {
    expect(grade(['42 cm'], '42cm')).toBe(true);
    expect(grade(['42cm'], '42 cm')).toBe(true);
    expect(grade(['42 cm'], '42 CM')).toBe(true);
    expect(grade(['25 cm²'], '25cm2')).toBe(true);
    expect(grade(['50%'], '50 %')).toBe(true);
    expect(grade(['2 kg 500 g'], '2kg 500g')).toBe(true);
    expect(grade(['7 giờ 5 phút'], '7 giờ 05 phút')).toBe(true);
    expect(grade(['100 000 đồng'], '100000đồng')).toBe(true);
  });

  it('không đánh đồng các đơn vị đo khác nhau', () => {
    expect(grade(['42 cm'], '42 mm')).toBe(false);
    expect(grade(['42 cm'], '42 dm')).toBe(false);
    expect(grade(['42 cm'], '42 m')).toBe(false);
    expect(grade(['2 kg'], '2 g')).toBe(false);
    expect(grade(['25 cm²'], '25 cm')).toBe(false);
    expect(grade(['42 cm'], '42')).toBe(false); // thiếu đơn vị: chỉ đúng nếu giáo viên thêm "42" vào đáp án
    expect(grade(['42'], '42 cm')).toBe(false);
  });

  it('vẫn chấm đúng các đáp án chữ và không cho bài trống', () => {
    expect(grade(['Đúng'], 'đúng')).toBe(true);
    expect(grade(['Hình vuông'], '  hình   vuông ')).toBe(true);
    expect(grade(['hình vuông'], 'hình chữ nhật')).toBe(false);
    expect(grade(['0'], '')).toBe(false);
    expect(grade(['0'], '   ')).toBe(false);
    expect(grade(['0'], '00')).toBe(true);
  });

  describe('đơn vị theo yêu cầu của câu hỏi', () => {
    const optional = { unitMode: 'optional' as const };
    it('mặc định đơn vị là bắt buộc và phải đúng như đáp án', () => {
      expect(grade(['42 cm'], '42')).toBe(false);
      expect(grade(['42 cm'], '42 cm')).toBe(true);
      expect(grade(['42 cm'], '42 cm', { unitMode: 'required' })).toBe(true);
      expect(grade(['42 cm'], '42', { unitMode: 'required' })).toBe(false);
    });
    it('khi đề đã ghi sẵn đơn vị, học sinh được bỏ đơn vị', () => {
      expect(grade(['42 cm'], '42', optional)).toBe(true);
      expect(grade(['42'], '42cm', optional)).toBe(true);
      expect(grade(['1 000 g'], '1000', optional)).toBe(true);
      expect(grade(['3/4 m'], '3 / 4', optional)).toBe(true);
    });
    it('nhưng đơn vị đã viết phải đúng, và không bao giờ tự đổi đơn vị', () => {
      expect(grade(['42 cm'], '42 mm', optional)).toBe(false);
      expect(grade(['42 cm'], '420 mm', optional)).toBe(false);
      expect(grade(['1 kg'], '1000 g', optional)).toBe(false);
      expect(grade(['42 cm'], '43', optional)).toBe(false);
      expect(grade(['2 kg 500 g'], '2 kg', optional)).toBe(false);
      expect(grade(['2 kg 500 g'], '2kg 500g', optional)).toBe(true);
    });
  });

  describe('phân số tương đương khi câu hỏi cho phép', () => {
    const equivalent = { acceptEquivalentFractions: true };
    it('mặc định chỉ chấp nhận đúng phân số trong đáp án', () => {
      expect(grade(['3/4'], '6/8')).toBe(false);
      expect(grade(['1/2'], '2/4')).toBe(false);
    });
    it('khi bật, chấp nhận phân số bằng nhau', () => {
      expect(grade(['3/4'], '6/8', equivalent)).toBe(true);
      expect(grade(['1/2'], '50 / 100', equivalent)).toBe(true);
      expect(grade(['2/3 m'], '4/6 m', equivalent)).toBe(true);
    });
    it('vẫn không coi các đáp án khác giá trị là đúng', () => {
      expect(grade(['3/4'], '3/5', equivalent)).toBe(false);
      expect(grade(['3/4'], '4/3', equivalent)).toBe(false);
      expect(grade(['2'], '4/2', equivalent)).toBe(false); // số tự nhiên khác phân số: giáo viên tự thêm nếu muốn
      expect(grade(['1/2'], '0,5', equivalent)).toBe(false);
      expect(grade(['0/5'], '0/0', equivalent)).toBe(false);
      expect(grade(['2/3 m'], '4/6 cm', equivalent)).toBe(false);
      expect(grade(['2/3 m'], '4/6', equivalent)).toBe(false); // thiếu đơn vị khi đơn vị bắt buộc
      expect(grade(['2/3 m'], '4/6', { ...equivalent, unitMode: 'optional' })).toBe(true);
    });
  });
});
