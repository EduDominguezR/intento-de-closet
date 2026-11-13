import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import {
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_SKIN_OPTIONS,
  Avatar2D,
} from '@/src/components/avatar/Avatar2D';
import { updateUserAvatarConfig } from '@/src/firebase/firestore';
import { normalizeAvatarConfig } from '@/src/lib/avatar/mapping';
import {
  DEFAULT_AVATAR_CONFIG,
  type AvatarBodyType,
  type AvatarConfig,
  type AvatarHeightType,
} from '@/src/lib/avatar/types';
import { useAuthStore } from '@/src/stores/useAuthStore';

const LazyAvatar3DPreview = lazy(() => import('@/src/components/three/Avatar3D'));

const BODY_OPTIONS: { value: AvatarBodyType; label: string; note: string }[] = [
  { value: 'slim', label: 'Esbelta', note: 'Hombros y cintura estrechos' },
  { value: 'regular', label: 'Regular', note: 'Proporción equilibrada' },
  { value: 'curvy', label: 'Curvy', note: 'Cadera y silueta acentuada' },
];

const HEIGHT_OPTIONS: { value: AvatarHeightType; label: string; note: string }[] = [
  { value: 'short', label: 'Baja', note: 'Ajuste compacto' },
  { value: 'average', label: 'Media', note: 'Proporción estándar' },
  { value: 'tall', label: 'Alta', note: 'Piernas estilizadas' },
];

const STEP_TITLES = [
  'Tono de piel',
  'Cabello',
  'Complexión',
  'Estatura relativa',
] as const;

