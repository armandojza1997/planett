import { CastingApplication } from '../types';

export interface NormalizedCastingInsert {
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  edad: number;
  ciudad: string;
  whatsapp: string;
  correo: string;
  instagram: string;
  estatura: number | null;
  busto: number | null;
  cintura: number | null;
  caderas: number | null;
  talla_superior: string | null;
  talla_inferior: string | null;
  calzado: string | null;
  color_cabello: string | null;
  largo_cabello: string | null;
  color_ojos: string | null;
  tono_piel: string | null;
  tiene_piercings: boolean;
  tiene_tatuajes: boolean;
  detalle_piercings_tatuajes: string | null;
  foto_cara: null;
  foto_cuerpo: null;
  origen: 'google_form';
  talento: 'modelo' | 'bailarin' | 'ambos';
  genero: string | null;
  formacion_artistica: string | null;
  nivel_ensenanza: string | null;
  nombre_artistico: string | null;
  estado_cabello: string | null;
  tiktok: string | null;
  notas_importacion: string | null;
  datos_incompletos: boolean;
  campos_faltantes: string[];
  estado: 'pendiente';
  created_at: string;
}

export interface DiscardedCsvRecord {
  filaOriginal: string;
  marcaTemporal: string;
  talento: string;
  nombreCompleto: string;
  fechaNacimientoRaw: string;
  edadRaw: string;
  whatsappRaw: string;
  correoRaw: string;
  instagramRaw: string;
  estaturaRaw: string;
  motivo: string;
}

export interface NormalizationSummary {
  totalRows: number;
  excludedDancers: number;
  includedModels: number;
  includedDancers: number;
  emptyOrJunkRows: number;
  internalDuplicatesMerged: number;
  discardedUnder17OrConflict: number;
  readyToImport: number;
  withExtraMissingFields: number;
  repairedBirthYears: number;
}

export interface NormalizationResult {
  validRecords: NormalizedCastingInsert[];
  discardedRecords: DiscardedCsvRecord[];
  summary: NormalizationSummary;
}

const COMPOUND_FIRST_NAMES = new Set([
  'ana',
  'maria',
  'maría',
  'jose',
  'josé',
  'laura',
  'carla',
  'karla',
  'paula',
  'daniela',
  'rosa',
  'claudia',
  'elena',
  'clara',
  'sofia',
  'sofía',
  'lucia',
  'lucía',
  'isabel',
  'carmen',
  'luisa',
  'victoria',
  'karen',
  'liz',
  'liset',
  'andrea',
]);

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa']);

export function parseCsvMatrix(rawText: string): string[][] {
  const clean = rawText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

export function toTitleCaseSpanish(input: string): string {
  return (input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && NAME_PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function isValidPersonNameInput(raw: string): boolean {
  const s = (raw || '').trim().replace(/\s+/g, ' ');
  if (s.length < 2) return false;
  if (/\d/.test(s)) return false;
  if (/^(no|na|n\/a|ningun[oa]?|no tengo|test|prueba|sin nombre|por completar)$/i.test(s)) return false;
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’.\-\s]+$/.test(s);
}

function splitFullName(rawName: string): { nombre: string; apellidos: string; missingApellidos: boolean } {
  const cleaned = toTitleCaseSpanish(rawName);
  if (!cleaned) {
    return { nombre: 'Sin nombre', apellidos: 'Por completar', missingApellidos: true };
  }
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length === 1) {
    return { nombre: tokens[0], apellidos: 'Por completar', missingApellidos: true };
  }
  if (tokens.length === 2) {
    return { nombre: tokens[0], apellidos: tokens[1], missingApellidos: false };
  }
  if (tokens.length === 3) {
    const t0 = tokens[0].toLowerCase();
    const t1 = tokens[1].toLowerCase();
    if (NAME_PARTICLES.has(t1)) {
      return { nombre: tokens[0], apellidos: `${tokens[1]} ${tokens[2]}`, missingApellidos: false };
    }
    if (COMPOUND_FIRST_NAMES.has(t0) && !NAME_PARTICLES.has(tokens[2].toLowerCase())) {
      // Check if second token looks like an obvious compound middle name (e.g. Ana Paula, María José, Laura Sofía)
      if (COMPOUND_FIRST_NAMES.has(t1)) {
        return { nombre: `${tokens[0]} ${tokens[1]}`, apellidos: tokens[2], missingApellidos: false };
      }
    }
    return { nombre: tokens[0], apellidos: `${tokens[1]} ${tokens[2]}`, missingApellidos: false };
  }
  // 4+ tokens: if particle near end (e.g. "María de los Ángeles Pérez") keep apellidos at the end
  return {
    nombre: tokens.slice(0, tokens.length - 2).join(' '),
    apellidos: tokens.slice(tokens.length - 2).join(' '),
    missingApellidos: false,
  };
}

function parseGoogleFormTimestamp(rawTs: string): Date {
  const normalized = (rawTs || '')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return new Date();

  // ISO timestamp (e.g. 2026-11-24T12:34:56.000Z)
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    const parsedIso = new Date(normalized);
    if (!Number.isNaN(parsedIso.getTime())) return parsedIso;
  }

  // Format 1: YYYY/MM/DD HH:mm:ss [a. m.|p. m.]
  const ymdMatch = normalized.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    let hour = Number(ymdMatch[4]);
    const minute = Number(ymdMatch[5]);
    const second = Number(ymdMatch[6] || '0');
    const ampm = (ymdMatch[7] || '').toLowerCase();
    if (ampm.startsWith('p') && hour < 12) hour += 12;
    if (ampm.startsWith('a') && hour === 12) hour = 0;
    const utcMs = Date.UTC(year, month, day, hour - 1, minute, second);
    return new Date(utcMs);
  }

  // Format 2: DD/MM/YYYY HH:mm:ss or MM/DD/YYYY HH:mm:ss (Google Sheets display values)
  const dmyMatch = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (dmyMatch) {
    const first = Number(dmyMatch[1]);
    const second = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    let day = first;
    let month = second - 1;
    // If second part > 12, it was MM/DD/YYYY
    if (second > 12 && first <= 12) {
      month = first - 1;
      day = second;
    }
    let hour = Number(dmyMatch[4]);
    const minute = Number(dmyMatch[5]);
    const secondSec = Number(dmyMatch[6] || '0');
    const ampm = (dmyMatch[7] || '').toLowerCase();
    if (ampm.startsWith('p') && hour < 12) hour += 12;
    if (ampm.startsWith('a') && hour === 12) hour = 0;
    const utcMs = Date.UTC(year, month, day, hour, minute, secondSec);
    return new Date(utcMs);
  }

  const fallback = new Date(normalized);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function computeAgeAtReference(year: number, month: number, day: number, refDate: Date): number {
  let age = refDate.getUTCFullYear() - year;
  const mDiff = refDate.getUTCMonth() + 1 - month;
  if (mDiff < 0 || (mDiff === 0 && refDate.getUTCDate() < day)) {
    age--;
  }
  return age;
}

function parseDobComponents(trimmedDob: string): { year: number; month: number; day: number } | null {
  const ymd = trimmedDob.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    return {
      year: parseInt(ymd[1], 10),
      month: parseInt(ymd[2], 10),
      day: parseInt(ymd[3], 10),
    };
  }
  const dmy = trimmedDob.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const first = parseInt(dmy[1], 10);
    const second = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    if (second > 12 && first <= 12) {
      return { year, month: first, day: second };
    }
    return { year, month: second, day: first };
  }
  return null;
}

function parseAndRepairDob(
  rawDob: string,
  rawEdad: string,
  submissionDate: Date,
  castingRefDate: Date
): {
  fechaNacimiento: string | null;
  edad: number | null;
  repaired: boolean;
  conflictReason: string | null;
  repairNote: string | null;
} {
  const edadMatch = (rawEdad || '').match(/\d+/);
  const declaredAge = edadMatch ? parseInt(edadMatch[0], 10) : null;
  const validDeclaredAge =
    declaredAge !== null && declaredAge >= 3 && declaredAge <= 80 ? declaredAge : null;

  const trimmedDob = (rawDob || '').trim();
  const parsedDob = parseDobComponents(trimmedDob);

  if (!parsedDob) {
    return {
      fechaNacimiento: null,
      edad: validDeclaredAge,
      repaired: false,
      conflictReason: null,
      repairNote: null,
    };
  }

  let { year } = parsedDob;
  const { month, day } = parsedDob;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return {
      fechaNacimiento: null,
      edad: validDeclaredAge,
      repaired: false,
      conflictReason: null,
      repairNote: `Fecha original inválida (${trimmedDob})`,
    };
  }

  let repaired = false;
  let repairNote: string | null = null;

  // 1) Typo "0004" -> "2004", "0005" -> "2005"
  if (year >= 1 && year <= 99) {
    const fixedYear = year <= 25 ? 2000 + year : 1900 + year;
    repairNote = `Año de nacimiento reparado (${String(year).padStart(4, '0')} -> ${fixedYear})`;
    year = fixedYear;
    repaired = true;
  } else if (year >= 2020 && validDeclaredAge !== null && validDeclaredAge >= 12 && validDeclaredAge <= 65) {
    // 2) User typed current year (2026 / 2027) instead of birth year
    const refYear = submissionDate.getUTCFullYear();
    const refMonth = submissionDate.getUTCMonth() + 1;
    const refDay = submissionDate.getUTCDate();
    const birthdayAlreadyPassed = month < refMonth || (month === refMonth && day <= refDay);
    const fixedYear = refYear - validDeclaredAge - (birthdayAlreadyPassed ? 0 : 1);
    repairNote = `Año calculado por edad (${trimmedDob} + ${validDeclaredAge}a -> ${fixedYear})`;
    year = fixedYear;
    repaired = true;
  }

  if (year < 1940 || year > 2026) {
    return {
      fechaNacimiento: null,
      edad: validDeclaredAge,
      repaired: false,
      conflictReason: null,
      repairNote: `Año fuera de rango (${trimmedDob})`,
    };
  }

  const fixedIso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const ageFromDob = computeAgeAtReference(year, month, day, castingRefDate);

  // Detect severe conflict (e.g. DOB says 15 years old but declared age says 17)
  if (
    !repaired &&
    ageFromDob < 17 &&
    validDeclaredAge !== null &&
    validDeclaredAge >= 17 &&
    Math.abs(validDeclaredAge - ageFromDob) >= 2
  ) {
    return {
      fechaNacimiento: fixedIso,
      edad: ageFromDob,
      repaired: false,
      conflictReason: `Conflicto fecha/edad (fecha ${fixedIso} = ${ageFromDob} años vs edad declarada ${validDeclaredAge})`,
      repairNote: null,
    };
  }

  if (ageFromDob < 17) {
    const turns17Soon = ageFromDob === 16 && year === 2009 && month === 12;
    return {
      fechaNacimiento: fixedIso,
      edad: ageFromDob,
      repaired,
      conflictReason: turns17Soon
        ? `Menor durante el casting: cumple 17 el ${fixedIso}`
        : `Menor de 17 años (${ageFromDob} años, nac. ${fixedIso})`,
      repairNote,
    };
  }

  return {
    fechaNacimiento: fixedIso,
    edad: ageFromDob,
    repaired,
    conflictReason: null,
    repairNote,
  };
}

