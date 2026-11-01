'use strict';

// Manual, loopback-only preview using the same in-memory database and
// local identities as the browser integration tests.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { database, DatabaseBackend, profiles, domain, employees } = require('../tests/backend/helpers.cjs');
const { createHandler } = require('../server/handler.cjs');
const { securityHeaders } = require('../server/static.cjs');

const root = path.resolve(__dirname, '..');
const assets = new Map([
  ['/index.html', 'text/html'], ['/app.js', 'text/javascript'],
  ['/style.css', 'text/css'], ['/shared/domain.js', 'text/javascript']
]);

function mondayKey(date, offset) {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + offset * 7);
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${monday.getFullYear()}-${month}-${day}`;
}

async function startOfflineDemo(port = 4180, supplements = false) {
  const db = await database();
  const backend = new DatabaseBackend(db);
  try {
    const now = new Date();
    const registrationWeek = mondayKey(now, 0);
    const exampleWeek = mondayKey(now, 1);
    let { state } = await backend.snapshot(registrationWeek);
    if (supplements) {
      state = require('./submitted-demo.cjs')();
      require('../server/planning.cjs').generate(state, employees);
      state.weekStatus = 3;
    } else {
      state.weekStatus = 1;
    }
    for (const [week, initialState] of [
      [registrationWeek, state], [exampleWeek, require('./submitted-demo.cjs')()]
    ]) {
      await backend.commit({
        p_actor: profiles.manager.id, p_action: 'demo_seed', p_expected_employee_id: null, p_request: randomUUID(),
        p_week: week, p_revision: 0, p_fingerprint: 'offline-demo',
        p_state: initialState, p_result: { message: 'Dữ liệu thử trên máy.' }
      });
    }

    let origin, handler;
    const server = http.createServer(async (req, res) => {
      if (req.headers.host !== server.address().address + ':' + server.address().port) {
        res.writeHead(403).end();
        return;
      }
      const pathname = req.url.split('?')[0];
      if (pathname.startsWith('/api/')) return handler(req, res);
      const asset = pathname === '/' ? '/index.html' : pathname;
      if (!assets.has(asset) || !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(404).end();
        return;
      }
      try {
        securityHeaders(res);
        res.setHeader('Content-Type', assets.get(asset) + '; charset=utf-8');
        res.end(req.method === 'HEAD' ? undefined : await fs.readFile(path.join(root, asset)));
      } catch {
        res.writeHead(500).end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    origin = 'http://127.0.0.1:' + server.address().port;
    handler = createHandler({ backend, origin });
    return { origin, registrationWeek, exampleWeek,
      async close() {
        await new Promise(resolve => server.close(resolve));
        await db.close();
      }
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}

if (require.main === module) {
  const supplements = process.argv.includes('--supplements');
  const port = supplements ? 4181 : 4180;
  startOfflineDemo(port, supplements).then(demo => {
    console.log('2CE chạy thử trên máy:', demo.origin);
    console.log(supplements ? 'Tuần đăng ký bổ sung:' : 'Tuần mở đăng ký:', demo.registrationWeek, '| Tuần có 73 đăng ký mẫu:', demo.exampleWeek);
    console.log('Nhân viên NV01: 0900000003 | Quản lý: 0900000002 | Mật khẩu thử: test-only-generated');
    console.log('Ctrl+C để dừng. Khởi động lại sẽ tạo lịch thử mới.');
    process.once('SIGINT', () => demo.close());
    process.once('SIGTERM', () => demo.close());
  }).catch(error => {
    console.error(error.code === 'EADDRINUSE' ? `Cổng ${port} đang được sử dụng.` : error.message);
    process.exitCode = 1;
  });
}

module.exports = { startOfflineDemo };
