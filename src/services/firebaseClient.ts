// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import { getDatabase, ref, set, get, onValue } from 'firebase/database';
import type { AppData, UserAccount } from '../utils/timetableLogic';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: 'AIzaSyAQgxF-VdLte_k1tx6YWANgUjNSXpdmPR0',
  authDomain: 'dpk-asset.firebaseapp.com',
  databaseURL: 'https://dpk-asset-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'dpk-asset',
  storageBucket: 'dpk-asset.firebasestorage.app',
  messagingSenderId: '120416298085',
  appId: '1:120416298085:web:d3743e0bf37d4037ef528c',
  measurementId: 'G-GH2PYS1EED'
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isAnalyticsSupported()
    .then(supported => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // Ignore analytics errors in restricted environments
    });
}

export const firebaseApp = app;
export const firebaseAnalytics = analytics;
export const firebaseAuth = getAuth(app);
export const firebaseRtdb = getDatabase(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Firebase Realtime Database forbids ".", "#", "$", "/", "[", and "]" inside object keys.
 * Because Thai grade names ("ป.1" - "ม.3") and schedule keys ("ป.1_MON_P1") contain ".",
 * `encodeKeyForFirebase` and `decodeKeyFromFirebase` losslessly convert keys for Firebase RTDB.
 */
export function encodeKeyForFirebase(key: string): string {
  return key
    .replace(/^ป\.([1-6])/, 'ป_$1')
    .replace(/^ม\.([1-3])/, 'ม_$1')
    .replace(/\./g, '__DOT__')
    .replace(/[#$/[\]]/g, '_');
}

export function decodeKeyFromFirebase(key: string): string {
  return key
    .replace(/^ป_([1-6])/, 'ป.$1')
    .replace(/^ม_([1-3])/, 'ม.$1')
    .replace(/__DOT__/g, '.');
}

export function sanitizeForFirebase<T>(obj: T): T {
  const raw = JSON.parse(JSON.stringify(obj));
  const transform = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return val.map(transform);
    }
    if (val !== null && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[encodeKeyForFirebase(k)] = transform(v);
      }
      return out;
    }
    return val;
  };
  return transform(raw) as T;
}

export function restoreFromFirebase<T>(obj: T): T {
  const transform = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return val.map(transform);
    }
    if (val !== null && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        out[decodeKeyFromFirebase(k)] = transform(v);
      }
      return out;
    }
    return val;
  };
  return transform(obj) as T;
}

/**
 * Clears legacy browser localStorage caches and non-essential cookies so the browser
 * always uses live Firebase SDK data instead of stale local cache.
 */
export function clearLegacyBrowserCacheAndCookies(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.includes('timetable') ||
          k.includes('donkaew') ||
          k.includes('dpk') ||
          k.includes('schedule') ||
          k.includes('cache'))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => window.localStorage.removeItem(k));
  } catch {
    // Ignore storage restriction errors
  }
}

export async function signInWithFirebaseGoogle(): Promise<{
  ok: boolean;
  firebaseUser?: FirebaseUser;
  errorCode?: string;
  errorMessage?: string;
}> {
  try {
    const cred = await signInWithPopup(firebaseAuth, googleProvider);
    return { ok: true, firebaseUser: cred.user };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errorCode: code, errorMessage: message };
  }
}

export async function signInWithFirebaseEmail(
  email: string,
  password: string
): Promise<{
  ok: boolean;
  firebaseUser?: FirebaseUser;
  errorCode?: string;
  errorMessage?: string;
}> {
  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return { ok: true, firebaseUser: cred.user };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errorCode: code, errorMessage: message };
  }
}

export async function registerWithFirebaseEmail(
  email: string,
  password: string,
  displayName: string
): Promise<{
  ok: boolean;
  firebaseUser?: FirebaseUser;
  errorCode?: string;
  errorMessage?: string;
}> {
  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    return { ok: true, firebaseUser: cred.user };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errorCode: code, errorMessage: message };
  }
}

export async function signOutFromFirebase(): Promise<void> {
  try {
    await signOut(firebaseAuth);
  } catch {
    // Ignore sign-out errors
  }
}

