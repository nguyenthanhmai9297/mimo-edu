import type React from 'react';
import {
  CountdownArt,
  GamesArt,
  Geometry3DArt,
  MathCanvasArt,
  MindMapArt,
  PracticeArt,
  PuzzleArt,
  QuickQuizArt,
  RandomPickerArt,
  ScoreboardArt,
  TrainArt,
  TugOfWarArt,
} from './ToolIllustrations';

export type ToolCategory = 'math' | 'game' | 'activity' | 'visual' | 'quiz';

export const TOOL_CATEGORIES: { id: ToolCategory; label: string; badge: string }[] = [
  { id: 'math', label: 'Công cụ Toán học', badge: 'bg-[#E6FAFC] text-[#0E8A9A]' },
  { id: 'game', label: 'Trò chơi tương tác', badge: 'bg-[#F3EFFF] text-[#6A4BE6]' },
  { id: 'activity', label: 'Hoạt động trên lớp', badge: 'bg-[#EAF5FF] text-[#1267E9]' },
  { id: 'visual', label: 'Công cụ trực quan', badge: 'bg-[#FFF6DC] text-[#B7790A]' },
  { id: 'quiz', label: 'Kiểm tra nhanh', badge: 'bg-[#FFEDF6] text-[#D9468C]' },
];

export interface TeachingTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  art: React.FC;
  /** Uses question sets from Kho học liệu Toán 3 / Luyện Toán cùng Mimo. */
  usesQuestions: boolean;
  audience: string;
  duration?: string;
  /** ready: built-in tool page · link: existing MimoEDU page · soon: not built yet */
  status: 'ready' | 'link' | 'soon';
  /** Route to open (built-in tools live under /admin/tools/:id). */
  to?: string;
  /** Shortcut to a student-facing feature (e.g. Kho trò chơi) – previewed, not run by the teacher. */
  studentShortcut?: boolean;
  featured?: boolean;
  isNew?: boolean;
  keywords?: string;
}