export function normalizePhoneNumber(raw: string): {
  primary: string;
  phoneKey: string;
  extraNotes: string | null;
  missing: boolean;
} {
  const cleanedRaw = (raw || '').trim();
  if (!cleanedRaw || /^(no tengo|ninguno|-|\.)+$/i.test(cleanedRaw)) {
    return { primary: 'No especificado', phoneKey: '', extraNotes: null, missing: true };
  }

  // Extract segments separated by / or multiple numbers
  const candidates = cleanedRaw
    .split(/[/,\n]|(?:\s{2,})|(?:\s+o\s+)/i)
    .map((part) => part.replace(/[^\d+]/g, ''))
    .filter((digits) => digits.replace(/\D/g, '').length >= 7);

  if (candidates.length === 0) {
    const allDigits = cleanedRaw.replace(/\D/g, '');
    if (allDigits.length >= 8) {
      const first8 = allDigits.slice(0, 8);
      const rest = allDigits.length >= 16 ? allDigits.slice(8) : '';
      const formatted = /^[56]\d{7}$/.test(first8) ? `+53 ${first8}` : first8;
      return {
        primary: formatted,
        phoneKey: first8,
        extraNotes: rest ? `Tel. secundario: ${rest}` : null,
        missing: false,
      };
    }
    return { primary: 'No especificado', phoneKey: '', extraNotes: null, missing: true };
  }

  const formatSingle = (num: string): { formatted: string; key: string } => {
    const trimmedNum = num.trim();
    const digitsOnly = trimmedNum.replace(/\D/g, '');
    if (digitsOnly.length === 8 && /^[56]\d{7}$/.test(digitsOnly)) {
      return { formatted: `+53 ${digitsOnly}`, key: digitsOnly };
    }
    if (digitsOnly.length === 10 && digitsOnly.startsWith('53') && /^[56]\d{7}$/.test(digitsOnly.slice(2))) {
      return { formatted: `+53 ${digitsOnly.slice(2)}`, key: digitsOnly.slice(-8) };
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('053') && /^[56]\d{7}$/.test(digitsOnly.slice(3))) {
      return { formatted: `+53 ${digitsOnly.slice(3)}`, key: digitsOnly.slice(-8) };
    }
    // Foreign / international phone numbers (8 to 15 digits with country code, or explicit +country)
    if (trimmedNum.startsWith('+') && digitsOnly.length >= 8 && digitsOnly.length <= 15) {
      if (digitsOnly.startsWith('53') && digitsOnly.length === 10) {
        return { formatted: `+53 ${digitsOnly.slice(2)}`, key: digitsOnly.slice(-8) };
      }
      return { formatted: `+${digitsOnly}`, key: `intl:${digitsOnly}` };
    }
    if (digitsOnly.length >= 9 && digitsOnly.length <= 15 && !digitsOnly.startsWith('53')) {
      return { formatted: `+${digitsOnly}`, key: `intl:${digitsOnly}` };
    }
    return {
      formatted: trimmedNum.startsWith('+') ? `+${digitsOnly}` : digitsOnly.length === 8 ? digitsOnly : `+${digitsOnly}`,
      key: digitsOnly.length >= 8 ? digitsOnly.slice(-8) : digitsOnly,
    };
  };

  const first = formatSingle(candidates[0]);
  const extras = candidates
    .slice(1)
    .map((c) => formatSingle(c).formatted)
    .filter((v) => v && v !== first.formatted);

  return {
    primary: first.formatted,
    phoneKey: first.key,
    extraNotes: extras.length > 0 ? `Tel. alternativo: ${extras.join(', ')}` : null,
    missing: false,
  };
}

export function validateAndFormatWebPhone(raw: string): {
  valid: boolean;
  formatted: string;
  isInternational: boolean;
  error?: string;
} {
  const trimmed = (raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits || digits.length < 8) {
    return {
      valid: false,
      formatted: trimmed,
      isInternational: false,
      error: 'Ingresa un número de WhatsApp válido (8 dígitos para Cuba o +código de país si es extranjero).',
    };
  }
  if (/^(\d)\1+$/.test(digits) || digits === '12345678' || digits === '87654321') {
    return {
      valid: false,
      formatted: trimmed,
      isInternational: false,
      error: 'Ese número de WhatsApp no parece válido. Verifica los dígitos.',
    };
  }
  if (digits.length > 15) {
    return {
      valid: false,
      formatted: trimmed,
      isInternational: false,
      error: 'Ingresa un solo número de WhatsApp válido (máximo 15 dígitos).',
    };
  }
  if (digits.length === 8) {
    if (!/^[56]\d{7}$/.test(digits)) {
      return {
        valid: false,
        formatted: trimmed,
        isInternational: false,
        error: 'Si es un número extranjero de 8 dígitos, incluye el código de país (ej. +1..., +34..., +52...). Si es Cuba, empieza por 5 o 6.',
      };
    }
    return { valid: true, formatted: `+53 ${digits}`, isInternational: false };
  }
  if (
    (digits.length === 10 && digits.startsWith('53') && /^[56]\d{7}$/.test(digits.slice(2))) ||
    (digits.length === 11 && digits.startsWith('053') && /^[56]\d{7}$/.test(digits.slice(3)))
  ) {
    const local8 = digits.slice(-8);
    return { valid: true, formatted: `+53 ${local8}`, isInternational: false };
  }
  if (digits.startsWith('53') && digits.length !== 10) {
    return {
      valid: false,
      formatted: trimmed,
      isInternational: false,
      error: 'Los números de Cuba (+53) deben tener exactamente 8 dígitos después del +53.',
    };
  }
  // Valid international number (9-15 digits with country code, or 8+ with explicit +country)
  return { valid: true, formatted: `+${digits}`, isInternational: true };
}

const BANNED_SOCIAL_WORDS = new Set([
  'no',
  'na',
  'noespecificado',
  'noespecificada',
  'notengo',
  'ninguno',
  'ninguna',
  'instagram',
  'ig',
  'tiktok',
  'tk',
  'facebook',
  'fb',
  'whatsapp',
  'usuario',
  'user',
  'test',
  'prueba',
  'admin',
  'reel',
  'stories',
  'explore',
  'invites',
  'contact',
  'porcompletar',
  'sinnombre',
]);