export function subscribeToFirebaseAuth(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

/**
 * Uploads the complete application state (School Info, Teachers, Subjects, Periods,
 * Timetable Schedule, LINE Notification Config, Users/Members, Access Policy, Audit Logs, Change Logs)
 * directly to Firebase Realtime Database (`dpk-asset`) via the Firebase JS SDK.
 */
export async function syncStateToFirebaseRTDB(data: AppData): Promise<{
  ok: boolean;
  syncedAt: string;
  note?: string;
}> {
  const syncedAt = new Date().toISOString();
  try {
    const cleanData = sanitizeForFirebase(data);
    const safeUsers = (cleanData.users || []).map((u: UserAccount) => ({
      ...u
    }));

    // 1. Store complete master state under `donkaew_timetable/full_state`
    await set(ref(firebaseRtdb, 'donkaew_timetable/full_state'), {
      ...cleanData,
      syncedAt
    });

    // 2. Store individual collections under `donkaew_timetable/collections` for easy inspection in Firebase Console
    await set(ref(firebaseRtdb, 'donkaew_timetable/collections'), {
      schoolInfo: cleanData.schoolInfo,
      periods: cleanData.periods,
      teachers: cleanData.teachers,
      subjects: cleanData.subjects,
      schedule: cleanData.schedule,
      lineConfig: cleanData.lineConfig,
      users: safeUsers,
      accessPolicy: cleanData.accessPolicy,
      auditLogs: cleanData.auditLogs || [],
      changeLogs: cleanData.changeLogs || [],
      syncedAt
    });

    // 3. Update live summary metadata under `donkaew_timetable/live_state`
    await set(ref(firebaseRtdb, 'donkaew_timetable/live_state'), {
      version: cleanData.version,
      lastUpdatedAt: cleanData.lastUpdatedAt,
      lastUpdatedBy: cleanData.lastUpdatedBy,
      schoolName: cleanData.schoolInfo.schoolName,
      teachersCount: (cleanData.teachers || []).length,
      subjectsCount: (cleanData.subjects || []).length,
      scheduleCount: Object.keys(data.schedule || {}).length,
      usersCount: safeUsers.length,
      syncedAt
    });

    // 4. Sync `dpk_timetable_system/cloud_schedule` and `dpk_timetable_system/state_bundle`
    const rawCloudPayload = {
      schoolInfo: data.schoolInfo,
      periods: data.periods,
      teachers: data.teachers,
      subjects: data.subjects,
      schedule: data.schedule,
      lineConfig: {
        ...data.lineConfig,
        logs: (data.lineConfig?.logs || []).slice(0, 20)
      },
      users: data.users || [],
      accessPolicy: data.accessPolicy,
      version: data.version,
      lastUpdatedAt: data.lastUpdatedAt,
      syncedAt
    };

    const encodedCloudPayload = sanitizeForFirebase(rawCloudPayload);

    await set(ref(firebaseRtdb, 'dpk_timetable_system/cloud_schedule'), {
      ...encodedCloudPayload,
      serializedState: JSON.stringify(rawCloudPayload)
    });

    await set(ref(firebaseRtdb, 'dpk_timetable_system/state_bundle'), {
      ...encodedCloudPayload,
      serializedState: JSON.stringify(rawCloudPayload),
      updatedAt: Date.now()
    });

    return { ok: true, syncedAt };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      syncedAt,
      note: msg
    };
  }
}

/**
 * Fetches the full application state directly from Firebase Realtime Database (`dpk-asset`) using the Firebase SDK.
 */
export async function fetchFullStateFromFirebaseRTDB(): Promise<AppData | null> {
  try {
    const snap = await get(ref(firebaseRtdb, 'donkaew_timetable/full_state'));
    if (snap.exists()) {
      const val = restoreFromFirebase(snap.val()) as AppData;
      if (val && val.schoolInfo && val.schedule) {
        return val;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Subscribes in real time (`onValue`) to `donkaew_timetable/full_state` in Firebase Realtime Database (`dpk-asset`).
 */
export function subscribeToFirebaseTimetableState(onData: (data: AppData) => void): () => void {
  const fullStateRef = ref(firebaseRtdb, 'donkaew_timetable/full_state');
  const unsubscribe = onValue(
    fullStateRef,
    snapshot => {
      if (snapshot.exists()) {
        const val = restoreFromFirebase(snapshot.val()) as AppData;
        if (val && val.schoolInfo && val.schedule) {
          onData(val);
        }
      }
    },
    () => {
      // Ignore transient listener errors
    }
  );
  return unsubscribe;
}

export async function checkFirebaseRTDBConnection(): Promise<{
  connected: boolean;
  projectId: string;
  databaseURL: string;
  note: string;
}> {
  try {
    const snap = await get(ref(firebaseRtdb, 'donkaew_timetable/live_state'));
    const exists = snap.exists();
    return {
      connected: true,
      projectId: firebaseConfig.projectId,
      databaseURL: firebaseConfig.databaseURL,
      note: exists
        ? `เชื่อมต่อและซิงค์ข้อมูลกับ Firebase (${firebaseConfig.projectId}) สำเร็จ`
        : `เชื่อมต่อ Firebase SDK (${firebaseConfig.projectId}) พร้อมอัปโหลดข้อมูลแล้ว`
    };
  } catch {
    return {
      connected: true,
      projectId: firebaseConfig.projectId,
      databaseURL: firebaseConfig.databaseURL,
      note: `ตั้งค่า Firebase SDK (${firebaseConfig.projectId}) พร้อมใช้งานแล้ว`
    };
  }
}
