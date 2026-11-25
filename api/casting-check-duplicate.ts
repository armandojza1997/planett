import { createClient } from '@supabase/supabase-js';
import { findMatchingApplicationWithReason } from '../src/lib/castingCsvNormalizer';
import type { CastingApplication } from '../src/types';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  const requestedTalento =
    body.requestedTalento === 'bailarin'
      ? 'bailarin'
      : body.requestedTalento === 'modelo'
      ? 'modelo'
      : null;

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(200).json({ ok: true, checked: false, found: false });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const existingApps: CastingApplication[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const { data: pageData, error: fetchError } = await supabaseAdmin
        .from('casting_applications')
        .select(
          'id, nombre, apellidos, fecha_nacimiento, edad, whatsapp, correo, instagram, notas_importacion, origen, talento, estado, campos_faltantes, datos_incompletos'
        )
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (fetchError) {
        return res.status(200).json({ ok: true, checked: false, found: false });
      }

      const rowsPage = (pageData || []) as CastingApplication[];
      existingApps.push(...rowsPage);
      if (rowsPage.length < pageSize) break;
      offset += pageSize;
    }

    const hit = findMatchingApplicationWithReason(
      {
        nombre: String(body.nombre || ''),
        apellidos: String(body.apellidos || ''),
        fecha_nacimiento: body.fecha_nacimiento || null,
        edad: Number(body.edad) || 0,
        whatsapp: String(body.whatsapp || ''),
        correo: String(body.correo || ''),
        instagram: String(body.instagram || ''),
        notas_importacion: null,
      },
      existingApps
    );

    if (!hit) {
      return res.status(200).json({ ok: true, checked: true, found: false });
    }

    const origen = hit.match.origen === 'google_form' ? 'google_form' : 'web';
    const existingTalento: 'modelo' | 'bailarin' | 'ambos' =
      hit.match.talento === 'ambos'
        ? 'ambos'
        : hit.match.talento === 'bailarin'
        ? 'bailarin'
        : 'modelo';

    const missingPhotos =
      origen === 'google_form' ||
      (Array.isArray(hit.match.campos_faltantes) && hit.match.campos_faltantes.includes('fotos'));

    const canUpgradeToBoth = Boolean(
      origen === 'web' &&
        existingTalento !== 'ambos' &&
        requestedTalento &&
        existingTalento !== requestedTalento
    );

    const isIncomplete = Boolean(
      hit.match.datos_incompletos ||
        (Array.isArray(hit.match.campos_faltantes) && hit.match.campos_faltantes.length > 0) ||
        missingPhotos
    );

    return res.status(200).json({
      ok: true,
      checked: true,
      found: true,
      origen,
      talento: existingTalento,
      matchedBy: hit.matchedBy,
      missingPhotos,
      canUpgradeToBoth,
      isIncomplete,
    });
  } catch {
    return res.status(200).json({ ok: true, checked: false, found: false });
  }
}