export const TEACHING_TOOLS: TeachingTool[] = [
  {
    id: 'bang-ve-toan',
    name: 'Bảng vẽ Toán học',
    description: 'Vẽ điểm, đoạn thẳng, tam giác, tứ giác, hình tròn; kéo đỉnh, thêm đường cao, đường chéo; xuất PNG, SVG, PDF.',
    category: 'math',
    art: MathCanvasArt,
    usesQuestions: false,
    audience: 'Cả lớp',
    duration: 'Tùy chọn',
    status: 'ready',
    to: '/admin/tools/bang-ve-toan',
    isNew: true,
    keywords: 'bang ve toan hoc hinh hoc diem doan thang tam giac hinh vuong hinh tron duong cao dem hinh math canvas',
  },
  {
    id: 'goi-ten',
    name: 'Gọi tên & Chia nhóm',
    description: 'Gọi ngẫu nhiên học sinh trong lớp, không gọi trùng, và chia nhóm đều chỉ trong một chạm.',
    category: 'activity',
    art: RandomPickerArt,
    usesQuestions: false,
    audience: 'Cả lớp',
    duration: '1 phút',
    status: 'ready',
    to: '/admin/tools/goi-ten',
    featured: true,
    isNew: true,
    keywords: 'ngẫu nhiên vòng quay bốc thăm chia đội nhóm học sinh',
  },
  {
    id: 'dong-ho',
    name: 'Đồng hồ đếm ngược',
    description: 'Đặt thời gian cho hoạt động, số to rõ khi trình chiếu, có chuông báo hết giờ.',
    category: 'activity',
    art: CountdownArt,
    usesQuestions: false,
    audience: 'Cả lớp',
    duration: 'Tùy chọn',
    status: 'ready',
    to: '/admin/tools/dong-ho',
    isNew: true,
    keywords: 'hẹn giờ bấm giờ thời gian timer',
  },
  {
    id: 'keo-co',
    name: 'Kéo co kiến thức',
    description: 'Hai đội trả lời câu hỏi để kéo dây về phía mình. Đội dẫn trước 3 điểm hoặc nhiều điểm hơn khi hết giờ sẽ thắng.',
    category: 'game',
    art: TugOfWarArt,
    usesQuestions: true,
    audience: '2 đội',
    duration: '5–10 phút',
    status: 'ready',
    to: '/admin/tools/keo-co',
    isNew: true,
    keywords: 'keo co thi dau hai doi tro choi cau hoi',
  },
  {
    id: 'doan-tau',
    name: 'Đoàn tàu kiến thức',
    description: 'Kéo thả xếp các toa thành đoàn tàu đúng thứ tự, hoặc hai đội trả lời câu hỏi để nối toa về ga đích.',
    category: 'game',
    art: TrainArt,
    usesQuestions: true,
    audience: 'Cả lớp / 2 đội',
    duration: '5–15 phút',
    status: 'ready',
    to: '/admin/tools/doan-tau',
    isNew: true,
    keywords: 'doan tau tri thuc kien thuc xep toa thu tu sap xep keo tha so be lon noi toa thi dau hai doi',
  },
  {
    id: 'mimo-quiz',
    name: 'Mimo Quiz',
    description: 'Trắc nghiệm tương tác: chiếu từng câu lên bảng, đếm ngược, hiện đáp án khi giáo viên cho phép.',
    category: 'quiz',
    art: QuickQuizArt,
    usesQuestions: true,
    audience: 'Cả lớp',
    duration: '5–15 phút',
    status: 'ready',
    to: '/admin/tools/mimo-quiz',
    isNew: true,
    keywords: 'quiz trac nghiem trinh chieu dap an cau hoi nhanh',
  },
  {
    id: 'so-do-tu-duy',
    name: 'Sơ đồ tư duy Mimo',
    description: 'Vẽ sơ đồ tư duy nhiều nhánh, kéo thả, tự sắp xếp và mở dần từng nhánh khi giảng bài.',
    category: 'visual',
    art: MindMapArt,
    usesQuestions: false,
    audience: 'Cả lớp',
    duration: 'Tùy chọn',
    status: 'ready',
    to: '/admin/tools/so-do-tu-duy',
    isNew: true,
    keywords: 'so do tu duy mind map nhanh ghi nho on tap',
  },
  {
    id: 'lat-manh-ghep',
    name: 'Lật mảnh ghép Mimo',
    description: 'Trả lời đúng để lật từng mảnh ghép và đoán bức hình bí mật.',
    category: 'game',
    art: PuzzleArt,
    usesQuestions: true,
    audience: '2–4 đội',
    duration: '10 phút',
    status: 'soon',
    keywords: 'mảnh ghép bí mật đoán hình trò chơi',
  },
  {
    id: 'bang-diem',
    name: 'Bảng điểm thi đua',
    description: 'Cộng, trừ điểm và theo dõi thứ hạng các đội ngay trong tiết học.',
    category: 'activity',
    art: ScoreboardArt,
    usesQuestions: false,
    audience: '2–6 đội',
    duration: 'Cả tiết',
    status: 'soon',
    keywords: 'điểm thi đua đội nhóm xếp hạng',
  },
  {
    id: 'kho-tro-choi',
    name: 'Kho trò chơi (học sinh)',
    description: 'Xem trước các trò chơi Toán học sinh tự chọn và tự chơi ở cổng học sinh.',
    category: 'game',
    art: GamesArt,
    usesQuestions: false,
    audience: 'Cá nhân',
    status: 'link',
    to: '/admin/games',
    studentShortcut: true,
    keywords: 'trò chơi game phet iframe',
  },
  {
    id: 'hinh-hoc-3d',
    name: 'Hình học 3D',
    description: 'Quan sát, xoay, trải phẳng và đổ đầy các khối hình không gian.',
    category: 'math',
    art: Geometry3DArt,
    usesQuestions: false,
    audience: 'Cả lớp',
    status: 'link',
    to: '/admin/geometry3d',
    keywords: 'khối lập phương hộp chữ nhật trụ cầu nón',
  },
  {
    id: 'luyen-toan',
    name: 'Luyện Toán cùng Mimo',
    description: 'Ngân hàng câu hỏi theo chuyên đề và 4 mức độ để học sinh tự luyện.',
    category: 'quiz',
    art: PracticeArt,
    usesQuestions: true,
    audience: 'Cá nhân',
    status: 'link',
    to: '/admin/practice',
    keywords: 'luyện tập chuyên đề mức độ ngân hàng câu hỏi',
  },
];

export function findTool(id: string | undefined): TeachingTool | undefined {
  return TEACHING_TOOLS.find((t) => t.id === id);
}

/** Case- and accent-insensitive search over name, description and keywords. */
export function matchesToolSearch(tool: TeachingTool, query: string): boolean {
  const fold = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const q = fold(query.trim());
  if (!q) return true;
  return fold(`${tool.name} ${tool.description} ${tool.keywords ?? ''}`).includes(q);
}