export function validateAndFormatSocialHandle(
  raw: string,
  platform: 'instagram' | 'tiktok'
): {
  valid: boolean;
  formatted: string;
  handleKey: string;
  error?: string;
} {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      formatted: '',
      handleKey: '',
      error: platform === 'instagram' ? 'Indica tu usuario de Instagram.' : 'Indica tu usuario de TikTok.',
    };
  }

  let extracted = trimmed
    .replace(/^(?:ig|instagram|tk|tiktok)\s*:\s*/i, '')
    .trim();

  if (platform === 'instagram') {
    const m = extracted.match(/instagram\.com\/([^/?#\s]+)/i);
    if (m && m[1]) extracted = m[1];
  } else {
    const m = extracted.match(/tiktok\.com\/@?([^/?#\s]+)/i);
    if (m && m[1]) extracted = m[1];
  }

  const clean = extracted.replace(/^@+/, '').split(/[/?#\s]/)[0].trim();
  const lower = clean.toLowerCase();

  if (!clean || clean.length < 3 || BANNED_SOCIAL_WORDS.has(lower)) {
    return {
      valid: false,
      formatted: trimmed,
      handleKey: '',
      error:
        platform === 'instagram'
          ? 'Ingresa un usuario real de Instagram (ej. @tu_usuario, mínimo 3 caracteres; no escribas "no tengo" ni "instagram").'
          : 'Ingresa un usuario válido de TikTok (ej. @tu_usuario, mínimo 3 caracteres).',
    };
  }

  if (/\s/.test(extracted) || !/^[A-Za-z0-9._]{3,30}$/.test(clean) || /^\.|\.\.|\.$/.test(clean)) {
    return {
      valid: false,
      formatted: trimmed,
      handleKey: '',
      error:
        platform === 'instagram'
          ? 'Usuario de Instagram inválido: solo se permiten letras, números, puntos y guiones bajos (sin espacios ni URLs inválidas).'
          : 'Usuario de TikTok inválido: solo se permiten letras, números, puntos y guiones bajos.',
    };
  }

  return {
    valid: true,
    formatted: `@${clean}`,
    handleKey: lower,
  };
}

export function normalizeEmailAddress(raw: string): {
  email: string;
  emailKey: string;
  missing: boolean;
} {
  let s = (raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s || /^(no tengo|ninguno|no|-|\.)+$/i.test(s)) {
    return { email: 'No especificado', emailKey: '', missing: true };
  }
  // Remove leading accidental @ like @usuario@gmail.com
  s = s.replace(/^@+/, '');
  // Common domain typos
  s = s
    .replace(/@gamil\.com$/i, '@gmail.com')
    .replace(/@gamail\.com$/i, '@gmail.com')
    .replace(/@gmai\.com$/i, '@gmail.com')
    .replace(/@gmail\.con$/i, '@gmail.com')
    .replace(/@gmail\.como$/i, '@gmail.com')
    .replace(/@gmail\.vom$/i, '@gmail.com')
    .replace(/@hotmai\.com$/i, '@hotmail.com')
    .replace(/@outlok\.com$/i, '@outlook.com');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { email: 'No especificado', emailKey: '', missing: true };
  }
  return { email: s, emailKey: s, missing: false };
}

export function normalizeSocialHandles(raw: string): {
  instagram: string;
  tiktok: string | null;
  missingIg: boolean;
} {
  const s = (raw || '').trim();
  if (!s || /^(instagram|tik\s*tok|no tengo|ninguno|no|-|\.)+$/i.test(s)) {
    return { instagram: 'No especificado', tiktok: null, missingIg: true };
  }

  let igHandle = '';
  let tkHandle: string | null = null;

  // Split multi-part entries
  const parts = s.split(/[\s,;|\n]+/).filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/tiktok\.com/i.test(part)) {
      const m = part.match(/tiktok\.com\/@?([^/?#\s]+)/i);
      if (m && m[1] && !/^(t|r|video)$/i.test(m[1])) {
        tkHandle = `@${m[1].replace(/^@+/, '')}`;
      } else {
        tkHandle = part.split('?')[0];
      }
      continue;
    }
    if (/instagram\.com/i.test(part)) {
      const m = part.match(/instagram\.com\/([^/?#\s]+)/i);
      if (m && m[1] && !/^(p|reel|stories|explore)$/i.test(m[1])) {
        igHandle = `@${m[1].replace(/^@+/, '')}`;
      }
      continue;
    }
    if (/^(tiktok|tk):?$/i.test(part) && parts[i + 1]) {
      const next = parts[i + 1].replace(/^@+/, '').split(/[/?#]/)[0];
      if (next && !/^(no|tengo)$/i.test(next)) tkHandle = `@${next}`;
      i++;
      continue;
    }
    if (/^(ig|instagram):?$/i.test(part)) continue;
  }

  // Fallback if no URL was matched but user wrote plain @handle or username
  if (!igHandle) {
    const firstValidToken = parts.find((p) => {
      const cleaned = p.replace(/^@+/, '').toLowerCase();
      return (
        cleaned.length >= 2 &&
        !/^https?:\/\//i.test(p) &&
        !/^(instagram|ig|tiktok|tk|y|o|no|tengo|en|como|soy|-)$/i.test(cleaned)
      );
    });
    if (firstValidToken && (!tkHandle || `@${firstValidToken.replace(/^@+/, '')}` !== tkHandle)) {
      igHandle = `@${firstValidToken.replace(/^@+/, '').replace(/[,;]+$/, '')}`;
    }
  }

  if (!igHandle || igHandle === '@') {
    return { instagram: 'No especificado', tiktok: tkHandle, missingIg: true };
  }

  return { instagram: igHandle, tiktok: tkHandle, missingIg: false };
}

function parseHeightCm(raw: string): { cm: number | null; note: string | null } {
  const s = (raw || '').trim();
  if (!s || /^(no s[eé]|alta|baja|ni idea|ni c|-|\.)/i.test(s) && !/\d{2}/.test(s)) {
    return { cm: null, note: s && !/^(-|\.)$/i.test(s) ? `Estatura texto: "${s}"` : null };
  }
  if (/https?:\/\//i.test(s)) {
    return { cm: null, note: null };
  }

  const normalized = s
    .replace(/[\u2018\u2019'`´]/g, '.')
    .replace(/[,:;/\-]/g, '.')
    .replace(/\s*\.\s*/g, '.')
    .replace(/(\d)[oO]/g, '$10');

  const m = normalized.match(/\b([12]\.\d{1,2}|\d{3})\b/);
  if (!m) {
    return { cm: null, note: `Estatura texto: "${s}"` };
  }

  const num = parseFloat(m[1]);
  if (num >= 1.2 && num <= 2.3) {
    return { cm: Math.round(num * 100), note: null };
  }
  if (num >= 120 && num <= 230) {
    return { cm: Math.round(num), note: null };
  }
  return { cm: null, note: `Estatura fuera de rango: "${s}"` };
}

function parseMeasurementCm(raw: string, label: string): { value: number | null; note: string | null } {
  const s = (raw || '').trim();
  if (!s || /^(no s[eé]|ni idea|-|\.|x)$/i.test(s)) {
    return { value: null, note: null };
  }
  // Pure cm like "86", "86cm", "90 cm"
  const m = s.match(/^(\d{2,3})(?:\.\d+)?\s*(?:cm)?$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 45 && n <= 165) {
      return { value: n, note: null };
    }
  }
  // E.g. "0.80cm" -> 80 cm
  const mDec = s.match(/^0\.(\d{2})\s*(?:cm|m)?$/i);
  if (mDec) {
    return { value: parseInt(mDec[1], 10), note: null };
  }
  // Keep original value like "34B", "XS", "32 pulgadas" in notes without guessing wrong cm
  return { value: null, note: `${label} orig.: ${s}` };
}

function cleanHairCondition(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  return s
    .replace(/\s*\(Marque solo si está de acuerdo\)/gi, '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' · ');
}

function normalizeTextChoice(raw: string): string | null {
  const s = (raw || '').trim().replace(/\s+/g, ' ');
  if (!s || /^(no tengo|-|\.)$/i.test(s)) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanShoeSize(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s || /^(-|\.)$/i.test(s)) return null;
  const numMatch = s.match(/\b(3[4-9]|4[0-6](?:\.5)?(?:\s*[-/]\s*(?:3[4-9]|4[0-6]))?)\b/);
  if (numMatch) return numMatch[1].replace(/\s+/g, '');
  return s;
}

function parseBoolYesNo(raw: string, detailText: string, keywordRegex: RegExp): boolean {
  const s = (raw || '').toLowerCase();
  if (s.includes('sí') || s.includes('si')) return true;
  if (!s && detailText && keywordRegex.test(detailText)) return true;
  return false;
}

export function normalizeGoogleFormsCastingCsv(
  rawCsv: string,
  castingRefDate: Date = new Date('2026-11-28T12:00:00-05:00')
): NormalizationResult {
  const matrix = parseCsvMatrix(rawCsv);
  if (matrix.length <= 1) {
    return {
      validRecords: [],
      discardedRecords: [],
      summary: {
        totalRows: 0,
        excludedDancers: 0,
        includedModels: 0,
        includedDancers: 0,
        emptyOrJunkRows: 0,
        internalDuplicatesMerged: 0,
        discardedUnder17OrConflict: 0,
        readyToImport: 0,
        withExtraMissingFields: 0,
        repairedBirthYears: 0,
      },
    };
  }
  return normalizeGoogleFormsRows(matrix.slice(1), castingRefDate);
}

export function normalizeGoogleFormsRows(
  dataRows: string[][],
  castingRefDate: Date = new Date('2026-11-28T12:00:00-05:00')
): NormalizationResult {
  if (!Array.isArray(dataRows) || dataRows.length === 0) {
    return {
      validRecords: [],
      discardedRecords: [],
      summary: {
        totalRows: 0,
        excludedDancers: 0,
        includedModels: 0,
        includedDancers: 0,
        emptyOrJunkRows: 0,
        internalDuplicatesMerged: 0,
        discardedUnder17OrConflict: 0,
        readyToImport: 0,
        withExtraMissingFields: 0,
        repairedBirthYears: 0,
      },
    };
  }

  const excludedDancers = 0;
  let emptyOrJunkRows = 0;

  interface CandidateRow {
    rowNum: number;
    cols: string[];
    talentoType: 'modelo' | 'bailarin';
    tsDate: Date;
    phoneKey: string;
    emailKey: string;
    nameKey: string;
  }

  const preCandidates: CandidateRow[] = [];
  const discardedRecords: DiscardedCsvRecord[] = [];

  dataRows.forEach((rawCols, idx) => {
    const rowNum = idx + 2;
    const cols = Array.from({ length: 33 }, (_, i) => (rawCols[i] || '').trim());
    const talentoRaw = cols[1];
    const isDancer = /bailar/i.test(talentoRaw);
    const talentoType: 'modelo' | 'bailarin' = isDancer ? 'bailarin' : 'modelo';

    const restEmpty = cols.slice(2).every((c) => !c);
    if (restEmpty) {
      emptyOrJunkRows++;
      discardedRecords.push({
        filaOriginal: String(rowNum),
        marcaTemporal: cols[0],
        talento: talentoRaw,
        nombreCompleto: '',
        fechaNacimientoRaw: '',
        edadRaw: '',
        whatsappRaw: '',
        correoRaw: '',
        instagramRaw: '',
        estaturaRaw: '',
        motivo: 'Fila vacía',
      });
      return;
    }

    const nombreRaw = isDancer ? cols[2] || cols[10] : cols[10] || cols[2];
    if (/gennaro\s+esposito|test\s+prueba/i.test(nombreRaw)) {
      emptyOrJunkRows++;
      discardedRecords.push({
        filaOriginal: String(rowNum),
        marcaTemporal: cols[0],
        talento: talentoRaw,
        nombreCompleto: nombreRaw,
        fechaNacimientoRaw: cols[12],
        edadRaw: cols[13] || cols[3],
        whatsappRaw: cols[15] || cols[8],
        correoRaw: cols[16],
        instagramRaw: cols[17] || cols[9],
        estaturaRaw: cols[18] || cols[5],
        motivo: 'Registro de broma o prueba',
      });
      return;
    }

    const phoneParsed = normalizePhoneNumber(cols[15] || cols[8]);
    const emailParsed = normalizeEmailAddress(cols[16]);
    const nameKey = nombreRaw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!nameKey && phoneParsed.missing && emailParsed.missing) {
      emptyOrJunkRows++;
      discardedRecords.push({
        filaOriginal: String(rowNum),
        marcaTemporal: cols[0],
        talento: talentoRaw,
        nombreCompleto: nombreRaw,
        fechaNacimientoRaw: cols[12],
        edadRaw: cols[13] || cols[3],
        whatsappRaw: cols[15] || cols[8],
        correoRaw: cols[16],
        instagramRaw: cols[17] || cols[9],
        estaturaRaw: cols[18] || cols[5],
        motivo: 'Sin nombre ni medio de contacto',
      });
      return;
    }

    preCandidates.push({
      rowNum,
      cols,
      talentoType,
      tsDate: parseGoogleFormTimestamp(cols[0]),
      phoneKey: phoneParsed.phoneKey,
      emailKey: emailParsed.emailKey,
      nameKey,
    });
  });

  // Deduplicate internal submissions (merge oldest -> newest so latest wins while keeping prior valid fields)
  const groups: CandidateRow[][] = [];
  const keyToGroup = new Map<string, number>();

  for (const item of preCandidates) {
    let gIdx: number | undefined;
    if (item.phoneKey && keyToGroup.has(`P:${item.phoneKey}`)) {
      gIdx = keyToGroup.get(`P:${item.phoneKey}`);
    } else if (item.emailKey && keyToGroup.has(`E:${item.emailKey}`)) {
      gIdx = keyToGroup.get(`E:${item.emailKey}`);
    } else if (item.nameKey && keyToGroup.has(`N:${item.nameKey}`)) {
      // Only group by exact name if phones don't clash
      const candidateGroupIdx = keyToGroup.get(`N:${item.nameKey}`)!;
      const existingPhone = groups[candidateGroupIdx].find((g) => g.phoneKey)?.phoneKey;
      if (!existingPhone || !item.phoneKey || existingPhone === item.phoneKey) {
        gIdx = candidateGroupIdx;
      }
    }

    if (gIdx === undefined) {
      gIdx = groups.length;
      groups.push([]);
    }
    groups[gIdx].push(item);
    if (item.phoneKey) keyToGroup.set(`P:${item.phoneKey}`, gIdx);
    if (item.emailKey) keyToGroup.set(`E:${item.emailKey}`, gIdx);
    if (item.nameKey) keyToGroup.set(`N:${item.nameKey}`, gIdx);
  }

  const internalDuplicatesMerged = preCandidates.length - groups.length;

  const validRecords: NormalizedCastingInsert[] = [];
  let discardedUnder17OrConflict = 0;
  let repairedBirthYears = 0;
  let withExtraMissingFields = 0;
  let includedModels = 0;
  let includedDancers = 0;

  for (const group of groups) {
    const sorted = [...group].sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime());
    const newest = sorted[sorted.length - 1];
    const merged = [...newest.cols];

    for (let i = sorted.length - 2; i >= 0; i--) {
      for (let c = 0; c < 33; c++) {
        if (!merged[c] && sorted[i].cols[c]) {
          merged[c] = sorted[i].cols[c];
        }
      }
    }

    const hasDancerEntry = sorted.some((s) => s.talentoType === 'bailarin') || /bailar/i.test(merged[1]);
    const hasModelEntry = sorted.some((s) => s.talentoType === 'modelo');
    const talentoType: 'modelo' | 'bailarin' | 'ambos' =
      hasDancerEntry && hasModelEntry ? 'ambos' : hasDancerEntry ? 'bailarin' : 'modelo';
    const isDancer = talentoType === 'bailarin';
    const nombreRaw = isDancer ? merged[2] || merged[10] : merged[10] || merged[2];
    const dobResult = parseAndRepairDob(
      merged[12],
      merged[13] || merged[3],
      newest.tsDate,
      castingRefDate
    );

    if (dobResult.conflictReason || dobResult.edad === null || dobResult.edad < 17) {
      const reason =
        dobResult.conflictReason ||
        (dobResult.edad !== null && dobResult.edad < 17
          ? `Menor de 17 años (${dobResult.edad} años)`
          : 'Sin fecha de nacimiento ni edad válida');
      discardedUnder17OrConflict++;
      discardedRecords.push({
        filaOriginal: String(newest.rowNum),
        marcaTemporal: merged[0],
        talento: merged[1],
        nombreCompleto: nombreRaw,
        fechaNacimientoRaw: merged[12],
        edadRaw: merged[13] || merged[3],
        whatsappRaw: merged[15] || merged[8],
        correoRaw: merged[16],
        instagramRaw: merged[17] || merged[9],
        estaturaRaw: merged[18] || merged[5],
        motivo: reason,
      });
      continue;
    }

    if (dobResult.repaired) {
      repairedBirthYears++;
    }

    const { nombre, apellidos, missingApellidos } = splitFullName(nombreRaw);
    const phone = normalizePhoneNumber(merged[15] || merged[8]);
    const email = normalizeEmailAddress(merged[16]);
    const social = normalizeSocialHandles(merged[17] || merged[9]);
    const height = parseHeightCm(merged[18] || merged[5]);
    const busto = parseMeasurementCm(merged[19], 'Busto');
    const cintura = parseMeasurementCm(merged[20], 'Cintura');
    const caderas = parseMeasurementCm(merged[21], 'Cadera');
    const tallaSuperior = merged[22] ? merged[22].toUpperCase() : null;
    const tallaInferior = merged[23] ? merged[23].toUpperCase() : null;
    const calzado = cleanShoeSize(merged[24]);
    const colorCabello = normalizeTextChoice(merged[25]);
    const largoCabello = normalizeTextChoice(merged[26]);
    const estadoCabello = cleanHairCondition(merged[27]);
    const colorOjos = normalizeTextChoice(merged[28]);
    const tonoPiel = normalizeTextChoice(merged[29]);
    const detallePyT = merged[32] ? merged[32].trim() : null;
    const tienePiercings = parseBoolYesNo(merged[30], detallePyT || '', /piercing|arete|ombligo|lengua|ceja|nariz/i);
    const tieneTatuajes = parseBoolYesNo(merged[31], detallePyT || '', /tatuaje|tattoo|tatoo/i);
    const ciudad = merged[14] ? toTitleCaseSpanish(merged[14]) : 'No especificada';
    const nombreArtistico = merged[11] && !/^no$/i.test(merged[11].trim()) ? toTitleCaseSpanish(merged[11]) : null;
    const genero = normalizeTextChoice(merged[4]);
    const formacionArtistica = normalizeTextChoice(merged[6]);
    const nivelEnsenanza = normalizeTextChoice(merged[7]);

    const candidateRecord: NormalizedCastingInsert = {
      nombre,
      apellidos,
      fecha_nacimiento: dobResult.fechaNacimiento,
      edad: dobResult.edad,
      ciudad,
      whatsapp: phone.primary,
      correo: email.email,
      instagram: social.instagram,
      estatura: height.cm,
      busto: busto.value,
      cintura: cintura.value,
      caderas: caderas.value,
      talla_superior: tallaSuperior,
      talla_inferior: tallaInferior,
      calzado,
      color_cabello: colorCabello,
      largo_cabello: largoCabello,
      color_ojos: colorOjos,
      tono_piel: tonoPiel,
      tiene_piercings: tienePiercings,
      tiene_tatuajes: tieneTatuajes,
      detalle_piercings_tatuajes: detallePyT || null,
      foto_cara: null,
      foto_cuerpo: null,
      origen: 'google_form',
      talento: talentoType,
      genero,
      formacion_artistica: formacionArtistica,
      nivel_ensenanza: nivelEnsenanza,
      nombre_artistico: nombreArtistico,
      estado_cabello: estadoCabello,
      tiktok: social.tiktok,
      notas_importacion: null,
      datos_incompletos: true,
      campos_faltantes: ['fotos'],
      estado: 'pendiente',
      created_at: newest.tsDate.toISOString(),
    };

    const missingFields = computeMissingCastingFields(candidateRecord);
    if (missingApellidos && !missingFields.includes('nombre_completo')) {
      missingFields.push('nombre_completo');
    }
    candidateRecord.campos_faltantes = missingFields;
    candidateRecord.datos_incompletos = missingFields.length > 0;

    if (missingFields.length > 1) {
      withExtraMissingFields++;
    }

    const notes = [
      dobResult.repairNote,
      phone.extraNotes,
      height.note,
      busto.note,
      cintura.note,
      caderas.note,
      sorted.length > 1 ? `Fusionado de ${sorted.length} envíos repetidos` : null,
    ].filter(Boolean);
    candidateRecord.notas_importacion = notes.length > 0 ? notes.join(' | ') : null;

    if (talentoType === 'ambos') {
      includedModels++;
      includedDancers++;
    } else if (talentoType === 'bailarin') {
      includedDancers++;
    } else {
      includedModels++;
    }

    validRecords.push(candidateRecord);
  }

  return {
    validRecords,
    discardedRecords,
    summary: {
      totalRows: dataRows.length,
      excludedDancers,
      includedModels,
      includedDancers,
      emptyOrJunkRows,
      internalDuplicatesMerged,
      discardedUnder17OrConflict,
      readyToImport: validRecords.length,
      withExtraMissingFields,
      repairedBirthYears,
    },
  };
}

const INVALID_IG_KEYS = new Set([
  'no',
  'noespecificado',
  'noespecificada',
  'notengo',
  'ninguno',
  'ninguna',
  'instagram',
  'ig',
  'tiktok',
  'tk',
  'reel',
  'stories',
  'explore',
  'invites',
  'contact',
  'porcompletar',
  'sinnombre',
]);

export function normalizeNameKey(raw: string | null | undefined): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeInstagramKey(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (!s) return '';
  let handle = '';
  const urlMatch = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch && urlMatch[1] && !/^(p|reel|stories|explore|invites)$/i.test(urlMatch[1])) {
    handle = urlMatch[1];
  } else {
    const cleaned = s
      .replace(/^(?:ig|instagram)\s*:\s*/i, '')
      .split(/[\s,;|\n]+/)[0] || '';
    if (!/^https?:\/\//i.test(cleaned)) {
      handle = cleaned;
    }
  }
  const normalized = handle
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.+$/, '');
  if (!normalized || normalized.length < 3 || INVALID_IG_KEYS.has(normalized)) {
    return '';
  }
  return normalized;
}

export function extractAllPhoneKeys(
  whatsapp?: string | null,
  notas?: string | null
): string[] {
  const keys = new Set<string>();
  const addFromText = (text: string) => {
    const matches = text.match(/\+?\d[\d\s\-()]{6,17}\d/g) || [];
    for (const m of matches) {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 8) continue;
      if (digits.length === 8 && /^[56]\d{7}$/.test(digits)) {
        if (!/^(\d)\1{7}$/.test(digits)) keys.add(digits);
      } else if (digits.length === 10 && digits.startsWith('53') && /^[56]\d{7}$/.test(digits.slice(2))) {
        const last8 = digits.slice(-8);
        if (!/^(\d)\1{7}$/.test(last8)) keys.add(last8);
      } else if (digits.length === 11 && digits.startsWith('053') && /^[56]\d{7}$/.test(digits.slice(3))) {
        const last8 = digits.slice(-8);
        if (!/^(\d)\1{7}$/.test(last8)) keys.add(last8);
      } else if (digits.length >= 8 && digits.length <= 15) {
        if (!/^(\d)\1+$/.test(digits)) {
          keys.add(`intl:${digits}`);
        }
      } else if (digits.length >= 8) {
        const last8 = digits.slice(-8);
        if (!/^(\d)\1{7}$/.test(last8)) keys.add(last8);
      }
    }
  };
  if (whatsapp) addFromText(whatsapp);
  if (notas && /Tel\./i.test(notas)) addFromText(notas);
  return Array.from(keys);
}

export function normalizeEmailKey(raw: string | null | undefined): string {
  const parsed = normalizeEmailAddress(raw || '');
  return parsed.emailKey;
}

export function areNamesCompatibleForSameDob(nameKeyA: string, nameKeyB: string): boolean {
  if (!nameKeyA || !nameKeyB) return false;
  if (nameKeyA === nameKeyB) return true;
  const tokensA = nameKeyA.split(' ').filter((t) => t.length >= 2);
  const tokensB = nameKeyB.split(' ').filter((t) => t.length >= 2);
  if (tokensA.length < 2 || tokensB.length < 2) return false;
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);
  return shorter.every((tok) => longerSet.has(tok));
}

export type DuplicateMatchField = 'whatsapp' | 'correo' | 'instagram' | 'nombre_fecha';

export function findMatchingApplicationWithReason(
  candidate: Pick<
    NormalizedCastingInsert,
    'nombre' | 'apellidos' | 'fecha_nacimiento' | 'edad' | 'whatsapp' | 'correo' | 'instagram' | 'notas_importacion'
  >,
  existingApps: CastingApplication[]
): { match: CastingApplication; matchedBy: DuplicateMatchField } | null {
  const candPhoneKeys = extractAllPhoneKeys(candidate.whatsapp, candidate.notas_importacion);
  const candEmail = normalizeEmailKey(candidate.correo);
  const candIg = normalizeInstagramKey(candidate.instagram);
  const candName = normalizeNameKey(`${candidate.nombre} ${candidate.apellidos}`);

  for (const existing of existingApps) {
    const exPhoneKeys = extractAllPhoneKeys(existing.whatsapp, existing.notas_importacion);
    if (candPhoneKeys.some((pk) => exPhoneKeys.includes(pk))) {
      return { match: existing, matchedBy: 'whatsapp' };
    }

    const exEmail = normalizeEmailKey(existing.correo);
    if (candEmail && exEmail && candEmail === exEmail) {
      return { match: existing, matchedBy: 'correo' };
    }

    const exIg = normalizeInstagramKey(existing.instagram);
    if (candIg && exIg && candIg === exIg) {
      return { match: existing, matchedBy: 'instagram' };
    }

    const exName = normalizeNameKey(`${existing.nombre || ''} ${existing.apellidos || ''}`);
    if (
      candName &&
      exName &&
      candidate.fecha_nacimiento &&
      existing.fecha_nacimiento &&
      candidate.fecha_nacimiento === existing.fecha_nacimiento &&
      areNamesCompatibleForSameDob(candName, exName)
    ) {
      return { match: existing, matchedBy: 'nombre_fecha' };
    }

    if (
      candName &&
      exName &&
      candName === exName &&
      candName.split(' ').length >= 2 &&
      candName.length >= 10 &&
      (!candidate.fecha_nacimiento || !existing.fecha_nacimiento) &&
      Math.abs((candidate.edad || 0) - (existing.edad || 0)) <= 1
    ) {
      const phonesConflict =
        candPhoneKeys.length > 0 &&
        exPhoneKeys.length > 0 &&
        !candPhoneKeys.some((pk) => exPhoneKeys.includes(pk));
      const emailsConflict = candEmail && exEmail && candEmail !== exEmail;
      if (!phonesConflict && !emailsConflict) {
        return { match: existing, matchedBy: 'nombre_fecha' };
      }
    }
  }
  return null;
}

export function findMatchingApplicationInDb(
  candidate: Pick<
    NormalizedCastingInsert,
    'nombre' | 'apellidos' | 'fecha_nacimiento' | 'edad' | 'whatsapp' | 'correo' | 'instagram' | 'notas_importacion'
  >,
  existingApps: CastingApplication[]
): CastingApplication | null {
  return findMatchingApplicationWithReason(candidate, existingApps)?.match || null;
}

export function findExistingDuplicateInDb(
  candidate: NormalizedCastingInsert,
  existingApps: CastingApplication[]
): boolean {
  return findMatchingApplicationInDb(candidate, existingApps) !== null;
}

const isPlaceholderOrEmpty = (val: unknown): boolean => {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return (
      !s ||
      s === 'no especificado' ||
      s === 'no especificada' ||
      s === 'por completar' ||
      s === 'sin nombre'
    );
  }
  return false;
};

export function computeMissingCastingFields(record: Partial<CastingApplication>): string[] {
  const missing: string[] = [];
  const isDancerOnly = record.talento === 'bailarin';
  const needsDancerFields = record.talento === 'bailarin' || record.talento === 'ambos';
  const needsModelFields = record.talento !== 'bailarin';

  if (!record.foto_cara || !record.foto_cuerpo) missing.push('fotos');
  if (isPlaceholderOrEmpty(record.nombre) || isPlaceholderOrEmpty(record.apellidos)) {
    missing.push('nombre_completo');
  }
  if (isPlaceholderOrEmpty(record.whatsapp)) missing.push('whatsapp');
  if (isPlaceholderOrEmpty(record.correo)) missing.push('correo');
  if (isPlaceholderOrEmpty(record.instagram)) missing.push('instagram');
  if (!record.estatura) missing.push('estatura');

  if (needsDancerFields) {
    if (isPlaceholderOrEmpty(record.genero)) missing.push('genero');
    if (isPlaceholderOrEmpty(record.formacion_artistica)) missing.push('formacion_artistica');
    if (isPlaceholderOrEmpty(record.nivel_ensenanza)) missing.push('nivel_ensenanza');
  }

  if (isDancerOnly && !needsModelFields) {
    return missing;
  }

  if (!record.fecha_nacimiento) missing.push('fecha_nacimiento');
  if (isPlaceholderOrEmpty(record.ciudad)) missing.push('ciudad');
  if (isPlaceholderOrEmpty(record.talla_superior)) missing.push('talla_superior');
  if (isPlaceholderOrEmpty(record.talla_inferior)) missing.push('talla_inferior');
  if (isPlaceholderOrEmpty(record.calzado)) missing.push('calzado');
  if (isPlaceholderOrEmpty(record.color_cabello)) missing.push('color_cabello');
  if (isPlaceholderOrEmpty(record.largo_cabello)) missing.push('largo_cabello');
  if (isPlaceholderOrEmpty(record.color_ojos)) missing.push('color_ojos');
  if (isPlaceholderOrEmpty(record.tono_piel)) missing.push('tono_piel');
  return missing;
}

export function computeApplicationMergePatch(
  existing: CastingApplication,
  incoming: NormalizedCastingInsert
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  const fillIfEmpty = <K extends keyof CastingApplication & keyof NormalizedCastingInsert>(field: K) => {
    const currentVal = existing[field];
    const nextVal = incoming[field];
    if (isPlaceholderOrEmpty(currentVal) && !isPlaceholderOrEmpty(nextVal)) {
      patch[field as string] = nextVal;
    }
  };

  fillIfEmpty('nombre');
  fillIfEmpty('apellidos');
  fillIfEmpty('fecha_nacimiento');
  fillIfEmpty('ciudad');
  fillIfEmpty('whatsapp');
  fillIfEmpty('correo');
  fillIfEmpty('instagram');
  fillIfEmpty('estatura');
  fillIfEmpty('busto');
  fillIfEmpty('cintura');
  fillIfEmpty('caderas');
  fillIfEmpty('talla_superior');
  fillIfEmpty('talla_inferior');
  fillIfEmpty('calzado');
  fillIfEmpty('color_cabello');
  fillIfEmpty('largo_cabello');
  fillIfEmpty('color_ojos');
  fillIfEmpty('tono_piel');
  fillIfEmpty('talento');
  fillIfEmpty('genero');
  fillIfEmpty('formacion_artistica');
  fillIfEmpty('nivel_ensenanza');
  fillIfEmpty('nombre_artistico');
  fillIfEmpty('estado_cabello');
  fillIfEmpty('tiktok');
  fillIfEmpty('detalle_piercings_tatuajes');

  if (!existing.tiene_piercings && incoming.tiene_piercings) {
    patch.tiene_piercings = true;
  }
  if (!existing.tiene_tatuajes && incoming.tiene_tatuajes) {
    patch.tiene_tatuajes = true;
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  if (incoming.notas_importacion && !existing.notas_importacion) {
    patch.notas_importacion = incoming.notas_importacion;
  }

  const mergedState: Partial<CastingApplication> = { ...existing, ...patch };
  const recomputedMissing = computeMissingCastingFields(mergedState);
  patch.campos_faltantes = recomputedMissing;
  patch.datos_incompletos = recomputedMissing.length > 0;

  return patch;
}

export interface DuplicateApplicationGroup {
  key: string;
  apps: CastingApplication[];
  suggestedWinnerId: number;
  reasons: string[];
}

const STATUS_PRIORITY: Record<string, number> = {
  seleccionada: 4,
  preseleccionada: 3,
  pendiente: 2,
  descartada: 1,
};

function getRecordPriorityScore(app: CastingApplication): number {
  let score = 0;
  if (app.foto_cara && app.foto_cuerpo) score += 10000;
  else if (app.foto_cara || app.foto_cuerpo) score += 5000;
  if (app.origen !== 'google_form') score += 2000;
  score += (STATUS_PRIORITY[app.estado] || 0) * 100;
  if (!app.datos_incompletos) score += 50;
  return score;
}

export function sortDuplicatesLowToHighPriority(apps: CastingApplication[]): CastingApplication[] {
  return [...apps].sort((a, b) => {
    const scoreDiff = getRecordPriorityScore(a) - getRecordPriorityScore(b);
    if (scoreDiff !== 0) return scoreDiff;
    const tA = Date.parse(a.created_at || '') || 0;
    const tB = Date.parse(b.created_at || '') || 0;
    if (tA !== tB) return tA - tB;
    return a.id - b.id;
  });
}

export function findDuplicateGroupsInApplications(
  apps: CastingApplication[]
): DuplicateApplicationGroup[] {
  if (!Array.isArray(apps) || apps.length < 2) return [];

  const n = apps.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const groupReasons = new Map<string, Set<string>>();
  const addPairReason = (i: number, j: number, reason: string) => {
    const min = Math.min(i, j);
    const max = Math.max(i, j);
    const key = `${min}:${max}`;
    let set = groupReasons.get(key);
    if (!set) {
      set = new Set<string>();
      groupReasons.set(key, set);
    }
    set.add(reason);
    union(i, j);
  };

  const phoneBuckets = new Map<string, number[]>();
  const emailBuckets = new Map<string, number[]>();
  const igBuckets = new Map<string, number[]>();
  const dobBuckets = new Map<string, number[]>();
  const nameBuckets = new Map<string, number[]>();

  const meta = apps.map((app, idx) => {
    const phoneKeys = extractAllPhoneKeys(app.whatsapp, app.notas_importacion);
    const emailKey = normalizeEmailKey(app.correo);
    const igKey = normalizeInstagramKey(app.instagram);
    const dob = (app.fecha_nacimiento || '').trim();
    const nameKey = normalizeNameKey(`${app.nombre || ''} ${app.apellidos || ''}`);

    for (const pk of phoneKeys) {
      const arr = phoneBuckets.get(pk) || [];
      arr.push(idx);
      phoneBuckets.set(pk, arr);
    }
    if (emailKey) {
      const arr = emailBuckets.get(emailKey) || [];
      arr.push(idx);
      emailBuckets.set(emailKey, arr);
    }
    if (igKey) {
      const arr = igBuckets.get(igKey) || [];
      arr.push(idx);
      igBuckets.set(igKey, arr);
    }
    if (dob) {
      const arr = dobBuckets.get(dob) || [];
      arr.push(idx);
      dobBuckets.set(dob, arr);
    }
    if (nameKey && nameKey.split(' ').length >= 2 && nameKey.length >= 10) {
      const arr = nameBuckets.get(nameKey) || [];
      arr.push(idx);
      nameBuckets.set(nameKey, arr);
    }

    return { phoneKeys, emailKey, igKey, dob, nameKey, edad: app.edad };
  });

  const linkBucket = (bucket: Map<string, number[]>, reason: string) => {
    for (const indices of bucket.values()) {
      if (indices.length < 2) continue;
      for (let k = 1; k < indices.length; k++) {
        addPairReason(indices[0], indices[k], reason);
      }
    }
  };

  linkBucket(phoneBuckets, 'Mismo WhatsApp');
  linkBucket(emailBuckets, 'Mismo correo');
  linkBucket(igBuckets, 'Mismo @Instagram');

  // Same DOB + compatible name
  for (const indices of dobBuckets.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a];
        const j = indices[b];
        if (areNamesCompatibleForSameDob(meta[i].nameKey, meta[j].nameKey)) {
          addPairReason(i, j, 'Mismo nombre y fecha nac.');
        }
      }
    }
  }

  // Exact full name (>= 2 words) when one lacks DOB or same age, and no conflicting phone/email
  for (const indices of nameBuckets.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a];
        const j = indices[b];
        const mA = meta[i];
        const mB = meta[j];
        if (mA.dob && mB.dob && mA.dob !== mB.dob) continue;
        if (Math.abs((mA.edad || 0) - (mB.edad || 0)) > 1) continue;
        const phonesConflict =
          mA.phoneKeys.length > 0 &&
          mB.phoneKeys.length > 0 &&
          !mA.phoneKeys.some((pk) => mB.phoneKeys.includes(pk));
        const emailsConflict = mA.emailKey && mB.emailKey && mA.emailKey !== mB.emailKey;
        if (!phonesConflict && !emailsConflict) {
          addPairReason(i, j, 'Mismo nombre completo');
        }
      }
    }
  }

  const components = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = components.get(root) || [];
    list.push(i);
    components.set(root, list);
  }

  const results: DuplicateApplicationGroup[] = [];
  for (const indices of components.values()) {
    if (indices.length < 2) continue;
    const reasonsSet = new Set<string>();
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const key = `${Math.min(indices[a], indices[b])}:${Math.max(indices[a], indices[b])}`;
        const r = groupReasons.get(key);
        if (r) r.forEach((reason) => reasonsSet.add(reason));
      }
    }

    const groupApps = sortDuplicatesLowToHighPriority(indices.map((i) => apps[i]));
    const winner = groupApps[groupApps.length - 1];
    const sortedIds = groupApps.map((a) => a.id).sort((x, y) => x - y);

    results.push({
      key: sortedIds.join('-'),
      apps: [...groupApps].reverse(), // highest priority first for UI display
      suggestedWinnerId: winner.id,
      reasons: Array.from(reasonsSet),
    });
  }

  return results.sort((a, b) => b.apps.length - a.apps.length || a.suggestedWinnerId - b.suggestedWinnerId);
}

