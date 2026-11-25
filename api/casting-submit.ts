import { createClient } from '@supabase/supabase-js';
import {
  computeMergedRecordFromDuplicates,
  findMatchingApplicationWithReason,
  isValidPersonNameInput,
  normalizeEmailAddress,
  toTitleCaseSpanish,
  validateAndFormatSocialHandle,
  validateAndFormatWebPhone,
} from '../src/lib/castingCsvNormalizer';
import type { CastingApplication } from '../src/types';

function sanitizeWebPayload(payload: Record<string, any>) {
  const clean = { ...payload };
  if (typeof clean.nombre === 'string' && isValidPersonNameInput(clean.nombre)) {
    clean.nombre = toTitleCaseSpanish(clean.nombre);
  }
  if (typeof clean.apellidos === 'string' && isValidPersonNameInput(clean.apellidos)) {
    clean.apellidos = toTitleCaseSpanish(clean.apellidos);
  }
  if (typeof clean.ciudad === 'string' && clean.ciudad.trim()) {
    clean.ciudad = toTitleCaseSpanish(clean.ciudad);
  }
  if (typeof clean.nombre_artistico === 'string' && clean.nombre_artistico.trim()) {
    clean.nombre_artistico = toTitleCaseSpanish(clean.nombre_artistico);
  }
  if (typeof clean.whatsapp === 'string') {
    const wa = validateAndFormatWebPhone(clean.whatsapp);
    if (wa.valid) clean.whatsapp = wa.formatted;
  }
  if (typeof clean.correo === 'string') {
    const em = normalizeEmailAddress(clean.correo);
    if (!em.missing) clean.correo = em.email;
  }
  if (typeof clean.instagram === 'string') {
    const ig = validateAndFormatSocialHandle(clean.instagram, 'instagram');
    if (ig.valid) clean.instagram = ig.formatted;
  }
  if (typeof clean.tiktok === 'string' && clean.tiktok.trim()) {
    const tk = validateAndFormatSocialHandle(clean.tiktok, 'tiktok');
    if (tk.valid) clean.tiktok = tk.formatted;
  }
  return clean;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  if (body.website) {
    return res.status(200).json({ ok: true, merged: false });
  }

  if (!body.extendedPayload || typeof body.extendedPayload !== 'object') {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  const extendedPayload = sanitizeWebPayload(body.extendedPayload);
  const corePayload = body.corePayload ? sanitizeWebPayload(body.corePayload) : undefined;

  const age = Number(extendedPayload.edad);
  if (!Number.isFinite(age) || age < 17) {
    return res.status(400).json({ error: 'La edad mínima para participar es 17 años.' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({
      error: 'Servidor sin clave administrativa de Supabase; usar inserción directa.',
    });
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
          'id, nombre, apellidos, fecha_nacimiento, edad, whatsapp, correo, instagram, notas_importacion, origen, talento, estado'
        )
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (fetchError) {
        return res.status(502).json({ error: fetchError.message });
      }

      const rowsPage = (pageData || []) as CastingApplication[];
      existingApps.push(...rowsPage);
      if (rowsPage.length < pageSize) break;
      offset += pageSize;
    }

    const hit = findMatchingApplicationWithReason(
      {
        nombre: String(extendedPayload.nombre || ''),
        apellidos: String(extendedPayload.apellidos || ''),
        fecha_nacimiento: extendedPayload.fecha_nacimiento || null,
        edad: age,
        whatsapp: String(extendedPayload.whatsapp || ''),
        correo: String(extendedPayload.correo || ''),
        instagram: String(extendedPayload.instagram || ''),
        notas_importacion: null,
      },
      existingApps
    );

    if (hit) {
      const { match, matchedBy } = hit;
      const incomingTalento: 'modelo' | 'bailarin' =
        extendedPayload.talento === 'bailarin' ? 'bailarin' : 'modelo';
      const existingTalento: 'modelo' | 'bailarin' | 'ambos' =
        match.talento === 'ambos'
          ? 'ambos'
          : match.talento === 'bailarin'
          ? 'bailarin'
          : 'modelo';

      const canUpgradeToBoth =
        match.origen !== 'google_form' &&
        existingTalento !== 'ambos' &&
        existingTalento !== incomingTalento;

      if (match.origen !== 'google_form' && !canUpgradeToBoth) {
        const fieldLabel =
          matchedBy === 'whatsapp'
            ? 'WhatsApp'
            : matchedBy === 'correo'
            ? 'correo electrónico'
            : matchedBy === 'instagram'
            ? 'Instagram'
            : 'nombre y fecha de nacimiento';
        return res.status(409).json({
          ok: false,
          duplicate: true,
          matchedBy,
          origen: 'web',
          talento: existingTalento,
          error: `Ya existe una inscripción web registrada con ese mismo ${fieldLabel}. Si necesitas corregir algún dato entra a /completar.`,
        });
      }

      const { data: fullMatch, error: fullErr } = await supabaseAdmin
        .from('casting_applications')
        .select('*')
        .eq('id', match.id)
        .single();

      if (!fullErr && fullMatch) {
        const incomingAsRow: CastingApplication = {
          ...(fullMatch as CastingApplication),
          ...extendedPayload,
          id: (fullMatch as CastingApplication).id + 1_000_000,
          origen: 'web',
          created_at: new Date().toISOString(),
        };

        const merged = computeMergedRecordFromDuplicates([
          fullMatch as CastingApplication,
          incomingAsRow,
        ]);

        const { error: updateError } = await supabaseAdmin
          .from('casting_applications')
          .update(merged.updatePayload)
          .eq('id', match.id);

        if (updateError) {
          return res.status(502).json({ error: updateError.message });
        }

        return res.status(200).json({
          ok: true,
          merged: true,
          upgradedToBoth: canUpgradeToBoth,
          talento: merged.updatePayload.talento,
          id: match.id,
        });
      }
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('casting_applications')
      .insert([extendedPayload])
      .select('id')
      .single();

    if (insertError) {
      if (
        corePayload &&
        (insertError.code === 'PGRST204' ||
          insertError.code === '42703' ||
          /schema cache|column/i.test(insertError.message || ''))
      ) {
        const { data: fallbackInserted, error: fallbackError } = await supabaseAdmin
          .from('casting_applications')
          .insert([corePayload])
          .select('id')
          .single();

        if (fallbackError) {
          return res.status(502).json({ error: fallbackError.message });
        }
        return res.status(200).json({ ok: true, merged: false, id: fallbackInserted?.id });
      }
      return res.status(502).json({ error: insertError.message });
    }

    return res.status(200).json({ ok: true, merged: false, id: inserted?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error interno al procesar postulación.' });
  }
}
