const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../tuvi-core');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const MAX_BODY_BYTES = 1024 * 1024;

class RequestError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const oversized = () => new RequestError(413, 'Dữ liệu gửi lên vượt giới hạn 1 MiB.');
    req.once('error', reject);
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      req.resume();
      reject(oversized());
      return;
    }

    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(oversized());
        return;
      }
      chunks.push(chunk);
    });
    req.once('end', () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks, size).toString('utf8')));
      } catch {
        reject(new RequestError(400, 'JSON trong yêu cầu không đúng cú pháp.'));
      }
    });
    req.once('aborted', () => reject(new RequestError(400, 'Yêu cầu bị ngắt trước khi gửi đủ dữ liệu.')));
  });
}

function isInsideDirectory(directory, filePath) {
  const relative = path.relative(directory, filePath);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveStaticPath(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new RequestError(400, 'Đường dẫn không đúng định dạng.');
  }
  if (!decodedPath.startsWith('/') || /[\\:\0]/.test(decodedPath) || decodedPath.split('/').includes('..')) {
    throw new RequestError(403, 'Truy cập bị từ chối.');
  }
  const filePath = path.resolve(PUBLIC_DIR, decodedPath === '/' ? 'index.html' : `.${decodedPath}`);
  if (!isInsideDirectory(PUBLIC_DIR, filePath)) {
    throw new RequestError(403, 'Truy cập bị từ chối.');
  }
  return filePath;
}