export function OnboardingAvatarPage() {
  const { user, profile, setAvatarConfig } = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AvatarConfig>(() =>
    normalizeAvatarConfig(profile?.avatarConfig ?? DEFAULT_AVATAR_CONFIG),
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const normalized = normalizeAvatarConfig(config);
      await updateUserAvatarConfig(user.uid, normalized);
      setAvatarConfig(normalized);
      navigate('/closet', { replace: true });
    } catch {
      setErrorMsg('No se pudo guardar tu avatar. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBFD] py-6 sm:py-10 px-4 sm:px-6 flex items-center justify-center">
      <div className="max-w-5xl w-full rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Preview lado a lado 2D y 3D en vivo */}
        <div className="lg:col-span-6 rounded-3xl bg-[#E6E0F8]/30 border border-[#E6E0F8] p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 items-stretch">
            <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-3 flex flex-col items-center justify-between">
              <div className="w-full h-60 sm:h-72 flex items-center justify-center">
                <Avatar2D config={config} className="w-full h-full" />
              </div>
              <span className="mt-2 text-[11px] font-semibold text-[#6B6580]">Vista 2D</span>
            </div>

            <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-2 flex flex-col items-center justify-between">
              <div className="w-full h-60 sm:h-72">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center">
                      <div className="h-7 w-7 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
                      <span className="text-[11px] text-[#6B6580]">Cargando 3D...</span>
                    </div>
                  }
                >
                  <LazyAvatar3DPreview config={config} className="w-full h-full" />
                </Suspense>
              </div>
              <span className="mt-2 text-[11px] font-semibold text-[#6B6580]">
                Vista 3D aproximada
              </span>
            </div>
          </div>

          <p className="text-xs font-medium text-[#6B6580] text-center">
            Los cambios se reflejan en vivo en tu maniquí 2D y tu avatar 3D paramétrico
          </p>
        </div>

        {/* Wizard de 4 pasos */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#6B6580] tabular-nums">
              Paso {step + 1} de 4 · {STEP_TITLES[step]}
            </p>
            <h1 className="font-display text-2xl font-bold text-[#4A4458]">
              Personaliza tu avatar
            </h1>
            <div className="grid grid-cols-4 gap-1.5 pt-1" aria-hidden="true">
              {STEP_TITLES.map((title, idx) => (
                <div
                  key={title}
                  className={`h-1.5 rounded-full transition-colors ${
                    idx <= step ? 'bg-[#6E61BE]' : 'bg-[#E6E0F8]'
                  }`}
                />
              ))}
            </div>
          </div>

          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-[#6B6580]">
                Elige el tono base de piel para tu avatar 2D y 3D.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AVATAR_SKIN_OPTIONS.map((tone) => {
                  const active = config.skin.toUpperCase() === tone.hex.toUpperCase();
                  return (
                    <button
                      key={tone.hex}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, skin: tone.hex }))}
                      aria-pressed={active}
                      className={`min-h-[48px] px-4 py-2.5 rounded-2xl border flex items-center gap-3 text-left transition-colors ${
                        active
                          ? 'bg-[#E6E0F8]/70 border-[#8B7FD4] text-[#4A4458]'
                          : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458] hover:bg-[#E6E0F8]/30'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded-full border border-[#4A4458]/20 shrink-0"
                        style={{ backgroundColor: tone.hex }}
                      />
                      <span className="text-sm font-semibold">{tone.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#4A4458]">Estilo de cabello</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVATAR_HAIR_STYLES.map((styleOpt) => {
                    const active = config.hair.style === styleOpt.id;
                    return (
                      <button
                        key={styleOpt.id}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            hair: { ...prev.hair, style: styleOpt.id },
                          }))
                        }
                        aria-pressed={active}
                        className={`min-h-[44px] px-3 py-2 rounded-2xl border text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-[#FADADD]/65 border-[#8B7FD4] text-[#4A4458]'
                            : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458] hover:bg-[#FADADD]/25'
                        }`}
                      >
                        {styleOpt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#4A4458]">Color de cabello</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AVATAR_HAIR_COLORS.map((colorOpt) => {
                    const active = config.hair.color.toUpperCase() === colorOpt.hex.toUpperCase();
                    return (
                      <button
                        key={colorOpt.hex}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            hair: { ...prev.hair, color: colorOpt.hex },
                          }))
                        }
                        aria-pressed={active}
                        className={`min-h-[44px] px-3 py-2 rounded-2xl border flex items-center gap-2.5 text-left transition-colors ${
                          active
                            ? 'bg-[#E6E0F8]/70 border-[#8B7FD4] text-[#4A4458]'
                            : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458] hover:bg-[#E6E0F8]/30'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full border border-[#4A4458]/20 shrink-0"
                          style={{ backgroundColor: colorOpt.hex }}
                        />
                        <span className="text-xs font-semibold truncate">{colorOpt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-[#6B6580]">
                Ajusta la silueta para adaptar tanto el maniquí 2D como las proporciones 3D.
              </p>
              <div className="space-y-2.5">
                {BODY_OPTIONS.map((opt) => {
                  const active = config.body === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, body: opt.value }))}
                      aria-pressed={active}
                      className={`w-full min-h-[56px] px-4 py-3 rounded-2xl border flex items-center justify-between text-left transition-colors ${
                        active
                          ? 'bg-[#E6E0F8]/70 border-[#8B7FD4] text-[#4A4458]'
                          : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{opt.label}</p>
                        <p className="text-xs text-[#6B6580]">{opt.note}</p>
                      </div>
                      {active && <Check className="w-4 h-4 text-[#5E51AE]" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-[#6B6580]">
                Elige la estatura relativa para calibrar el 2D y la altura 3D.
              </p>
              <div className="space-y-2.5">
                {HEIGHT_OPTIONS.map((opt) => {
                  const active = config.height === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, height: opt.value }))}
                      aria-pressed={active}
                      className={`w-full min-h-[56px] px-4 py-3 rounded-2xl border flex items-center justify-between text-left transition-colors ${
                        active
                          ? 'bg-[#D5F5E3]/70 border-[#8B7FD4] text-[#4A4458]'
                          : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{opt.label}</p>
                        <p className="text-xs text-[#6B6580]">{opt.note}</p>
                      </div>
                      {active && <Check className="w-4 h-4 text-[#5E51AE]" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-2xl bg-[#FADADD]/60 border border-[#FADADD] px-4 py-3 text-sm text-[#4A4458]"
            >
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || saving}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Anterior</span>
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(3, s + 1))}
                className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>{saving ? 'Guardando...' : 'Guardar y continuar'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
