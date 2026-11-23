const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Readable } = require('node:stream');
const { server, isInsideDirectory, resolveStaticPath } = require('../server');

let baseUrl;
let testServer;

test.before(async () => {
  await new Promise(resolve => {
    testServer = server.listen(0, '127.0.0.1', () => {
      const port = testServer.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise(resolve => testServer.close(resolve));
});

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, headers: response.headers, text, json };
}

function postNatal(body) {
  return request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const solarBirth = {
  calendar: 'solar',
  date: '1990-01-01',
  time: '12:30',
  tz: 'Asia/Ho_Chi_Minh',
  gender: 'male',
  calendarConvention: 'chinese',
};

test('GET /api/health trả về status ok và thông tin môi trường', async () => {
  const res = await request('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.ok(res.json.serverTime);
});

test('GET /api/profiles trả về các profiles được hỗ trợ', async () => {
  const res = await request('/api/profiles');
  assert.equal(res.status, 200);
  assert.ok(res.json.profiles['thienky-candidate']);
  assert.ok(res.json.profiles['repro-v4']);
  assert.equal(res.json.defaultProfileId, 'thienky-candidate');
  assert.ok(res.json.evidence['thienky-candidate']);
});

test('GET /api/sample trả về lá số mẫu với 12 cung được decorate', async () => {
  const res = await request('/api/sample');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.equal(res.json.isSample, true);
  assert.equal(res.json.displayNatal.palaces.length, 12);
  assert.ok(res.json.displayNatal.palaces[0].labelVi);
  assert.ok(res.json.displayNatal.palaces[0].branchLabelVi);
  assert.ok(res.json.hash);
  assert.equal(res.json.normalization.input.time, '12:30');
  assert.equal(res.json.normalization.chart.hourBranch, 6);
});

test('POST /api/natal với input dương lịch chuẩn trả về status ok', async () => {
  const body = {
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '12:30',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    profileId: 'thienky-candidate',
  };
  const res = await request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.equal(res.json.displayNatal.palaces.length, 12);
  assert.equal(res.json.profile.id, 'thienky-candidate');
  assert.ok(res.json.normalization.chart);
});

test('POST /api/natal khi time: null trả về 422 NEEDS_BIRTH_TIME', async () => {
  const body = {
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: null,
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
    },
    profileId: 'thienky-candidate',
  };
  const res = await request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(res.status, 422);
  assert.equal(res.json.status, 'needs');
  assert.equal(res.json.reason, 'NEEDS_BIRTH_TIME');
});

test('POST /api/natal tại ranh giới giờ 23:00 trả về 422 HOUR_BOUNDARY kèm kịch bản', async () => {
  const body = {
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '23:00',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    profileId: 'thienky-candidate',
  };
  const res = await request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(res.status, 422);
  assert.equal(res.json.status, 'needs');
  assert.equal(res.json.reason, 'HOUR_BOUNDARY');
  assert.ok(Array.isArray(res.json.scenarios));
  assert.ok(res.json.scenarios.length >= 2);
});

test('POST /api/natal gửi selectedScenario hợp lệ tại HOUR_BOUNDARY tính thành công lá số', async () => {
  const body = {
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '23:00',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    profileId: 'thienky-candidate',
    selectedScenario: {
      year: 1990,
      month: 1,
      day: 1,
      hourBranch: 0,
      gender: 'male',
    },
  };
  const res = await request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.equal(res.json.normalization.chart.hourBranch, 0);
  const userAudit = res.json.normalization.audit.find(
    a => a.step === 'user-scenario-selection'
  );
  assert.ok(userAudit);
});

test('POST /api/natal gửi selectedScenario không có trong scenarios bị từ chối 400', async () => {
  const body = {
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '23:00',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
      calendarConvention: 'chinese',
    },
    profileId: 'thienky-candidate',
    selectedScenario: {
      year: 1990,
      month: 1,
      day: 1,
      hourBranch: 6, // Không phải Tý (0) hay Hợi (11)
      gender: 'male',
    },
  };
  const res = await request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(res.status, 400);
  assert.equal(res.json.status, 'error');
  assert.match(res.json.error, /không khớp với bất kỳ kịch bản hợp lệ nào/);
});

test('POST /api/natal với profile không tồn tại trả về 400', async () => {
  const body = {
    birth: {
      calendar: 'solar',
      date: '1990-01-01',
      time: '12:30',
      tz: 'Asia/Ho_Chi_Minh',
      gender: 'male',
    },
    profileId: 'non-existent-profile',
  };
  const res = await request('/api/natal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  assert.equal(res.status, 400);
  assert.equal(res.json.status, 'error');
  assert.match(res.json.error, /không hợp lệ hoặc không tồn tại/);
});

test('POST /api/natal trả 400 cho JSON hỏng, rỗng hoặc sai kiểu', async () => {
  for (const body of ['{"birth":', '', 'null', '[]']) {
    const res = await request('/api/natal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.status, 'error');
  }
});

test('POST /api/natal giới hạn body theo byte cho cả request có và chưa có Content-Length', async () => {
  const body = JSON.stringify({ text: 'é'.repeat(540000) });
  for (const payload of [
    { body },
    { body: Readable.from([body.slice(0, 270000), body.slice(270000)]), duplex: 'half' },
  ]) {
    const res = await request('/api/natal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...payload,
    });
    assert.equal(res.status, 413);
    assert.equal(res.json.status, 'error');
  }
});

test('giờ DST trùng giữ hai thời điểm cho cùng lá số và ghi lựa chọn vào audit', async () => {
  const body = {
    birth: { ...solarBirth, date: '2024-11-03', time: '01:30', tz: 'America/New_York' },
    profileId: 'thienky-candidate',
  };
  const needs = await postNatal(body);
  assert.equal(needs.status, 422);
  assert.equal(needs.json.reason, 'AMBIGUOUS_LOCAL_TIME');
  assert.equal(needs.json.scenarios.length, 1);
  assert.deepEqual(needs.json.scenarioOptions.map(option => [option.instant, option.utcOffsetMinutes]), [
    ['2024-11-03T05:30:00.000Z', -240],
    ['2024-11-03T06:30:00.000Z', -300],
  ]);

  const choice = needs.json.scenarioOptions[1];
  const res = await postNatal({ ...body, selectedScenario: choice.chart, selectedInstant: choice.instant });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.normalization.chart, choice.chart);
  const audit = res.json.normalization.audit.find(step => step.step === 'user-scenario-selection');
  assert.equal(audit.data.reason, 'AMBIGUOUS_LOCAL_TIME');
  assert.equal(audit.data.selectedInstant, choice.instant);
  assert.equal(audit.data.utcOffsetMinutes, -300);

  for (const selectedInstant of [undefined, '2024-11-03T07:30:00.000Z']) {
    const rejected = await postNatal({ ...body, selectedScenario: choice.chart, selectedInstant });
    assert.equal(rejected.status, 400);
  }
  const wrongScenario = { ...choice.chart, hourBranch: 2 };
  const rejected = await postNatal({ ...body, selectedScenario: wrongScenario, selectedInstant: choice.instant });
  assert.equal(rejected.status, 400);
});

test('giờ DST không tồn tại trả đúng lý do và audit', async () => {
  const res = await postNatal({
    birth: { ...solarBirth, date: '2024-03-10', time: '02:30', tz: 'America/New_York' },
  });
  assert.equal(res.status, 422);
  assert.equal(res.json.reason, 'NONEXISTENT_LOCAL_TIME');
  assert.ok(res.json.audit.some(step => step.step === 'iana-time-zone' && step.data.status === 'nonexistent'));
});

test('Tý muộn giữ ngày người dùng nhập và ngày lập số riêng biệt', async () => {
  const birth = { ...solarBirth, date: '1990-03-10', time: '23:30' };
  const res = await postNatal({ birth, profileId: 'repro-v4' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.normalization.input, birth);
  assert.equal(res.json.normalization.chart.day, 11);
  assert.equal(res.json.normalization.chart.hourBranch, 0);
});

test('âm lịch nhuận giữ tháng gốc và dùng quy tắc lập số theo profile', async () => {
  const birth = { ...solarBirth, calendar: 'lunar', date: '1990-05-15', isLeap: true, time: '00:30' };
  for (const [profileId, effectiveMonth] of [['thienky-candidate', 6], ['repro-v4', 5]]) {
    const res = await postNatal({ birth, profileId });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.normalization.input, birth);
    assert.deepEqual(res.json.normalization.chart, { year: 1990, month: 7, day: 7, hourBranch: 0, gender: 'male' });
    assert.equal(res.json.natal.lunarInfo.lunarMonth, effectiveMonth);
    assert.equal(res.json.natal.lunarInfo.lunarDay, 15);
    assert.equal(res.json.normalization.audit.find(step => step.step === 'lunar-to-solar').data.input.isLeap, true);
    if (profileId === 'thienky-candidate') {
      const ming = res.json.displayNatal.palaces.find(palace => palace.isMingGong);
      assert.equal(ming.isEmpty, true);
      assert.deepEqual(ming.borrowedStars, ['天同', '巨门']);
    }
  }
});

test('GET / phục vụ index.html với Content-Type text/html', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  assert.match(res.text, /THIÊN KỶ/);
});

test('GET /css/styles.css phục vụ file CSS', async () => {
  const res = await request('/css/styles.css');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/css/);
});

test('GET /js/app.js phục vụ file JavaScript ES module', async () => {
  const res = await request('/js/app.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /application\/javascript/);
});

test('kiểm tra phạm vi static theo thư mục, kể cả thư mục ngang cấp có cùng tiền tố', () => {
  const publicDir = path.resolve(__dirname, '../public');
  const siblingDir = path.resolve(__dirname, '../public-backup');
  assert.equal(isInsideDirectory(publicDir, path.join(publicDir, 'js', 'app.js')), true);
  assert.equal(isInsideDirectory(publicDir, path.join(siblingDir, 'example.txt')), false);
  assert.equal(isInsideDirectory(publicDir, publicDir), false);
  assert.equal(resolveStaticPath('/js/app.js'), path.join(publicDir, 'js', 'app.js'));
  assert.throws(() => resolveStaticPath('example.txt'), { statusCode: 403 });
  assert.throws(() => resolveStaticPath('/%'), { statusCode: 400 });
});

test('API cùng origin không quảng bá quyền truy cập CORS', async () => {
  const res = await request('/api/health', { headers: { Origin: 'https://example.test' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

