export interface CastingConfig {
  enabled: boolean;
  deadlineIso: string;
}

// Modo temporal de presentación: muestra únicamente la página de Casting en "/" y "/casting"
// sin referencias al catálogo. Cambiar a false al aprobar el diseño para restaurar el catálogo.
export const CASTING_ONLY_PREVIEW_MODE = true;

export const CASTING_STORAGE_KEY = 'pt_casting_config';
export const CASTING_EVENT_UPDATED = 'pt-casting-config-updated';
export const CASTING_SUBMISSIONS_KEY = 'pt_casting_submissions';

export const CASTING_FLYER_SRC = '/assets/aistudio/casting_flyer_top.jpg';
export const CASTING_VIDEO_SRC = '/assets/aistudio/Casting_Planet_2c988d68.mp4';
export const CASTING_VIDEO_POSTER_SRC = '/assets/aistudio/casting_video_poster.jpg';

// Assets y canal exclusivos para la ruta /bailarines (LDC · Planet Records · Estudio 50)
export const DANCERS_CASTING_FLYER_SRC = '/assets/aistudio/casting_flyer_bailarines.jpg';
export const DANCERS_CASTING_VIDEO_SRC = '/assets/aistudio/VID-20261124-WA0012_76550c87.mp4';
export const DANCERS_CASTING_VIDEO_POSTER_SRC = '/assets/aistudio/casting_video_poster_bailarines.jpg';
export const DANCERS_WHATSAPP_CHANNEL_URL =
  'https://whatsapp.com/channel/0029VbEZLKFG3R3mTJxZnu22';

// Canal Oficial de WhatsApp: CASTING PLANET INFORMACIÓN
export const CASTING_WHATSAPP_CHANNEL_URL =
  'https://whatsapp.com/channel/0029Vb9Arh8AInPdaFhOXE1W';

export const CASTING_VENUE = 'Estudio 50';
export const CASTING_ADDRESS =
  'Calle Lugareño esquina Almendares, Vedado, Plaza de la Revolución, La Habana, Cuba';
export const CASTING_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${CASTING_VENUE}, 4JHC+W9V, ${CASTING_ADDRESS}`
)}`;

// Cierre oficial de inscripciones en línea:
// - Por defecto: Jueves 26 de nov. 2026 (23:59 hora de Cuba, UTC-5)
// - Extensión opcional desde /admin: Viernes 27 de nov. 2026 hasta 12:00 PM (cierra 12:01 PM)
export const CASTING_DEADLINE_THU_26_ISO = '2026-11-26T23:59:59-05:00';
export const CASTING_DEADLINE_FRI_27_NOON_ISO = '2026-11-27T12:01:00-05:00';

export const DEFAULT_CASTING_CONFIG: CastingConfig = {
  enabled: true,
  deadlineIso: CASTING_DEADLINE_THU_26_ISO,
};

function upgradeLegacyDeadline(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return DEFAULT_CASTING_CONFIG.deadlineIso;
  if (iso.startsWith('2026-11-25')) return DEFAULT_CASTING_CONFIG.deadlineIso;
  return iso;
}

export function getCastingConfig(): CastingConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_CASTING_CONFIG };
  }
  try {
    const raw = window.localStorage.getItem(CASTING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CASTING_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      enabled:
        typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_CASTING_CONFIG.enabled,
      deadlineIso: upgradeLegacyDeadline(parsed.deadlineIso),
    };
  } catch {
    return { ...DEFAULT_CASTING_CONFIG };
  }
}

function persistLocalCastingConfig(updated: CastingConfig): CastingConfig {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CASTING_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(CASTING_EVENT_UPDATED, { detail: updated }));
    } catch {
      // ignore storage errors
    }
  }
  return updated;
}

export function setCastingEnabled(enabled: boolean): CastingConfig {
  const current = getCastingConfig();
  return persistLocalCastingConfig({
    ...current,
    enabled,
  });
}

/**
 * Sincroniza el estado Activo/Pausado desde Supabase (tabla casting_settings).
 * Si la tabla aún no existe o no hay conexión, mantiene la configuración local.
 */
export async function fetchRemoteCastingConfig(): Promise<CastingConfig> {
  const local = getCastingConfig();
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('casting_settings')
      .select('enabled, deadline_iso')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return local;

    const synced: CastingConfig = {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : local.enabled,
      deadlineIso: upgradeLegacyDeadline(data.deadline_iso),
    };
    return persistLocalCastingConfig(synced);
  } catch {
    return local;
  }
}

/**
 * Guarda el interruptor Activo/Pausado en Supabase (solo administrador autenticado via RLS)
 * y actualiza inmediatamente el estado local.
 */
