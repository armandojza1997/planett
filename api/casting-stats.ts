import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(200).json({
      ok: false,
      modelos: 0,
      bailarines: 0,
      ambos: 0,
      soloModelos: 0,
      soloBailarines: 0,
      total: 0,
    });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const [totalRes, soloDancersRes, bothRes] = await Promise.all([
      supabaseAdmin
        .from('casting_applications')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('casting_applications')
        .select('id', { count: 'exact', head: true })
        .eq('talento', 'bailarin'),
      supabaseAdmin
        .from('casting_applications')
        .select('id', { count: 'exact', head: true })
        .eq('talento', 'ambos'),
    ]);

    if (totalRes.error || soloDancersRes.error || bothRes.error) {
      return res.status(200).json({
        ok: false,
        modelos: 0,
        bailarines: 0,
        ambos: 0,
        soloModelos: 0,
        soloBailarines: 0,
        total: 0,
      });
    }

    const total = totalRes.count ?? 0;
    const soloBailarines = soloDancersRes.count ?? 0;
    const ambos = bothRes.count ?? 0;
    const soloModelos = Math.max(0, total - soloBailarines - ambos);
    const modelos = soloModelos + ambos;
    const bailarines = soloBailarines + ambos;

    return res.status(200).json({
      ok: true,
      modelos,
      bailarines,
      ambos,
      soloModelos,
      soloBailarines,
      total,
    });
  } catch {
    return res.status(200).json({
      ok: false,
      modelos: 0,
      bailarines: 0,
      ambos: 0,
      soloModelos: 0,
      soloBailarines: 0,
      total: 0,
    });
  }
}
