const warningLabels = {
  CALENDAR_DIVERGENCE_NO_ADAPTER: 'Engine dùng lịch Trung Quốc. Lập số theo lịch Việt ngày này cần adapter riêng; không tạo lá số sai.',
  CALENDAR_DIVERGENCE_CHINESE_EXPLICIT: 'Lịch Trung và lịch Việt khác nhau ngày này. Đang dùng quy ước lịch Trung theo lựa chọn của bạn.',
  VIETNAMESE_CALENDAR_MODEL: 'Kiểm tra lịch Việt dùng mô hình thiên văn UTC+7, không phải mọi lịch chính thức.',
  SHIFTED_DATE_DIVERGENCE: 'Ngày lập số sau hiệu chỉnh rơi vào ngày lịch Trung/Việt khác nhau.',
};

export function translateWarning(warning) {
  if (warningLabels[warning]) return warningLabels[warning];
  const match = /^SCENARIO_BLOCKED_DIVERGENCE:(.+)$/.exec(warning);
  if (match) return `Phương án ngày ${match[1]} bị chặn do lịch Việt và lịch Trung khác nhau.`;
  return warning;
}

const stepLabels = {
  input: 'Dữ kiện nhập',
  'lunar-calendar-choice': 'So sánh quy ước ngày âm nhập',
  'lunar-to-solar': 'Đổi ngày âm sang ngày dương',
  'calendar-comparison': 'Đối chiếu lịch',
  'shifted-calendar-comparison': 'Đối chiếu lịch sau khi đổi ngày',
  'iana-time-zone': 'Múi giờ nơi sinh',
  'solar-time': 'Hiệu chỉnh giờ mặt trời',
  'chart-ready': 'Ngày giờ dùng để lập số',
  'boundary-scenarios': 'Phương án gần ranh giờ',
  'blocked-scenarios': 'Phương án bị chặn do lịch khác nhau',
  'user-scenario-selection': 'Phương án đã xác nhận',
};

function addSection(parent, label, value) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return;
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = label;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(value, null, 2);
  section.append(heading, pre);
  parent.append(section);
}

export function buildVerification(result) {
  if (!result) return null;
  const normalized = result.normalization || result;
  const { audit, warnings } = normalized;
  if (!audit?.length && !warnings?.length && !result.provenance && !result.hash) return null;

  const details = document.createElement('details');
  details.className = 'verification';
  const summary = document.createElement('summary');
  summary.textContent = 'Thông tin kiểm chứng';
  details.append(summary);
  if (warnings?.length) {
    const list = document.createElement('ul');
    list.className = 'verification-warnings';
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.textContent = translateWarning(warning);
      list.append(item);
    }
    details.append(list);
  }
  addSection(details, 'Nguồn và phiên bản', result.provenance);
  addSection(details, 'Mã kiểm tra lá số', result.hash);
  addSection(details, 'Cấu hình lập số', result.profile);
  if (audit?.length) {
    const steps = document.createElement('ol');
    for (const entry of audit) {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = stepLabels[entry.step] || entry.step;
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(entry.data ?? entry.description, null, 2);
      item.append(label, pre);
      steps.append(item);
    }
    details.append(steps);
  }
  return details;
}
