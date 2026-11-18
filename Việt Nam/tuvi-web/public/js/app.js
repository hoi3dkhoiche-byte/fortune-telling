/**
 * Điểm khởi nhập chính của ứng dụng Thiên Kỷ Web — Giao Diện Vũ Trụ
 */

import { state } from './state.js';
import { fetchProfiles, fetchSampleChart } from './api.js';
import { initStarfield } from './starfield.js';
import { setupForm } from './form.js';
import { setupChart } from './chart.js';
import { setupDetails } from './details.js';
import { setupBreakUi } from './break-ui.js';
import { generateReading } from './reading.js';

async function init() {
  console.log('[Thiên Kỷ] Khởi động giao diện Chiêm Tinh Vũ Trụ...');

  // 1. Khởi tạo hiệu ứng nền sao vũ trụ tương tác
  initStarfield('starfield-canvas');

  // 2. Khởi tạo các module nghiệp vụ
  setupForm();
  setupChart();
  setupDetails();
  setupBreakUi();

  // 3. Quản lý điều hướng 3 màn hình riêng biệt
  setupViewNavigation();

  // 4. Thanh cảnh báo lỗi
  setupAlertBanners();

  // 5. Tải danh sách profiles từ backend
  try {
    const profileData = await fetchProfiles();
    state.setState({
      profiles: profileData.profiles || {},
      profileEvidence: profileData.evidence || {},
      selectedProfileId: profileData.defaultProfileId || 'thienky-candidate',
    });
  } catch (err) {
    console.warn('Không tải được profiles tự động:', err);
  }

  // 6. Nạp sẵn dữ liệu mẫu vào nền để sẵn sàng hiển thị khi cần
  try {
    const sample = await fetchSampleChart();
    state.setState({
      currentNatal: sample,
      isSample: true,
      userName: 'Lá Số Mẫu Minh Họa',
      selectedBranch: sample.displayNatal?.mingGongBranch ?? 7,
    });
  } catch (err) {
    console.warn('Không tải được dữ liệu mẫu:', err);
  }
}

function setupViewNavigation() {
  const viewInput = document.getElementById('view-input');
  const viewChart = document.getElementById('view-chart');
  const viewReading = document.getElementById('view-reading');

  const backToInputBtn = document.getElementById('back-to-input-btn');
  const gotoReadingBtn = document.getElementById('goto-reading-btn');
  const topGotoReadingBtn = document.getElementById('top-goto-reading-btn');
  const backToChartBtn = document.getElementById('back-to-chart-btn');

  // Đăng ký nhận thay đổi màn hình từ state
  state.subscribe(s => {
    const currentView = s.currentView;

    viewInput.classList.toggle('hidden', currentView !== 'input');
    viewChart.classList.toggle('hidden', currentView !== 'chart');
    viewReading.classList.toggle('hidden', currentView !== 'reading');

    if (currentView === 'reading') {
      renderReadingScreen(s);
    }
  });

  if (backToInputBtn) {
    backToInputBtn.addEventListener('click', () => {
      state.setView('input');
    });
  }

  if (gotoReadingBtn) {
    gotoReadingBtn.addEventListener('click', () => {
      state.setView('reading');
    });
  }

  if (topGotoReadingBtn) {
    topGotoReadingBtn.addEventListener('click', () => {
      state.setView('reading');
    });
  }

  if (backToChartBtn) {
    backToChartBtn.addEventListener('click', () => {
      state.setView('chart');
    });
  }

  // Chuyển chế độ xem mobile giữa Bàn cờ và 12 cung
  const tabs = document.querySelectorAll('.view-mode-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      state.setViewMode(mode);
    });
  });
}