export function computeMergedRecordFromDuplicates(fullRows: CastingApplication[]): {
  winnerId: number;
  loserIds: number[];
  updatePayload: Record<string, unknown>;
} {
  const ordered = sortDuplicatesLowToHighPriority(fullRows);
  const winner = ordered[ordered.length - 1];
  const loserIds = ordered.slice(0, -1).map((r) => r.id);

  const pickBestValue = <K extends keyof CastingApplication>(field: K): CastingApplication[K] => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const val = ordered[i][field];
      if (!isPlaceholderOrEmpty(val)) return val;
    }
    return winner[field];
  };

  // Preserve the highest status (seleccionada > preseleccionada > pendiente > descartada)
  let bestEstado = winner.estado || 'pendiente';
  let bestStatusScore = STATUS_PRIORITY[bestEstado] || 0;
  for (const row of ordered) {
    const score = STATUS_PRIORITY[row.estado] || 0;
    if (score > bestStatusScore) {
      bestStatusScore = score;
      bestEstado = row.estado;
    }
  }

  // Merge photos preferring valid Storage URLs or non-empty photos
  const pickBestPhoto = (field: 'foto_cara' | 'foto_cuerpo'): string | null => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const val = ordered[i][field];
      if (typeof val === 'string' && /^https?:\/\//i.test(val.trim())) {
        return val.trim();
      }
    }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const val = ordered[i][field];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
    return null;
  };

  const foto_cara = pickBestPhoto('foto_cara');
  const foto_cuerpo = pickBestPhoto('foto_cuerpo');
  const hasWebOrigin = ordered.some((r) => r.origen === 'web') || Boolean(foto_cara && foto_cuerpo);

  // Preserve coupon tag and merge unique import notes
  const couponMatches: string[] = [];
  const otherNotes: string[] = [];
  for (const row of ordered) {
    const raw = (row.notas_importacion || '').trim();
    if (!raw) continue;
    const couponMatch = raw.match(/\[CUP[ÓO]N(?::\s*[^\]]+)?\]/i);
    if (couponMatch && !couponMatches.includes(couponMatch[0])) {
      couponMatches.push(couponMatch[0]);
    }
    const stripped = raw
      .replace(/\s*\[CUP[ÓO]N(?::\s*[^\]]+)?\]\s*/gi, ' ')
      .replace(/\s*·\s*$/, '')
      .replace(/^\s*·\s*/, '')
      .trim();
    if (stripped) {
      for (const part of stripped.split(/\s*\|\s*/)) {
        const cleanPart = part.trim();
        if (cleanPart && !otherNotes.includes(cleanPart)) {
          otherNotes.push(cleanPart);
        }
      }
    }
  }
  const combinedNotesParts: string[] = [];
  if (couponMatches.length > 0) combinedNotesParts.push(couponMatches[0]);
  if (otherNotes.length > 0) combinedNotesParts.push(otherNotes.join(' | '));
  const notas_importacion = combinedNotesParts.length > 0 ? combinedNotesParts.join(' · ') : null;

  const hasAnyBoth = ordered.some((r) => r.talento === 'ambos');
  const hasAnyModel = ordered.some((r) => r.talento === 'modelo');
  const hasAnyDancer = ordered.some((r) => r.talento === 'bailarin');
  const mergedTalento: 'modelo' | 'bailarin' | 'ambos' =
    hasAnyBoth || (hasAnyModel && hasAnyDancer)
      ? 'ambos'
      : hasAnyDancer
      ? 'bailarin'
      : 'modelo';

  const mergedPayload: Record<string, unknown> = {
    nombre: pickBestValue('nombre'),
    apellidos: pickBestValue('apellidos'),
    fecha_nacimiento: pickBestValue('fecha_nacimiento'),
    edad: pickBestValue('edad'),
    ciudad: pickBestValue('ciudad'),
    whatsapp: pickBestValue('whatsapp'),
    correo: pickBestValue('correo'),
    instagram: pickBestValue('instagram'),
    estatura: pickBestValue('estatura'),
    busto: pickBestValue('busto'),
    cintura: pickBestValue('cintura'),
    caderas: pickBestValue('caderas'),
    talla_superior: pickBestValue('talla_superior'),
    talla_inferior: pickBestValue('talla_inferior'),
    calzado: pickBestValue('calzado'),
    color_cabello: pickBestValue('color_cabello'),
    largo_cabello: pickBestValue('largo_cabello'),
    color_ojos: pickBestValue('color_ojos'),
    tono_piel: pickBestValue('tono_piel'),
    tiene_piercings: ordered.some((r) => Boolean(r.tiene_piercings)),
    tiene_tatuajes: ordered.some((r) => Boolean(r.tiene_tatuajes)),
    detalle_piercings_tatuajes: pickBestValue('detalle_piercings_tatuajes'),
    foto_cara,
    foto_cuerpo,
    origen: hasWebOrigin ? 'web' : 'google_form',
    talento: mergedTalento,
    genero: pickBestValue('genero'),
    formacion_artistica: pickBestValue('formacion_artistica'),
    nivel_ensenanza: pickBestValue('nivel_ensenanza'),
    nombre_artistico: pickBestValue('nombre_artistico'),
    estado_cabello: pickBestValue('estado_cabello'),
    tiktok: pickBestValue('tiktok'),
    notas_importacion,
    estado: bestEstado,
  };

  const missingFields = computeMissingCastingFields(mergedPayload as Partial<CastingApplication>);
  mergedPayload.campos_faltantes = missingFields;
  mergedPayload.datos_incompletos = missingFields.length > 0;

  return {
    winnerId: winner.id,
    loserIds,
    updatePayload: mergedPayload,
  };
}

