export type SeoPageType = 'catalog' | 'casting' | 'bailarines' | 'completar';

interface CastingSeoConfig {
  title: string;
  description: string;
  keywords: string;
  imagePath: string;
  imageWidth: string;
  imageHeight: string;
  webAppTitle: string;
  manifestPath: string;
  canonicalPath: string;
}

export const CASTING_SEO_BY_PAGE: Record<'casting' | 'bailarines' | 'completar', CastingSeoConfig> = {
  casting: {
    title: 'Casting Planet Talent | Convocatoria para Modelos',
    description:
      'Convocatoria presencial de casting para modelos · 28 y 29 de noviembre en Estudio 50 (Calle Lugareño esq. Almendares, Vedado, Plaza de la Revolución), La Habana.',
    keywords: 'casting, modelos, planet talent, planet records, convocatoria, la habana, estudio 50',
    imagePath: '/assets/aistudio/casting_flyer_top.jpg',
    imageWidth: '870',
    imageHeight: '628',
    webAppTitle: 'Casting PT',
    manifestPath: '/manifest-casting.json',
    canonicalPath: '/',
  },
  bailarines: {
    title: 'Casting Bailarines | LDC · Planet Records & Estudio 50',
    description:
      'Convocatoria presencial de casting para bailarines · Domingo 29 de noviembre, 9:00 AM en Estudio 50 (Almendares y Lugareño, Vedado), La Habana.',
    keywords: 'casting bailarines, ldc, planet records, estudio 50, danza, la habana',
    imagePath: '/assets/aistudio/casting_flyer_bailarines.jpg',
    imageWidth: '482',
    imageHeight: '861',
    webAppTitle: 'Casting LDC',
    manifestPath: '/manifest-casting.json',
    canonicalPath: '/bailarines',
  },
  completar: {
    title: 'Completar Ficha | Casting Planet Talent',
    description:
      'Sube tus 2 fotos y completa o corrige los datos pendientes de tu inscripción al Casting Planet Talent en Estudio 50.',
    keywords: 'completar ficha, casting planet talent, fotos casting, estudio 50, modelos, bailarines',
    imagePath: '/assets/aistudio/casting_flyer_top.jpg',
    imageWidth: '870',
    imageHeight: '628',
    webAppTitle: 'Completar PT',
    manifestPath: '/manifest-casting.json',
    canonicalPath: '/completar',
  },
};

export function applySeoMeta(
  html: string,
  origin: string,
  pageType: SeoPageType,
  requestPath?: string
): string {
  const normalizedOrigin = (origin || '').replace(/\/+$/, '');

  if (pageType === 'catalog') {
    if (!normalizedOrigin) return html;
    return html
      .replace(/content="\/og-preview\.jpg"/g, `content="${normalizedOrigin}/og-preview.jpg"`)
      .replace(/href="\/og-preview\.jpg"/g, `href="${normalizedOrigin}/og-preview.jpg"`);
  }

  const meta = CASTING_SEO_BY_PAGE[pageType];
  const absoluteImage = normalizedOrigin ? `${normalizedOrigin}${meta.imagePath}` : meta.imagePath;
  const targetPath = requestPath || meta.canonicalPath;
  const pageUrl = normalizedOrigin ? `${normalizedOrigin}${targetPath}` : targetPath;

  let updated = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${meta.title}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/i,
      `<meta name="description" content="${meta.description}" />`
    )
    .replace(
      /<meta\s+name="keywords"\s+content="[^"]*"\s*\/>/i,
      `<meta name="keywords" content="${meta.keywords}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:title" content="${meta.title}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:description" content="${meta.description}" />`
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:image" content="${absoluteImage}" />`
    )
    .replace(
      /<meta\s+property="og:image:secure_url"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:image:secure_url" content="${absoluteImage}" />`
    )
    .replace(
      /<meta\s+property="og:image:width"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:image:width" content="${meta.imageWidth}" />`
    )
    .replace(
      /<meta\s+property="og:image:height"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:image:height" content="${meta.imageHeight}" />`
    )
    .replace(
      /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:image:alt" content="${meta.title}" />`
    )
    .replace(
      /<link\s+rel="image_src"\s+href="[^"]*"\s*\/>/i,
      `<link rel="image_src" href="${absoluteImage}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/i,
      `<meta name="twitter:title" content="${meta.title}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/i,
      `<meta name="twitter:description" content="${meta.description}" />`
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/>/i,
      `<meta name="twitter:image" content="${absoluteImage}" />`
    )
    .replace(
      /<meta\s+name="twitter:image:alt"\s+content="[^"]*"\s*\/>/i,
      `<meta name="twitter:image:alt" content="${meta.title}" />`
    )
    .replace(
      /<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/>/i,
      `<meta name="apple-mobile-web-app-title" content="${meta.webAppTitle}" />`
    )
    .replace(
      /<link\s+rel="manifest"\s+href="[^"]*"\s*\/>/i,
      `<link rel="manifest" href="${meta.manifestPath}" />`
    );

  if (/<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/i.test(updated)) {
    updated = updated.replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:url" content="${pageUrl}" />`
    );
  } else {
    updated = updated.replace(
      /<\/head>/i,
      `    <meta property="og:url" content="${pageUrl}" />\n  </head>`
    );
  }

  return updated;
}
