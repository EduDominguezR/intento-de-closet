import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, LogOut, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PWAInstallButton } from '@/src/components/pwa/PWAInstallButton';
import { logout } from '@/src/firebase/auth';
import { updateUserDisplayName } from '@/src/firebase/firestore';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import {
  clearPhotoModeConsent,
  deleteLocalUserPhotoAndLooks,
  hasLocalUserPhoto,
} from '@/src/lib/photo/storage';
import { useLookbookQuery } from '@/src/queries/lookbook';
import { useAuthStore } from '@/src/stores/useAuthStore';

export function ProfilePage() {
  const { user, profile, setProfile, reset } = useAuthStore();
  const { isInstallable, isInstalled, isIOS } = usePWAInstall();
  const { data: lookbookEntries = [] } = useLookbookQuery(user?.uid);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [hasLocalPhoto, setHasLocalPhoto] = useState(false);
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.uid) {
      setHasLocalPhoto(false);
      return;
    }
    void hasLocalUserPhoto(user.uid).then((exists) => {
      if (active) setHasLocalPhoto(exists);
    });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  async function handleUpdateName(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await updateUserDisplayName(user.uid, displayName);
      if (profile) {
        setProfile({ ...profile, displayName: displayName.trim().slice(0, 80) });
      }
      setStatusMsg('Nombre actualizado.');
    } catch {
      setErrorMsg('No se pudo actualizar tu nombre.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLocalPhoto() {
    if (!user?.uid) return;
    setDeletingPhoto(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await deleteLocalUserPhotoAndLooks(user.uid);
      clearPhotoModeConsent(user.uid);
      setHasLocalPhoto(false);
      setConfirmDeletePhoto(false);
      setStatusMsg('Tu foto local del probador fue borrada de este dispositivo.');
    } catch {
      setErrorMsg('No se pudo borrar la foto local del dispositivo.');
    } finally {
      setDeletingPhoto(false);
    }
  }

  async function performLogout(deletePhotoFirst: boolean) {
    setLoggingOut(true);
    try {
      if (deletePhotoFirst && user?.uid) {
        await deleteLocalUserPhotoAndLooks(user.uid);
        clearPhotoModeConsent(user.uid);
      }
      await logout();
      reset();
    } finally {
      setLoggingOut(false);
      setLogoutModalOpen(false);
    }
  }

  async function handleLogoutClick() {
    if (user?.uid) {
      const exists = await hasLocalUserPhoto(user.uid);
      if (exists) {
        setHasLocalPhoto(true);
        setLogoutModalOpen(true);
        return;
      }
    }
    await performLogout(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-[#4A4458]">Perfil</h1>
          <p className="text-sm text-[#6B6580]">{profile?.email || user?.email}</p>
        </div>

        <form onSubmit={handleUpdateName} className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-sm font-medium text-[#4A4458] mb-1.5">
              Nombre visible
            </label>
            <input
              id="profile-name"
              type="text"
              required
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
            />
          </div>

          {statusMsg && (
            <p role="status" className="text-sm text-[#4A4458] bg-[#D5F5E3]/70 px-4 py-2.5 rounded-2xl">
              {statusMsg}
            </p>
          )}
          {errorMsg && (
            <p role="alert" className="text-sm text-[#4A4458] bg-[#FADADD]/70 px-4 py-2.5 rounded-2xl">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar nombre'}
          </button>
        </form>
      </section>

      <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#4A4458]">Avatar 2D y 3D</h2>
          <p className="text-xs text-[#6B6580] mt-1">
            Complexión {profile?.avatarConfig?.body ?? 'regular'} · Estatura{' '}
            {profile?.avatarConfig?.height ?? 'average'}
          </p>
        </div>
        <Link
          to="/onboarding"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          <span>Editar avatar</span>
        </Link>
      </section>

      <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-[#4A4458] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#3B875E]" aria-hidden="true" />
              <span>Foto del probador (solo en este dispositivo)</span>
            </h2>
            <p className="text-xs text-[#6B6580]">
              {hasLocalPhoto
                ? 'Tienes una foto guardada localmente. Tu foto se queda en este dispositivo.'
                : 'Sin foto guardada en este navegador. Tu foto se queda en este dispositivo.'}
            </p>
          </div>

          {hasLocalPhoto && !confirmDeletePhoto && (
            <button
              type="button"
              onClick={() => setConfirmDeletePhoto(true)}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#FADADD]/70 hover:bg-[#FADADD] text-[#4A4458] text-sm font-semibold transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Borrar mi foto</span>
            </button>
          )}
        </div>

        {hasLocalPhoto && confirmDeletePhoto && (
          <div className="rounded-2xl bg-[#FADADD]/45 border border-[#FADADD] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#4A4458]">
              ¿Borrar la foto guardada en este dispositivo? Podrás subir otra cuando quieras.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDeletePhoto(false)}
                disabled={deletingPhoto}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white border border-[#E6E0F8] text-xs font-semibold text-[#4A4458]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteLocalPhoto()}
                disabled={deletingPhoto}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#D96B78] text-white text-xs font-semibold"
              >
                {deletingPhoto ? 'Borrando...' : 'Sí, borrar foto'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[#4A4458]">
            Mi Lookbook ({lookbookEntries.length}{' '}
            {lookbookEntries.length === 1 ? 'look registrado' : 'looks registrados'})
          </h2>
          <p className="text-xs text-[#6B6580] mt-1">
            Tus fotos del lookbook son privadas y solo tú las ves.
          </p>
        </div>
        <Link
          to="/lookbook"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors shrink-0"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Ver lookbook</span>
        </Link>
      </section>

      {(isInstallable || isIOS || isInstalled) && (
        <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#4A4458]">Aplicación PWA</h2>
            <p className="text-xs text-[#6B6580] mt-1">
              {isInstalled
                ? 'Closetly está instalada en este dispositivo y lista para usar sin conexión.'
                : 'Instala Closetly en tu pantalla de inicio para acceso rápido y modo offline.'}
            </p>
          </div>
          <PWAInstallButton variant="card" />
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleLogoutClick()}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#FADADD]/70 hover:bg-[#FADADD] text-[#4A4458] text-sm font-semibold transition-colors"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
      </div>

      {logoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A4458]/35 backdrop-blur-[2px] p-4"
          onClick={() => !loggingOut && setLogoutModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-photo-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white p-6 border border-[#E6E0F8] shadow-sheet space-y-4"
          >
            <div className="space-y-1.5">
              <h2 id="logout-photo-title" className="font-display text-lg font-bold text-[#4A4458]">
                Tienes una foto guardada en este dispositivo
              </h2>
              <p className="text-xs text-[#6B6580] leading-relaxed">
                Tu foto del probador solo vive en este navegador. ¿Quieres borrarla antes de cerrar sesión?
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void performLogout(true)}
                disabled={loggingOut}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#D96B78] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>{loggingOut ? 'Cerrando sesión...' : 'Borrar foto y cerrar sesión'}</span>
              </button>

              <button
                type="button"
                onClick={() => void performLogout(false)}
                disabled={loggingOut}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold"
              >
                Conservar foto y cerrar sesión
              </button>

              <button
                type="button"
                onClick={() => setLogoutModalOpen(false)}
                disabled={loggingOut}
                className="w-full min-h-[42px] px-4 py-2 rounded-2xl text-xs font-semibold text-[#6B6580] hover:bg-[#FFFBFD]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
