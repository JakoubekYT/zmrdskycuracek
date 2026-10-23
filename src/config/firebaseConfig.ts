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

// Check if bundled config is present locally without hard-importing it
let fileConfig: Partial<FirebaseConfigShape> = {};
try {
  const modules = import.meta.glob('../../*.json', { eager: true });
  const appletConfig = modules['../../firebase-applet-config.json'] as
    | { default?: FirebaseConfigShape }
    | FirebaseConfigShape
    | undefined;
  if (appletConfig) {
    fileConfig = (appletConfig as any).default || appletConfig;
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
