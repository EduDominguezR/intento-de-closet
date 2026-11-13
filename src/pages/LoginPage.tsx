import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import {
  loginWithEmail,
  loginWithGoogle,
  mapAuthError,
  registerWithEmail,
  sendPasswordReset,
} from '@/src/firebase/auth';
import { useAuthStore } from '@/src/stores/useAuthStore';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const { user, profile, initialized } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (initialized && user) {
    return <Navigate to={profile?.avatarConfig ? '/closet' : '/onboarding'} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      const nextProfile =
        mode === 'login'
          ? await loginWithEmail(email, password)
          : await registerWithEmail(name, email, password);
      useAuthStore.getState().setProfile(nextProfile);
    } catch (error) {
      setErrorMsg(mapAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const nextProfile = await loginWithGoogle();
      if (nextProfile) {
        useAuthStore.getState().setProfile(nextProfile);
      }
    } catch (error) {
      setErrorMsg(mapAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setErrorMsg(null);
    setInfoMsg(null);
    if (!email.trim()) {
      setErrorMsg('Escribe tu correo electrónico arriba para enviarte el enlace de recuperación.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setInfoMsg('Te enviamos un correo para restablecer tu contraseña.');
    } catch (error) {
      setErrorMsg(mapAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFBFD] text-[#4A4458] flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Editorial Left Panel */}
        <section className="lg:col-span-6 rounded-3xl bg-[#E6E0F8]/55 p-8 sm:p-10 flex flex-col justify-between border border-[#E6E0F8]">
          <div className="space-y-6">
            <span className="font-display text-2xl font-bold tracking-tight text-[#4A4458]">
              Closetly
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight text-[#4A4458] text-balance">
              Tu guardarropa digital, ordenado y listo para combinar.
            </h1>
            <p className="text-base leading-relaxed text-[#6B6580] max-w-md">
              Fotografía tus prendas, limpia el fondo en segundos y arma looks por capas sobre tu
              maniquí 2D personalizado.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-[#4A4458]/10 grid grid-cols-3 gap-4 text-left">
            <div className="rounded-2xl bg-[#FFFBFD]/85 p-3.5">
              <p className="font-display text-sm font-semibold text-[#4A4458]">Recorte local</p>
              <p className="text-xs text-[#6B6580] mt-1">Con pincel de ajuste fino</p>
            </div>
            <div className="rounded-2xl bg-[#FADADD]/45 p-3.5">
              <p className="font-display text-sm font-semibold text-[#4A4458]">Armador 2D</p>
              <p className="text-xs text-[#6B6580] mt-1">Capas y accesorios</p>
            </div>
            <div className="rounded-2xl bg-[#D5F5E3]/55 p-3.5">
              <p className="font-display text-sm font-semibold text-[#4A4458]">Modo offline</p>
              <p className="text-xs text-[#6B6580] mt-1">Closet siempre contigo</p>
            </div>
          </div>
        </section>

        {/* Auth Form Card */}
        <section className="lg:col-span-6 rounded-3xl bg-white p-6 sm:p-10 shadow-soft border border-[#E6E0F8] flex flex-col justify-center">
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#E6E0F8]/45 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#4A4458] shadow-sm'
                  : 'text-[#6B6580] hover:text-[#4A4458]'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#4A4458] shadow-sm'
                  : 'text-[#6B6580] hover:text-[#4A4458]'
              }`}
            >
              Crear cuenta
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] hover:bg-[#E6E0F8]/35 text-[#4A4458] text-sm font-semibold flex items-center justify-center gap-3 transition-colors disabled:opacity-60"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Continuar con Google</span>
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-[#6B6580]">
            <div className="flex-1 h-px bg-[#E6E0F8]" />
            <span>o con tu correo</span>
            <div className="flex-1 h-px bg-[#E6E0F8]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-sm font-medium text-[#4A4458] mb-1.5">
                  Nombre
                </label>
                <div className="relative">
                  <UserIcon
                    className="w-4 h-4 text-[#6B6580] absolute left-3.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-name"
                    type="text"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] placeholder:text-[#6B6580]/70"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-[#4A4458] mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-[#6B6580] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] placeholder:text-[#6B6580]/70"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="auth-password" className="block text-sm font-medium text-[#4A4458]">
                  Contraseña
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-xs font-semibold text-[#5E51AE] hover:underline py-1"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-[#6B6580] absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] placeholder:text-[#6B6580]/70"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-2xl bg-[#FADADD]/60 border border-[#FADADD] px-4 py-3 text-sm text-[#4A4458]"
              >
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="rounded-2xl bg-[#D5F5E3]/70 border border-[#D5F5E3] px-4 py-3 text-sm text-[#4A4458]"
              >
                {infoMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {submitting
                ? 'Procesando...'
                : mode === 'login'
                  ? 'Entrar a mi closet'
                  : 'Crear cuenta y empezar'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