async function serveStatic(res, pathname) {
  const filePath = resolveStaticPath(pathname);
  let realPath;
  let stats;
  try {
    realPath = await fs.promises.realpath(filePath);
    const realPublicDir = await fs.promises.realpath(PUBLIC_DIR);
    if (!isInsideDirectory(realPublicDir, realPath)) {
      throw new RequestError(403, 'Truy cập bị từ chối.');
    }
    stats = await fs.promises.stat(realPath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new RequestError(404, 'Không tìm thấy tài nguyên.');
    }
    throw error;
  }
  if (!stats.isFile()) throw new RequestError(404, 'Không tìm thấy tài nguyên.');

  const ext = path.extname(realPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stats.size,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  const stream = fs.createReadStream(realPath);
  stream.once('error', error => res.destroy(error));
  res.once('close', () => stream.destroy());
  stream.pipe(res);
}

function matchScenario(candidate, scenario) {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return false;
  return (
    candidate.year === scenario.year &&
    candidate.month === scenario.month &&
    candidate.day === scenario.day &&
    candidate.hourBranch === scenario.hourBranch &&
    candidate.gender === scenario.gender
  );
}

function chartResponse(birth, profile, chart, audit, warnings) {
  const result = core.computeNatal(chart, profile);
  return {
    status: 'ok',
    ...result,
    displayNatal: core.decorateNatal(result.natal),
    normalization: { input: birth, chart, audit, warnings },
  };
}

function chooseScenario(normalized, selectedScenario, selectedInstant) {
  if (normalized.status === 'needs' && normalized.reason === 'HOUR_BOUNDARY' && selectedInstant === undefined) {
    const chart = normalized.scenarios?.find(candidate => matchScenario(candidate, selectedScenario));
    if (chart) return { chart };
  }
  if (normalized.status === 'needs' && normalized.reason === 'AMBIGUOUS_LOCAL_TIME' && typeof selectedInstant === 'string') {
    const option = normalized.scenarioOptions?.find(candidate =>
      candidate.instant === selectedInstant && matchScenario(candidate.chart, selectedScenario));
    if (option) return option;
  }
  throw new RequestError(400, 'Lựa chọn không khớp với bất kỳ kịch bản hợp lệ nào của dữ liệu hiện tại.', {
    validScenarios: normalized.scenarios,
    scenarioOptions: normalized.scenarioOptions,
  });
}

const server = http.createServer(async (req, res) => {
  // Keep the request pathname intact until the static path resolver checks it.
  const pathname = (req.url || '').split('?', 1)[0];

  try {
    // 1. Health check
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        serverTime: new Date().toISOString(),
        node: process.version,
        coreVersion: '0.1.0',
      });
      return;
    }

    // 2. Profiles list
    if (req.method === 'GET' && pathname === '/api/profiles') {
      sendJson(res, 200, {
        profiles: core.PROFILES,
        evidence: core.PROFILE_EVIDENCE,
        defaultProfileId: 'thienky-candidate',
      });
      return;
    }

    // 3. Sample chart
    if (req.method === 'GET' && pathname === '/api/sample') {
      const profile = core.getProfile('thienky-candidate');
      const birth = {
        calendar: 'solar',
        date: '1990-01-01',
        time: '12:30',
        tz: 'Asia/Ho_Chi_Minh',
        gender: 'male',
      };
      const normalized = core.normalizeBirth(birth, profile);
      if (normalized.status !== 'ok') throw new Error('Dữ liệu lá số mẫu cần được xem lại.');
      sendJson(res, 200, {
        ...chartResponse(birth, profile, normalized.chart, normalized.audit, [
          ...normalized.warnings,
          'Đây là lá số mẫu minh họa, không phải kết quả tính từ dữ kiện vừa nhập.',
        ]),
        isSample: true,
        title: 'Lá số mẫu minh họa (01/01/1990 lúc 12:30, Nam, TP. Hồ Chí Minh)',
      });
      return;
    }

    // 4. Compute Natal
    if (req.method === 'POST' && pathname === '/api/natal') {
      const body = await parseJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new RequestError(400, 'Dữ liệu gửi lên phải là một đối tượng JSON.');
      }
      const { birth, profileId = 'thienky-candidate', selectedScenario, selectedInstant } = body;
      if (!birth || typeof birth !== 'object' || Array.isArray(birth)) {
        throw new RequestError(400, 'Trường birth phải là một đối tượng JSON.');
      }
      if (typeof profileId !== 'string') throw new RequestError(400, 'Mã cấu hình phải là chuỗi.');
      let profile;
      try {
        profile = core.getProfile(profileId);
      } catch {
        throw new RequestError(400, 'Cấu hình không hợp lệ hoặc không tồn tại.');
      }

      let normalized;
      try {
        normalized = core.normalizeBirth(birth, profile);
      } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) {
          throw new RequestError(400, `Dữ liệu đầu vào không hợp lệ. ${error.message}`);
        }
        throw error;
      }

      if (selectedScenario != null || selectedInstant !== undefined) {
        const { chart, instant, utcOffsetMinutes } = chooseScenario(normalized, selectedScenario, selectedInstant);
        const selectionAudit = {
          step: 'user-scenario-selection',
          description: 'Người dùng đã xác nhận kịch bản giờ sinh.',
          data: {
            reason: normalized.reason,
            selectedScenario: chart,
            ...(instant === undefined ? {} : { selectedInstant: instant, utcOffsetMinutes }),
          },
        };
        sendJson(res, 200, chartResponse(birth, profile, chart, [...normalized.audit, selectionAudit], normalized.warnings));
        return;
      }

      if (normalized.status === 'needs') {
        sendJson(res, 422, { ...normalized, profile });
        return;
      }
      sendJson(res, 200, chartResponse(birth, profile, normalized.chart, normalized.audit, normalized.warnings));
      return;
    }

    // Serve static files
    if (req.method === 'GET') {
      await serveStatic(res, pathname);
      return;
    }

    sendJson(res, 405, { status: 'error', error: `Phương thức ${req.method} không được hỗ trợ.` });
  } catch (error) {
    if (res.destroyed) return;
    if (error instanceof RequestError) {
      sendJson(res, error.statusCode, { status: 'error', error: error.message, ...error.details });
      return;
    }
    console.error('Unhandled server error:', error);
    if (res.headersSent) res.destroy();
    else sendJson(res, 500, { status: 'error', error: 'Máy chủ gặp lỗi khi xử lý yêu cầu.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Thiên Kỷ Web] Máy chủ đang chạy tại: http://localhost:${PORT}`);
  });
}

module.exports = { server, sendJson, parseJsonBody, matchScenario, resolveStaticPath, isInsideDirectory };
