/**
 * Bộ kiểm thử biên Adversarial UI Test Suite (Theo kỹ năng break-ui của Emil Kowalski)
 */

import { state } from './state.js';
import { computeNatalApi } from './api.js';

export const BREAK_UI_SCENARIOS = [
  {
    id: 'long-name',
    title: '1. Tên cực dài với đầy đủ dấu tiếng Việt',
    desc: 'Kiểm tra hiển thị text và ngắt dòng trong tiêu đề & vùng trung tâm',
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '12:30',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'female',
      calendarConvention: 'chinese',
    },
    userName: 'Nguyễn Hoàng Công Tằng Tôn Nữ Bích Thủy Tiên Long Phụng',
    profileId: 'thienky-candidate',
  },
  {
    id: 'empty-palace',
    title: '2. Cung Mệnh Vô Chính Diệu (Mượn sao đối cung)',
    desc: 'Kiểm tra hiển thị nhãn [Vô chính diệu] và sao mượn từ cung Thiên Di',
    birth: {
      calendar: 'solar',
      date: '1990-08-15',
      time: '06:00',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    userName: 'Trần Văn VCD',
    profileId: 'thienky-candidate',
  },
  {
    id: 'leap-month',
    title: '3. Tháng Nhuận Âm Lịch (Tháng 5 nhuận năm 1990)',
    desc: 'Kiểm tra xử lý cờ isLeap: true của âm lịch và quy tắc nhuận của profile',
    birth: {
      calendar: 'lunar',
      date: '1990-05-15',
      isLeap: true,
      time: '14:20',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'female',
      calendarConvention: 'chinese',
    },
    userName: 'Lê Thị Nhuận',
    profileId: 'thienky-candidate',
  },
  {
    id: 'hour-boundary',
    title: '4. Giáp ranh giờ Tý / Hợi (23:00)',
    desc: 'Kiểm tra kích hoạt modal chọn kịch bản ranh giờ',
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '23:00',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    userName: 'Phạm Ranh Giờ',
    profileId: 'thienky-candidate',
  },
  {
    id: 'unknown-time',
    title: '5. Chưa rõ giờ sinh (time: null)',
    desc: 'Kiểm tra backend trả NEEDS_BIRTH_TIME mà không tự động đoán 00:00',
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: null,
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    userName: 'Vô Danh Giờ',
    profileId: 'thienky-candidate',
  },
];

export function setupBreakUi() {
  const breakModal = document.getElementById('break-modal');
  const breakModalClose = document.getElementById('break-modal-close');
  const breakModalList = document.getElementById('break-modal-list');
  const breakToggleBtn = document.getElementById('break-toggle-btn');

  if (!breakToggleBtn) return;

  breakToggleBtn.addEventListener('click', () => {
    renderBreakUiList();
    breakModal.classList.remove('hidden');
  });

  breakModalClose.addEventListener('click', () => {
    breakModal.classList.add('hidden');
  });

  function renderBreakUiList() {
    breakModalList.innerHTML = '';
    BREAK_UI_SCENARIOS.forEach(sc => {
      const item = document.createElement('div');
      item.className = 'scenario-card';
      item.innerHTML = `
        <div style="flex: 1; margin-right: 12px;">
          <div style="font-weight: 700; color: #F59E0B; font-size: 0.9rem;">
            ${sc.title}
          </div>
          <div style="font-size: 0.78rem; color: #94A3B8; margin-top: 2px;">
            ${sc.desc}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button">Áp dụng</button>
      `;

      item.querySelector('button').addEventListener('click', async () => {
        breakModal.classList.add('hidden');
        await applyBreakScenario(sc);
      });

      breakModalList.appendChild(item);
    });
  }

  async function applyBreakScenario(sc) {
    state.setState({
      isLoading: true,
      error: null,
      needsInfo: null,
      userName: sc.userName,
    });

    const result = await computeNatalApi(sc.birth, sc.profileId);
    if (result.httpStatus === 200 && result.data.status === 'ok') {
      state.setState({
        currentNatal: result.data,
        isSample: false,
        isLoading: false,
        selectedBranch: result.data.displayNatal?.mingGongBranch ?? 0,
      });
      state.setView('chart');
    } else if (result.httpStatus === 422 && result.data.status === 'needs') {
      state.setState({
        isLoading: false,
        needsInfo: result.data,
      });
      if (result.data.reason === 'HOUR_BOUNDARY' && result.data.scenarios) {
        const modalBackdrop = document.getElementById('scenario-modal');
        const modalBody = document.getElementById('scenario-modal-body');
        modalBody.innerHTML = `
          <p style="margin-bottom: 10px; color: #FDE047;">Kiểm thử ca giáp ranh giờ 23:00 thành công! Backend đã trả về ${result.data.scenarios.length} kịch bản chuẩn hóa.</p>
        `;
        modalBackdrop.classList.remove('hidden');
      }
    } else {
      state.setState({
        isLoading: false,
        error: result.data?.error || `Lỗi HTTP: ${result.httpStatus}`,
      });
    }
  }
}
