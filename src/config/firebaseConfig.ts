// Safe Firebase Configuration Loader
// Protects secrets so the repository is 100% safe to push to GitHub.
// Priority:
// 1. Vite Environment variables (VITE_FIREBASE_*)
// 2. Local firebase-applet-config.json if present
// 3. Safe fallback defaults (enables offline & Guest mode without crashing)

export interface FirebaseConfigShape {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
}

const safeFallback: FirebaseConfigShape = {
  projectId: 'apex-velocity-f1',
  appId: '1:000000000000:web:000000000000',
  apiKey: 'AIzaSy_GUEST_FALLBACK_KEY',
  authDomain: 'apex-velocity-f1.firebaseapp.com',
  firestoreDatabaseId: '(default)',
  storageBucket: 'apex-velocity-f1.firebasestorage.app',
  messagingSenderId: '000000000000',
};

declare const __LOCAL_FIREBASE_CONFIG__: Partial<FirebaseConfigShape> | null | undefined;

// Check if local config was injected by vite.config.ts (works even when firebase-applet-config.json is in .gitignore)
let fileConfig: Partial<FirebaseConfigShape> = {};
try {
  if (typeof __LOCAL_FIREBASE_CONFIG__ !== 'undefined' && __LOCAL_FIREBASE_CONFIG__) {
    fileConfig = __LOCAL_FIREBASE_CONFIG__;
  }
} catch {
  // Ignored in git - running on clean clone
}

const env =
  typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;

export const resolvedFirebaseConfig: FirebaseConfigShape = {
  projectId:
    env?.VITE_FIREBASE_PROJECT_ID ||
    fileConfig.projectId ||
    safeFallback.projectId,
  appId: env?.VITE_FIREBASE_APP_ID || fileConfig.appId || safeFallback.appId,
  apiKey:
    env?.VITE_FIREBASE_API_KEY || fileConfig.apiKey || safeFallback.apiKey,
  authDomain:
    env?.VITE_FIREBASE_AUTH_DOMAIN ||
    fileConfig.authDomain ||
    safeFallback.authDomain,
  firestoreDatabaseId:
    env?.VITE_FIREBASE_DATABASE_ID ||
    fileConfig.firestoreDatabaseId ||
    safeFallback.firestoreDatabaseId,
  storageBucket:
    env?.VITE_FIREBASE_STORAGE_BUCKET ||
    fileConfig.storageBucket ||
    safeFallback.storageBucket,
  messagingSenderId:
    env?.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    fileConfig.messagingSenderId ||
    safeFallback.messagingSenderId,
};

export default resolvedFirebaseConfig;
