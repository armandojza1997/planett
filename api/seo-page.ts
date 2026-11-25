import fs from 'fs';
import path from 'path';
import { applySeoMeta, CASTING_SEO_BY_PAGE } from '../src/lib/seoMeta';

function getOriginFromReq(req: any): string {
  const rawHost =
    (typeof req?.headers?.['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    (typeof req?.headers?.host === 'string' && req.headers.host) ||
    '';
  const host = rawHost.split(',')[0].trim();
  const rawProto =
    (typeof req?.headers?.['x-forwarded-proto'] === 'string' && req.headers['x-forwarded-proto']) ||
    'https';
  const proto = rawProto.split(',')[0].trim() || 'https';
  return host ? `${proto}://${host}` : '';
}

function resolvePageType(req: any): 'casting' | 'bailarines' | 'completar' {
  const qPage = typeof req?.query?.page === 'string' ? req.query.page.trim().toLowerCase() : '';
  if (qPage === 'bailarines') return 'bailarines';
  if (qPage === 'completar') return 'completar';
  const rawUrl = typeof req?.url === 'string' ? req.url : '';
  const pathname = rawUrl.split('?')[0].replace(/\/+$/, '').toLowerCase();
  if (pathname === '/bailarines') return 'bailarines';
  if (pathname === '/completar') return 'completar';
  return 'casting';
}

function buildMinimalFallbackHtml(
  pageType: 'casting' | 'bailarines' | 'completar',
  origin: string
): string {
  const meta = CASTING_SEO_BY_PAGE[pageType];
  const img = origin ? `${origin}${meta.imagePath}` : meta.imagePath;
  const pageUrl = origin ? `${origin}${meta.canonicalPath}` : meta.canonicalPath;
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${meta.description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    <meta property="og:image:width" content="${meta.imageWidth}" />
    <meta property="og:image:height" content="${meta.imageHeight}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    <meta name="twitter:image" content="${img}" />
    <title>${meta.title}</title>
  </head>
  <body><div id="root"></div></body>
</html>`;
}

export default async function handler(req: any, res: any) {
  const origin = getOriginFromReq(req);
  const pageType = resolvePageType(req);
  const canonicalPath =
    pageType === 'bailarines' ? '/bailarines' : pageType === 'completar' ? '/completar' : '/';

  let rawHtml = '';
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'index.html'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        rawHtml = fs.readFileSync(filePath, 'utf-8');
        if (rawHtml) break;
      }
    } catch {
      // continue trying next source
    }
  }

  if (!rawHtml && origin) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const htmlRes = await fetch(`${origin}/index.html`, { signal: controller.signal });
      clearTimeout(timer);
      if (htmlRes.ok) {
        rawHtml = await htmlRes.text();
      }
    } catch {
      // fall through to minimal fallback
    }
  }

  const finalHtml = rawHtml
    ? applySeoMeta(rawHtml, origin, pageType, canonicalPath)
    : buildMinimalFallbackHtml(pageType, origin);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  return res.status(200).send(finalHtml);
}
