/**
 * "Luyện Toán cùng Mimo" – Toán lớp 3: 5 nhóm kiến thức, 35 chuyên đề.
 * Danh mục do giáo viên cung cấp; câu hỏi nằm trong question-bank/ và Firestore.
 */
export interface PracticeTopicInfo {
  id: string;
  name: string;
  /** Tên tiếng Việt của kĩ năng theo mã skillId; thiếu thì hiển thị mã. */
  skills?: Record<string, string>;
}

export interface PracticeGroupInfo {
  id: string;
  name: string;
  topics: PracticeTopicInfo[];
}

export const PRACTICE_CATALOG: PracticeGroupInfo[] = [
  {
    id: 'I',
    name: 'Số và phép tính',
    topics: [
      {
        id: 'N01',
        name: 'Số tự nhiên trong phạm vi 100 000',
        // Tạm dịch từ mã kĩ năng trong bộ N01 – cần giáo viên xác nhận
        skills: {
          'N01.read_write': 'Đọc, viết số',
          'N01.place_value': 'Hàng và giá trị của chữ số',
          'N01.successor': 'Số liền trước, số liền sau',
          'N01.digits': 'Số có năm chữ số',
          'N01.decompose': 'Phân tích số thành tổng',
          'N01.compose': 'Viết số từ các hàng',
          'N01.compare': 'So sánh, sắp xếp số',
          'N01.sequence': 'Dãy số',
          'N01.digit_puzzle': 'Lập số từ các chữ số',
          'N01.logic': 'Suy luận về số',
        },
      },
      { id: 'N02', name: 'So sánh và sắp xếp số' },
      { id: 'N03', name: 'Dãy số và quy luật' },
      { id: 'N04', name: 'Làm tròn số' },
      { id: 'N05', name: 'Phép cộng và phép trừ' },
      { id: 'N06', name: 'Phép nhân và phép chia' },
      { id: 'N07', name: 'Tính giá trị biểu thức' },
      { id: 'N08', name: 'Tính nhanh, tính thuận tiện' },
      { id: 'N09', name: 'Tìm thành phần chưa biết' },
      { id: 'N10', name: 'Phép chia có dư' },
      { id: 'N11', name: 'Chữ số La Mã' },
      { id: 'N12', name: 'Một phần mấy' },
    ],
  },
  {
    id: 'II',
    name: 'Toán có lời văn',
    topics: [
      { id: 'N13', name: 'Bài toán giải bằng hai bước tính' },
      { id: 'N14', name: 'Gấp một số lên nhiều lần' },
      { id: 'N15', name: 'Giảm một số đi nhiều lần' },
      { id: 'N16', name: 'So sánh số lớn gấp mấy lần số bé' },
      { id: 'N17', name: 'Bài toán về một phần mấy' },
      { id: 'N18', name: 'Bài toán rút về đơn vị' },
      { id: 'N19', name: 'Bài toán thực tế tổng hợp' },
    ],
  },
  {
    id: 'III',
    name: 'Hình học và đo lường',
    topics: [
      { id: 'N20', name: 'Điểm, đoạn thẳng và các hình học' },
      { id: 'N21', name: 'Hình tròn' },
      { id: 'N22', name: 'Chu vi các hình' },
      { id: 'N23', name: 'Diện tích hình chữ nhật, hình vuông' },
      { id: 'N24', name: 'Đơn vị đo độ dài' },
      { id: 'N25', name: 'Đơn vị đo khối lượng' },
      { id: 'N26', name: 'Đơn vị đo dung tích' },
      { id: 'N27', name: 'Thời gian và xem đồng hồ' },
      { id: 'N28', name: 'Tiền Việt Nam' },
      { id: 'N29', name: 'Nhiệt độ' },
    ],
  },
  {
    id: 'IV',
    name: 'Thống kê và xác suất',
    topics: [
      { id: 'N30', name: 'Thu thập và phân loại số liệu' },
      { id: 'N31', name: 'Bảng số liệu' },
      { id: 'N32', name: 'Khả năng xảy ra của sự kiện' },
    ],
  },
  {
    id: 'V',
    name: 'Toán tư duy và nâng cao',
    topics: [
      { id: 'N33', name: 'Tư duy quy luật và suy luận logic' },
      { id: 'N34', name: 'Toán tổ hợp đơn giản' },
      { id: 'N35', name: 'Toán thử thách tổng hợp' },
    ],
  },
];

export const PRACTICE_TOPICS: PracticeTopicInfo[] = PRACTICE_CATALOG.flatMap((g) => g.topics);

export function findPracticeTopic(topicId: string): PracticeTopicInfo | undefined {
  return PRACTICE_TOPICS.find((t) => t.id === topicId);
}

export function practiceSkillLabel(skillId: string): string {
  const topic = findPracticeTopic(skillId.split('.')[0]);
  return topic?.skills?.[skillId] ?? skillId.split('.').slice(1).join('.') ?? skillId;
}