function renderReadingScreen(s) {
  const container = document.getElementById('reading-container');
  if (!container) return;

  const reading = generateReading(s.currentNatal);
  if (!reading) {
    container.innerHTML = '<p style="text-align: center; color: #94A3B8;">Chưa có dữ liệu lá số để luận giải.</p>';
    return;
  }

  container.innerHTML = `
    <!-- Thẻ 1: Tổng Quan Mệnh & Thân -->
    <div class="reading-card">
      <div class="reading-card-title">
        Cốt Cách Bản Mệnh & Hậu Vận Cung Thân
      </div>
      <div class="reading-card-body">
        <p style="margin-bottom: 10px;">${reading.mingOverview}</p>
        <p>${reading.shenOverview}</p>
      </div>
    </div>

    <!-- Thẻ 2: Cục và Mệnh Tương Phối -->
    <div class="reading-card">
      <div class="reading-card-title">
        Ngũ Hành Cục (${reading.juName})
      </div>
      <div class="reading-card-body">
        <p>
          Lá số an tại <strong>${reading.juName}</strong>. Trong Tử Vi Đẩu Số, Cục tượng trưng cho môi trường xã hội, hoàn cảnh sinh tồn và trường khí bao bọc lấy bản mệnh.
          Đương số nắm giữ cục số này thường phát huy tối đa năng lực khi đặt mình vào đúng môi trường sở trường, thuận theo thời thế để tạo dựng cơ nghiệp vững bền.
        </p>
      </div>
    </div>

    <!-- Thẻ 3: Tứ Hóa Bản Mệnh -->
    <div class="reading-card">
      <div class="reading-card-title">
        Tứ Hóa Bản Mệnh (Lộc • Quyền • Khoa • Kỵ)
      </div>
      <div class="reading-card-body">
        <p style="margin-bottom: 10px;">
          Tứ Hóa là 4 ngọn gió chuyển hóa nghiệp lực, xoay chuyển cát hung trên toàn bộ tinh bàn:
        </p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${reading.sihuaList.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.5); padding: 8px 12px; border-radius: 6px;">
              <div>
                <strong style="color: #FDE047;">${item.star}</strong> hóa <span class="sihua-badge sh-${getSihuaSlug(item.sihua)}">${item.sihua.replace('Hóa ', '')}</span>
              </div>
              <div style="color: #94A3B8; font-size: 0.85rem;">
                Tọa thủ tại <strong>Cung ${item.palace}</strong> (${item.branch})
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Thẻ 4: Vận Trình Thập Niên Đại Hạn -->
    <div class="reading-card">
      <div class="reading-card-title">
        Vận Trình Thập Niên Đại Hạn (10 Năm Một Chặng)
      </div>
      <div class="reading-card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
          ${reading.daxianList.map(dx => `
            <div style="background: rgba(30, 41, 59, 0.4); padding: 10px; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.1);">
              <div style="display: flex; justify-content: space-between; font-weight: 700; color: #F59E0B; margin-bottom: 4px;">
                <span>Cung ${dx.palace}</span>
                <span>${dx.range} tuổi</span>
              </div>
              <div style="font-size: 0.8rem; color: #94A3B8;">
                Chính tinh: <strong style="color: #E2E8F0;">${dx.stars}</strong>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Thẻ 5: Triết Lý Thiên Kỷ & Tu Thân -->
    <div class="reading-card" style="border-color: rgba(245, 158, 11, 0.4);">
      <div class="reading-card-title" style="color: #F59E0B;">
        Triết Lý Thiên Kỷ — Nhân Định Thắng Thiên
      </div>
      <div class="reading-card-body">
        <p style="margin-bottom: 8px;">
          Theo giáo trình của Thầy Nghê Hải Hà: <em>"Lá số Tử Vi là Thiên Mệnh (1/3), Phong Thủy Dương Trạch là Địa Lợi (1/3), và Hành Xử Tu Dưỡng của con người là Nhân Hòa (1/3)."</em>
        </p>
        <p>
          Số mệnh không phải điều bất di bất dịch mà là bản đồ chỉ đường. Biết cung xấu để phòng thân tu tâm, biết cung tốt để nắm bắt thời cơ. Người có trí tuệ lấy đức hạnh làm gốc, hành sự chính trực thì mọi hung họa đều có thể hóa giải thành an lành.
        </p>
      </div>
    </div>
  `;
}

function getSihuaSlug(text) {
  if (text.includes('Lộc')) return 'lu';
  if (text.includes('Quyền')) return 'quan';
  if (text.includes('Khoa')) return 'ke';
  if (text.includes('Kỵ')) return 'ji';
  return 'lu';
}

function setupAlertBanners() {
  const alertContainer = document.getElementById('global-alert-container');

  state.subscribe(s => {
    alertContainer.innerHTML = '';

    if (s.error) {
      const errBox = document.createElement('div');
      errBox.className = 'alert-box alert-error';
      errBox.style.cssText = 'background: rgba(239, 68, 68, 0.2); border: 1px solid #EF4444; color: #FCA5A5; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;';
      errBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; color: #EF4444;">[Lưu ý]</span>
          <span><strong>Lỗi:</strong> ${s.error}</span>
        </div>
        <button style="background: none; border: none; color: inherit; font-size: 1.1rem; cursor: pointer;" type="button">✕</button>
      `;
      errBox.querySelector('button').addEventListener('click', () => {
        state.setState({ error: null });
      });
      alertContainer.appendChild(errBox);
    }

    if (s.needsInfo) {
      const needs = s.needsInfo;
      const warnBox = document.createElement('div');
      warnBox.className = 'alert-box alert-warning';
      warnBox.style.cssText = 'background: rgba(245, 158, 11, 0.2); border: 1px solid #F59E0B; color: #FDE047; padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;';
      let msg = '';

      switch (needs.reason) {
        case 'NEEDS_BIRTH_TIME':
          msg = 'Chưa rõ giờ sinh: Thuật toán cần giờ sinh cụ thể để an sao. Bạn có thể chọn giờ ước lượng.';
          break;
        case 'HOUR_BOUNDARY':
          msg = `Giáp ranh giờ sinh: Thời điểm sinh gần ranh giới giữa hai giờ. Mời chọn phương án an sao.`;
          break;
        case 'CALENDAR_DIVERGENCE':
          msg = 'Phân kỳ lịch: Ngày sinh này có sự khác biệt giữa Lịch Trung Quốc và Lịch Việt.';
          break;
        default:
          msg = `Yêu cầu làm rõ dữ kiện: ${needs.reason}`;
      }

      warnBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>ℹ️</span>
          <span>${msg}</span>
        </div>
        <button style="background: none; border: none; color: inherit; font-size: 1.1rem; cursor: pointer;" type="button">✕</button>
      `;
      warnBox.querySelector('button').addEventListener('click', () => {
        state.setState({ needsInfo: null });
      });
      alertContainer.appendChild(warnBox);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
