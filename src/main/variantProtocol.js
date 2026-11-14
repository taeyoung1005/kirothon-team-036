// 시안은 file:// 이 아니라 전용 프로토콜로 서빙한다. 응답 헤더에 CSP를 붙여 강제하기 위해서다.
//   skillpick-variant://<runId>/<skillId>/index.html   시안 HTML (별도 세션 파티션에서만 열린다)
//   skillpick-asset://<runId>/<original|skillId>/<desktop|mobile>   캡처 PNG (앱 창에서만 쓴다)
import { protocol, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { assertId, originalDir, workDirOf } from './paths.js';

export const VARIANT_SCHEME = 'skillpick-variant';
export const ASSET_SCHEME = 'skillpick-asset';
export const VARIANT_PARTITION = 'skillpick-variants'; // persist: 가 없으므로 저장되지 않는 세션

export const VARIANT_CSP = [
  "script-src 'unsafe-inline'",
  "connect-src 'none'",
  'img-src https: data:',
  'font-src https: data:',
  "style-src 'unsafe-inline' https:",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

export function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: VARIANT_SCHEME, privileges: { standard: true, secure: true } },
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

export const variantUrl = (runId, skillId) => `${VARIANT_SCHEME}://${assertId(runId, 'runId')}/${assertId(skillId, 'skillId')}/index.html`;
export const assetUrl = (runId, who, kind) => `${ASSET_SCHEME}://${assertId(runId, 'runId')}/${who}/${kind}`;

const text = (status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

function variantHandler(request) {
  try {
    const u = new URL(request.url);
    const [skillId, file] = u.pathname.split('/').filter(Boolean);
    if (file !== 'index.html') return text(404, 'not found');
    const html = fs.readFileSync(path.join(workDirOf(u.hostname, skillId), 'out', 'index.html'));
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': VARIANT_CSP,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return text(error.code === 'ENOENT' ? 404 : 400, '열 수 없어요');
  }
}

function assetHandler(request) {
  try {
    const u = new URL(request.url);
    const [who, kind] = u.pathname.split('/').filter(Boolean);
    if (!['desktop', 'mobile'].includes(kind)) return text(404, 'not found');
    const file = who === 'original'
      ? path.join(originalDir(u.hostname), `original-${kind}.png`)
      : path.join(workDirOf(u.hostname, who), `variant-${kind}.png`);
    return new Response(fs.readFileSync(file), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
  } catch (error) {
    return text(error.code === 'ENOENT' ? 404 : 400, '열 수 없어요');
  }
}

export function configureVariantSession() {
  const ses = session.fromPartition(VARIANT_PARTITION);
  ses.protocol.handle(VARIANT_SCHEME, variantHandler);
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  ses.on('will-download', (event) => event.preventDefault());
  return ses;
}

export function registerHandlers() {
  session.defaultSession.protocol.handle(ASSET_SCHEME, assetHandler);
  return configureVariantSession();
}
