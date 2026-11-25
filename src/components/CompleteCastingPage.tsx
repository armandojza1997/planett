import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Loader2,
  MessageCircle,
  Search,
  Shirt,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CASTING_WHATSAPP_CHANNEL_URL,
  DANCERS_WHATSAPP_CHANNEL_URL,
} from '../lib/castingConfig';
import {
  ApplicationIssueItem,
  isValidPersonNameInput,
  normalizeEmailAddress,
  toTitleCaseSpanish,
  validateAndFormatSocialHandle,
  validateAndFormatWebPhone,
} from '../lib/castingCsvNormalizer';
import { compressDataUrl, compressImageFile } from '../lib/imageOptimizer';
import { uploadImageToSupabaseStorage } from '../lib/storage';

interface CompleteCastingPageProps {
  lang: 'es' | 'en';
  onChangeLang: (lang: 'es' | 'en') => void;
  onOpenModelsPage: () => void;
  onOpenDancersPage: () => void;
  onOpenManagerLogin?: () => void;
}

interface LookupProfile {
  id: number;
  nombre: string;
  apellidos: string;
  nombre_artistico: string;
  fecha_nacimiento: string;
  edad: number;
  ciudad: string;
  whatsapp: string;
  correo: string;
  instagram: string;
  tiktok: string;
  talento: 'modelo' | 'bailarin' | 'ambos';
  genero: string;
  formacion_artistica: string;
  nivel_ensenanza: string;
  estatura: number | null;
  busto: number | null;
  cintura: number | null;
  caderas: number | null;
  talla_superior: string;
  talla_inferior: string;
  calzado: string;
  color_cabello: string;
  largo_cabello: string;
  estado_cabello: string;
  color_ojos: string;
  tono_piel: string;
  tiene_piercings: boolean;
  tiene_tatuajes: boolean;
  detalle_piercings_tatuajes: string;
  origen: 'web' | 'google_form';
  estado: string;
  hasFotoCara: boolean;
  hasFotoCuerpo: boolean;
}

interface LookupAnalysis {
  issues: ApplicationIssueItem[];
  missingFields: string[];
  malformedFields: string[];
  isComplete: boolean;
}

const UPPER_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const LOWER_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['36', '37', '38', '39', '40', '41', 'Otro'];
const HAIR_COLORS = ['Rubio', 'Negro', 'Castaño', 'Rojo', 'Otro'];
const HAIR_LENGTHS = ['Corto', 'Medio', 'Largo', 'Otro'];
const HAIR_CONDITIONS = ['Natural', 'Teñido', 'Natural · Disposición a cambios', 'Teñido · Disposición a cambios'];
const EYE_COLORS = ['Azules', 'Verdes', 'Carmelitas', 'Negros', 'Otro'];
const SKIN_TONES = ['Blanca', 'Morena', 'Mulata', 'Negra', 'Otro'];

function computeAgeFromDob(dobStr: string): number | null {
  if (!dobStr || !/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) return null;
  const [year, month, day] = dobStr.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    age--;
  }
  return age >= 0 && age <= 100 ? age : null;
}

function cleanEditableValue(val: string | null | undefined): string {
  const s = (val || '').trim();
  if (/^(no especificado|no especificada|por completar|sin nombre|s\/n|n\/a|na|-)$/i.test(s)) {
    return '';
  }
  return s;
}

