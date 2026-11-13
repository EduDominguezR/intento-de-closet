import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '@/src/firebase/config';
import { ensureUserProfile } from '@/src/firebase/firestore';
import type { UserProfile } from '@/src/types/models';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/cancelled-popup-request',
]);

export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return ensureUserProfile(credential.user);
}

export async function registerWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<UserProfile> {
  const cleanName = name.trim().slice(0, 80);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (cleanName) {
    await updateProfile(credential.user, { displayName: cleanName });
  }
  return ensureUserProfile(credential.user, cleanName);
}

export async function loginWithGoogle(): Promise<UserProfile | null> {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return ensureUserProfile(credential.user);
  } catch (error) {
    if (error instanceof FirebaseError && POPUP_FALLBACK_CODES.has(error.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

export async function consumeGoogleRedirectResult(): Promise<UserCredential | null> {
  const result = await getRedirectResult(auth);
  if (result?.user) {
    await ensureUserProfile(result.user);
  }
  return result;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function mapAuthError(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado al iniciar sesión.';
  }

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta registrada con este correo.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico no es válido.';
    case 'auth/popup-closed-by-user':
      return 'Cerraste la ventana de Google antes de completar el acceso.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    case 'auth/network-request-failed':
      return 'Sin conexión a internet. Verifica tu red e intenta de nuevo.';
    default:
      return 'No se pudo completar la autenticación. Intenta de nuevo.';
  }
}
