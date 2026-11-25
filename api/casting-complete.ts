import { createClient } from '@supabase/supabase-js';
import {
  analyzeApplicationIssues,
  computeMissingCastingFields,
  isValidPersonNameInput,
  normalizeEmailAddress,
  toTitleCaseSpanish,
  validateAndFormatSocialHandle,
  validateAndFormatWebPhone,
} from '../src/lib/castingCsvNormalizer';
import type { CastingApplication } from '../src/types';
import { verifyLookupToken } from './_lookupToken';

function computeAge(dobStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) return null;
  const [y, m, d] = dobStr.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }
  return age >= 0 && age <= 100 ? age : null;
}

function isValidStoredPhotoUrl(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  return /^https?:\/\/.+|^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({
      error: 'Servidor sin configuración administrativa para actualizar la ficha.',
    });
  }

  const recordId = verifyLookupToken(String(body.lookupToken || ''), serviceRoleKey);
  if (!recordId) {
    return res.status(401).json({
      error: 'Tu sesión de verificación expiró o no es válida. Vuelve a buscar tu ficha.',
    });
  }

  const updates = body.updates && typeof body.updates === 'object' ? body.updates : {};

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const { data: existingData, error: fetchErr } = await supabaseAdmin
      .from('casting_applications')
      .select('*')
      .eq('id', recordId)
      .single();

    if (fetchErr || !existingData) {
      return res.status(404).json({ error: 'No se encontró la ficha seleccionada.' });
    }

    const existing = existingData as CastingApplication;
    const patch: Record<string, unknown> = {};

    if (typeof updates.nombre === 'string' && updates.nombre.trim()) {
      if (!isValidPersonNameInput(updates.nombre)) {
        return res.status(400).json({ error: 'Ingresa un nombre válido (sin números ni símbolos).' });
      }
      patch.nombre = toTitleCaseSpanish(updates.nombre);
    }

    if (typeof updates.apellidos === 'string' && updates.apellidos.trim()) {
      if (!isValidPersonNameInput(updates.apellidos)) {
        return res.status(400).json({ error: 'Ingresa apellidos válidos (sin números ni símbolos).' });
      }
      patch.apellidos = toTitleCaseSpanish(updates.apellidos);
    }

    if (typeof updates.nombre_artistico === 'string') {
      const trimmedArt = updates.nombre_artistico.trim();
      patch.nombre_artistico = trimmedArt ? toTitleCaseSpanish(trimmedArt) : null;
    }

    if (typeof updates.fecha_nacimiento === 'string' && updates.fecha_nacimiento.trim()) {
      const dob = updates.fecha_nacimiento.trim();
      const computedAge = computeAge(dob);
      if (computedAge === null) {
        return res.status(400).json({ error: 'Fecha de nacimiento inválida.' });
      }
      if (computedAge < 17) {
        return res.status(400).json({ error: 'La edad mínima para participar es de 17 años.' });
      }
      patch.fecha_nacimiento = dob;
      patch.edad = computedAge;
    }

    if (typeof updates.ciudad === 'string' && updates.ciudad.trim()) {
      patch.ciudad = toTitleCaseSpanish(updates.ciudad);
    }

    if (typeof updates.whatsapp === 'string' && updates.whatsapp.trim()) {
      const wa = validateAndFormatWebPhone(updates.whatsapp);
      if (!wa.valid) {
        return res.status(400).json({ error: wa.error || 'Número de WhatsApp inválido.' });
      }
      patch.whatsapp = wa.formatted;
    }

    if (typeof updates.correo === 'string' && updates.correo.trim()) {
      const emailParsed = normalizeEmailAddress(updates.correo);
      if (emailParsed.missing) {
        return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
      }
      patch.correo = emailParsed.email;
    }

    if (typeof updates.instagram === 'string' && updates.instagram.trim()) {
      const igParsed = validateAndFormatSocialHandle(updates.instagram, 'instagram');
      if (!igParsed.valid) {
        return res.status(400).json({ error: igParsed.error || 'Usuario de Instagram inválido.' });
      }
      patch.instagram = igParsed.formatted;
    }

    if (typeof updates.tiktok === 'string') {
      const rawTk = updates.tiktok.trim();
      if (!rawTk || rawTk === '@') {
        patch.tiktok = null;
      } else {
        const tkParsed = validateAndFormatSocialHandle(rawTk, 'tiktok');
        if (!tkParsed.valid) {
          return res.status(400).json({ error: tkParsed.error || 'Usuario de TikTok inválido.' });
        }
        patch.tiktok = tkParsed.formatted;
      }
    }

    if (updates.estatura !== undefined && updates.estatura !== null && String(updates.estatura).trim() !== '') {
      const h = Math.round(Number(updates.estatura));
      if (!Number.isFinite(h) || h < 120 || h > 225) {
        return res.status(400).json({ error: 'Ingresa tu estatura en centímetros (entre 120 y 225).' });
      }
      patch.estatura = h;
    }

    const intMeasurements: ('busto' | 'cintura' | 'caderas')[] = ['busto', 'cintura', 'caderas'];
    for (const field of intMeasurements) {
      if (updates[field] !== undefined && updates[field] !== null && String(updates[field]).trim() !== '') {
        const v = Math.round(Number(updates[field]));
        if (!Number.isFinite(v) || v < 40 || v > 170) {
          return res.status(400).json({ error: `Medida de ${field} fuera de rango (40–170 cm).` });
        }
        patch[field] = v;
      }
    }

    const textChoices: (
      | 'talla_superior'
      | 'talla_inferior'
      | 'calzado'
      | 'color_cabello'
      | 'largo_cabello'
      | 'estado_cabello'
      | 'color_ojos'
      | 'tono_piel'
      | 'genero'
      | 'formacion_artistica'
      | 'nivel_ensenanza'
    )[] = [
      'talla_superior',
      'talla_inferior',
      'calzado',
      'color_cabello',
      'largo_cabello',
      'estado_cabello',
      'color_ojos',
      'tono_piel',
      'genero',
      'formacion_artistica',
      'nivel_ensenanza',
    ];
    for (const field of textChoices) {
      if (typeof updates[field] === 'string' && updates[field].trim()) {
        patch[field] = updates[field].trim();
      }
    }

    if (typeof updates.tiene_piercings === 'boolean') {
      patch.tiene_piercings = updates.tiene_piercings;
    }
    if (typeof updates.tiene_tatuajes === 'boolean') {
      patch.tiene_tatuajes = updates.tiene_tatuajes;
    }
    if (typeof updates.detalle_piercings_tatuajes === 'string') {
      patch.detalle_piercings_tatuajes = updates.detalle_piercings_tatuajes.trim() || null;
    }

    if (isValidStoredPhotoUrl(updates.foto_cara)) {
      patch.foto_cara = updates.foto_cara.trim();
    }
    if (isValidStoredPhotoUrl(updates.foto_cuerpo)) {
      patch.foto_cuerpo = updates.foto_cuerpo.trim();
    }

    const mergedRow: CastingApplication = {
      ...existing,
      ...patch,
    } as CastingApplication;

    if (mergedRow.foto_cara && mergedRow.foto_cuerpo) {
      patch.origen = 'web';
      mergedRow.origen = 'web';
    }

    const missingFields = computeMissingCastingFields(mergedRow);
    patch.campos_faltantes = missingFields;
    patch.datos_incompletos = missingFields.length > 0;

    // Never touch existing estado or notas_importacion ([CUPÓN])
    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from('casting_applications')
      .update(patch)
      .eq('id', recordId)
      .select('*')
      .single();

    if (updateError) {
      return res.status(502).json({ error: updateError.message });
    }

    const finalApp = (updatedData || mergedRow) as CastingApplication;
    const analysis = analyzeApplicationIssues(finalApp);

    return res.status(200).json({
      ok: true,
      id: recordId,
      campos_faltantes: missingFields,
      datos_incompletos: missingFields.length > 0,
      hasFotoCara: Boolean(finalApp.foto_cara),
      hasFotoCuerpo: Boolean(finalApp.foto_cuerpo),
      analysis,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error interno al actualizar la ficha.' });
  }
}
