/**
 * Paraveda CRM — dev server (LOCAL TESTING ONLY, not for production).
 * Runs the real api.php through PHP 8.3 (WebAssembly) against a real
 * directory on disk, and serves the static files next to it.
 *
 *   node server.mjs <docroot> [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PHP, PHPRequestHandler } from '@php-wasm/universal';
import { loadNodeRuntime, createNodeFsMountHandler } from '@php-wasm/node';

const DOCROOT = '/var/www';
const HOST_DIR = path.resolve(process.argv[2] || '../.testsite');
const PORT = Number(process.argv[3] || process.env.PORT || 8080);

const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: 1 } }));
php.setSapiName('cli-server');
php.mkdirTree(DOCROOT);
await php.mount(DOCROOT, createNodeFsMountHandler(HOST_DIR));
php.chdir(DOCROOT);

const handler = new PHPRequestHandler({
	documentRoot: DOCROOT,
	absoluteUrl: `http://localhost:${PORT}`,
	phpFactory: async () => php,
	maxPhpInstances: 1,
});

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
};

const readBody = (req) =>
	new Promise((res) => {
		const c = [];
		req.on('data', (d) => c.push(d));
		req.on('end', () => res(Buffer.concat(c)));
	});

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	let pathname = decodeURIComponent(url.pathname);
	if (pathname === '/') pathname = '/index.html';

	if (!pathname.endsWith('.php')) {
		const file = path.join(HOST_DIR, pathname);
		if (fs.existsSync(file) && fs.statSync(file).isFile()) {
			const buf = fs.readFileSync(file);
			res.writeHead(200, {
				'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
				'Cache-Control': 'no-store',
			});
			return res.end(buf);
		}
		res.writeHead(404);
		return res.end('not found');
	}

	const body = await readBody(req);
	const headers = {};
	for (const [k, v] of Object.entries(req.headers)) {
		headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
	}
	const t0 = Date.now();
	try {
		const r = await handler.request({
			url: url.pathname + url.search,
			method: req.method,
			headers,
			body: body.length ? new Uint8Array(body) : undefined,
		});
		const out = {};
		for (const [k, v] of Object.entries(r.headers || {})) {
			if (k.toLowerCase() === 'content-length') continue;
			out[k] = Array.isArray(v) ? v.join(', ') : v;
		}
		res.writeHead(r.httpStatusCode, out);
		res.end(Buffer.from(r.bytes));
		console.log(
			`${req.method} ${url.pathname}${url.search} -> ${r.httpStatusCode} ` +
				`${r.bytes.length}b ${Date.now() - t0}ms`
		);
	} catch (e) {
		console.error('PHP error:', e);
		res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end(String((e && e.stack) || e));
	}
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`Paraveda CRM dev server  →  http://0.0.0.0:${PORT}`);
	console.log(`docroot: ${HOST_DIR}`);
});