export async function saveRemoteCastingEnabled(
  enabled: boolean
): Promise<{ ok: boolean; error?: string; config: CastingConfig }> {
  const current = getCastingConfig();
  const updated = persistLocalCastingConfig({
    ...current,
    enabled,
  });

  try {
    const { supabase } = await import('./supabase');
    const { error } = await supabase
      .from('casting_settings')
      .upsert(
        {
          id: 1,
          enabled,
          deadline_iso: current.deadlineIso || DEFAULT_CASTING_CONFIG.deadlineIso,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      return { ok: false, error: error.message, config: updated };
    }
    return { ok: true, config: updated };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error de conexión', config: updated };
  }
}

export async function saveRemoteCastingDeadline(
  deadlineIso: string
): Promise<{ ok: boolean; error?: string; config: CastingConfig }> {
  const current = getCastingConfig();
  const updated = persistLocalCastingConfig({
    ...current,
    deadlineIso,
  });

  try {
    const { supabase } = await import('./supabase');
    const { error } = await supabase
      .from('casting_settings')
      .upsert(
        {
          id: 1,
          enabled: current.enabled,
          deadline_iso: deadlineIso,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      return { ok: false, error: error.message, config: updated };
    }
    return { ok: true, config: updated };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error de conexión', config: updated };
  }
}

export function isFridayNoonExtension(deadlineIso?: string | null): boolean {
  if (!deadlineIso) return false;
  const ms = Date.parse(deadlineIso);
  const friStart = Date.parse('2026-11-27T05:05:00Z'); // > 00:05 Cuba time on Nov 27
  return !Number.isNaN(ms) && ms >= friStart;
}

const COUPON_TAG_REGEX = /\[CUP[ÓO]N(?::\s*([^\]]+))?\]/i;

export function hasCastingCoupon(notas?: string | null): boolean {
  if (!notas) return false;
  return COUPON_TAG_REGEX.test(notas);
}

export function getCastingCouponNote(notas?: string | null): string {
  if (!notas) return '';
  const m = COUPON_TAG_REGEX.exec(notas);
  return m?.[1]?.trim() || '';
}

export function stripCastingCouponTag(notas?: string | null): string {
  if (!notas) return '';
  return notas
    .replace(/\s*\[CUP[ÓO]N(?::\s*[^\]]+)?\]\s*/gi, ' ')
    .replace(/\s*·\s*$/, '')
    .replace(/^\s*·\s*/, '')
    .trim();
}

export function buildNotesWithCastingCoupon(
  currentNotas: string | null | undefined,
  enabled: boolean,
  couponNote?: string
): string | null {
  const cleanRest = stripCastingCouponTag(currentNotas);
  if (!enabled) {
    return cleanRest || null;
  }
  const cleanLabel = (couponNote || '').replace(/[\[\]]/g, '').trim();
  const tag = cleanLabel ? `[CUPÓN: ${cleanLabel}]` : '[CUPÓN]';
  return cleanRest ? `${tag} · ${cleanRest}` : tag;
}

export function isCastingWithinDeadline(now: Date = new Date(), deadlineIso?: string): boolean {
  const iso = deadlineIso || getCastingConfig().deadlineIso;
  const deadline = new Date(iso);
  if (Number.isNaN(deadline.getTime())) return true;
  return now.getTime() <= deadline.getTime();
}

export function isCastingActive(now: Date = new Date()): boolean {
  const config = getCastingConfig();
  return config.enabled && isCastingWithinDeadline(now, config.deadlineIso);
}

export function getCastingStatusInfo(now: Date = new Date()) {
  const config = getCastingConfig();
  const withinDeadline = isCastingWithinDeadline(now, config.deadlineIso);
  const expired = !withinDeadline;
  const active = config.enabled && withinDeadline;
  return {
    active,
    enabled: config.enabled,
    expired,
    deadlineIso: config.deadlineIso,
  };
}

// Límite anti-spam por dispositivo (máximo 2 envíos en 24 horas)
const DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEVICE_MAX_SUBMISSIONS = 2;

export function getRecentDeviceSubmissions(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CASTING_SUBMISSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((ts) => typeof ts === 'number' && now - ts < DEVICE_WINDOW_MS);
  } catch {
    return [];
  }
}

export function canDeviceSubmitCasting(): { allowed: boolean; remaining: number } {
  const recent = getRecentDeviceSubmissions();
  const remaining = Math.max(0, DEVICE_MAX_SUBMISSIONS - recent.length);
  return {
    allowed: recent.length < DEVICE_MAX_SUBMISSIONS,
    remaining,
  };
}

export function recordCastingDeviceSubmission(): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentDeviceSubmissions();
    recent.push(Date.now());
    window.localStorage.setItem(CASTING_SUBMISSIONS_KEY, JSON.stringify(recent));
  } catch {
    // ignore storage errors
  }
}
