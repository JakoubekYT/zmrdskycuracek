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
import { resolvedFirebaseConfig } from './config/firebaseConfig';
import { TireCompound } from './game/physics';

const app = initializeApp(resolvedFirebaseConfig);
export const db = getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId);
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

export interface GoogleAuthResult {
  user: User | null;
  error?: string;
  unauthorizedDomain?: boolean;
  domainName?: string;
}

export async function signInWithGooglePopup(): Promise<GoogleAuthResult> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      await ensureDriverProfileExists(result.user);
    }
    return { user: result.user };
  } catch (error: any) {
    const code = String(error?.code || '');
    const msg = String(error?.message || '');
    const currentDomain =
      typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
      console.warn(
        `[Firebase Auth] Doména '${currentDomain}' není v seznamu Authorized Domains Firebase projektu.`
      );
      return {
        user: null,
        error: `Doména "${currentDomain}" zatím není autorizována v Google Firebase Console. V aplikaci můžeš okamžitě závodit a hrát online multiplayer jako Hostující pilot!`,
        unauthorizedDomain: true,
        domainName: currentDomain,
      };
    }

    if (code === 'auth/popup-blocked') {
      return {
        user: null,
        error: 'Vyskakovací okno Google přihlášení bylo zablokováno prohlížečem.',
      };
    }

    return {
      user: null,
      error: error instanceof Error ? error.message : 'Chyba přihlášení',
    };
  }
}

export async function signOutGoogleUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function ensureDriverProfileExists(user: User): Promise<void> {
  const isGoogle = user.providerData?.some((p) => p.providerId === 'google.com');
  if (!user.emailVerified && !isGoogle) return;
  const uid = sanitizeId(user.uid);
  const ref = doc(db, 'hall_of_fame_drivers', uid);
  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (error) {
    console.warn('[Firestore] Nelze načíst profil jezdce:', error);
    return;
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
      console.warn('[Firestore] Nelze vytvořit profil jezdce:', error);
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
      console.warn('[Firestore] Hall of Fame drivers listener warning:', error);
      onDrivers([]);
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
      console.warn('[Firestore] Hall of Fame laps listener warning:', error);
      onLaps([]);
    }
  );

  return () => {
    unsubDrivers();
    unsubLaps();
  };
}

// ============================================================================
// REAL-TIME FIRESTORE MULTIPLAYER CLOUD LOBBIES (CROSS-DEVICE / VERCEL COMPATIBLE)
// ============================================================================

