const warningLabels = {
  CALENDAR_DIVERGENCE_NO_ADAPTER: 'Engine dùng lịch Trung Quốc. Lập số theo lịch Việt ngày này cần adapter riêng; không tạo lá số sai.',
  CALENDAR_DIVERGENCE_CHINESE_EXPLICIT: 'Lịch Trung và lịch Việt khác nhau ngày này. Đang dùng quy ước lịch Trung theo lựa chọn của bạn.',
  VIETNAMESE_CALENDAR_MODEL: 'Kiểm tra lịch Việt dùng mô hình thiên văn UTC+7, không phải mọi lịch chính thức.',
  SHIFTED_DATE_DIVERGENCE: 'Ngày lập số sau hiệu chỉnh rơi vào ngày lịch Trung/Việt khác nhau.',
};

export function translateWarning(warning) {
  if (warningLabels[warning]) return warningLabels[warning];
  const isoMatch = /^SCENARIO_BLOCKED_DIVERGENCE:(\d{4})-(\d{2})-(\d{2})$/.exec(warning);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `Phương án ngày ${day}/${month}/${year} bị chặn do lịch Việt và lịch Trung khác nhau.`;
  }
  const fallbackMatch = /^SCENARIO_BLOCKED_DIVERGENCE:(.+)$/.exec(warning);
  if (fallbackMatch) return `Phương án ngày ${fallbackMatch[1]} bị chặn do lịch Việt và lịch Trung khác nhau.`;
  return warning;
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isBranch = value => Number.isInteger(value) && value >= 0 && value <= 11;
const isString = value => typeof value === 'string';
const isOptionalString = value => value == null || isString(value);
const isListOf = (value, check) => Array.isArray(value) && value.every(check);
const isOptionalListOf = (value, check) => value == null || isListOf(value, check);

function validateNatal(natal) {
  if (!isRecord(natal) || !Array.isArray(natal.palaces) || natal.palaces.length !== 12) {
    throw new Error('Dữ liệu lá số phải có đủ 12 cung.');
  }
  const branches = new Set();
  for (const palace of natal.palaces) {
    if (!isRecord(palace) || !isBranch(palace.branch) || !Array.isArray(palace.stars)) {
      throw new Error('Cấu trúc cung hoặc danh sách sao trong file không hợp lệ.');
    }
    if (!palace.stars.every(star => isRecord(star) && isString(star.name)
      && isOptionalString(star.brightnessRaw) && isOptionalString(star.brightnessLabelVi))
      || !isOptionalListOf(palace.borrowedStars, isString)) {
      throw new Error('Dữ liệu sao trong file không hợp lệ.');
    }
    branches.add(palace.branch);
  }
  if (branches.size !== 12) {
    throw new Error('12 cung trong lá số phải có đủ 12 địa chi riêng biệt (0–11).');
  }
  if (!isBranch(natal.mingGongBranch)) {
    throw new Error('Thiếu vị trí cung Mệnh hợp lệ (mingGongBranch).');
  }
  if (!isBranch(natal.shenGongBranch)) {
    throw new Error('Thiếu vị trí cung Thân hợp lệ (shenGongBranch).');
  }
}

export function validateImportedChart(data) {
  if (!isRecord(data)) {
    throw new Error('File không chứa đối tượng JSON hợp lệ.');
  }
  if (data.schemaVersion !== undefined && (!isString(data.schemaVersion) || !data.schemaVersion.trim())) {
    throw new Error('Trường schemaVersion trong file không hợp lệ.');
  }
  if (data.natal == null && data.displayNatal == null) {
    throw new Error('File không chứa dữ liệu lá số (thiếu natal hoặc displayNatal).');
  }
  // Bản hiển thị và bản gốc đều có thể được dùng khi tra dữ kiện.
  if (data.natal != null) validateNatal(data.natal);
  if (data.displayNatal != null) validateNatal(data.displayNatal);

  const isRelationRef = item => isRecord(item) && isBranch(item.branch);
  if (!isOptionalListOf(data.relations, item =>
    isRelationRef(item) && isRelationRef(item.opposite) && isListOf(item.trine, isRelationRef))) {
    throw new Error('Dữ liệu quan hệ cung trong file không hợp lệ.');
  }
  if (!isOptionalListOf(data.facts, item => isRecord(item) && isString(item.predicate) && isString(item.id))) {
    throw new Error('Danh sách dữ kiện lá số trong file không hợp lệ.');
  }
  if ((data.labels != null && !isRecord(data.labels))
    || !isOptionalListOf(data.labels?.palaces, palace =>
      isRecord(palace) && isOptionalListOf(palace.stars, star =>
        isRecord(star) && isOptionalString(star.brightness?.labelVi)))) {
    throw new Error('Nhãn cung hoặc sao trong file không hợp lệ.');
  }
  const normalized = data.normalization ?? data;
  if (!isRecord(normalized)
    || !isOptionalListOf(normalized.audit, entry => isRecord(entry) && isString(entry.step))
    || !isOptionalListOf(normalized.warnings, isString)) {
    throw new Error('Thông tin kiểm chứng trong file không hợp lệ.');
  }
  return { ...data, importedFromFile: true };
}

export function getBlockedScenarioGuidance(result, calendarConvention) {
  const hasBlocked = Boolean(
    result?.audit?.some(step => step.step === 'blocked-scenarios')
    || result?.warnings?.some(warning => typeof warning === 'string' && warning.startsWith('SCENARIO_BLOCKED_DIVERGENCE:')),
  );
  if (!hasBlocked) return null;
  if (calendarConvention === 'vietnamese') {
    return {
      message: 'Đang chọn quy ước Lịch Việt Nam nên phương án rơi vào ngày lệch lịch không thể mở được (cần adapter lịch Việt riêng).',
      canOpenChineseConvention: false,
    };
  }
  return {
    message: 'Để mở phương án bị chặn, hãy vào Tùy chọn nâng cao và chọn Quy ước Lịch Trung Quốc (chinese).',
    canOpenChineseConvention: true,
  };
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
  const imported = Boolean(result.importedFromFile);
  const normalized = result.normalization || result;
  const { audit, warnings } = normalized;
  if (!imported && !audit?.length && !warnings?.length && !result.provenance && !result.hash) return null;

  const details = document.createElement('details');
  details.className = 'verification';
  const summary = document.createElement('summary');
  summary.textContent = imported
    ? 'Thông tin kiểm chứng (Mở từ file · Chưa kiểm tra lại)'
    : 'Thông tin kiểm chứng';
  details.append(summary);
  if (imported) {
    const notice = document.createElement('p');
    notice.className = 'verification-unverified';
    notice.textContent = 'Dữ liệu mở từ file JSON ngoài — chưa kiểm tra lại bằng máy chủ. Mã kiểm tra (hash) và thông tin nguồn dưới đây chỉ phản ánh nội dung trong file và có thể đã bị chỉnh sửa.';
    details.append(notice);
  }
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
  addSection(details, imported ? 'Nguồn và phiên bản (trong file · chưa kiểm tra lại)' : 'Nguồn và phiên bản', result.provenance);
  addSection(details, imported ? 'Mã kiểm tra lá số (trong file · chưa kiểm tra lại)' : 'Mã kiểm tra lá số', result.hash);
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
