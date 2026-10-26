import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { duplicateNames, readRosterFile, rosterFromRows } from '../features/games/bell/rosterFile';

const LONG = 'Nguyễn Hoàng Bảo Ngọc Thiên Phương Anh';
const sheetFile = (rows: unknown[][], name: string, bookType: XLSX.BookType) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'DS');
  return new File([XLSX.write(wb, { type: 'array', bookType })], name);
};

describe('Đọc danh sách học sinh từ tệp', () => {
  it('nhận cột STT, Họ và tên, Lớp; bỏ dòng trống và tiêu đề trường', () => {
    const r = rosterFromRows([
      ['TRƯỜNG TIỂU HỌC MIMO'],
      [],
      ['STT', 'Họ và tên', 'Lớp'],
      ['1', 'Nguyễn An', '3A'],
      ['', '', ''],
      ['2', ' Trần   Bình ', '3A'],
      ['3', LONG, '3A'],
    ]);
    expect(r).toEqual({ names: ['Nguyễn An', 'Trần Bình', LONG], className: '3A' });
  });

  it('ghép cột Họ (đệm) và Tên', () => {
    expect(rosterFromRows([['STT', 'Họ và tên đệm', 'Tên'], ['1', 'Lê Thị', 'Chi'], ['2', 'Phạm', 'Dũng']]).names).toEqual(['Lê Thị Chi', 'Phạm Dũng']);
  });

  it('không có tiêu đề: lấy cột tên, bỏ số thứ tự viết trước tên', () => {
    expect(rosterFromRows([['1', 'Nguyễn An'], ['2', 'Trần Bình']]).names).toEqual(['Nguyễn An', 'Trần Bình']);
    expect(rosterFromRows([['1. Nguyễn An'], ['2) Trần Bình'], ['Lê Chi']]).names).toEqual(['Nguyễn An', 'Trần Bình', 'Lê Chi']);
  });

  it('tên trùng được báo, không bị xóa', () => {
    const names = ['Nguyễn An', 'Trần Bình', 'nguyễn  an'].map((name, i) => ({ seat: i + 1, name }));
    expect(duplicateNames(names)).toEqual([{ name: 'Nguyễn An', seats: [1, 3] }]);
  });

  it('đọc tệp Excel .xlsx, .xls và CSV 41 học sinh', async () => {
    const rows = [['STT', 'Họ và tên', 'Lớp'], ...Array.from({ length: 41 }, (_, i) => [i + 1, i === 40 ? LONG : `Học sinh ${i + 1}`, '3A'])];
    for (const [name, type] of [['ds.xlsx', 'xlsx'], ['ds.xls', 'biff8']] as const) {
      const r = await readRosterFile(sheetFile(rows, name, type));
      expect(r.names).toHaveLength(41);
      expect(r.names[40]).toBe(LONG);
      expect(r.className).toBe('3A');
    }
    const csv = new File(['﻿STT,Họ và tên,Lớp\n' + rows.slice(1).map((r) => r.join(',')).join('\n')], 'ds.csv');
    expect((await readRosterFile(csv)).names).toHaveLength(41);
  });

  it('từ chối tệp sai loại, quá lớn hoặc không có tên', async () => {
    await expect(readRosterFile(new File(['x'], 'ds.pdf'))).rejects.toThrow('Chọn tệp Excel');
    await expect(readRosterFile(new File([new Uint8Array(3 * 1024 * 1024)], 'ds.csv'))).rejects.toThrow('quá lớn');
    await expect(readRosterFile(new File(['1,2\n3,4'], 'ds.csv'))).rejects.toThrow('Không tìm thấy tên');
    await expect(readRosterFile(new File(['không phải excel'], 'ds.xlsx'))).rejects.toThrow();
  });
});