export interface CloudPlayerDTO {
  id: string;
  name: string;
  carSpecId: string;
  colorHex: number;
  tireCompound?: TireCompound;
  isReady: boolean;
  isHost: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedKmh: number;
  steerAngle: number;
  chassisPitch: number;
  chassisRoll: number;
  isDrifting: boolean;
  nitroActive: boolean;
  lap: number;
  totalDistanceDriven: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface CloudChatMessageDTO {
  id: string;
  senderName: string;
  senderColorHex: number;
  text: string;
  timestamp: number;
}

export interface CloudLobbyDTO {
  roomId: string;
  hostId: string;
  trackId: string;
  totalLaps: number;
  botCount: number;
  botDifficulty: 'easy' | 'medium' | 'hard';
  status: 'waiting' | 'racing' | 'finished';
  raceStartedAt: number | null;
  players: CloudPlayerDTO[];
  chatMessages?: CloudChatMessageDTO[];
  createdAt?: number;
  updatedAt?: number;
}

export interface CloudLobbySummary {
  roomId: string;
  trackId: string;
  totalLaps: number;
  botCount: number;
  status: string;
  playerCount: number;
  hostName: string;
}

export async function createCloudLobby(room: CloudLobbyDTO): Promise<string> {
  const roomId = sanitizeId(room.roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', roomId);
  const now = Date.now();
  await setDoc(ref, {
    roomId,
    hostId: room.hostId,
    trackId: room.trackId,
    totalLaps: room.totalLaps,
    botCount: room.botCount,
    botDifficulty: room.botDifficulty,
    status: room.status,
    raceStartedAt: room.raceStartedAt,
    players: room.players,
    chatMessages: (room.chatMessages || []).slice(-25),
    createdAt: now,
    updatedAt: now,
  });
  return roomId;
}

export async function joinCloudLobby(
  roomId: string,
  player: CloudPlayerDTO
): Promise<CloudLobbyDTO | null> {
  const cleanId = sanitizeId(roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', cleanId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  const existingPlayers: CloudPlayerDTO[] = Array.isArray(data.players)
    ? data.players
    : [];
  const filtered = existingPlayers.filter((p) => p.id !== player.id);
  filtered.push(player);

  const updatedChat: CloudChatMessageDTO[] = Array.isArray(data.chatMessages)
    ? data.chatMessages
    : [];
  updatedChat.push({
    id: `join-${Date.now()}`,
    senderName: 'FIA Box',
    senderColorHex: 0x22c55e,
    text: `Pilot ${player.name} se připojil na startovní rošt!`,
    timestamp: Date.now(),
  });

  const now = Date.now();
  await updateDoc(ref, {
    players: filtered,
    chatMessages: updatedChat.slice(-25),
    updatedAt: now,
  });

  return {
    roomId: cleanId,
    hostId: String(data.hostId || player.id),
    trackId: String(data.trackId || 'alpine-gp'),
    totalLaps: Number(data.totalLaps || 3),
    botCount: Number(data.botCount ?? 4),
    botDifficulty: data.botDifficulty || 'medium',
    status: data.status || 'waiting',
    raceStartedAt: data.raceStartedAt || null,
    players: filtered,
    chatMessages: updatedChat.slice(-25),
    updatedAt: now,
  };
}

export async function leaveCloudLobby(
  roomId: string,
  playerId: string
): Promise<void> {
  const cleanId = sanitizeId(roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', cleanId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const existing: CloudPlayerDTO[] = Array.isArray(data.players)
    ? data.players
    : [];
  const remaining = existing.filter((p) => p.id !== playerId);
  let newHostId = data.hostId;
  if (data.hostId === playerId && remaining.length > 0) {
    newHostId = remaining[0].id;
    remaining[0].isHost = true;
  }
  await updateDoc(ref, {
    players: remaining,
    hostId: newHostId,
    updatedAt: Date.now(),
  });
}

export async function updateCloudRoom(
  roomId: string,
  patch: Partial<CloudLobbyDTO>
): Promise<void> {
  const cleanId = sanitizeId(roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', cleanId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function updateCloudPlayerTelemetry(
  roomId: string,
  player: CloudPlayerDTO
): Promise<void> {
  const cleanId = sanitizeId(roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', cleanId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const list: CloudPlayerDTO[] = Array.isArray(data.players) ? data.players : [];
  const idx = list.findIndex((p) => p.id === player.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...player };
  } else {
    list.push(player);
  }
  await updateDoc(ref, {
    players: list,
    updatedAt: Date.now(),
  });
}

export async function sendCloudLobbyChat(
  roomId: string,
  message: CloudChatMessageDTO
): Promise<void> {
  const cleanId = sanitizeId(roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', cleanId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const msgs: CloudChatMessageDTO[] = Array.isArray(data.chatMessages)
    ? data.chatMessages
    : [];
  msgs.push(message);
  await updateDoc(ref, {
    chatMessages: msgs.slice(-25),
    updatedAt: Date.now(),
  });
}

export function subscribeCloudRoom(
  roomId: string,
  onUpdate: (room: CloudLobbyDTO | null) => void
): () => void {
  const cleanId = sanitizeId(roomId.toUpperCase());
  const ref = doc(db, 'multiplayer_lobbies', cleanId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const data = snap.data();
      const room: CloudLobbyDTO = {
        roomId: cleanId,
        hostId: String(data.hostId || ''),
        trackId: String(data.trackId || 'alpine-gp'),
        totalLaps: Number(data.totalLaps || 3),
        botCount: Number(data.botCount ?? 4),
        botDifficulty: data.botDifficulty || 'medium',
        status: data.status || 'waiting',
        raceStartedAt: data.raceStartedAt || null,
        players: Array.isArray(data.players) ? data.players : [],
        chatMessages: Array.isArray(data.chatMessages) ? data.chatMessages : [],
        updatedAt: Number(data.updatedAt || 0),
      };
      onUpdate(room);
    },
    (err) => {
      console.warn('[Firestore] Error subscribing to cloud room:', err);
    }
  );
}

export function subscribeCloudLobbies(
  onUpdate: (summaries: CloudLobbySummary[]) => void
): () => void {
  const colRef = collection(db, 'multiplayer_lobbies');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: CloudLobbySummary[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const updated = Number(d.updatedAt || d.createdAt || 0);
        // Display rooms active within the last 24 hours
        if (now - updated < 86400000) {
          const players: CloudPlayerDTO[] = Array.isArray(d.players)
            ? d.players
            : [];
          const hostPlayer = players.find((p) => p.id === d.hostId);
          list.push({
            roomId: docSnap.id,
            trackId: String(d.trackId || 'alpine-gp'),
            totalLaps: Number(d.totalLaps || 3),
            botCount: Number(d.botCount ?? 4),
            status: String(d.status || 'waiting'),
            playerCount: players.length,
            hostName: hostPlayer?.name || 'F1 Host',
          });
        }
      });
      list.sort(
        (a, b) => (b.status === 'waiting' ? 1 : 0) - (a.status === 'waiting' ? 1 : 0)
      );
      onUpdate(list);
    },
    (err) => {
      console.warn('[Firestore] Error listing cloud lobbies:', err);
    }
  );
}