export interface ApplicationIssueItem {
  field: string;
  label: string;
  kind: 'missing' | 'malformed';
  reason: string;
  currentValue?: string | number | null;
  suggestedValue?: string | number | null;
}

export function analyzeApplicationIssues(app: Partial<CastingApplication>): {
  issues: ApplicationIssueItem[];
  missingFields: string[];
  malformedFields: string[];
  isComplete: boolean;
} {
  const issues: ApplicationIssueItem[] = [];
  const isDancerOnly = app.talento === 'bailarin';
  const needsDancerFields = app.talento === 'bailarin' || app.talento === 'ambos';
  const needsModelFields = app.talento !== 'bailarin';

  // Photos
  if (!app.foto_cara || !app.foto_cuerpo) {
    issues.push({
      field: 'fotos',
      label: 'Fotografías (Cara y Cuerpo completo)',
      kind: 'missing',
      reason:
        !app.foto_cara && !app.foto_cuerpo
          ? 'Faltan tus 2 fotografías (primer plano y cuerpo completo).'
          : !app.foto_cara
          ? 'Falta tu fotografía de cara (primer plano).'
          : 'Falta tu fotografía de cuerpo completo.',
    });
  }

  // Name & Last name
  const rawNombre = (app.nombre || '').trim();
  const rawApellidos = (app.apellidos || '').trim();
  if (isPlaceholderOrEmpty(rawNombre) || !isValidPersonNameInput(rawNombre)) {
    issues.push({
      field: 'nombre',
      label: 'Nombre',
      kind: isPlaceholderOrEmpty(rawNombre) ? 'missing' : 'malformed',
      reason: isPlaceholderOrEmpty(rawNombre)
        ? 'Falta tu nombre.'
        : 'El nombre actual contiene caracteres inválidos o está incompleto.',
      currentValue: rawNombre,
    });
  } else if (rawNombre !== toTitleCaseSpanish(rawNombre)) {
    issues.push({
      field: 'nombre',
      label: 'Nombre',
      kind: 'malformed',
      reason: 'El nombre está escrito sin mayúsculas iniciales adecuadas.',
      currentValue: rawNombre,
      suggestedValue: toTitleCaseSpanish(rawNombre),
    });
  }

  if (isPlaceholderOrEmpty(rawApellidos) || !isValidPersonNameInput(rawApellidos)) {
    issues.push({
      field: 'apellidos',
      label: 'Apellidos',
      kind: isPlaceholderOrEmpty(rawApellidos) ? 'missing' : 'malformed',
      reason: isPlaceholderOrEmpty(rawApellidos)
        ? 'Faltan tus apellidos.'
        : 'Los apellidos están incompletos o tienen caracteres no válidos.',
      currentValue: rawApellidos,
    });
  } else if (rawApellidos !== toTitleCaseSpanish(rawApellidos)) {
    issues.push({
      field: 'apellidos',
      label: 'Apellidos',
      kind: 'malformed',
      reason: 'Los apellidos están escritos sin mayúsculas iniciales adecuadas.',
      currentValue: rawApellidos,
      suggestedValue: toTitleCaseSpanish(rawApellidos),
    });
  }

  // DOB
  if (!app.fecha_nacimiento) {
    issues.push({
      field: 'fecha_nacimiento',
      label: 'Fecha de nacimiento',
      kind: 'missing',
      reason: 'Falta confirmar tu fecha de nacimiento exacta.',
    });
  }

  // Ciudad
  const rawCiudad = (app.ciudad || '').trim();
  if (isPlaceholderOrEmpty(rawCiudad)) {
    issues.push({
      field: 'ciudad',
      label: 'Ciudad / Ubicación',
      kind: 'missing',
      reason: 'Falta indicar tu ciudad o municipio actual.',
    });
  } else if (rawCiudad !== toTitleCaseSpanish(rawCiudad)) {
    issues.push({
      field: 'ciudad',
      label: 'Ciudad / Ubicación',
      kind: 'malformed',
      reason: 'La ciudad necesita formato limpio con mayúscula inicial.',
      currentValue: rawCiudad,
      suggestedValue: toTitleCaseSpanish(rawCiudad),
    });
  }

  // WhatsApp
  const rawWa = (app.whatsapp || '').trim();
  if (isPlaceholderOrEmpty(rawWa)) {
    issues.push({
      field: 'whatsapp',
      label: 'WhatsApp',
      kind: 'missing',
      reason: 'Falta tu número de WhatsApp de contacto.',
    });
  } else {
    const waCheck = validateAndFormatWebPhone(rawWa);
    if (!waCheck.valid) {
      issues.push({
        field: 'whatsapp',
        label: 'WhatsApp',
        kind: 'malformed',
        reason: waCheck.error || 'El número de WhatsApp registrado está mal escrito o incompleto.',
        currentValue: rawWa,
      });
    }
  }

  // Email
  const rawEmail = (app.correo || '').trim();
  if (isPlaceholderOrEmpty(rawEmail)) {
    issues.push({
      field: 'correo',
      label: 'Correo electrónico',
      kind: 'missing',
      reason: 'Falta tu correo electrónico.',
    });
  } else {
    const parsedEmail = normalizeEmailAddress(rawEmail);
    if (parsedEmail.missing) {
      issues.push({
        field: 'correo',
        label: 'Correo electrónico',
        kind: 'malformed',
        reason: 'El correo electrónico registrado no es válido.',
        currentValue: rawEmail,
      });
    } else if (parsedEmail.email !== rawEmail) {
      issues.push({
        field: 'correo',
        label: 'Correo electrónico',
        kind: 'malformed',
        reason: 'El correo tenía espacios o error de dominio y se puede corregir.',
        currentValue: rawEmail,
        suggestedValue: parsedEmail.email,
      });
    }
  }

  // Instagram
  const rawIg = (app.instagram || '').trim();
  if (isPlaceholderOrEmpty(rawIg)) {
    issues.push({
      field: 'instagram',
      label: 'Instagram',
      kind: 'missing',
      reason: 'Falta tu usuario de Instagram.',
    });
  } else {
    const igCheck = validateAndFormatSocialHandle(rawIg, 'instagram');
    if (!igCheck.valid) {
      issues.push({
        field: 'instagram',
        label: 'Instagram',
        kind: 'malformed',
        reason: igCheck.error || 'Tu Instagram actual no es un usuario válido.',
        currentValue: rawIg,
      });
    } else if (igCheck.formatted !== rawIg) {
      issues.push({
        field: 'instagram',
        label: 'Instagram',
        kind: 'malformed',
        reason: 'Se puede limpiar a formato @usuario.',
        currentValue: rawIg,
        suggestedValue: igCheck.formatted,
      });
    }
  }

  // Estatura
  if (!app.estatura || Number(app.estatura) < 120 || Number(app.estatura) > 225) {
    issues.push({
      field: 'estatura',
      label: 'Estatura (cm)',
      kind: !app.estatura ? 'missing' : 'malformed',
      reason: !app.estatura
        ? 'Falta tu estatura en centímetros (ej. 170).'
        : 'La estatura registrada está fuera de rango (120–225 cm).',
      currentValue: app.estatura ?? null,
    });
  }

  if (needsDancerFields) {
    if (isPlaceholderOrEmpty(app.genero)) {
      issues.push({ field: 'genero', label: 'Género', kind: 'missing', reason: 'Falta indicar tu género.' });
    }
    if (isPlaceholderOrEmpty(app.formacion_artistica)) {
      issues.push({
        field: 'formacion_artistica',
        label: 'Formación artística',
        kind: 'missing',
        reason: 'Falta indicar si eres profesional o autodidacta.',
      });
    }
    if (isPlaceholderOrEmpty(app.nivel_ensenanza)) {
      issues.push({
        field: 'nivel_ensenanza',
        label: 'Nivel de enseñanza',
        kind: 'missing',
        reason: 'Falta tu nivel de enseñanza artística.',
      });
    }
  }

  if (needsModelFields || !isDancerOnly) {
    const modelChecks: { field: keyof CastingApplication; label: string }[] = [
      { field: 'talla_superior', label: 'Talla superior' },
      { field: 'talla_inferior', label: 'Talla inferior' },
      { field: 'calzado', label: 'Calzado' },
      { field: 'color_cabello', label: 'Color de cabello' },
      { field: 'largo_cabello', label: 'Largo de cabello' },
      { field: 'estado_cabello', label: 'Estado del cabello' },
      { field: 'color_ojos', label: 'Color de ojos' },
      { field: 'tono_piel', label: 'Tono de piel' },
    ];
    for (const chk of modelChecks) {
      if (isPlaceholderOrEmpty(app[chk.field])) {
        issues.push({
          field: chk.field as string,
          label: chk.label,
          kind: 'missing',
          reason: `Falta completar ${chk.label.toLowerCase()}.`,
        });
      }
    }
  }

  const missingFields = issues.filter((i) => i.kind === 'missing').map((i) => i.field);
  const malformedFields = issues.filter((i) => i.kind === 'malformed').map((i) => i.field);
  return {
    issues,
    missingFields,
    malformedFields,
    isComplete: issues.length === 0,
  };
}