export const CompleteCastingPage: React.FC<CompleteCastingPageProps> = ({
  lang,
  onChangeLang,
  onOpenModelsPage,
  onOpenDancersPage,
  onOpenManagerLogin,
}) => {
  // Phase 1: Search state
  const [searchMode, setSearchMode] = useState<'contact' | 'name'>('contact');
  const [contactQuery, setContactQuery] = useState('');
  const [searchNombre, setSearchNombre] = useState('');
  const [searchApellidos, setSearchApellidos] = useState('');
  const [searchDob, setSearchDob] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Phase 2: Loaded profile + editable fields
  const [lookupToken, setLookupToken] = useState('');
  const [foundProfile, setFoundProfile] = useState<LookupProfile | null>(null);
  const [analysis, setAnalysis] = useState<LookupAnalysis | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);

  // Editable form state
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [nombreArtistico, setNombreArtistico] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [correo, setCorreo] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [estatura, setEstatura] = useState('');
  const [busto, setBusto] = useState('');
  const [cintura, setCintura] = useState('');
  const [caderas, setCaderas] = useState('');
  const [tallaSuperior, setTallaSuperior] = useState('');
  const [tallaInferior, setTallaInferior] = useState('');
  const [calzado, setCalzado] = useState('');
  const [colorCabello, setColorCabello] = useState('');
  const [largoCabello, setLargoCabello] = useState('');
  const [estadoCabello, setEstadoCabello] = useState('');
  const [colorOjos, setColorOjos] = useState('');
  const [tonoPiel, setTonoPiel] = useState('');
  const [genero, setGenero] = useState('');
  const [formacionArtistica, setFormacionArtistica] = useState('');
  const [nivelEnsenanza, setNivelEnsenanza] = useState('');
  const [tienePiercings, setTienePiercings] = useState(false);
  const [tieneTatuajes, setTieneTatuajes] = useState(false);
  const [detallePiercingsTatuajes, setDetallePiercingsTatuajes] = useState('');

  const [newFotoCara, setNewFotoCara] = useState('');
  const [newFotoCuerpo, setNewFotoCuerpo] = useState('');
  const [uploadingCara, setUploadingCara] = useState(false);
  const [uploadingCuerpo, setUploadingCuerpo] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedDone, setSavedDone] = useState(false);

  const issueFieldSet = useMemo(() => {
    return new Set((analysis?.issues || []).map((i) => i.field));
  }, [analysis]);

  const hydrateFormFromProfile = (p: LookupProfile, anal: LookupAnalysis) => {
    const suggestedMap = new Map<string, string>();
    for (const item of anal.issues) {
      if (item.suggestedValue !== undefined && item.suggestedValue !== null) {
        suggestedMap.set(item.field, String(item.suggestedValue));
      }
    }

    setNombre(suggestedMap.get('nombre') || cleanEditableValue(p.nombre));
    setApellidos(suggestedMap.get('apellidos') || cleanEditableValue(p.apellidos));
    setNombreArtistico(cleanEditableValue(p.nombre_artistico));
    setFechaNacimiento(p.fecha_nacimiento || '');
    setCiudad(suggestedMap.get('ciudad') || cleanEditableValue(p.ciudad));
    setWhatsapp(suggestedMap.get('whatsapp') || cleanEditableValue(p.whatsapp));
    setCorreo(suggestedMap.get('correo') || cleanEditableValue(p.correo));
    setInstagram(suggestedMap.get('instagram') || cleanEditableValue(p.instagram));
    setTiktok(cleanEditableValue(p.tiktok));
    setEstatura(p.estatura ? String(p.estatura) : '');
    setBusto(p.busto ? String(p.busto) : '');
    setCintura(p.cintura ? String(p.cintura) : '');
    setCaderas(p.caderas ? String(p.caderas) : '');
    setTallaSuperior(cleanEditableValue(p.talla_superior));
    setTallaInferior(cleanEditableValue(p.talla_inferior));
    setCalzado(cleanEditableValue(p.calzado));
    setColorCabello(cleanEditableValue(p.color_cabello));
    setLargoCabello(cleanEditableValue(p.largo_cabello));
    setEstadoCabello(cleanEditableValue(p.estado_cabello));
    setColorOjos(cleanEditableValue(p.color_ojos));
    setTonoPiel(cleanEditableValue(p.tono_piel));
    setGenero(cleanEditableValue(p.genero));
    setFormacionArtistica(cleanEditableValue(p.formacion_artistica));
    setNivelEnsenanza(cleanEditableValue(p.nivel_ensenanza));
    setTienePiercings(Boolean(p.tiene_piercings));
    setTieneTatuajes(Boolean(p.tiene_tatuajes));
    setDetallePiercingsTatuajes(cleanEditableValue(p.detalle_piercings_tatuajes));
    setNewFotoCara('');
    setNewFotoCuerpo('');
    setSaveError('');
    setShowAllFields(anal.isComplete);
  };

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setNotFound(false);

    const payload: Record<string, string> = {};
    if (searchMode === 'contact') {
      const q = contactQuery.trim();
      if (!q) {
        setSearchError(
          lang === 'es'
            ? 'Ingresa tu número de WhatsApp, tu correo electrónico o tu @Instagram.'
            : 'Enter your WhatsApp number, email address, or @Instagram handle.'
        );
        return;
      }
      if (q.includes('@') && q.includes('.')) {
        payload.correo = q.toLowerCase();
      } else if (q.startsWith('@') || /[a-zA-Z]/.test(q)) {
        payload.instagram = q.startsWith('@') ? q : `@${q}`;
      } else {
        payload.whatsapp = q;
      }
    } else {
      if (!searchNombre.trim() || !searchApellidos.trim() || !searchDob) {
        setSearchError(
          lang === 'es'
            ? 'Completa tu nombre, apellidos y fecha de nacimiento para buscar.'
            : 'Enter your first name, last name, and date of birth.'
        );
        return;
      }
      payload.nombre = searchNombre.trim();
      payload.apellidos = searchApellidos.trim();
      payload.fecha_nacimiento = searchDob;
    }

    setSearching(true);
    try {
      const res = await fetch('/api/casting-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get('content-type') || '';
      const json = ct.includes('application/json') ? await res.json() : null;

      if (!res.ok) {
        setSearchError(
          json?.error ||
            (lang === 'es'
              ? 'No se pudo consultar tu ficha en este momento.'
              : 'Could not look up your application right now.')
        );
        return;
      }

      if (!json?.found || !json?.profile || !json?.lookupToken) {
        setNotFound(true);
        return;
      }

      setLookupToken(json.lookupToken);
      setFoundProfile(json.profile);
      setAnalysis(json.analysis);
      hydrateFormFromProfile(json.profile, json.analysis);
      setSavedDone(false);
    } catch {
      setSearchError(
        lang === 'es'
          ? 'Error de conexión al buscar tu ficha. Revisa tu internet e intenta nuevamente.'
          : 'Network error while searching. Please try again.'
      );
    } finally {
      setSearching(false);
    }
  };

  const handlePhotoUpload = async (
    file: File | undefined,
    kind: 'cara' | 'cuerpo'
  ) => {
    if (!file) return;
    if (kind === 'cara') setUploadingCara(true);
    else setUploadingCuerpo(true);

    try {
      const compressed = await compressImageFile(file, {
        maxWidth: kind === 'cara' ? 720 : 800,
        maxHeight: kind === 'cara' ? 920 : 1120,
        quality: 0.78,
      });
      if (kind === 'cara') setNewFotoCara(compressed);
      else setNewFotoCuerpo(compressed);
    } catch {
      toast.error(
        lang === 'es'
          ? 'No se pudo procesar la fotografía.'
          : 'Could not process the selected photo.'
      );
    } finally {
      if (kind === 'cara') setUploadingCara(false);
      else setUploadingCuerpo(false);
    }
  };

  const handleSaveUpdates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundProfile || !lookupToken) return;
    setSaveError('');

    // Validate core fields before submitting
    if (!isValidPersonNameInput(nombre) || !isValidPersonNameInput(apellidos)) {
      setSaveError(
        lang === 'es'
          ? 'Verifica que tu nombre y apellidos contengan solo letras reales.'
          : 'Please make sure your first and last names are valid.'
      );
      return;
    }

    if (fechaNacimiento) {
      const age = computeAgeFromDob(fechaNacimiento);
      if (age === null || age < 17) {
        setSaveError(
          lang === 'es'
            ? 'La edad mínima para participar en el casting es de 17 años.'
            : 'Minimum age for the casting is 17.'
        );
        return;
      }
    }

    const phoneCheck = validateAndFormatWebPhone(whatsapp);
    if (!phoneCheck.valid) {
      setSaveError(phoneCheck.error || 'Número de WhatsApp inválido.');
      return;
    }

    const emailCheck = normalizeEmailAddress(correo);
    if (emailCheck.missing || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailCheck.email)) {
      setSaveError(
        lang === 'es' ? 'Ingresa un correo electrónico válido.' : 'Enter a valid email address.'
      );
      return;
    }

    const igCheck = validateAndFormatSocialHandle(instagram, 'instagram');
    if (!igCheck.valid) {
      setSaveError(igCheck.error || 'Usuario de Instagram inválido.');
      return;
    }

    if (tiktok.trim() && tiktok.trim() !== '@') {
      const tkCheck = validateAndFormatSocialHandle(tiktok, 'tiktok');
      if (!tkCheck.valid) {
        setSaveError(tkCheck.error || 'Usuario de TikTok inválido.');
        return;
      }
    }

    if (estatura.trim()) {
      const h = Number(estatura);
      if (Number.isNaN(h) || h < 120 || h > 225) {
        setSaveError(
          lang === 'es'
            ? 'Ingresa tu estatura en centímetros (entre 120 y 225).'
            : 'Height must be between 120 and 225 cm.'
        );
        return;
      }
    }

    if (!foundProfile.hasFotoCara && !newFotoCara) {
      setSaveError(
        lang === 'es'
          ? 'Sube tu fotografía de cara (primer plano) antes de guardar.'
          : 'Please upload your face photo before saving.'
      );
      return;
    }
    if (!foundProfile.hasFotoCuerpo && !newFotoCuerpo) {
      setSaveError(
        lang === 'es'
          ? 'Sube tu fotografía de cuerpo completo antes de guardar.'
          : 'Please upload your full-body photo before saving.'
      );
      return;
    }

    setSaving(true);
    try {
      const compressForDb = async (src: string, maxW: number, maxH: number) => {
        const firstPass = await compressDataUrl(src, {
          maxWidth: maxW,
          maxHeight: maxH,
          quality: 0.72,
        }).catch(() => src);
        if (firstPass.length > 220_000) {
          return compressDataUrl(firstPass, {
            maxWidth: Math.round(maxW * 0.8),
            maxHeight: Math.round(maxH * 0.8),
            quality: 0.58,
          }).catch(() => firstPass);
        }
        return firstPass;
      };

      const storageFolder = `casting/${new Date().toISOString().slice(0, 7)}`;
      let uploadedCaraUrl: string | undefined;
      let uploadedCuerpoUrl: string | undefined;

      if (newFotoCara) {
        const compressedCara = await compressForDb(newFotoCara, 720, 960);
        uploadedCaraUrl = await uploadImageToSupabaseStorage(compressedCara, storageFolder).catch(
          () => compressedCara
        );
      }
      if (newFotoCuerpo) {
        const compressedCuerpo = await compressForDb(newFotoCuerpo, 720, 1080);
        uploadedCuerpoUrl = await uploadImageToSupabaseStorage(
          compressedCuerpo,
          storageFolder
        ).catch(() => compressedCuerpo);
      }

      const updates: Record<string, unknown> = {
        nombre: toTitleCaseSpanish(nombre),
        apellidos: toTitleCaseSpanish(apellidos),
        nombre_artistico: nombreArtistico.trim() ? toTitleCaseSpanish(nombreArtistico) : '',
        ciudad: ciudad.trim() ? toTitleCaseSpanish(ciudad) : undefined,
        whatsapp: phoneCheck.formatted,
        correo: emailCheck.email,
        instagram: igCheck.formatted,
        tiktok: tiktok.trim() && tiktok.trim() !== '@' ? validateAndFormatSocialHandle(tiktok, 'tiktok').formatted : '',
        tiene_piercings: tienePiercings,
        tiene_tatuajes: tieneTatuajes,
        detalle_piercings_tatuajes:
          tienePiercings || tieneTatuajes ? detallePiercingsTatuajes.trim() : '',
      };

      if (fechaNacimiento) updates.fecha_nacimiento = fechaNacimiento;
      if (estatura.trim()) updates.estatura = Math.round(Number(estatura));
      if (busto.trim()) updates.busto = Math.round(Number(busto));
      if (cintura.trim()) updates.cintura = Math.round(Number(cintura));
      if (caderas.trim()) updates.caderas = Math.round(Number(caderas));
      if (tallaSuperior) updates.talla_superior = tallaSuperior;
      if (tallaInferior) updates.talla_inferior = tallaInferior;
      if (calzado) updates.calzado = calzado;
      if (colorCabello) updates.color_cabello = colorCabello;
      if (largoCabello) updates.largo_cabello = largoCabello;
      if (estadoCabello) updates.estado_cabello = estadoCabello;
      if (colorOjos) updates.color_ojos = colorOjos;
      if (tonoPiel) updates.tono_piel = tonoPiel;
      if (genero) updates.genero = genero;
      if (formacionArtistica) updates.formacion_artistica = formacionArtistica;
      if (nivelEnsenanza) updates.nivel_ensenanza = nivelEnsenanza;
      if (uploadedCaraUrl) updates.foto_cara = uploadedCaraUrl;
      if (uploadedCuerpoUrl) updates.foto_cuerpo = uploadedCuerpoUrl;

      const res = await fetch('/api/casting-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookupToken,
          updates,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      const json = ct.includes('application/json') ? await res.json() : null;

      if (!res.ok || !json?.ok) {
        setSaveError(
          json?.error ||
            (lang === 'es'
              ? 'No se pudieron guardar los cambios.'
              : 'Could not save your updates.')
        );
        return;
      }

      setAnalysis(json.analysis);
      setFoundProfile((prev) =>
        prev
          ? {
              ...prev,
              nombre: String(updates.nombre || prev.nombre),
              apellidos: String(updates.apellidos || prev.apellidos),
              hasFotoCara: Boolean(json.hasFotoCara),
              hasFotoCuerpo: Boolean(json.hasFotoCuerpo),
            }
          : prev
      );
      setSavedDone(true);
      toast.success(
        lang === 'es'
          ? '¡Tu ficha ha sido actualizada correctamente!'
          : 'Your application has been updated!'
      );
    } catch {
      setSaveError(
        lang === 'es'
          ? 'Error de conexión al guardar. Intenta nuevamente.'
          : 'Connection error while saving.'
      );
    } finally {
      setSaving(false);
    }
  };

  const resetLookup = () => {
    setFoundProfile(null);
    setLookupToken('');
    setAnalysis(null);
    setSavedDone(false);
    setSaveError('');
    setSearchError('');
    setNotFound(false);
  };

  const talentLabel =
    foundProfile?.talento === 'ambos'
      ? lang === 'es'
        ? 'Modelo y Bailarín/a'
        : 'Model & Dancer'
      : foundProfile?.talento === 'bailarin'
      ? lang === 'es'
        ? 'Bailarín/a'
        : 'Dancer'
      : lang === 'es'
      ? 'Modelo'
      : 'Model';

  const needsDancerFields =
    foundProfile?.talento === 'bailarin' || foundProfile?.talento === 'ambos';
  const needsModelFields = foundProfile?.talento !== 'bailarin';

  const channelUrl =
    foundProfile?.talento === 'bailarin'
      ? DANCERS_WHATSAPP_CHANNEL_URL
      : CASTING_WHATSAPP_CHANNEL_URL;

  const shouldRenderField = (fieldKey: string) =>
    showAllFields || issueFieldSet.has(fieldKey);

  return (
    <div
      id="complete-casting-root"
      className="min-h-screen bg-[#0B0B0D] text-[#F5F5F7] font-sans flex flex-col selection:bg-[#CC0000] selection:text-white"
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0B0B0D]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-8 h-12 flex items-center justify-between gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onOpenModelsPage();
            }}
            className="shrink-0 py-0.5 cursor-pointer"
            aria-label="Planet Talent"
          >
            <img
              src="/logo header.PNG"
              alt="Planet Talent"
              className="h-6 sm:h-8 w-auto object-contain shrink-0"
            />
          </a>

          <div className="flex items-center gap-3 sm:gap-5 text-xs">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onOpenModelsPage();
              }}
              className="text-zinc-300 hover:text-white transition-colors hidden sm:inline"
            >
              {lang === 'es' ? 'Casting Modelos' : 'Models Casting'}
            </a>
            <a
              href="/bailarines"
              onClick={(e) => {
                e.preventDefault();
                onOpenDancersPage();
              }}
              className="text-zinc-300 hover:text-white transition-colors hidden sm:inline"
            >
              {lang === 'es' ? 'Casting Bailarines' : 'Dancers Casting'}
            </a>

            <div className="flex items-center gap-1.5 shrink-0">
              <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <button
                type="button"
                onClick={() => onChangeLang('es')}
                className={`uppercase font-medium tracking-wider cursor-pointer px-0.5 ${
                  lang === 'es' ? 'text-white font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                ES
              </button>
              <span className="text-white/25 text-[0.625rem]">|</span>
              <button
                type="button"
                onClick={() => onChangeLang('en')}
                className={`uppercase font-medium tracking-wider cursor-pointer px-0.5 ${
                  lang === 'en' ? 'text-white font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-6">
        {/* Title Banner */}
        <div className="space-y-2 text-center sm:text-left">
          <p className="font-['Cormorant_Garamond',serif] uppercase text-xs sm:text-sm font-semibold tracking-[0.18em] text-[#E2BA57]">
            {lang === 'es' ? 'Actualización de Postulantes · Casting 2026' : 'Applicant Update · Casting 2026'}
          </p>
          <h1 className="font-condensed uppercase text-3xl sm:text-5xl tracking-wide text-white leading-none">
            {lang === 'es' ? 'Completa o corrige tu ficha' : 'Complete or Fix Your Profile'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-300 max-w-2xl leading-relaxed">
            {lang === 'es'
              ? 'Si te inscribiste por el Formulario de Google (sin fotos), escribiste mal algún dato como tu Instagram/nombre, o te falta información para validar tu postulación, búscala aquí sin volver a inscribirte.'
              : 'If you registered via Google Forms (missing photos), mistyped details like Instagram or your name, or still have missing fields, update your existing profile here without registering twice.'}
          </p>
        </div>

        {/* PHASE 1: LOOKUP */}
        {!foundProfile && (
          <section className="bg-[#141418] border border-[#E2BA57]/25 rounded-sm p-5 sm:p-8 shadow-2xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-[#E2BA57]" />
                <span>{lang === 'es' ? '1. Busca tu inscripción' : '1. Find your registration'}</span>
              </h2>
              <div className="inline-flex bg-[#0B0B0D] border border-white/15 rounded-sm p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setSearchMode('contact');
                    setSearchError('');
                    setNotFound(false);
                  }}
                  className={`px-2.5 py-1 rounded-sm font-semibold cursor-pointer transition-colors ${
                    searchMode === 'contact' ? 'bg-[#E2BA57]/20 text-[#FCE99F]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {lang === 'es' ? 'WhatsApp / Correo / IG' : 'Phone / Email / IG'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchMode('name');
                    setSearchError('');
                    setNotFound(false);
                  }}
                  className={`px-2.5 py-1 rounded-sm font-semibold cursor-pointer transition-colors ${
                    searchMode === 'name' ? 'bg-[#E2BA57]/20 text-[#FCE99F]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {lang === 'es' ? 'Nombre y fecha' : 'Name & DOB'}
                </button>
              </div>
            </div>

            <form onSubmit={handleLookupSubmit} className="space-y-4">
              {searchMode === 'contact' ? (
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                    {lang === 'es'
                      ? 'Ingresa tu WhatsApp, Correo electrónico o usuario @Instagram'
                      : 'Enter your WhatsApp, Email, or @Instagram handle'}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      id="complete-lookup-input"
                      type="text"
                      value={contactQuery}
                      onChange={(e) => setContactQuery(e.target.value)}
                      placeholder="Ej. +53 50000000, tu@correo.com o @tu_usuario"
                      className="flex-1 h-11 px-3.5 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E2BA57]"
                    />
                    <button
                      id="complete-lookup-btn"
                      type="submit"
                      disabled={searching}
                      className="h-11 px-6 bg-gradient-to-r from-[#E6C15A] via-[#F4D984] to-[#D4A73E] hover:from-[#F2D376] hover:to-[#E2B74B] disabled:opacity-60 text-[#0B0B0D] text-xs uppercase tracking-wider font-bold rounded-sm cursor-pointer inline-flex items-center justify-center gap-2 shrink-0"
                    >
                      {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      <span>{searching ? (lang === 'es' ? 'Buscando...' : 'Searching...') : (lang === 'es' ? 'Buscar mi ficha' : 'Find profile')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-300 font-semibold mb-1">
                        {lang === 'es' ? 'Nombre' : 'First Name'}
                      </label>
                      <input
                        type="text"
                        value={searchNombre}
                        onChange={(e) => setSearchNombre(e.target.value)}
                        placeholder="Ej. Camila"
                        className="w-full h-11 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-300 font-semibold mb-1">
                        {lang === 'es' ? 'Apellidos' : 'Last Name'}
                      </label>
                      <input
                        type="text"
                        value={searchApellidos}
                        onChange={(e) => setSearchApellidos(e.target.value)}
                        placeholder="Ej. Pérez García"
                        className="w-full h-11 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-300 font-semibold mb-1">
                        {lang === 'es' ? 'Fecha de nacimiento' : 'Date of Birth'}
                      </label>
                      <input
                        type="date"
                        value={searchDob}
                        onChange={(e) => setSearchDob(e.target.value)}
                        className="w-full h-11 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57] [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={searching}
                    className="h-11 px-6 bg-gradient-to-r from-[#E6C15A] via-[#F4D984] to-[#D4A73E] disabled:opacity-60 text-[#0B0B0D] text-xs uppercase tracking-wider font-bold rounded-sm cursor-pointer inline-flex items-center gap-2"
                  >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>{searching ? (lang === 'es' ? 'Buscando...' : 'Searching...') : (lang === 'es' ? 'Buscar mi ficha' : 'Find profile')}</span>
                  </button>
                </div>
              )}

              {searchError && (
                <div role="alert" className="p-3 bg-red-950/50 border border-red-500/40 rounded-sm text-xs text-red-200">
                  {searchError}
                </div>
              )}

              {notFound && (
                <div className="p-4 bg-amber-950/30 border border-amber-500/35 rounded-sm space-y-3 text-xs sm:text-sm text-amber-100">
                  <p className="font-semibold text-white">
                    {lang === 'es'
                      ? 'No encontramos ninguna inscripción con ese dato.'
                      : 'We could not find an application with that information.'}
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {lang === 'es'
                      ? 'Prueba buscando con otro método (tu correo, tu @Instagram o tu nombre completo + fecha de nacimiento). Si aún no te has inscrito, postúlate directamente en:'
                      : 'Try searching by email, @Instagram, or full name + DOB. If you have not applied yet, register here:'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onOpenModelsPage}
                      className="px-3.5 py-2 bg-[#E2BA57] text-[#0B0B0D] text-xs font-bold uppercase tracking-wider rounded-sm cursor-pointer"
                    >
                      {lang === 'es' ? 'Inscribirme como Modelo' : 'Apply as Model'}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenDancersPage}
                      className="px-3.5 py-2 bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider rounded-sm cursor-pointer"
                    >
                      {lang === 'es' ? 'Inscribirme como Bailarín/a' : 'Apply as Dancer'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </section>
        )}

        {/* PHASE 3: SUCCESS */}
        {foundProfile && savedDone && (
          <section className="bg-[#141418] border border-emerald-500/35 rounded-sm p-6 sm:p-10 text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-400 font-semibold">
                {lang === 'es' ? 'Ficha Actualizada' : 'Profile Updated'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                {lang === 'es' ? `¡Listo, ${nombre}!` : `All set, ${nombre}!`}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-lg mx-auto leading-relaxed">
                {analysis?.isComplete
                  ? lang === 'es'
                    ? 'Tu ficha está 100% completa y verificada con tus datos y fotografías correctas.'
                    : 'Your profile is 100% complete and verified.'
                  : lang === 'es'
                  ? `Guardamos tus cambios. Aún quedan ${analysis?.issues.length || 0} detalle(s) opcionales o pendientes que puedes revisar cuando quieras.`
                  : 'Your changes were saved cleanly.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href={channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs uppercase tracking-wider font-semibold rounded-sm transition-colors"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>{lang === 'es' ? 'Ir al Canal de WhatsApp' : 'Join WhatsApp Channel'}</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <button
                type="button"
                onClick={() => setSavedDone(false)}
                className="w-full sm:w-auto px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/15 text-zinc-200 text-xs uppercase tracking-wider font-semibold rounded-sm cursor-pointer"
              >
                {lang === 'es' ? 'Seguir editando mi ficha' : 'Keep editing'}
              </button>
            </div>
          </section>
        )}

        {/* PHASE 2: DIAGNOSTIC + FORM */}
        {foundProfile && !savedDone && analysis && (
          <section className="space-y-5">
            {/* Profile summary bar */}
            <div className="bg-[#141418] border border-white/15 rounded-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    {foundProfile.nombre} {foundProfile.apellidos}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-sm bg-[#E2BA57]/15 text-[#FCE99F] border border-[#E2BA57]/35">
                    {talentLabel}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-white/5 text-zinc-300 border border-white/15 capitalize">
                    {foundProfile.estado}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {foundProfile.whatsapp} · {foundProfile.instagram} · {foundProfile.correo}
                </p>
              </div>
              <button
                type="button"
                onClick={resetLookup}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-sm text-xs text-zinc-200 cursor-pointer self-start sm:self-center shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{lang === 'es' ? 'Buscar otra ficha' : 'Search another'}</span>
              </button>
            </div>

            {/* Issues Alert */}
            {analysis.issues.length > 0 ? (
              <div className="bg-amber-950/25 border border-[#E2BA57]/45 rounded-sm p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-[#FCE99F] font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'es'
                      ? `Detectamos ${analysis.issues.length} ${analysis.issues.length === 1 ? 'punto por completar o corregir' : 'puntos por completar o corregir'}:`
                      : `We found ${analysis.issues.length} item(s) to complete or fix:`}
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-zinc-200">
                  {analysis.issues.map((issue) => (
                    <li key={issue.field} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase shrink-0 ${
                          issue.kind === 'missing'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                            : 'bg-rose-500/20 text-rose-200 border border-rose-500/35'
                        }`}
                      >
                        {issue.kind === 'missing' ? 'Falta' : 'Corregir'}
                      </span>
                      <span>
                        <strong className="text-white">{issue.label}:</strong> {issue.reason}
                        {issue.suggestedValue ? (
                          <span className="text-emerald-300 ml-1">
                            (Pre-corregido a "{String(issue.suggestedValue)}")
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-emerald-950/25 border border-emerald-500/35 rounded-sm p-4 flex items-center gap-3 text-xs sm:text-sm text-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  {lang === 'es'
                    ? '¡Tu ficha ya está 100% completa y con formato válido! Igual puedes revisar o actualizar cualquier dato o fotografía abajo.'
                    : 'Your profile is 100% complete! You can still review or update any field below.'}
                </span>
              </div>
            )}

            <form
              onSubmit={handleSaveUpdates}
              className="bg-[#141418] border border-white/15 rounded-sm p-5 sm:p-7 space-y-6 shadow-2xl"
              noValidate
            >
              {/* Fotos Section: always visible if missing, collapsible/replaceable if already uploaded */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs uppercase tracking-[0.14em] text-[#E2BA57] font-bold flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    <span>{lang === 'es' ? 'Fotografías de Casting' : 'Casting Photos'}</span>
                  </h3>
                  {foundProfile.hasFotoCara && foundProfile.hasFotoCuerpo && (
                    <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Ambas fotos guardadas
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Foto Cara */}
                  <div
                    className={`p-4 rounded-sm border space-y-2.5 ${
                      !foundProfile.hasFotoCara && !newFotoCara
                        ? 'bg-amber-500/5 border-[#E2BA57]/55'
                        : 'bg-[#0D0D10] border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase text-white">
                        1. Foto de Cara {!foundProfile.hasFotoCara ? '*' : ''}
                      </span>
                      {foundProfile.hasFotoCara && !newFotoCara && (
                        <span className="text-[10px] text-emerald-400 font-semibold">✓ Cargada</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {lang === 'es'
                        ? 'Primer plano donde se vea claramente tu rostro con buena luz.'
                        : 'Clear close-up photo of your face.'}
                    </p>
                    <div className="flex items-center gap-3">
                      {newFotoCara ? (
                        <div className="relative w-14 h-16 rounded-sm overflow-hidden border border-white/25 shrink-0">
                          <img src={newFotoCara} alt="Nueva cara" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setNewFotoCara('')}
                            className="absolute top-0.5 right-0.5 p-0.5 bg-black/75 text-white rounded-full"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null}
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-sm text-xs font-semibold text-white cursor-pointer">
                        {uploadingCara ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                        <span>
                          {uploadingCara
                            ? 'Procesando...'
                            : newFotoCara
                            ? 'Cambiar foto'
                            : foundProfile.hasFotoCara
                            ? 'Reemplazar foto de cara'
                            : 'Subir foto de cara'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'cara')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Foto Cuerpo */}
                  <div
                    className={`p-4 rounded-sm border space-y-2.5 ${
                      !foundProfile.hasFotoCuerpo && !newFotoCuerpo
                        ? 'bg-amber-500/5 border-[#E2BA57]/55'
                        : 'bg-[#0D0D10] border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase text-white">
                        2. Cuerpo Completo {!foundProfile.hasFotoCuerpo ? '*' : ''}
                      </span>
                      {foundProfile.hasFotoCuerpo && !newFotoCuerpo && (
                        <span className="text-[10px] text-emerald-400 font-semibold">✓ Cargada</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {lang === 'es'
                        ? 'Foto de cuerpo entero donde se aprecie tu postura y proporciones.'
                        : 'Full-body photo showing your posture cleanly.'}
                    </p>
                    <div className="flex items-center gap-3">
                      {newFotoCuerpo ? (
                        <div className="relative w-14 h-16 rounded-sm overflow-hidden border border-white/25 shrink-0">
                          <img src={newFotoCuerpo} alt="Nuevo cuerpo" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setNewFotoCuerpo('')}
                            className="absolute top-0.5 right-0.5 p-0.5 bg-black/75 text-white rounded-full"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null}
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-sm text-xs font-semibold text-white cursor-pointer">
                        {uploadingCuerpo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shirt className="w-3.5 h-3.5" />}
                        <span>
                          {uploadingCuerpo
                            ? 'Procesando...'
                            : newFotoCuerpo
                            ? 'Cambiar foto'
                            : foundProfile.hasFotoCuerpo
                            ? 'Reemplazar foto de cuerpo'
                            : 'Subir cuerpo completo'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e.target.files?.[0], 'cuerpo')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Toggle to show all fields vs only flagged issues */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10">
                <h3 className="text-xs uppercase tracking-[0.14em] text-[#E2BA57] font-bold flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {showAllFields
                      ? lang === 'es'
                        ? 'Todos tus datos personales y ficha'
                        : 'All personal & profile fields'
                      : lang === 'es'
                      ? 'Datos por completar o corregir'
                      : 'Fields to complete or fix'}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAllFields((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  {showAllFields ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>
                    {showAllFields
                      ? lang === 'es'
                        ? 'Mostrar solo pendientes'
                        : 'Show flagged only'
                      : lang === 'es'
                      ? 'Revisar o editar todos mis datos'
                      : 'Review or edit all fields'}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shouldRenderField('nombre') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      onBlur={() => nombre.trim() && setNombre(toTitleCaseSpanish(nombre))}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {shouldRenderField('apellidos') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Apellidos *
                    </label>
                    <input
                      type="text"
                      value={apellidos}
                      onChange={(e) => setApellidos(e.target.value)}
                      onBlur={() => apellidos.trim() && setApellidos(toTitleCaseSpanish(apellidos))}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {showAllFields && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Nombre artístico (opcional)
                    </label>
                    <input
                      type="text"
                      value={nombreArtistico}
                      onChange={(e) => setNombreArtistico(e.target.value)}
                      onBlur={() => nombreArtistico.trim() && setNombreArtistico(toTitleCaseSpanish(nombreArtistico))}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {shouldRenderField('fecha_nacimiento') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Fecha de nacimiento *
                    </label>
                    <input
                      type="date"
                      value={fechaNacimiento}
                      onChange={(e) => setFechaNacimiento(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57] [color-scheme:dark]"
                    />
                  </div>
                )}

                {shouldRenderField('ciudad') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Ciudad / Municipio *
                    </label>
                    <input
                      type="text"
                      value={ciudad}
                      onChange={(e) => setCiudad(e.target.value)}
                      onBlur={() => ciudad.trim() && setCiudad(toTitleCaseSpanish(ciudad))}
                      placeholder="Ej. La Habana"
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {shouldRenderField('whatsapp') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      WhatsApp *
                    </label>
                    <input
                      type="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      onBlur={() => {
                        const c = validateAndFormatWebPhone(whatsapp);
                        if (c.valid) setWhatsapp(c.formatted);
                      }}
                      placeholder="+53 50000000 o +código extranjero"
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {shouldRenderField('correo') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Correo electrónico *
                    </label>
                    <input
                      type="email"
                      value={correo}
                      onChange={(e) => setCorreo(e.target.value)}
                      onBlur={() => {
                        const parsed = normalizeEmailAddress(correo);
                        if (!parsed.missing) setCorreo(parsed.email);
                      }}
                      placeholder="tu@correo.com"
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {shouldRenderField('instagram') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Instagram *
                    </label>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      onBlur={() => {
                        const c = validateAndFormatSocialHandle(instagram, 'instagram');
                        if (c.valid) setInstagram(c.formatted);
                      }}
                      placeholder="@tu_usuario"
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {showAllFields && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      TikTok (opcional)
                    </label>
                    <input
                      type="text"
                      value={tiktok}
                      onChange={(e) => setTiktok(e.target.value)}
                      onBlur={() => {
                        const c = validateAndFormatSocialHandle(tiktok, 'tiktok');
                        if (c.valid) setTiktok(c.formatted);
                      }}
                      placeholder="@tu_tiktok"
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {shouldRenderField('estatura') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Estatura (cm) *
                    </label>
                    <input
                      type="number"
                      min={120}
                      max={225}
                      value={estatura}
                      onChange={(e) => setEstatura(e.target.value)}
                      placeholder="Ej. 170"
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    />
                  </div>
                )}

                {needsDancerFields && shouldRenderField('genero') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Género *
                    </label>
                    <select
                      value={genero}
                      onChange={(e) => setGenero(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Femenino">Femenino</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                )}

                {needsDancerFields && shouldRenderField('formacion_artistica') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Formación artística *
                    </label>
                    <select
                      value={formacionArtistica}
                      onChange={(e) => setFormacionArtistica(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Autodidacta">Autodidacta</option>
                      <option value="Profesional">Profesional</option>
                    </select>
                  </div>
                )}

                {needsDancerFields && shouldRenderField('nivel_ensenanza') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Nivel de enseñanza *
                    </label>
                    <select
                      value={nivelEnsenanza}
                      onChange={(e) => setNivelEnsenanza(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Elemental (Secundaria)">Elemental (Secundaria)</option>
                      <option value="Medio (Preuniversitario o Técnico)">Medio (Preuniversitario o Técnico)</option>
                      <option value="Superior (Universitario)">Superior (Universitario)</option>
                    </select>
                  </div>
                )}

                {needsModelFields && showAllFields && (
                  <>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                        Busto (cm)
                      </label>
                      <input
                        type="number"
                        value={busto}
                        onChange={(e) => setBusto(e.target.value)}
                        className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                        Cintura (cm)
                      </label>
                      <input
                        type="number"
                        value={cintura}
                        onChange={(e) => setCintura(e.target.value)}
                        className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                        Caderas (cm)
                      </label>
                      <input
                        type="number"
                        value={caderas}
                        onChange={(e) => setCaderas(e.target.value)}
                        className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                      />
                    </div>
                  </>
                )}

                {needsModelFields && shouldRenderField('talla_superior') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Talla superior
                    </label>
                    <select
                      value={tallaSuperior}
                      onChange={(e) => setTallaSuperior(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {UPPER_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('talla_inferior') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Talla inferior
                    </label>
                    <select
                      value={tallaInferior}
                      onChange={(e) => setTallaInferior(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {LOWER_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('calzado') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Calzado
                    </label>
                    <select
                      value={calzado}
                      onChange={(e) => setCalzado(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {SHOE_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('color_cabello') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Color de cabello
                    </label>
                    <select
                      value={colorCabello}
                      onChange={(e) => setColorCabello(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {HAIR_COLORS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('largo_cabello') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Largo de cabello
                    </label>
                    <select
                      value={largoCabello}
                      onChange={(e) => setLargoCabello(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {HAIR_LENGTHS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('estado_cabello') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Estado del cabello
                    </label>
                    <select
                      value={estadoCabello}
                      onChange={(e) => setEstadoCabello(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {HAIR_CONDITIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('color_ojos') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Color de ojos
                    </label>
                    <select
                      value={colorOjos}
                      onChange={(e) => setColorOjos(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {EYE_COLORS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {needsModelFields && shouldRenderField('tono_piel') && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-200 font-semibold mb-1.5">
                      Tono de piel
                    </label>
                    <select
                      value={tonoPiel}
                      onChange={(e) => setTonoPiel(e.target.value)}
                      className="w-full h-10 px-3 bg-[#0D0D10] border border-white/20 rounded-sm text-sm text-white focus:outline-none focus:border-[#E2BA57]"
                    >
                      <option value="">Seleccionar...</option>
                      {SKIN_TONES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {saveError && (
                <div role="alert" className="p-3 bg-red-950/50 border border-red-500/40 rounded-sm text-xs text-red-200">
                  {saveError}
                </div>
              )}

              <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E2BA57] shrink-0" />
                  <span>
                    {lang === 'es'
                      ? 'Tus cambios actualizan tu ficha original sin perder tu historial.'
                      : 'Changes update your existing profile cleanly without duplicating.'}
                  </span>
                </p>

                <button
                  id="complete-save-btn"
                  type="submit"
                  disabled={saving}
                  className="h-11 px-7 bg-gradient-to-r from-[#E6C15A] via-[#F4D984] to-[#D4A73E] hover:from-[#F2D376] hover:to-[#E2B74B] disabled:opacity-60 text-[#0B0B0D] text-xs uppercase tracking-wider font-bold rounded-sm cursor-pointer inline-flex items-center justify-center gap-2 shrink-0"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{saving ? (lang === 'es' ? 'Guardando...' : 'Saving...') : (lang === 'es' ? 'Guardar actualización' : 'Save updates')}</span>
                </button>
              </div>
            </form>
          </section>
        )}
      </main>

      <footer className="border-t border-white/10 py-4 sm:py-6 px-4 sm:px-8 text-center space-y-2">
        <p className="text-[0.6875rem] sm:text-xs tracking-[0.06em] text-zinc-400 max-w-3xl mx-auto">
          {lang === 'es'
            ? 'La agencia oficial de los videos de Planet Records · Partner de Getty Images, Adobe, Premios Lucas y más'
            : 'Official agency for Planet Records music videos · Partner of Getty Images, Adobe, Premios Lucas & more'}
        </p>
        {onOpenManagerLogin && (
          <button
            type="button"
            onClick={onOpenManagerLogin}
            className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {lang === 'es' ? 'Acceso Manager' : 'Manager Login'}
          </button>
        )}
      </footer>
    </div>
  );
};
