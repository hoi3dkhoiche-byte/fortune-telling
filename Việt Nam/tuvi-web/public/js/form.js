/**
 * Quản lý Biểu mẫu Lập Lá Số & Chuyển Đổi Màn Hình
 */

import { state } from './state.js';
import { computeNatalApi, fetchSampleChart } from './api.js';

export function setupForm() {
  const form = document.getElementById('birth-form');
  const calendarRadios = document.querySelectorAll('input[name="calendar"]');
  const solarGroup = document.getElementById('solar-date-group');
  const lunarGroup = document.getElementById('lunar-date-group');
  const unknownTimeCheckbox = document.getElementById('unknown-time');
  const birthTimeInput = document.getElementById('birth-time');
  const tzSelect = document.getElementById('tz-select');
  const tzCustomGroup = document.getElementById('tz-custom-group');
  const tzCustomInput = document.getElementById('tz-custom');
  const profileSelect = document.getElementById('profile-select');
  const submitBtn = document.getElementById('submit-btn');
  const sampleBtn = document.getElementById('sample-btn');
  const advToggle = document.getElementById('adv-toggle');
  const advContent = document.getElementById('adv-content');

  // Modal ranh giới giờ sinh
  const modalBackdrop = document.getElementById('scenario-modal');
  const modalBody = document.getElementById('scenario-modal-body');
  const modalCloseBtn = document.getElementById('scenario-modal-close');

  // 1. Chuyển đổi Dương lịch / Âm lịch
  calendarRadios.forEach(radio => {
    radio.addEventListener('change', e => {
      const isLunar = e.target.value === 'lunar';
      solarGroup.style.display = isLunar ? 'none' : 'flex';
      lunarGroup.style.display = isLunar ? 'flex' : 'none';
      document.getElementById('lbl-cal-solar').classList.toggle('active', !isLunar);
      document.getElementById('lbl-cal-lunar').classList.toggle('active', isLunar);
    });
  });

  // 2. Chuyển đổi Nam / Nữ
  const genderRadios = document.querySelectorAll('input[name="gender"]');
  genderRadios.forEach(radio => {
    radio.addEventListener('change', e => {
      document.getElementById('lbl-gender-male').classList.toggle('active', e.target.value === 'male');
      document.getElementById('lbl-gender-female').classList.toggle('active', e.target.value === 'female');
    });
  });

  // 3. Checkbox chưa rõ giờ sinh
  unknownTimeCheckbox.addEventListener('change', e => {
    birthTimeInput.disabled = e.target.checked;
    if (e.target.checked) {
      birthTimeInput.dataset.savedTime = birthTimeInput.value;
      birthTimeInput.value = '';
    } else {
      birthTimeInput.value = birthTimeInput.dataset.savedTime || '12:00';
    }
  });

  // 4. Timezone custom toggle
  tzSelect.addEventListener('change', e => {
    tzCustomGroup.style.display = e.target.value === 'custom' ? 'flex' : 'none';
  });

  // 5. Toggle tùy chọn nâng cao
  advToggle.addEventListener('click', () => {
    advContent.classList.toggle('collapsed');
    const isCollapsed = advContent.classList.contains('collapsed');
    advToggle.querySelector('.toggle-icon').textContent = isCollapsed ? '▸' : '▾';
  });

  // 6. Đóng modal kịch bản
  modalCloseBtn.addEventListener('click', () => {
    modalBackdrop.classList.add('hidden');
  });

  // 7. Xử lý Lập Lá Số (Submit)
  form.addEventListener('submit', async e => {
    e.preventDefault();
    await handleFormSubmit();
  });

  // 8. Xem lá số mẫu
  sampleBtn.addEventListener('click', async () => {
    state.setState({ isLoading: true, error: null, needsInfo: null });
    try {
      const data = await fetchSampleChart();
      state.setState({
        currentNatal: data,
        isSample: true,
        isLoading: false,
        userName: 'Lá Số Mẫu Minh Họa',
        selectedBranch: data.displayNatal?.mingGongBranch ?? 7,
      });
      // Chuyển sang màn hình Bàn Cờ Lá Số!
      state.setView('chart');
    } catch (err) {
      state.setState({ isLoading: false, error: err.message });
    }
  });

  function getBirthInputFromForm() {
    const calendar = document.querySelector('input[name="calendar"]:checked').value;
    const gender = document.querySelector('input[name="gender"]:checked').value;
    const userName = document.getElementById('user-name').value.trim();

    let tz = tzSelect.value;
    if (tz === 'custom') {
      tz = tzCustomInput.value.trim() || 'Asia/Ho_Chi_Minh';
    }

    const isUnknownTime = unknownTimeCheckbox.checked;
    let time = null;
    if (!isUnknownTime) {
      time = birthTimeInput.value || null;
    }

    let dateStr = '';
    let isLeapVal = undefined;

    if (calendar === 'solar') {
      dateStr = document.getElementById('solar-date').value;
    } else {
      const d = String(document.getElementById('lunar-day').value).padStart(2, '0');
      const m = String(document.getElementById('lunar-month').value).padStart(2, '0');
      const y = String(document.getElementById('lunar-year').value);
      dateStr = `${y}-${m}-${d}`;
      isLeapVal = document.getElementById('lunar-leap').checked;
    }

    const latVal = parseFloat(document.getElementById('place-lat').value);
    const lonVal = parseFloat(document.getElementById('place-lon').value);
    let place = undefined;
    if (!isNaN(latVal) && !isNaN(lonVal)) {
      place = { lat: latVal, lon: lonVal };
    }

    const calConvSelect = document.getElementById('cal-convention').value;
    const calendarConvention = calConvSelect ? calConvSelect : undefined;

    const birth = {
      calendar,
      date: dateStr,
      time,
      tz,
      gender,
      ...(isLeapVal !== undefined ? { isLeap: isLeapVal } : {}),
      ...(place ? { place } : {}),
      ...(calendarConvention ? { calendarConvention } : {}),
    };

    return { birth, userName };
  }

  async function handleFormSubmit(selectedScenario = null) {
    const { birth, userName } = getBirthInputFromForm();
    const profileId = profileSelect.value;

    if (!birth.date) {
      state.setState({ error: 'Vui lòng chọn ngày sinh hợp lệ.' });
      return;
    }

    state.setState({
      isLoading: true,
      error: null,
      needsInfo: null,
      userName: userName || 'Đương Số',
    });

    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang khai mở tinh bàn...';

    const result = await computeNatalApi(birth, profileId, selectedScenario);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Khởi tạo lá số';

    if (result.aborted) return;

    if (result.httpStatus === 200 && result.data.status === 'ok') {
      modalBackdrop.classList.add('hidden');
      state.setState({
        currentNatal: result.data,
        isSample: false,
        isLoading: false,
        error: null,
        needsInfo: null,
        selectedBranch: result.data.displayNatal?.mingGongBranch ?? 0,
      });

      // Chuyển sang màn hình Bàn Cờ Lá Số!
      state.setView('chart');
      return;
    }

    if (result.httpStatus === 422 && result.data.status === 'needs') {
      state.setState({ isLoading: false, needsInfo: result.data });

      if (result.data.reason === 'HOUR_BOUNDARY' && result.data.scenarios) {
        showScenarioPickerModal(result.data.scenarios, birth, profileId);
      }
      return;
    }

    state.setState({
      isLoading: false,
      error: result.data?.error || `Lỗi không xác định (Mã HTTP: ${result.httpStatus})`,
    });
  }

  function showScenarioPickerModal(scenarios, birth, profileId) {
    modalBody.innerHTML = '';

    const intro = document.createElement('p');
    intro.textContent = 'Thời điểm sinh nằm gần ranh giới hai canh giờ hoặc đổi ngày. Mời bạn chọn kịch bản để an sao:';
    intro.style.marginBottom = '12px';
    intro.style.color = '#FDE047';
    modalBody.appendChild(intro);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '10px';

    const branchNames = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

    scenarios.forEach((sc, idx) => {
      const card = document.createElement('div');
      card.className = 'scenario-card';
      const branchName = branchNames[sc.hourBranch] || `Chi ${sc.hourBranch}`;

      card.innerHTML = `
        <div>
          <div style="font-weight: 700; color: #F59E0B; font-size: 0.95rem;">
            Phương án ${idx + 1}: Giờ ${branchName} (Chi ${sc.hourBranch})
          </div>
          <div style="font-size: 0.8rem; color: #94A3B8; margin-top: 2px;">
            Ngày dương: ${sc.year}-${String(sc.month).padStart(2, '0')}-${String(sc.day).padStart(2, '0')} • Giới tính: ${sc.gender === 'male' ? 'Nam' : 'Nữ'}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" type="button">Chọn phương án này</button>
      `;

      card.querySelector('button').addEventListener('click', async () => {
        card.querySelector('button').disabled = true;
        card.querySelector('button').textContent = 'Đang lập...';
        await handleFormSubmit(sc);
      });

      list.appendChild(card);
    });

    modalBody.appendChild(list);
    modalBackdrop.classList.remove('hidden');
  }
}