export function computeRetroactiveRecordCleanup(app: CastingApplication): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  const rawNombre = (app.nombre || '').trim();
  if (rawNombre && isValidPersonNameInput(rawNombre)) {
    const cleanNombre = toTitleCaseSpanish(rawNombre);
    if (cleanNombre !== app.nombre) patch.nombre = cleanNombre;
  }

  const rawApellidos = (app.apellidos || '').trim();
  if (rawApellidos && isValidPersonNameInput(rawApellidos)) {
    const cleanApellidos = toTitleCaseSpanish(rawApellidos);
    if (cleanApellidos !== app.apellidos) patch.apellidos = cleanApellidos;
  }

  const rawCiudad = (app.ciudad || '').trim();
  if (rawCiudad && !isPlaceholderOrEmpty(rawCiudad)) {
    const cleanCiudad = toTitleCaseSpanish(rawCiudad);
    if (cleanCiudad !== app.ciudad) patch.ciudad = cleanCiudad;
  }

  const rawArtistic = (app.nombre_artistico || '').trim();
  if (rawArtistic && !/^(no|no tengo|-)$/i.test(rawArtistic)) {
    const cleanArt = toTitleCaseSpanish(rawArtistic);
    if (cleanArt !== app.nombre_artistico) patch.nombre_artistico = cleanArt;
  }

  const rawWa = (app.whatsapp || '').trim();
  if (rawWa && !isPlaceholderOrEmpty(rawWa)) {
    const waParsed = normalizePhoneNumber(rawWa);
    if (!waParsed.missing && waParsed.primary && waParsed.primary !== app.whatsapp) {
      patch.whatsapp = waParsed.primary;
    }
  }

  const rawEmail = (app.correo || '').trim();
  if (rawEmail && !isPlaceholderOrEmpty(rawEmail)) {
    const emailParsed = normalizeEmailAddress(rawEmail);
    if (!emailParsed.missing && emailParsed.email !== app.correo) {
      patch.correo = emailParsed.email;
    }
  }

  const rawIg = (app.instagram || '').trim();
  if (rawIg && !isPlaceholderOrEmpty(rawIg)) {
    const igParsed = validateAndFormatSocialHandle(rawIg, 'instagram');
    if (igParsed.valid && igParsed.formatted !== app.instagram) {
      patch.instagram = igParsed.formatted;
    } else if (!igParsed.valid && /^(instagram|ig|no tengo|ninguno|no|-|\.)+$/i.test(rawIg)) {
      patch.instagram = 'No especificado';
    }
  }

  if (app.tiktok && app.tiktok.trim()) {
    const tkParsed = validateAndFormatSocialHandle(app.tiktok, 'tiktok');
    if (tkParsed.valid && tkParsed.formatted !== app.tiktok) {
      patch.tiktok = tkParsed.formatted;
    }
  }

  if (Object.keys(patch).length === 0) return null;

  const mergedState: Partial<CastingApplication> = { ...app, ...patch };
  const missing = computeMissingCastingFields(mergedState);
  patch.campos_faltantes = missing;
  patch.datos_incompletos = missing.length > 0;
  return patch;
}

export function buildDiscardedCsvContent(records: DiscardedCsvRecord[]): string {
  const headers = [
    'Fila Original CSV',
    'Marca Temporal',
    'Talento',
    'Nombre Completo',
    'Fecha Nacimiento (Raw)',
    'Edad (Raw)',
    'WhatsApp (Raw)',
    'Correo (Raw)',
    'Instagram/Redes (Raw)',
    'Estatura (Raw)',
    'Motivo Descarte / Observación',
  ];
  const escapeCell = (val: string) => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.map(escapeCell).join(','),
    ...records.map((r) =>
      [
        r.filaOriginal,
        r.marcaTemporal,
        r.talento,
        r.nombreCompleto,
        r.fechaNacimientoRaw,
        r.edadRaw,
        r.whatsappRaw,
        r.correoRaw,
        r.instagramRaw,
        r.estaturaRaw,
        r.motivo,
      ]
        .map(escapeCell)
        .join(',')
    ),
  ];
  return '\uFEFF' + lines.join('\r\n');
}
