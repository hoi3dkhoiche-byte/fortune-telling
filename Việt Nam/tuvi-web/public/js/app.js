import { state } from './state.js';
import { fetchProfiles } from './api.js';
import { initStarfield } from './starfield.js';
import { setupForm } from './form.js';
import { setupChart } from './chart.js';
import { setupDetails } from './details.js';
import { renderFactSummary } from './reading.js';
import { buildVerification } from './verification.js';

const needsCopy = {
  NEEDS_BIRTH_TIME: ['Cần bổ sung giờ sinh để lập lá số.', 'Nhập giờ sinh'],
  NEEDS_BIRTH_PLACE: ['Cấu hình hiệu chỉnh giờ cần tọa độ nơi sinh.', 'Bổ sung nơi sinh'],
  HOUR_BOUNDARY: ['Giờ sinh gần ranh giờ hoặc ranh ngày lập số. Hãy xác nhận phương án.', 'Chọn phương án'],
  AMBIGUOUS_LOCAL_TIME: ['Giờ này xảy ra hai lần ở múi giờ nơi sinh. Xác nhận độ lệch UTC ghi trong hồ sơ sinh.', 'Chọn độ lệch UTC'],
  NONEXISTENT_LOCAL_TIME: ['Giờ này bị bỏ qua khi địa phương đổi đồng hồ. Hãy kiểm tra lại ngày, giờ và múi giờ nơi sinh.', 'Kiểm tra giờ sinh'],
  CALENDAR_CONFIRMATION: ['Ngày âm nhập cho kết quả khác nhau theo quy ước lịch. Hãy xác nhận lịch được dùng khi ghi ngày sinh.', 'Chọn quy ước lịch'],
  CALENDAR_DIVERGENCE: ['Lịch Việt và lịch Trung cho ngày âm khác nhau ở ngày này. Hãy chọn quy ước Lịch Việt Nam hoặc Lịch Trung Quốc để lập số.', 'Chọn quy ước lịch'],
};
const profileNames = {
  'thienky-candidate': 'Thiên Kỷ · Đang kiểm chứng',
  'repro-v4': 'Đối chiếu dataset v4',
};

function setupViewNavigation() {
  const views = Object.fromEntries(['input', 'chart', 'reading'].map(view => [view, document.getElementById(`view-${view}`)]));
  const readings = document.getElementById('reading-container');
  const verification = document.getElementById('chart-verification');
  const profileBadge = document.getElementById('profile-badge');
  const sampleBadge = document.getElementById('sample-badge');
  const importedBadge = document.getElementById('imported-badge');
  let renderedResult;
  let renderedSummary;

  state.subscribe(s => {
    for (const [view, section] of Object.entries(views)) {
      section.classList.toggle('hidden', view !== s.currentView);
    }
    const chartProfile = s.currentView === 'input' ? null : s.currentNatal?.profile;
    const selected = chartProfile ?? s.profiles[s.selectedProfileId];
    const id = chartProfile?.id || s.selectedProfileId;
    profileBadge.textContent = profileNames[id] || id;
    profileBadge.title = id;
    profileBadge.classList.toggle('candidate', selected?.status === 'candidate' || id === 'thienky-candidate');
    sampleBadge.classList.toggle('hidden', !(s.isSample && s.currentView !== 'input'));
    importedBadge?.classList.toggle('hidden', !(s.isImported && s.currentView !== 'input'));

    if (s.currentNatal !== renderedResult) {
      renderedResult = s.currentNatal;
      const details = buildVerification(renderedResult);
      verification.replaceChildren(...(details ? [details] : []));
    }
    if (s.currentView === 'reading' && s.currentNatal !== renderedSummary) {
      renderedSummary = s.currentNatal;
      renderFactSummary(readings, renderedSummary);
    }
  });

  const links = {
    'back-to-input-btn': 'input',
    'goto-reading-btn': 'reading',
    'top-goto-reading-btn': 'reading',
    'back-to-chart-btn': 'chart',
  };
  for (const [id, view] of Object.entries(links)) {
    document.getElementById(id).addEventListener('click', () => state.setView(view));
  }
  const tabs = document.querySelectorAll('.view-mode-tab');
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const item of tabs) item.classList.toggle('active', item === tab);
      state.setViewMode(tab.dataset.mode);
    });
  }
}

function setupAlerts(form) {
  const container = document.getElementById('global-alert-container');
  let previousError;
  let previousNeeds;
  state.subscribe(({ error, needsInfo }) => {
    if (error === previousError && needsInfo === previousNeeds) return;
    previousError = error;
    previousNeeds = needsInfo;
    container.replaceChildren();
    if (!error && !needsInfo) return;

    const box = document.createElement('div');
    box.className = `alert-box ${error ? 'alert-error' : 'alert-warning'}`;
    const message = document.createElement('p');
    const [instruction, action] = needsCopy[needsInfo?.reason] || ['Cần kiểm tra lại thông tin sinh.'];
    message.textContent = error || instruction;
    box.append(message);
    if (needsInfo && action) {
      const button = document.createElement('button');
      button.className = 'btn btn-secondary btn-sm';
      button.type = 'button';
      button.textContent = action;
      button.addEventListener('click', () => form.resolveNeed(needsInfo.reason));
      box.append(button);
    }
    const details = buildVerification(needsInfo);
    container.append(box);
    if (details) container.append(details);
  });
}

async function init() {
  initStarfield('starfield-canvas');
  const form = setupForm();
  setupViewNavigation();
  setupChart();
  setupDetails();
  setupAlerts(form);
  state.notify();

  try {
    const profileData = await fetchProfiles();
    state.setState({ profiles: profileData.profiles, profileEvidence: profileData.evidence });
  } catch (error) {
    console.warn('Không tải được cấu hình lập số:', error);
  }
}

document.addEventListener('DOMContentLoaded', init);
