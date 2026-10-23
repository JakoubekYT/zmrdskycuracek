import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { TireCompound } from './game/physics';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot as required
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface DriverStandingRecord {
  uid: string;
  userId: string;
  displayName: string;
  photoURL: string;
  wins: number;
  racesCompleted: number;
  podiums: number;
  bestTrackName: string;
  favoriteCarName: string;
  bestLapTimeMs?: number | null;
}

export interface TrackLapRecordEntry {
  recordId: string;
  userId: string;
  displayName: string;
  photoURL: string;
  trackId: string;
  trackName: string;
  carName: string;
  tireCompound: TireCompound;
  lapTimeMs: number;
}

export type HallOfFameDriverDoc = DriverStandingRecord;
export type HallOfFameLapDoc = TrackLapRecordEntry;

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'default';
}

export async function signInWithGooglePopup(): Promise<User | null> {
  const result = await signInWithPopup(auth, googleProvider);
  if (result.user) {
    await ensureDriverProfileExists(result.user);
  }
  return result.user;
}

export async function signOutGoogleUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function ensureDriverProfileExists(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid);
  const path = `hall_of_fame_drivers/${uid}`;
  const ref = doc(db, 'hall_of_fame_drivers', uid);
  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!exists) {
    const cleanName =
      (user.displayName || 'Jezdec F1').trim().slice(0, 40) || 'Jezdec F1';
    const cleanPhoto = (user.photoURL || '').slice(0, 500);
    try {
      await setDoc(ref, {
        userId: uid,
        displayName: cleanName,
        photoURL: cleanPhoto,
        wins: 0,
        racesCompleted: 0,
        podiums: 0,
        bestTrackName: 'Alpský Autodrom GP',
        favoriteCarName: 'Scuderia Apex SF-26',
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function recordRaceResultInHallOfFame(
  userOrParams:
    | User
    | {
        user: User;
        driverName?: string;
        trackId: string;
        trackName: string;
        carName: string;
        tireCompound: TireCompound;
        position: number;
        bestLapMs?: number | null;
        bestLapTimeMs?: number | null;
      },
  maybeDetails?: {
    driverName?: string;
    trackId: string;
    trackName: string;
    carName: string;
    tireCompound: TireCompound;
    position: number;
    bestLapMs?: number | null;
    bestLapTimeMs?: number | null;
  }
): Promise<void> {
  const user: User =
    'uid' in userOrParams ? userOrParams : userOrParams.user;
  const details =
    'uid' in userOrParams ? maybeDetails! : userOrParams;

  if (!user || !user.emailVerified || !details) return;

  const {
    driverName,
    trackId,
    trackName,
    carName,
    tireCompound,
    position,
  } = details;
  const bestLapMs = details.bestLapMs ?? details.bestLapTimeMs ?? null;

  const uid = sanitizeId(user.uid);
  const cleanName =
    (driverName || user.displayName || 'Jezdec F1').trim().slice(0, 40) ||
    'Jezdec F1';
  const cleanPhoto = (user.photoURL || '').slice(0, 500);
  const cleanTrackId = sanitizeId(trackId).slice(0, 40);
  const cleanTrackName = trackName.trim().slice(0, 60) || 'Okruh F1';
  const cleanCarName = carName.trim().slice(0, 60) || 'Monopost F1';
  const validCompound: TireCompound = ['soft', 'medium', 'hard', 'wet'].includes(
    tireCompound
  )
    ? tireCompound
    : 'soft';

  // 1. Update Career Driver Standing (Most Wins / Podiums / Races)
  const driverPath = `hall_of_fame_drivers/${uid}`;
  const driverRef = doc(db, 'hall_of_fame_drivers', uid);
  let snap;
  try {
    snap = await getDoc(driverRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, driverPath);
  }

  const won = position === 1 ? 1 : 0;
  const podium = position <= 3 ? 1 : 0;
  if (!snap.exists()) {
    try {
      await setDoc(driverRef, {
        userId: uid,
        displayName: cleanName,
        photoURL: cleanPhoto,
        wins: won,
        racesCompleted: 1,
        podiums: podium,
        bestTrackName: cleanTrackName,
        favoriteCarName: cleanCarName,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, driverPath);
    }
  } else {
    const existing = snap.data();
    const nextWins = Math.min(100000, Math.round(Number(existing.wins || 0) + won));
    const nextRaces = Math.min(
      100000,
      Math.round(Number(existing.racesCompleted || 0) + 1)
    );
    const nextPodiums = Math.min(
      100000,
      Math.round(Number(existing.podiums || 0) + podium)
    );
    try {
      await updateDoc(driverRef, {
        displayName: cleanName,
        photoURL: cleanPhoto,
        wins: nextWins,
        racesCompleted: nextRaces,
        podiums: nextPodiums,
        bestTrackName: cleanTrackName,
        favoriteCarName: cleanCarName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, driverPath);
    }
  }

  // 2. Update Circuit Fastest Lap Record if a valid lap was completed
  if (bestLapMs !== null && Number.isFinite(bestLapMs) && bestLapMs >= 5000) {
    const clampedLapMs = Math.max(5000, Math.min(600000, Math.round(bestLapMs)));
    const recordId = `${uid}_${cleanTrackId}`.slice(0, 120);
    const lapPath = `hall_of_fame_laps/${recordId}`;
    const lapRef = doc(db, 'hall_of_fame_laps', recordId);
    let lapSnap;
    try {
      lapSnap = await getDoc(lapRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, lapPath);
    }
    if (!lapSnap.exists()) {
      try {
        await setDoc(lapRef, {
          userId: uid,
          displayName: cleanName,
          photoURL: cleanPhoto,
          trackId: cleanTrackId,
          trackName: cleanTrackName,
          carName: cleanCarName,
          tireCompound: validCompound,
          lapTimeMs: clampedLapMs,
          visibility: 'public',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, lapPath);
      }
    } else {
      const prevBest = Number(lapSnap.data().lapTimeMs || 999999);
      if (clampedLapMs <= prevBest) {
        try {
          await updateDoc(lapRef, {
            displayName: cleanName,
            photoURL: cleanPhoto,
            trackName: cleanTrackName,
            carName: cleanCarName,
            tireCompound: validCompound,
            lapTimeMs: clampedLapMs,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, lapPath);
        }
      }
    }
  }
}

export async function recordSingleLapInHallOfFame(
  userOrParams:
    | User
    | {
        user: User;
        driverName?: string;
        trackId: string;
        trackName: string;
        carName: string;
        tireCompound: TireCompound;
        lapTimeMs: number;
      },
  trackIdArg?: string,
  trackNameArg?: string,
  lapTimeMsArg?: number,
  carNameArg?: string,
  tireCompoundArg?: TireCompound
): Promise<void> {
  const user: User =
    'uid' in userOrParams ? userOrParams : userOrParams.user;
  const trackId =
    'uid' in userOrParams ? trackIdArg || 'alpine-gp' : userOrParams.trackId;
  const trackName =
    'uid' in userOrParams
      ? trackNameArg || 'Alpský Autodrom GP'
      : userOrParams.trackName;
  const lapTimeMs =
    'uid' in userOrParams ? Number(lapTimeMsArg) : userOrParams.lapTimeMs;
  const carName =
    'uid' in userOrParams
      ? carNameArg || 'Scuderia Apex SF-26'
      : userOrParams.carName;
  const tireCompound =
    ('uid' in userOrParams ? tireCompoundArg : userOrParams.tireCompound) ||
    'soft';
  const driverName =
    'uid' in userOrParams ? user.displayName || undefined : userOrParams.driverName;

  if (!user || !user.emailVerified || !Number.isFinite(lapTimeMs) || lapTimeMs < 5000) {
    return;
  }
  const uid = sanitizeId(user.uid);
  const cleanName =
    (driverName || user.displayName || 'Jezdec F1').trim().slice(0, 40) ||
    'Jezdec F1';
  const cleanPhoto = (user.photoURL || '').slice(0, 500);
  const cleanTrackId = sanitizeId(trackId).slice(0, 40);
  const cleanTrackName = trackName.trim().slice(0, 60) || 'Okruh F1';
  const cleanCarName = carName.trim().slice(0, 60) || 'Monopost F1';
  const validCompound: TireCompound = ['soft', 'medium', 'hard', 'wet'].includes(
    tireCompound
  )
    ? tireCompound
    : 'soft';
  const clampedLapMs = Math.max(5000, Math.min(600000, Math.round(lapTimeMs)));
  const recordId = `${uid}_${cleanTrackId}`.slice(0, 120);
  const lapPath = `hall_of_fame_laps/${recordId}`;
  const lapRef = doc(db, 'hall_of_fame_laps', recordId);

  let lapSnap;
  try {
    lapSnap = await getDoc(lapRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, lapPath);
  }

  if (!lapSnap.exists()) {
    try {
      await setDoc(lapRef, {
        userId: uid,
        displayName: cleanName,
        photoURL: cleanPhoto,
        trackId: cleanTrackId,
        trackName: cleanTrackName,
        carName: cleanCarName,
        tireCompound: validCompound,
        lapTimeMs: clampedLapMs,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, lapPath);
    }
  } else {
    const prevBest = Number(lapSnap.data().lapTimeMs || 999999);
    if (clampedLapMs < prevBest) {
      try {
        await updateDoc(lapRef, {
          displayName: cleanName,
          photoURL: cleanPhoto,
          trackName: cleanTrackName,
          carName: cleanCarName,
          tireCompound: validCompound,
          lapTimeMs: clampedLapMs,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, lapPath);
      }
    }
  }
}

export function subscribeHallOfFameData(
  onDrivers: (drivers: DriverStandingRecord[]) => void,
  onLaps: (laps: TrackLapRecordEntry[]) => void
): () => void {
  const driversQuery = query(
    collection(db, 'hall_of_fame_drivers'),
    where('visibility', '==', 'public')
  );
  const lapsQuery = query(
    collection(db, 'hall_of_fame_laps'),
    where('visibility', '==', 'public')
  );

  const unsubDrivers = onSnapshot(
    driversQuery,
    (snapshot) => {
      const list: DriverStandingRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const uid = String(d.userId || docSnap.id);
        list.push({
          uid,
          userId: uid,
          displayName: String(d.displayName || 'Jezdec F1'),
          photoURL: String(d.photoURL || ''),
          wins: Number(d.wins || 0),
          racesCompleted: Number(d.racesCompleted || 0),
          podiums: Number(d.podiums || 0),
          bestTrackName: String(d.bestTrackName || 'Alpský Autodrom GP'),
          favoriteCarName: String(d.favoriteCarName || 'Scuderia Apex SF-26'),
        });
      });
      list.sort(
        (a, b) =>
          b.wins - a.wins ||
          b.podiums - a.podiums ||
          b.racesCompleted - a.racesCompleted
      );
      onDrivers(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'hall_of_fame_drivers');
    }
  );

  const unsubLaps = onSnapshot(
    lapsQuery,
    (snapshot) => {
      const list: TrackLapRecordEntry[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          recordId: docSnap.id,
          userId: String(d.userId || ''),
          displayName: String(d.displayName || 'Jezdec F1'),
          photoURL: String(d.photoURL || ''),
          trackId: String(d.trackId || 'alpine-gp'),
          trackName: String(d.trackName || 'Alpský Autodrom GP'),
          carName: String(d.carName || 'Scuderia Apex SF-26'),
          tireCompound: (['soft', 'medium', 'hard', 'wet'].includes(
            d.tireCompound
          )
            ? d.tireCompound
            : 'soft') as TireCompound,
          lapTimeMs: Number(d.lapTimeMs || 45000),
        });
      });
      list.sort((a, b) => a.lapTimeMs - b.lapTimeMs);
      onLaps(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'hall_of_fame_laps');
    }
  );

  return () => {
    unsubDrivers();
    unsubLaps();
  };
}
