import { state } from './state.js';
import { computeNatalApi, fetchSampleChart } from './api.js';
import { translateWarning } from './verification.js';

const branchNames = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

export function formatUtcOffset(minutes) {
  const sign = minutes < 0 ? '−' : '+';
  const seconds = Math.round(Math.abs(minutes) * 60);
  const hour = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minute = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const second = seconds % 60;
  return `UTC${sign}${hour}:${minute}${second ? `:${String(second).padStart(2, '0')}` : ''}`;
}

export function setupForm() {
  const byId = id => document.getElementById(id);
  const form = byId('birth-form');
  const solarGroup = byId('solar-date-group');
  const lunarGroup = byId('lunar-date-group');
  const unknownTime = byId('unknown-time');
  const birthTime = byId('birth-time');
  const tzSelect = byId('tz-select');
  const tzCustom = byId('tz-custom');
  const profileSelect = byId('profile-select');
  const submitBtn = byId('submit-btn');
  const sampleBtn = byId('sample-btn');
  const advToggle = byId('adv-toggle');
  const advContent = byId('adv-content');
  const conventionSelect = byId('cal-convention');
  const coordinates = byId('place-coordinates');
  const latitude = byId('place-lat');
  const longitude = byId('place-lon');
  const modal = byId('scenario-modal');
  const modalBody = byId('scenario-modal-body');
  const modalClose = byId('scenario-modal-close');
  let request = 0;
  let pending = null;
  let previousFocus = null;
  let profiles = null;

  function showAdvanced(open) {
    advContent.classList.toggle('collapsed', !open);
    advContent.style.display = open ? 'flex' : 'none';
    advToggle.setAttribute('aria-expanded', String(open));
    advToggle.querySelector('.toggle-icon').textContent = open ? '▾' : '▸';
  }

  function closeModal(restoreFocus = true) {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    if (restoreFocus) previousFocus?.focus();
    previousFocus = null;
  }

  function showScenarios() {
    if (!pending) return;
    const { result, submission } = pending;
    const ambiguous = result.reason === 'AMBIGUOUS_LOCAL_TIME';
    const options = ambiguous
      ? result.scenarioOptions || []
      : (result.scenarios || []).map(chart => ({ chart }));
    if (!options.length) return;
    modalBody.replaceChildren();
    const intro = document.createElement('p');
    intro.textContent = ambiguous
      ? 'Giờ đồng hồ này xảy ra hai lần. Chọn độ lệch UTC theo hồ sơ sinh.'
      : options.length === 1
        ? 'Giờ sinh gần ranh giữa hai giờ. Chỉ có một phương án khả dụng với quy ước lịch hiện tại.'
        : 'Giờ sinh gần ranh giữa hai giờ hoặc hai ngày lập số. Chọn phương án phù hợp với dữ kiện sinh.';
    modalBody.append(intro);
    for (const warning of result.warnings || []) {
      const entry = document.createElement('p');
      entry.textContent = translateWarning(warning);
      modalBody.append(entry);
    }

    for (const { chart, instant, utcOffsetMinutes } of options) {
      const card = document.createElement('div');
      card.className = 'scenario-card';
      const description = document.createElement('div');
      const date = `${String(chart.day).padStart(2, '0')}/${String(chart.month).padStart(2, '0')}/${chart.year}`;
      const title = document.createElement('strong');
      title.textContent = `${date} · Giờ ${branchNames[chart.hourBranch]}`;
      const detail = document.createElement('div');
      if (instant) {
        detail.textContent = `${formatUtcOffset(utcOffsetMinutes)} · ${instant.replace('T', ' ').replace('.000Z', ' UTC')}`;
      }
      description.append(title, detail);
      const button = document.createElement('button');
      button.className = 'btn btn-primary btn-sm';
      button.type = 'button';
      button.textContent = instant ? `Chọn ${formatUtcOffset(utcOffsetMinutes)}` : 'Chọn phương án';
      button.addEventListener('click', () => submit(submission, chart, instant));
      card.append(description, button);
      modalBody.append(card);
    }
    if (modal.classList.contains('hidden')) previousFocus = document.activeElement;
    modal.classList.remove('hidden');
    modalClose.focus();
  }

  function updateCoordinates() {
    const mode = profiles?.[profileSelect.value]?.solarTime;
    const used = Boolean(mode && mode !== 'none');
    coordinates.classList.toggle('hidden', !used);
    latitude.disabled = longitude.disabled = !used;
  }

  for (const radio of form.querySelectorAll('input[name="calendar"]')) {
    radio.addEventListener('change', () => {
      const lunar = radio.value === 'lunar';
      solarGroup.style.display = lunar ? 'none' : 'flex';
      lunarGroup.style.display = lunar ? 'flex' : 'none';
      byId('lbl-cal-solar').classList.toggle('active', !lunar);
      byId('lbl-cal-lunar').classList.toggle('active', lunar);
    });
  }
  for (const radio of form.querySelectorAll('input[name="gender"]')) {
    radio.addEventListener('change', () => {
      byId('lbl-gender-male').classList.toggle('active', radio.value === 'male');
      byId('lbl-gender-female').classList.toggle('active', radio.value === 'female');
    });
  }
  unknownTime.addEventListener('change', () => {
    birthTime.disabled = unknownTime.checked;
  });
  tzSelect.addEventListener('change', () => {
    byId('tz-custom-group').style.display = tzSelect.value === 'custom' ? 'flex' : 'none';
  });
  profileSelect.addEventListener('change', () => {
    updateCoordinates();
    state.setState({ selectedProfileId: profileSelect.value });
  });
  advToggle.addEventListener('click', () => showAdvanced(advToggle.getAttribute('aria-expanded') !== 'true'));
  modalClose.addEventListener('click', () => closeModal());
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    } else if (event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll('button:not([disabled])')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Mọi thay đổi biểu mẫu làm mất hiệu lực của phương án đã tính trước đó.
  const clearPending = (event) => {
    if (event?.target?.id === 'user-name') return;
    request++;
    pending = null;
    closeModal(false);
    const { error, needsInfo, isLoading } = state.getState();
    if (error || needsInfo || isLoading) state.setState({ error: null, needsInfo: null, isLoading: false });
  };
  form.addEventListener('input', clearPending);
  form.addEventListener('change', clearPending);

  state.subscribe(s => {
    submitBtn.disabled = sampleBtn.disabled = s.isLoading;
    submitBtn.textContent = s.isLoading ? 'Đang xử lý…' : 'Khởi tạo lá số';
    if (s.profiles !== profiles) {
      profiles = s.profiles;
      updateCoordinates();
    }
  });

  function readForm() {
    const calendar = form.querySelector('input[name="calendar"]:checked').value;
    const gender = form.querySelector('input[name="gender"]:checked').value;
    const tz = tzSelect.value === 'custom' ? tzCustom.value.trim() : tzSelect.value;
    if (!tz) throw new Error('Nhập tên múi giờ IANA của nơi sinh.');
    const time = unknownTime.checked ? null : birthTime.value;
    if (time === '') throw new Error('Nhập giờ sinh hoặc đánh dấu “Chưa rõ giờ sinh”.');
    let date = byId('solar-date').value;
    if (calendar === 'lunar') {
      const [year, month, day] = ['lunar-year', 'lunar-month', 'lunar-day'].map(id => byId(id).value);
      if (!year || !month || !day) throw new Error('Nhập đủ ngày, tháng và năm âm lịch.');
      date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    if (!date) throw new Error('Nhập ngày sinh.');
    const birth = { calendar, date, time, tz, gender };
    if (calendar === 'lunar') birth.isLeap = byId('lunar-leap').checked;
    if (conventionSelect.value) birth.calendarConvention = conventionSelect.value;
    if (!latitude.disabled && (latitude.value || longitude.value)) {
      if (!latitude.value || !longitude.value) throw new Error('Nhập đủ vĩ độ và kinh độ nơi sinh.');
      birth.place = { lat: latitude.valueAsNumber, lon: longitude.valueAsNumber };
    }
    return { birth, profileId: profileSelect.value, userName: byId('user-name').value.trim() || 'Đương số' };
  }

  function showChart(data, userName, isSample) {
    state.setState({
      currentNatal: data,
      isSample,
      isLoading: false,
      error: null,
      needsInfo: null,
      userName,
      selectedBranch: (data.displayNatal || data.natal)?.mingGongBranch ?? null,
    });
    state.setView('chart');
  }

  async function submit(submission, selectedScenario, selectedInstant) {
    const id = ++request;
    closeModal(false);
    pending = null;
    state.setState({ isLoading: true, error: null, needsInfo: null });
    const { birth, profileId, userName } = submission;
    const result = await computeNatalApi(birth, profileId, selectedScenario, selectedInstant);
    if (id !== request || result.aborted) return;

    if (result.httpStatus === 200 && result.data.status === 'ok') {
      showChart(result.data, userName, false);
    } else if (result.httpStatus === 422 && result.data.status === 'needs') {
      pending = { result: result.data, submission };
      state.setState({ isLoading: false, needsInfo: result.data });
      showScenarios();
    } else {
      state.setState({
        isLoading: false,
        error: result.data?.error?.message || result.data?.error || `Máy chủ trả mã HTTP ${result.httpStatus}.`,
      });
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      submit(readForm());
    } catch (error) {
      state.setState({ error: error.message, needsInfo: null });
    }
  });
  sampleBtn.addEventListener('click', async () => {
    const id = ++request;
    pending = null;
    state.setState({ isLoading: true, error: null, needsInfo: null });
    try {
      const data = await fetchSampleChart();
      if (id === request) showChart(data, 'Lá số mẫu', true);
    } catch (error) {
      if (id === request) state.setState({ isLoading: false, error: error.message });
    }
  });

  // Mở file JSON đã lưu
  const openJsonBtn = document.getElementById('open-json-btn');
  const jsonFileInput = document.getElementById('json-file-input');
  if (openJsonBtn && jsonFileInput) {
    openJsonBtn.addEventListener('click', () => jsonFileInput.click());
    jsonFileInput.addEventListener('change', () => {
      const file = jsonFileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object') throw new Error('File không chứa dữ liệu lá số hợp lệ.');
          if (!data.natal && !data.displayNatal) throw new Error('File không chứa dữ liệu lá số (thiếu natal hoặc displayNatal).');
          showChart(data, data.title || 'Lá số từ file', false);
        } catch (error) {
          state.setState({ error: `Không đọc được file: ${error.message}`, needsInfo: null });
        }
        jsonFileInput.value = '';
      };
      reader.onerror = () => {
        state.setState({ error: 'Không đọc được file.', needsInfo: null });
        jsonFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  return {
    resolveNeed(reason) {
      if (reason === 'HOUR_BOUNDARY' || reason === 'AMBIGUOUS_LOCAL_TIME') showScenarios();
      else if (reason === 'CALENDAR_CONFIRMATION' || reason === 'CALENDAR_DIVERGENCE') {
        showAdvanced(true);
        conventionSelect.focus();
      } else if (reason === 'NEEDS_BIRTH_PLACE') {
        showAdvanced(true);
        (latitude.disabled ? profileSelect : latitude).focus();
      } else {
        if (unknownTime.checked) {
          unknownTime.checked = false;
          birthTime.disabled = false;
        }
        birthTime.focus();
      }
    },
  };
}
