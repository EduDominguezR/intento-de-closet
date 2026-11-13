import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import appletConfig from '@/firebase-applet-config.json';

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  }
}

const resolvedConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId,
};

const firestoreDatabaseId =
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
  appletConfig.firestoreDatabaseId ||
  '(default)';

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(resolvedConfig);

function createFirestoreInstance(app: FirebaseApp, databaseId: string): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      databaseId,
    );
  } catch {
    return getFirestore(app, databaseId);
  }
}

export const db: Firestore = createFirestoreInstance(firebaseApp, firestoreDatabaseId);
export const auth: Auth = getAuth(firebaseApp);
export const storage: FirebaseStorage = getStorage(firebaseApp);

function initAppCheck(app: FirebaseApp): AppCheck | null {
  const siteKey = import.meta.env.VITE_APPCHECK_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey || typeof window === 'undefined') {
    return null;
  }

  if (import.meta.env.DEV) {
    window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('App Check no pudo inicializarse:', error);
    return null;
  }
}

export const appCheck: AppCheck | null = initAppCheck(firebaseApp);

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Verifica tu configuración de Firebase: el cliente está offline.');
    }
  }
}

void testFirestoreConnection();
