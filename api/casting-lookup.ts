import { createClient } from '@supabase/supabase-js';
import {
  analyzeApplicationIssues,
  findMatchingApplicationWithReason,
} from '../src/lib/castingCsvNormalizer';
import type { CastingApplication } from '../src/types';
import { signLookupToken } from './_lookupToken';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  const whatsapp = String(body.whatsapp || '').trim();
  const correo = String(body.correo || '').trim();
  const instagram = String(body.instagram || '').trim();
  const nombre = String(body.nombre || '').trim();
  const apellidos = String(body.apellidos || '').trim();
  const fecha_nacimiento = body.fecha_nacimiento ? String(body.fecha_nacimiento).trim() : null;

  const hasPhone = whatsapp.replace(/\D/g, '').length >= 7;
  const hasEmail = correo.includes('@') && correo.length >= 5;
  const hasIg = instagram.replace(/^@+/, '').trim().length >= 3;
  const hasNameDob = Boolean(nombre && apellidos && fecha_nacimiento);

  if (!hasPhone && !hasEmail && !hasIg && !hasNameDob) {
    return res.status(400).json({
      error:
        'Ingresa tu número de WhatsApp, correo electrónico, usuario de @Instagram, o nombre completo con fecha de nacimiento para buscar tu ficha.',
    });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({
      error: 'El servidor no tiene configurada la clave administrativa para búsquedas.',
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
        nombre,
        apellidos,
        fecha_nacimiento,
        edad: Number(body.edad) || 0,
        whatsapp,
        correo,
        instagram,
        notas_importacion: null,
      },
      existingApps
    );

    if (!hit) {
      return res.status(200).json({ ok: true, checked: true, found: false });
    }

    const { data: fullRow, error: fullError } = await supabaseAdmin
      .from('casting_applications')
      .select('*')
      .eq('id', hit.match.id)
      .single();

    if (fullError || !fullRow) {
      return res.status(502).json({ error: fullError?.message || 'No se pudo cargar tu ficha.' });
    }

    const app = fullRow as CastingApplication;
    const analysis = analyzeApplicationIssues(app);
    const lookupToken = signLookupToken(app.id, serviceRoleKey);

    return res.status(200).json({
      ok: true,
      checked: true,
      found: true,
      matchedBy: hit.matchedBy,
      lookupToken,
      profile: {
        id: app.id,
        nombre: app.nombre,
        apellidos: app.apellidos,
        nombre_artistico: app.nombre_artistico || '',
        fecha_nacimiento: app.fecha_nacimiento || '',
        edad: app.edad,
        ciudad: app.ciudad || '',
        whatsapp: app.whatsapp || '',
        correo: app.correo || '',
        instagram: app.instagram || '',
        tiktok: app.tiktok || '',
        talento: app.talento === 'ambos' ? 'ambos' : app.talento === 'bailarin' ? 'bailarin' : 'modelo',
        genero: app.genero || '',
        formacion_artistica: app.formacion_artistica || '',
        nivel_ensenanza: app.nivel_ensenanza || '',
        estatura: app.estatura ?? null,
        busto: app.busto ?? null,
        cintura: app.cintura ?? null,
        caderas: app.caderas ?? null,
        talla_superior: app.talla_superior || '',
        talla_inferior: app.talla_inferior || '',
        calzado: app.calzado || '',
        color_cabello: app.color_cabello || '',
        largo_cabello: app.largo_cabello || '',
        estado_cabello: app.estado_cabello || '',
        color_ojos: app.color_ojos || '',
        tono_piel: app.tono_piel || '',
        tiene_piercings: Boolean(app.tiene_piercings),
        tiene_tatuajes: Boolean(app.tiene_tatuajes),
        detalle_piercings_tatuajes: app.detalle_piercings_tatuajes || '',
        origen: app.origen === 'google_form' ? 'google_form' : 'web',
        estado: app.estado,
        hasFotoCara: Boolean(app.foto_cara && String(app.foto_cara).trim()),
        hasFotoCuerpo: Boolean(app.foto_cuerpo && String(app.foto_cuerpo).trim()),
      },
      analysis,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error interno buscando postulación.' });
  }
}
