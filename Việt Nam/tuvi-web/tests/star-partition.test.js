const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../tuvi-core');

const chartModule = import('../public/js/chart.js');
const baseBirth = {
  calendar: 'solar', date: '1990-01-06', time: '06:00', gender: 'male', tz: 'Asia/Ho_Chi_Minh',
};

function buildResult(birth, profileId) {
  const profile = core.getProfile(profileId);
  const normalized = core.normalizeBirth(birth, profile);
  assert.equal(normalized.status, 'ok');
  return { ...core.computeNatal(normalized.chart, profile), normalization: normalized };
}

test('Star columns use real brightness, star type and Hóa Kỵ', async () => {
  const { partitionStars, getStarBrightness, getStarTransformation } = await chartModule;
  const stars = [
    { name: '紫微', type: 'major', brightnessRaw: '庙', brightnessLabelVi: 'Miếu' },
    { name: '擎羊', type: 'sha', brightnessRaw: '庙' },
    { name: '天机', type: 'major', brightnessRaw: '闲', brightnessLabelVi: 'Nhàn' },
    { name: '太阳', type: 'major', brightnessRaw: '陷' },
    { name: '天同', type: 'major', brightness: 'dim' },
    { name: '天梁', type: 'major', brightnessRaw: '地' },
    { name: '文曲', type: 'lucky', siHua: '忌' },
    { name: '文昌', type: 'lucky', siHua: '科' },
    { name: '恩光', type: 'lucky' },
  ];

  const { leftStars, rightStars } = partitionStars(stars);
  assert.deepEqual(leftStars.map(star => star.name), ['紫微', '天梁', '文昌', '恩光']);
  assert.deepEqual(rightStars.map(star => star.name), ['擎羊', '天机', '太阳', '天同', '文曲']);
  assert.deepEqual(getStarBrightness(stars[2]), { label: 'Nhàn', className: 'b-xian' });
  assert.deepEqual(getStarBrightness(stars[4]), { label: '', className: 'b-xian' });
  assert.deepEqual(getStarBrightness(stars[8]), { label: '', className: '' });
  assert.deepEqual(getStarTransformation(stars[6]), { label: 'Hóa Kỵ', shortLabel: 'Kỵ', className: 'sh-ji' });
});

test('CLI chart data resolves Vietnamese names for borrowed stars without adding placements', async () => {
  const { getDisplayNatal, getBorrowedStars } = await chartModule;
  const result = buildResult(baseBirth, 'thienky-candidate');
  const natal = getDisplayNatal(result);
  const ming = natal.palaces.find(palace => palace.isMingGong);

  assert.equal(ming.branch, 10);
  assert.equal(ming.labelVi, 'Mệnh');
  assert.equal(ming.stars.some(star => star.type === 'major'), false);
  assert.deepEqual(getBorrowedStars(ming, natal, result.facts), ['Thiên Cơ', 'Thiên Lương']);

  const borrowedByFactOnly = { ...ming, borrowedStars: undefined };
  assert.deepEqual(getBorrowedStars(borrowedByFactOnly, natal, result.facts), ['Thiên Cơ', 'Thiên Lương']);
});

test('Leap-month date retains the submitted leap flag and separately shows the date used for calculation', async () => {
  const { getBirthDates } = await chartModule;
  const birth = { ...baseBirth, calendar: 'lunar', date: '1990-05-15', isLeap: true, time: '12:00' };

  for (const [profile, dateForCalculation] of [['thienky-candidate', '1990-06-15'], ['repro-v4', '1990-05-15']]) {
    const result = buildResult(birth, profile);
    // Use legacy CLI normalization without an explicit input object.
    const dates = getBirthDates(result);
    assert.equal(dates.inputCalendar, 'lunar');
    assert.equal(dates.inputDate, '1990-05-15 (Nhuận)');
    assert.equal(dates.civilSolarDate, '1990-07-07');
    assert.equal(dates.effectiveLunarDate, dateForCalculation);
  }
});

test('Late Tý date preserves the submitted solar date and time alongside the shifted chart date', async () => {
  const { getBirthDates } = await chartModule;
  const birth = { ...baseBirth, date: '1990-03-10', time: '23:30' };
  const result = buildResult(birth, 'repro-v4');
  result.normalization.input = birth;
  const dates = getBirthDates(result);

  assert.equal(dates.inputDate, '1990-03-10');
  assert.equal(dates.inputTime, '23:30');
  assert.equal(dates.effectiveSolarDate, '1990-03-11');
  assert.equal(dates.hourBranch, 0);
});
