const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server } = require('../server');

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

test('GET path traversal bị chặn', async () => {
  const res = await request('/../../package.json');
  assert.ok(res.status === 403 || res.status === 404);
});

