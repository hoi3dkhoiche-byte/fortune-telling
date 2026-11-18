const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../tuvi-core');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');

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
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new RangeError('Payload quá lớn (giới hạn 1MB).'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new TypeError('JSON trong request không đúng cú pháp: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, '.' + safePath);

  // Path traversal check
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { status: 'error', error: 'Truy cập bị từ chối.' });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJson(res, 404, { status: 'error', error: 'Không tìm thấy tài nguyên: ' + pathname });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function matchScenario(candidate, scenario) {
  if (!scenario || typeof scenario !== 'object') return false;
  return (
    candidate.year === scenario.year &&
    candidate.month === scenario.month &&
    candidate.day === scenario.day &&
    candidate.hourBranch === scenario.hourBranch &&
    candidate.gender === scenario.gender
  );
}

const server = http.createServer(async (req, res) => {
  // CORS headers for local inspection
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

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
      const sampleReady = {
        year: 1990,
        month: 1,
        day: 1,
        hourBranch: 6,
        gender: 'male',
      };
      const result = core.computeNatal(sampleReady, profile);
      const displayNatal = core.decorateNatal(result.natal);

      sendJson(res, 200, {
        status: 'ok',
        isSample: true,
        title: 'Lá số mẫu minh họa (01/01/1990 lúc 12:30, Nam, TP. Hồ Chí Minh)',
        displayNatal,
        natal: result.natal,
        facts: result.facts,
        relations: result.relations,
        labels: result.labels,
        hash: result.hash,
        profile: result.profile,
        provenance: result.provenance,
        normalization: {
          chart: sampleReady,
          audit: [
            {
              step: 'sample-baseline',
              description: 'Lá số mẫu chuẩn của năm 1990 từ bộ kiểm thử hồi quy',
              data: { sampleReady, profileId: profile.id },
            },
          ],
          warnings: ['Đây là lá số mẫu minh họa, không phải kết quả tính từ dữ kiện vừa nhập.'],
        },
      });
      return;
    }

    // 4. Compute Natal
    if (req.method === 'POST' && pathname === '/api/natal') {
      const body = await parseJsonBody(req);
      const { birth, profileId = 'thienky-candidate', selectedScenario } = body;

      if (!birth || typeof birth !== 'object') {
        sendJson(res, 400, {
          status: 'error',
          error: 'Thiếu trường dữ liệu birth trong body request.',
        });
        return;
      }

      let profile;
      try {
        profile = core.getProfile(profileId);
      } catch (err) {
        sendJson(res, 400, {
          status: 'error',
          error: `Profile '${profileId}' không hợp lệ hoặc không tồn tại: ${err.message}`,
        });
        return;
      }

      // 1. Chạy chuẩn hóa
      let normalized;
      try {
        normalized = core.normalizeBirth(birth, profile);
      } catch (err) {
        sendJson(res, 400, {
          status: 'error',
          error: `Dữ liệu đầu vào không hợp lệ: ${err.message}`,
        });
        return;
      }

      // 2. Nếu cần làm rõ (needs)
      if (normalized.status === 'needs') {
        // Trường hợp HOUR_BOUNDARY và người dùng gửi selectedScenario
        if (normalized.reason === 'HOUR_BOUNDARY' && selectedScenario) {
          // Kiểm tra selectedScenario có nằm trong scenarios đã chuẩn hóa không
          const isValidScenario = (normalized.scenarios || []).some(s =>
            matchScenario(s, selectedScenario)
          );

          if (!isValidScenario) {
            sendJson(res, 400, {
              status: 'error',
              error: 'selectedScenario không khớp với bất kỳ kịch bản hợp lệ nào được tính toán từ input gốc.',
              validScenarios: normalized.scenarios,
            });
            return;
          }

          // Tính lá số theo kịch bản người dùng chọn
          const result = core.computeNatal(selectedScenario, profile);
          const displayNatal = core.decorateNatal(result.natal);

          const selectionAuditStep = {
            step: 'user-scenario-selection',
            description: 'Người dùng đã xác nhận kịch bản ranh giờ sinh cụ thể.',
            data: { selectedScenario },
          };

          sendJson(res, 200, {
            status: 'ok',
            schemaVersion: result.schemaVersion,
            hash: result.hash,
            profile: result.profile,
            provenance: result.provenance,
            displayNatal,
            natal: result.natal,
            facts: result.facts,
            relations: result.relations,
            labels: result.labels,
            normalization: {
              chart: selectedScenario,
              audit: [...normalized.audit, selectionAuditStep],
              warnings: normalized.warnings,
            },
          });
          return;
        }

        // Các trường hợp needs khác hoặc chưa chọn scenario
        sendJson(res, 422, {
          status: 'needs',
          reason: normalized.reason,
          scenarios: normalized.scenarios,
          audit: normalized.audit,
          warnings: normalized.warnings,
          profile,
        });
        return;
      }

      // 3. Chuẩn hóa thành công (status: 'ok')
      const result = core.computeNatal(normalized.chart, profile);
      const displayNatal = core.decorateNatal(result.natal);

      sendJson(res, 200, {
        status: 'ok',
        schemaVersion: result.schemaVersion,
        hash: result.hash,
        profile: result.profile,
        provenance: result.provenance,
        displayNatal,
        natal: result.natal,
        facts: result.facts,
        relations: result.relations,
        labels: result.labels,
        normalization: {
          chart: normalized.chart,
          audit: normalized.audit,
          warnings: normalized.warnings,
        },
      });
      return;
    }

    // Serve static files
    if (req.method === 'GET') {
      serveStatic(req, res, pathname);
      return;
    }

    sendJson(res, 405, { status: 'error', error: `Phương thức ${req.method} không được hỗ trợ.` });
  } catch (err) {
    console.error('Unhandled server error:', err);
    sendJson(res, 500, {
      status: 'error',
      error: 'Lỗi máy chủ nội bộ: ' + (err.message || String(err)),
    });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Thiên Kỷ Web] Máy chủ đang chạy tại: http://localhost:${PORT}`);
  });
}

module.exports = { server, sendJson, parseJsonBody, matchScenario };
