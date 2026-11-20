import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createDefaultAppData,
  createDefaultUsers,
  createDefaultAccessPolicy,
  verifyUserCredentials,
  autoScheduleEngine,
  buildPeriodBroadcastPayloads,
  findDuePeriodsForBackgroundAlert,
  sanitizeLineTargetId,
  DAYS,
  GRADES,
  PASTEL_PALETTE,
  type AppData,
  type UserAccount,
  type UserRole,
  type UserStatus,
  type AccessPolicy,
  type AuditLogEntry,
  type TimetableChangeNotification,
  type LineNotificationLog,
  type LineConfig
} from './src/utils/timetableLogic';
import { HighPerformanceRedisCache } from './src/utils/redisCache';
import {
  firebaseConfig,
  firebaseRtdb,
  syncStateToFirebaseRTDB,
  fetchFullStateFromFirebaseRTDB,
  sanitizeForFirebase,
  restoreFromFirebase
} from './src/services/firebaseClient';
import { ref as fbRef, get as fbGet, set as fbSet, onValue as fbOnValue } from 'firebase/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE_PATH = path.resolve(__dirname, '.timetable-db.json');
const redisCache = new HighPerformanceRedisCache(600);
let lastFirebaseSyncedAt: string = new Date().toISOString();
let isWritingToFirebase = false;

function loadPersistedDatabase(): AppData {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const raw = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && parsed.schoolInfo && parsed.schedule) {
        let needsSave = false;
        if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
          parsed.users = createDefaultUsers();
          needsSave = true;
        } else {
          const dpkAdminIdx = parsed.users.findIndex(
            u => u.username.toLowerCase() === 'dpkyst11' || u.id === 'USR_ADMIN_01'
          );
          if (dpkAdminIdx >= 0) {
            if (
              parsed.users[dpkAdminIdx].username !== 'dpkyst11' ||
              parsed.users[dpkAdminIdx].password !== 'dpkyst11' ||
              parsed.users[dpkAdminIdx].role !== 'admin'
            ) {
              parsed.users[dpkAdminIdx].username = 'dpkyst11';
              parsed.users[dpkAdminIdx].email = 'dpkyst11@donkaew.ac.th';
              parsed.users[dpkAdminIdx].password = 'dpkyst11';
              parsed.users[dpkAdminIdx].role = 'admin';
              parsed.users[dpkAdminIdx].status = 'active';
              needsSave = true;
            }
          } else {
            parsed.users.unshift(createDefaultUsers()[0]);
            needsSave = true;
          }
        }
        if (!parsed.accessPolicy) {
          parsed.accessPolicy = createDefaultAccessPolicy();
          needsSave = true;
        }
        if (!Array.isArray(parsed.auditLogs)) {
          parsed.auditLogs = [
            {
              id: 'AUD_INIT_01',
              timestamp: new Date().toISOString(),
              actorId: 'USR_ADMIN_01',
              actorName: 'นางสาวกานต์พิชชา วิชาการดี',
              actorRole: 'admin',
              action: 'USER_UPDATE',
              details: 'ตั้งค่าสิทธิ์ผู้ดูแลระบบและบัญชีสมาชิกเริ่มต้นของโรงเรียนเรียบร้อยแล้ว'
            }
          ];
          needsSave = true;
        }
        if (needsSave) {
          savePersistedDatabase(parsed);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Database read fallback to default:', err);
  }
  const initial = createDefaultAppData();
  savePersistedDatabase(initial);
  return initial;
}

function savePersistedDatabase(data: AppData, syncToFirebase = true): void {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Database write notice:', err);
  }
  if (syncToFirebase) {
    isWritingToFirebase = true;
    syncStateToFirebaseRTDB(data)
      .then(res => {
        if (res.ok) {
          lastFirebaseSyncedAt = res.syncedAt;
        }
      })
      .catch(err => {
        console.warn('Firebase RTDB sync warning:', err);
      })
      .finally(() => {
        setTimeout(() => {
          isWritingToFirebase = false;
        }, 500);
      });
  }
}

let dbState: AppData = loadPersistedDatabase();

async function bootstrapAndSyncFirebaseDatabase(broadcastCallback?: () => void): Promise<{
  ok: boolean;
  syncedAt: string;
  collectionsCount: {
    teachers: number;
    subjects: number;
    periods: number;
    scheduleSlots: number;
    users: number;
  };
}> {
  try {
    // 1. Check if `donkaew_timetable/full_state` already exists in Firebase RTDB (`dpk-asset`)
    const remoteState = await fetchFullStateFromFirebaseRTDB();
    if (
      remoteState &&
      remoteState.schoolInfo &&
      remoteState.schedule &&
      Object.keys(remoteState.schedule).length > 0 &&
      (remoteState.version || 0) >= (dbState.version || 0)
    ) {
      dbState = {
        ...dbState,
        ...remoteState,
        users: Array.isArray(remoteState.users) && remoteState.users.length > 0 ? remoteState.users : dbState.users
      };
    }

    // 2. Also merge any existing members from `dpk_timetable_system/members` in Firebase (`dpk-asset`)
    const membersSnap = await fbGet(fbRef(firebaseRtdb, 'dpk_timetable_system/members'));
    if (membersSnap.exists()) {
      const rawMembers = membersSnap.val() as Record<string, Record<string, unknown>>;
      const existingUsers = dbState.users || createDefaultUsers();
      let addedAny = false;

      for (const [mKey, mVal] of Object.entries(rawMembers)) {
        if (!mVal || typeof mVal !== 'object') continue;
        const email = String(mVal.email || '').trim().toLowerCase();
        if (!email) continue;
        const alreadyExists = existingUsers.some(u => u.email.toLowerCase() === email);
        if (!alreadyExists) {
          let decodedPass = String(mVal.password || 'dpkyst11');
          if (!mVal.password && typeof mVal.passwordHash === 'string') {
            try {
              decodedPass = Buffer.from(mVal.passwordHash, 'base64').toString('utf-8') || 'dpkyst11';
            } catch {
              decodedPass = 'dpkyst11';
            }
          }
          const prefix = String(mVal.prefix || '');
          const fullNameRaw = String(mVal.fullName || email.split('@')[0]);
          const fullName = prefix && !fullNameRaw.startsWith(prefix) ? `${prefix}${fullNameRaw}` : fullNameRaw;
          existingUsers.push({
            id: String(mVal.uid || mVal.id || `USR_${mKey}`),
            username: email.split('@')[0],
            email,
            password: decodedPass,
            fullName,
            role: mVal.role === 'admin' ? 'admin' : mVal.role === 'teacher' ? 'teacher' : 'student',
            status: mVal.status === 'approved' || mVal.status === 'active' ? 'active' : 'pending',
            assignedGrade: 'ป.1',
            teacherId: typeof mVal.linkedTeacherId === 'string' ? mVal.linkedTeacherId : 'T01',
            avatarColor: '#E2F0CB',
            authProvider: 'firebase_email',
            createdAt: typeof mVal.createdAt === 'string' ? mVal.createdAt : new Date().toISOString()
          });
          addedAny = true;
        }
      }

      if (addedAny) {
        dbState.users = existingUsers;
      }
    }

    // Ensure default admin `dpkyst11` is always present and active
    if (!Array.isArray(dbState.users)) {
      dbState.users = createDefaultUsers();
    }
    const dpkAdminIdx = dbState.users.findIndex(u => u.username.toLowerCase() === 'dpkyst11');
    if (dpkAdminIdx === -1) {
      dbState.users.unshift(createDefaultUsers()[0]);
    }

    // 3. Upload the complete, unified state to Firebase RTDB (`dpk-asset`) via Firebase SDK
    savePersistedDatabase(dbState, false);
    isWritingToFirebase = true;
    const syncRes = await syncStateToFirebaseRTDB(dbState);
    lastFirebaseSyncedAt = syncRes.syncedAt;

    // Also keep `dpk_timetable_system/members` updated with all users
    const membersMap: Record<string, unknown> = membersSnap.exists() ? { ...membersSnap.val() } : {};
    for (const u of dbState.users || []) {
      const safeKey = (u.username || u.email).replace(/[.#$/[\]@]/g, '_');
      membersMap[safeKey] = sanitizeForFirebase({
        ...(typeof membersMap[safeKey] === 'object' && membersMap[safeKey] ? membersMap[safeKey] : {}),
        id: u.id,
        uid: u.id,
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status === 'active' ? 'approved' : u.status,
        assignedGrade: u.assignedGrade || 'ป.1',
        linkedTeacherId: u.teacherId || '',
        updatedAt: syncRes.syncedAt
      });
    }
    await fbSet(fbRef(firebaseRtdb, 'dpk_timetable_system/members'), membersMap);

    setTimeout(() => {
      isWritingToFirebase = false;
    }, 500);

    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);
    if (broadcastCallback) broadcastCallback();

    return {
      ok: syncRes.ok,
      syncedAt: syncRes.syncedAt,
      collectionsCount: {
        teachers: (dbState.teachers || []).length,
        subjects: (dbState.subjects || []).length,
        periods: (dbState.periods || []).length,
        scheduleSlots: Object.keys(dbState.schedule || {}).length,
        users: (dbState.users || []).length
      }
    };
  } catch (err) {
    console.warn('Firebase bootstrap notice:', err);
    return {
      ok: false,
      syncedAt: new Date().toISOString(),
      collectionsCount: {
        teachers: (dbState.teachers || []).length,
        subjects: (dbState.subjects || []).length,
        periods: (dbState.periods || []).length,
        scheduleSlots: Object.keys(dbState.schedule || {}).length,
        users: (dbState.users || []).length
      }
    };
  }
}

// Warm up Redis cache on boot
function warmUpRedisCache(data: AppData) {
  redisCache.set('timetable:full', data, 600);
  GRADES.forEach(grade => {
    const gradeSchedule: Record<string, unknown> = {};
    Object.entries(data.schedule).forEach(([k, v]) => {
      if (k.startsWith(`${grade}_`)) {
        gradeSchedule[k] = v;
      }
    });
    const gradeSubjects = data.subjects.filter(s => s.grade === grade);
    redisCache.set(`timetable:grade:${grade}`, {
      version: data.version,
      grade,
      schedule: gradeSchedule,
      subjects: gradeSubjects,
      periods: data.periods,
      teachers: data.teachers,
      lastUpdatedAt: data.lastUpdatedAt
    }, 600);
  });
}

warmUpRedisCache(dbState);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Prevent browser from caching API responses in HTTP cache
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  interface ClientMeta {
    ws: WebSocket;
    role: 'student' | 'teacher' | 'admin';
    grade?: string;
    joinedAt: string;
  }

  const clients = new Map<WebSocket, ClientMeta>();

  function broadcastToAll(event: string, payload: unknown) {
    const message = JSON.stringify({
      event,
      payload,
      serverTime: new Date().toISOString()
    });
    for (const [client] of clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  function broadcastPresenceCount() {
    const list = Array.from(clients.values());
    const studentCount = list.filter(c => c.role === 'student').length;
    const teacherCount = list.filter(c => c.role !== 'student').length;
    broadcastToAll('presence:update', {
      totalConnected: list.length,
      studentCount,
      teacherCount
    });
  }

  wss.on('connection', (ws) => {
    clients.set(ws, {
      ws,
      role: 'student',
      grade: 'ป.1',
      joinedAt: new Date().toISOString()
    });

    // Send initial state from Redis Cache immediately on connect
    const cached = redisCache.get<AppData>('timetable:full');
    const stateToSend = cached.hit && cached.data ? cached.data : dbState;
    if (!cached.hit) {
      warmUpRedisCache(dbState);
    }

    ws.send(JSON.stringify({
      event: 'timetable:init',
      payload: {
        data: stateToSend,
        cacheStats: redisCache.getStats(),
        source: cached.hit ? 'REDIS_CACHE_HIT' : 'DB_QUERY'
      },
      serverTime: new Date().toISOString()
    }));

    broadcastPresenceCount();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'presence:role') {
          const meta = clients.get(ws);
          if (meta) {
            meta.role = msg.role || 'student';
            meta.grade = msg.grade || 'ป.1';
            broadcastPresenceCount();
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ event: 'pong', serverTime: new Date().toISOString() }));
        }
      } catch {
        // ignore malformed message
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      broadcastPresenceCount();
    });
  });

  // ==========================================
  // REST / AJAX API ENDPOINTS WITH REDIS CACHE
  // ==========================================

  // 1. Get Full Timetable State (AJAX polling & initial load with Redis Cache)
  app.get('/api/timetable', (req, res) => {
    const clientVersion = Number(req.query.version || 0);
    const cached = redisCache.get<AppData>('timetable:full');

    let data: AppData;
    let cacheSource: 'HIT' | 'MISS' = 'HIT';

    if (cached.hit && cached.data) {
      data = cached.data;
    } else {
      cacheSource = 'MISS';
      data = dbState;
      warmUpRedisCache(dbState);
    }

    res.setHeader('X-Redis-Cache', cacheSource);
    res.setHeader('X-Cache-Latency-Ms', String(cached.latencyMs));

    if (clientVersion > 0 && clientVersion === data.version) {
      res.json({
        upToDate: true,
        version: data.version,
        cacheSource,
        latencyMs: cached.latencyMs,
        cacheStats: redisCache.getStats()
      });
      return;
    }

    res.json({
      upToDate: false,
      version: data.version,
      cacheSource,
      latencyMs: cached.latencyMs,
      data,
      cacheStats: redisCache.getStats()
    });
  });

  // 2. Get Grade-Specific Student Timetable via Redis Cache (Fast endpoint for mobile student view)
  app.get('/api/timetable/grade/:grade', (req, res) => {
    const grade = req.params.grade;
    const cacheKey = `timetable:grade:${grade}`;
    const cached = redisCache.get(cacheKey);

    if (cached.hit && cached.data) {
      res.setHeader('X-Redis-Cache', 'HIT');
      res.json({
        cacheSource: 'HIT',
        latencyMs: cached.latencyMs,
        payload: cached.data,
        cacheStats: redisCache.getStats()
      });
      return;
    }

    const gradeSchedule: Record<string, unknown> = {};
    Object.entries(dbState.schedule).forEach(([k, v]) => {
      if (k.startsWith(`${grade}_`)) {
        gradeSchedule[k] = v;
      }
    });
    const payload = {
      version: dbState.version,
      grade,
      schedule: gradeSchedule,
      subjects: dbState.subjects.filter(s => s.grade === grade),
      periods: dbState.periods,
      teachers: dbState.teachers,
      lastUpdatedAt: dbState.lastUpdatedAt
    };

    redisCache.set(cacheKey, payload, 600);
    res.setHeader('X-Redis-Cache', 'MISS');
    res.json({
      cacheSource: 'MISS',
      latencyMs: cached.latencyMs,
      payload,
      cacheStats: redisCache.getStats()
    });
  });

  // 3. Assign / Update / Swap / Remove a Timetable Slot (Invalidates Redis Cache + Broadcasts WebSocket + Logs Notification)
  app.post('/api/timetable/slot', (req, res) => {
    const {
      grade,
      dayKey,
      periodId,
      subjectId,
      allowOverlap,
      roomNote,
      action = 'ASSIGN',
      swapFromKey,
      actorName = 'ฝ่ายวิชาการ / ครูผู้สอน'
    } = req.body;

    if (!grade || !dayKey || !periodId) {
      res.status(400).json({ error: 'ข้อมูลคาบเรียนไม่ครบถ้วน' });
      return;
    }

    const slotKey = `${grade}_${dayKey}_${periodId}`;
    const dayObj = DAYS.find(d => d.key === dayKey);
    const periodObj = dbState.periods.find(p => p.id === periodId);

    let notification: TimetableChangeNotification;

    if (action === 'REMOVE' || !subjectId) {
      const oldEntry = dbState.schedule[slotKey];
      const oldSub = oldEntry ? dbState.subjects.find(s => s.id === oldEntry.subjectId) : undefined;
      delete dbState.schedule[slotKey];

      notification = {
        id: 'CHG_' + Date.now(),
        timestamp: new Date().toISOString(),
        grade,
        dayKey,
        dayName: dayObj ? dayObj.name : dayKey,
        periodId,
        periodLabel: periodObj ? periodObj.label : periodId,
        action: 'REMOVE',
        subjectCode: oldSub?.code,
        subjectName: oldSub?.name,
        actorName,
        summary: `ยกเลิกคาบเรียนวิชา ${oldSub ? `${oldSub.code} ${oldSub.name}` : ''} ชั้น ${grade} (วัน${dayObj?.name || dayKey} ${periodObj?.label || periodId})`
      };
    } else {
      const sub = dbState.subjects.find(s => s.id === subjectId);
      const teacher = sub ? dbState.teachers.find(t => t.id === sub.teacherId) : undefined;

      if (swapFromKey && swapFromKey !== slotKey) {
        const targetExisting = dbState.schedule[slotKey];
        if (targetExisting) {
          dbState.schedule[swapFromKey] = targetExisting;
        } else {
          delete dbState.schedule[swapFromKey];
        }
      }

      dbState.schedule[slotKey] = {
        subjectId,
        allowOverlap: !!allowOverlap,
        roomNote: roomNote || '',
        updatedAt: new Date().toISOString(),
        updatedBy: actorName
      };

      // If overlap allowed, mark clashing slots as allowOverlap too
      if (allowOverlap && sub) {
        GRADES.forEach(g => {
          if (g === grade) return;
          const ck = `${g}_${dayKey}_${periodId}`;
          const cEntry = dbState.schedule[ck];
          if (cEntry) {
            const cSub = dbState.subjects.find(s => s.id === cEntry.subjectId);
            if (cSub && cSub.teacherId === sub.teacherId) {
              cEntry.allowOverlap = true;
            }
          }
        });
      }

      notification = {
        id: 'CHG_' + Date.now(),
        timestamp: new Date().toISOString(),
        grade,
        dayKey,
        dayName: dayObj ? dayObj.name : dayKey,
        periodId,
        periodLabel: periodObj ? periodObj.label : periodId,
        action: swapFromKey ? 'SWAP' : 'ASSIGN',
        subjectCode: sub?.code,
        subjectName: sub?.name,
        teacherName: teacher ? `${teacher.prefix}${teacher.fullName}` : undefined,
        actorName,
        summary: `${swapFromKey ? 'สลับ/ย้ายคาบเรียน' : 'อัปเดตตารางเรียน'} ชั้น ${grade} วัน${dayObj?.name || dayKey} ${periodObj?.label || periodId} เป็นวิชา ${sub ? `${sub.code} ${sub.name}` : ''} (${teacher ? teacher.prefix + teacher.fullName : '-'})`
      };
    }

    dbState.version += 1;
    dbState.lastUpdatedAt = notification.timestamp;
    dbState.lastUpdatedBy = actorName;
    dbState.changeLogs = [notification, ...(dbState.changeLogs || [])].slice(0, 50);

    savePersistedDatabase(dbState);

    // Invalidate & Warm up Redis Cache (Write-Through)
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();

    // Real-time WebSocket Broadcast to all connected students & teachers
    broadcastToAll('timetable:updated', {
      data: dbState,
      notification,
      slotKey,
      cacheStats
    });

    res.json({
      ok: true,
      version: dbState.version,
      data: dbState,
      notification,
      cacheStats
    });
  });

  // 4. Smart Auto-Schedule via Server (Invalidates Redis Cache & Broadcasts to Students Immediately)
  app.post('/api/timetable/auto-schedule', (req, res) => {
    const {
      grades = [...GRADES],
      noSameDayDuplicate = true,
      coreMorning = true,
      lockActivities = true,
      allowCombinedSubjects = true,
      clearExisting = true,
      actorName = 'ระบบจัดตารางอัตโนมัติ (Smart Auto)'
    } = req.body;

    const result = autoScheduleEngine(dbState, {
      grades,
      noSameDayDuplicate,
      coreMorning,
      lockActivities,
      allowCombinedSubjects,
      clearExisting
    });

    dbState.schedule = result.schedule;
    dbState.version += 1;
    dbState.lastUpdatedAt = new Date().toISOString();
    dbState.lastUpdatedBy = actorName;

    const notification: TimetableChangeNotification = {
      id: 'CHG_' + Date.now(),
      timestamp: dbState.lastUpdatedAt,
      grade: grades.length === GRADES.length ? 'ทุกชั้น (ป.1-ม.3)' : grades.join(', '),
      dayKey: 'MON',
      dayName: 'จันทร์-ศุกร์',
      periodId: 'ALL',
      periodLabel: 'ทุกคาบเรียน',
      action: 'AUTO_SCHEDULE',
      actorName,
      summary: `จัดตารางเรียนอัตโนมัติใหม่สำหรับชั้น ${grades.length === GRADES.length ? 'ป.1 - ม.3 ทั้งโรงเรียน' : grades.join(', ')} จำนวน ${result.placedCount} คาบเรียน`
    };

    dbState.changeLogs = [notification, ...(dbState.changeLogs || [])].slice(0, 50);
    savePersistedDatabase(dbState);

    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);
    const cacheStats = redisCache.getStats();

    broadcastToAll('timetable:updated', {
      data: dbState,
      notification,
      cacheStats
    });

    res.json({
      ok: true,
      placedCount: result.placedCount,
      data: dbState,
      notification,
      cacheStats
    });
  });

  // 5. Clear Grade Schedule
  app.post('/api/timetable/clear-grade', (req, res) => {
    const { grade, actorName = 'ฝ่ายวิชาการ' } = req.body;
    if (!grade) {
      res.status(400).json({ error: 'กรุณาระบุชั้นเรียน' });
      return;
    }

    Object.keys(dbState.schedule).forEach(k => {
      if (k.startsWith(`${grade}_`)) {
        delete dbState.schedule[k];
      }
    });

    dbState.version += 1;
    dbState.lastUpdatedAt = new Date().toISOString();
    dbState.lastUpdatedBy = actorName;

    const notification: TimetableChangeNotification = {
      id: 'CHG_' + Date.now(),
      timestamp: dbState.lastUpdatedAt,
      grade,
      dayKey: 'MON',
      dayName: 'จันทร์-ศุกร์',
      periodId: 'ALL',
      periodLabel: 'ทุกคาบเรียน',
      action: 'CLEAR',
      actorName,
      summary: `ล้างข้อมูลตารางเรียนชั้น ${grade} เพื่อเตรียมจัดใหม่`
    };

    dbState.changeLogs = [notification, ...(dbState.changeLogs || [])].slice(0, 50);
    savePersistedDatabase(dbState);

    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);
    const cacheStats = redisCache.getStats();

    broadcastToAll('timetable:updated', {
      data: dbState,
      notification,
      cacheStats
    });

    res.json({ ok: true, data: dbState, notification, cacheStats });
  });

  // 6. Bulk Sync Master Data (School Info, Teachers, Subjects, Time Slots, LINE Config, or Import JSON)
  app.put('/api/timetable/master', (req, res) => {
    const { schoolInfo, teachers, subjects, periods, schedule, lineConfig, summary, actorName = 'ผู้ดูแลระบบวิชาการ' } = req.body;

    if (schoolInfo) dbState.schoolInfo = schoolInfo;
    if (Array.isArray(teachers)) dbState.teachers = teachers;
    if (Array.isArray(subjects)) dbState.subjects = subjects;
    if (Array.isArray(periods)) dbState.periods = periods;
    if (schedule && typeof schedule === 'object') dbState.schedule = schedule;
    if (lineConfig) dbState.lineConfig = lineConfig;

    dbState.version += 1;
    dbState.lastUpdatedAt = new Date().toISOString();
    dbState.lastUpdatedBy = actorName;

    const notification: TimetableChangeNotification = {
      id: 'CHG_' + Date.now(),
      timestamp: dbState.lastUpdatedAt,
      grade: 'ทุกชั้นเรียน',
      dayKey: 'MON',
      dayName: 'ทั้งหมด',
      periodId: 'ALL',
      periodLabel: 'ข้อมูลพื้นฐาน',
      action: 'SETTINGS_UPDATE',
      actorName,
      summary: summary || 'อัปเดตข้อมูลพื้นฐานของโรงเรียน / ครูผู้สอน / รายวิชา และซิงค์ตารางเรียนใหม่'
    };

    dbState.changeLogs = [notification, ...(dbState.changeLogs || [])].slice(0, 50);
    savePersistedDatabase(dbState);

    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);
    const cacheStats = redisCache.getStats();

    broadcastToAll('timetable:updated', {
      data: dbState,
      notification,
      cacheStats
    });

    res.json({ ok: true, data: dbState, notification, cacheStats });
  });

  // 7. Reset Database to Default Sample Timetable
  app.post('/api/timetable/reset', (req, res) => {
    dbState = createDefaultAppData();
    savePersistedDatabase(dbState);
    redisCache.flushAll();
    warmUpRedisCache(dbState);
    const cacheStats = redisCache.getStats();

    const notification = dbState.changeLogs[0];
    broadcastToAll('timetable:updated', {
      data: dbState,
      notification,
      cacheStats
    });

    res.json({ ok: true, data: dbState, cacheStats });
  });

  // 8. Redis Cache Inspection & Manual Flush / Benchmark Endpoint
  app.get('/api/cache/stats', (_req, res) => {
    res.json({
      ok: true,
      cacheStats: redisCache.getStats()
    });
  });

  app.post('/api/cache/flush', (_req, res) => {
    redisCache.flushAll();
    res.json({
      ok: true,
      message: 'ล้างข้อมูล Redis Cache ทั้งหมดเรียบร้อยแล้ว (การดึงข้อมูลครั้งถัดไปจะดึงจากฐานข้อมูลและสร้าง Cache ใหม่)',
      cacheStats: redisCache.getStats()
    });
  });

  app.post('/api/cache/warm', (_req, res) => {
    warmUpRedisCache(dbState);
    // Simulate a few cache hits for instant verification
    redisCache.get('timetable:full');
    redisCache.get('timetable:grade:ป.1');
    res.json({
      ok: true,
      message: 'อุ่นข้อมูล (Pre-warm) เข้าสู่ Redis Cache สำหรับทุกชั้นเรียน ป.1 - ม.3 เรียบร้อยแล้ว',
      cacheStats: redisCache.getStats()
    });
  });

  // ==========================================
  // 8B. FIREBASE SDK REAL-TIME UPLOAD & SYNC ENDPOINTS (`dpk-asset`)
  // ==========================================

  app.get('/api/firebase/status', (_req, res) => {
    res.json({
      ok: true,
      projectId: firebaseConfig.projectId,
      databaseURL: firebaseConfig.databaseURL,
      lastFirebaseSyncedAt,
      version: dbState.version,
      counts: {
        teachers: (dbState.teachers || []).length,
        subjects: (dbState.subjects || []).length,
        periods: (dbState.periods || []).length,
        scheduleSlots: Object.keys(dbState.schedule || {}).length,
        users: (dbState.users || []).length
      }
    });
  });

  app.post('/api/firebase/sync-all', async (req, res) => {
    const clientData = req.body?.data as AppData | undefined;
    if (clientData && clientData.schoolInfo && clientData.schedule) {
      dbState = {
        ...dbState,
        ...clientData,
        version: Math.max(dbState.version, clientData.version || 1) + 1,
        lastUpdatedAt: new Date().toISOString()
      };
    }

    const result = await bootstrapAndSyncFirebaseDatabase(() => {
      broadcastToAll('timetable:updated', {
        data: dbState,
        cacheStats: redisCache.getStats()
      });
    });

    res.json({
      ok: result.ok,
      projectId: firebaseConfig.projectId,
      databaseURL: firebaseConfig.databaseURL,
      syncedAt: result.syncedAt,
      collectionsCount: result.collectionsCount,
      data: dbState,
      cacheStats: redisCache.getStats()
    });
  });

  // Firebase RTDB initial sync and real-time subscription are launched once httpServer binds to port 3000

  // ==========================================
  // 9. AUTHENTICATION, MEMBER & ADMIN ENDPOINTS
  // ==========================================

  app.post('/api/auth/login', (req, res) => {
    const { identifier = '', password = '' } = req.body;
    const users = dbState.users || createDefaultUsers();
    const result = verifyUserCredentials(users, identifier, password);

    if (!result.ok || !result.user) {
      res.status(401).json({ ok: false, error: result.error || 'เข้าสู่ระบบไม่สำเร็จ' });
      return;
    }

    const now = new Date().toISOString();
    result.user.lastLoginAt = now;
    const audit: AuditLogEntry = {
      id: 'AUD_' + Date.now(),
      timestamp: now,
      actorId: result.user.id,
      actorName: result.user.fullName,
      actorRole: result.user.role,
      action: 'LOGIN',
      details: `เข้าสู่ระบบสำเร็จด้วยบัญชี ${result.user.email} (สิทธิ์: ${result.user.role})`
    };

    dbState.users = users;
    dbState.auditLogs = [audit, ...(dbState.auditLogs || [])].slice(0, 80);
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    res.json({
      ok: true,
      user: result.user,
      data: dbState,
      cacheStats: redisCache.getStats()
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const {
      username = '',
      email = '',
      password = '',
      fullName = '',
      role = 'student',
      assignedGrade = 'ป.1',
      teacherId = '',
      studentCode = '',
      firebaseUid = '',
      authProvider = 'local'
    } = req.body;

    if (!email.trim() || !fullName.trim() || !password.trim()) {
      res.status(400).json({ ok: false, error: 'กรุณากรอกชื่อ-นามสกุล อีเมล และรหัสผ่านให้ครบถ้วน' });
      return;
    }

    const users = dbState.users || createDefaultUsers();
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (username.trim() || cleanEmail.split('@')[0]).toLowerCase();

    if (users.some(u => u.email.toLowerCase() === cleanEmail || u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ ok: false, error: 'อีเมลหรือชื่อผู้ใช้งานนี้ถูกใช้สมัครสมาชิกแล้ว' });
      return;
    }

    const policy = dbState.accessPolicy || createDefaultAccessPolicy();
    const isSuperEmail = cleanEmail === 'vitamin.capper@gmail.com' || cleanEmail === 'admin@donkaew.ac.th';
    const assignedRole: UserRole = isSuperEmail ? 'admin' : (role === 'teacher' ? 'teacher' : 'student');
    const assignedStatus: UserStatus =
      isSuperEmail || policy.autoApproveStudentRegistration ? 'active' : 'pending';

    const now = new Date().toISOString();
    const paletteColor = PASTEL_PALETTE[users.length % PASTEL_PALETTE.length].bg;

    const newUser: UserAccount = {
      id: 'USR_' + Date.now(),
      username: cleanUsername,
      email: cleanEmail,
      password: password.trim(),
      fullName: fullName.trim(),
      role: assignedRole,
      status: assignedStatus,
      assignedGrade: assignedGrade || 'ป.1',
      teacherId: assignedRole === 'teacher' ? (teacherId || 'T01') : undefined,
      studentCode: assignedRole === 'student' ? (studentCode || String(69000 + users.length + 1)) : undefined,
      avatarColor: paletteColor,
      authProvider,
      firebaseUid: firebaseUid || undefined,
      createdAt: now,
      lastLoginAt: now
    };

    const audit: AuditLogEntry = {
      id: 'AUD_' + Date.now(),
      timestamp: now,
      actorId: newUser.id,
      actorName: newUser.fullName,
      actorRole: newUser.role,
      action: 'REGISTER',
      details: `สมัครสมาชิกใหม่ (${newUser.email}) ประเภทสิทธิ์: ${newUser.role} สถานะ: ${newUser.status}`
    };

    dbState.users = [newUser, ...users];
    dbState.auditLogs = [audit, ...(dbState.auditLogs || [])].slice(0, 80);
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();
    broadcastToAll('timetable:updated', { data: dbState, cacheStats });

    res.json({
      ok: true,
      user: newUser,
      data: dbState,
      cacheStats
    });
  });

  app.post('/api/auth/firebase-sync', (req, res) => {
    const {
      email = '',
      displayName = '',
      firebaseUid = '',
      authProvider = 'firebase_google'
    } = req.body;

    if (!email.trim()) {
      res.status(400).json({ ok: false, error: 'ไม่พบอีเมลจากบัญชี Firebase' });
      return;
    }

    const users = dbState.users || createDefaultUsers();
    const cleanEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();

    let user = users.find(u => u.email.toLowerCase() === cleanEmail);
    const isSuperAdmin = cleanEmail === 'vitamin.capper@gmail.com' || cleanEmail === 'admin@donkaew.ac.th';

    if (user) {
      user.lastLoginAt = now;
      if (firebaseUid) user.firebaseUid = firebaseUid;
      if (isSuperAdmin) user.role = 'admin';
    } else {
      user = {
        id: 'USR_FB_' + Date.now(),
        username: cleanEmail.split('@')[0],
        email: cleanEmail,
        fullName: displayName || cleanEmail.split('@')[0],
        role: isSuperAdmin ? 'admin' : 'student',
        status: 'active',
        assignedGrade: 'ป.1',
        avatarColor: PASTEL_PALETTE[users.length % PASTEL_PALETTE.length].bg,
        authProvider,
        firebaseUid: firebaseUid || undefined,
        createdAt: now,
        lastLoginAt: now
      };
      users.unshift(user);
    }

    const audit: AuditLogEntry = {
      id: 'AUD_' + Date.now(),
      timestamp: now,
      actorId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      action: 'LOGIN',
      details: `เข้าสู่ระบบผ่าน Firebase Auth (${firebaseUid ? 'UID: ' + firebaseUid.slice(0, 8) : cleanEmail}) สิทธิ์: ${user.role}`
    };

    dbState.users = users;
    dbState.auditLogs = [audit, ...(dbState.auditLogs || [])].slice(0, 80);
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    res.json({
      ok: true,
      user,
      data: dbState,
      cacheStats: redisCache.getStats()
    });
  });

  // Admin Member CRUD
  app.post('/api/admin/users', (req, res) => {
    const {
      user,
      actorName = 'ผู้ดูแลระบบสูงสุด (Admin)'
    }: { user: Partial<UserAccount>; actorName?: string } = req.body;

    if (!user || !user.email || !user.fullName) {
      res.status(400).json({ ok: false, error: 'ข้อมูลสมาชิกไม่ครบถ้วน' });
      return;
    }

    const users = dbState.users || createDefaultUsers();
    const now = new Date().toISOString();
    let updatedUser: UserAccount;
    let actionType: AuditLogEntry['action'] = 'USER_UPDATE';
    let detailMsg = '';

    const existingIdx = user.id ? users.findIndex(u => u.id === user.id) : -1;
    if (existingIdx >= 0) {
      const prev = users[existingIdx];
      if (user.role && user.role !== prev.role) {
        actionType = 'ROLE_CHANGE';
      }
      updatedUser = {
        ...prev,
        ...user,
        password: user.password && user.password.trim() ? user.password.trim() : prev.password
      };
      users[existingIdx] = updatedUser;
      detailMsg = `อัปเดตข้อมูลสมาชิก ${updatedUser.fullName} (${updatedUser.email}) -> สิทธิ์: ${updatedUser.role}, สถานะ: ${updatedUser.status}`;
    } else {
      updatedUser = {
        id: 'USR_' + Date.now(),
        username: (user.username || user.email.split('@')[0]).toLowerCase(),
        email: user.email.toLowerCase(),
        password: user.password || '123456',
        fullName: user.fullName,
        role: user.role || 'student',
        status: user.status || 'active',
        assignedGrade: user.assignedGrade || 'ป.1',
        teacherId: user.teacherId,
        studentCode: user.studentCode,
        avatarColor: user.avatarColor || PASTEL_PALETTE[users.length % PASTEL_PALETTE.length].bg,
        authProvider: user.authProvider || 'local',
        createdAt: now
      };
      users.unshift(updatedUser);
      detailMsg = `ผู้ดูแลระบบเพิ่มสมาชิกใหม่ ${updatedUser.fullName} (${updatedUser.email}) สิทธิ์: ${updatedUser.role}`;
    }

    const audit: AuditLogEntry = {
      id: 'AUD_' + Date.now(),
      timestamp: now,
      actorId: 'ADMIN',
      actorName,
      actorRole: 'admin',
      action: actionType,
      details: detailMsg
    };

    dbState.users = users;
    dbState.auditLogs = [audit, ...(dbState.auditLogs || [])].slice(0, 80);
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();
    broadcastToAll('timetable:updated', { data: dbState, cacheStats });

    res.json({
      ok: true,
      user: updatedUser,
      data: dbState,
      cacheStats
    });
  });

  app.delete('/api/admin/users/:userId', (req, res) => {
    const userId = req.params.userId;
    const users = dbState.users || createDefaultUsers();
    const target = users.find(u => u.id === userId);
    if (!target) {
      res.status(404).json({ ok: false, error: 'ไม่พบสมาชิกที่ต้องการลบ' });
      return;
    }

    const adminCount = users.filter(u => u.role === 'admin' && u.status === 'active').length;
    if (target.role === 'admin' && adminCount <= 1) {
      res.status(400).json({ ok: false, error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบคนสุดท้ายของโรงเรียนได้' });
      return;
    }

    dbState.users = users.filter(u => u.id !== userId);
    const audit: AuditLogEntry = {
      id: 'AUD_' + Date.now(),
      timestamp: new Date().toISOString(),
      actorId: 'ADMIN',
      actorName: 'ผู้ดูแลระบบ',
      actorRole: 'admin',
      action: 'USER_UPDATE',
      details: `ลบบัญชีสมาชิก ${target.fullName} (${target.email}) ออกจากระบบ`
    };
    dbState.auditLogs = [audit, ...(dbState.auditLogs || [])].slice(0, 80);
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();
    broadcastToAll('timetable:updated', { data: dbState, cacheStats });

    res.json({ ok: true, data: dbState, cacheStats });
  });

  app.put('/api/admin/policy', (req, res) => {
    const { accessPolicy, actorName = 'ผู้ดูแลระบบสูงสุด (Admin)' } = req.body;
    if (!accessPolicy) {
      res.status(400).json({ ok: false, error: 'ไม่พบนโยบายสิทธิ์การเข้าถึง' });
      return;
    }

    dbState.accessPolicy = {
      ...(dbState.accessPolicy || createDefaultAccessPolicy()),
      ...accessPolicy
    };
    const audit: AuditLogEntry = {
      id: 'AUD_' + Date.now(),
      timestamp: new Date().toISOString(),
      actorId: 'ADMIN',
      actorName,
      actorRole: 'admin',
      action: 'POLICY_UPDATE',
      details: 'อัปเดตนโยบายความปลอดภัยและสิทธิ์การเข้าถึงระบบ (RBAC & Firebase Sync Policy)'
    };
    dbState.auditLogs = [audit, ...(dbState.auditLogs || [])].slice(0, 80);
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();
    broadcastToAll('timetable:updated', { data: dbState, cacheStats });

    res.json({ ok: true, data: dbState, cacheStats });
  });

  // ==========================================
  // 10. SERVER-SIDE & CLOUD BACKGROUND LINE NOTIFICATION ENGINE
  //     (Works 24/7 even when all browser tabs are closed)
  // ==========================================

  const sleepMs = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  function translateLineApiErrorToThai(status: number, rawBody: string, usedTargetId: string): string {
    const lower = (rawBody || '').toLowerCase();
    if (status === 400) {
      if (lower.includes('to') || lower.includes('target') || lower.includes('invalid')) {
        return `รหัสปลายทาง (${usedTargetId}) ไม่ถูกต้อง หรือบอท LINE OA ยังไม่ได้ถูกเชิญเข้ากลุ่ม/ยังไม่ได้เป็นเพื่อนกับผู้รับ`;
      }
      return `คำขอไม่ถูกต้อง (HTTP 400): ${rawBody.slice(0, 120)}`;
    }
    if (status === 401) {
      return 'LINE Channel Access Token ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบ Token ในหน้าตั้งค่า';
    }
    if (status === 403) {
      return 'บัญชี LINE OA ไม่มีสิทธิ์ส่งข้อความ Push หรือยังไม่ได้เปิดใช้งาน Messaging API';
    }
    if (status === 429) {
      return 'โควตาการส่งข้อความ LINE OA รายเดือนเต็ม (แพ็กเกจฟรี 200 ข้อความ/เดือน) หรือส่งถี่เกินกำหนด';
    }
    if (status >= 500) {
      return `เซิร์ฟเวอร์ LINE หรือ Google Apps Script ขัดข้องชั่วคราว (HTTP ${status})`;
    }
    return `ส่งไม่สำเร็จ (${rawBody.slice(0, 140) || `HTTP ${status}`})`;
  }

  async function attemptPushToLineTarget(params: {
    bridgeUrl: string;
    token: string;
    to: string;
    messageText: string;
  }): Promise<{ ok: boolean; status: number; errorDetail?: string }> {
    const { bridgeUrl, token, to, messageText } = params;
    try {
      if (bridgeUrl) {
        const gasRes = await fetch(bridgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'PUSH_MESSAGE',
            token,
            to,
            message: messageText
          })
        });
        const gasText = await gasRes.text();
        if (!gasRes.ok) {
          return {
            ok: false,
            status: gasRes.status,
            errorDetail: translateLineApiErrorToThai(gasRes.status, gasText, to)
          };
        }
        // Check if GAS returned a LINE API error JSON payload such as {"message":"The property, 'to', in the request body is invalid..."}
        try {
          const parsed = JSON.parse(gasText);
          if (parsed && (parsed.status === 'error' || (parsed.message && !parsed.sentMessages))) {
            const errMsg = String(parsed.message || 'ส่งผ่าน Google Apps Script ไม่สำเร็จ');
            const inferredStatus = errMsg.toLowerCase().includes('limit') ? 429 : 400;
            return {
              ok: false,
              status: inferredStatus,
              errorDetail: translateLineApiErrorToThai(inferredStatus, errMsg, to)
            };
          }
        } catch {
          // Non-JSON or empty response from GAS is treated as success
        }
        return { ok: true, status: 200 };
      }

      // Direct server-to-LINE Messaging API push
      const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          to,
          messages: [{ type: 'text', text: messageText }]
        })
      });

      if (!lineRes.ok) {
        const errBody = await lineRes.text();
        return {
          ok: false,
          status: lineRes.status,
          errorDetail: translateLineApiErrorToThai(lineRes.status, errBody, to)
        };
      }

      return { ok: true, status: 200 };
    } catch (err) {
      return {
        ok: false,
        status: 503,
        errorDetail: `การเชื่อมต่อเครือข่ายขัดข้อง: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  async function dispatchSingleLineMessageOnServer(params: {
    targetId: string;
    fallbackTargetId?: string;
    recipientLabel: string;
    messageText: string;
    periodLabel: string;
    cfg: LineConfig;
    source: 'WEB' | 'SERVER_BG' | 'CLOUD_GAS';
  }): Promise<{ logEntry: LineNotificationLog; ok: boolean; simulated: boolean }> {
    const { targetId, fallbackTargetId, recipientLabel, messageText, periodLabel, cfg, source } = params;
    const bridgeUrl = (cfg.bridgeUrl || '').trim();
    const token = (cfg.channelAccessToken || '').trim();
    const fallbackGroup = sanitizeLineTargetId(fallbackTargetId || cfg.teacherGroupId);
    const primaryTargetId = sanitizeLineTargetId(targetId) || fallbackGroup;
    const nowStr = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Bangkok'
    });

    if (!token || !primaryTargetId) {
      return {
        ok: true,
        simulated: true,
        logEntry: {
          time: nowStr,
          recipient: recipientLabel,
          period: periodLabel,
          status: 'SIMULATED',
          message: messageText,
          source,
          targetId: primaryTargetId || 'SIMULATED_NO_TARGET',
          errorDetail: !token
            ? 'โหมดจำลอง (ยังไม่ได้กรอก LINE Channel Access Token)'
            : 'โหมดจำลอง (ยังไม่ได้ระบุ Group ID / User ID ปลายทาง)'
        }
      };
    }

    // 1. Try primary target with up to 2 retries on transient/rate-limit errors
    let retriedCount = 0;
    let lastAttempt = await attemptPushToLineTarget({
      bridgeUrl,
      token,
      to: primaryTargetId,
      messageText
    });

    while (!lastAttempt.ok && (lastAttempt.status === 429 || lastAttempt.status >= 500) && retriedCount < 2) {
      retriedCount++;
      await sleepMs(400 * retriedCount);
      lastAttempt = await attemptPushToLineTarget({
        bridgeUrl,
        token,
        to: primaryTargetId,
        messageText
      });
    }

    if (lastAttempt.ok) {
      return {
        ok: true,
        simulated: false,
        logEntry: {
          time: nowStr,
          recipient: recipientLabel,
          period: periodLabel,
          status: 'SENT',
          message: messageText,
          source,
          targetId: primaryTargetId,
          retriedCount
        }
      };
    }

    // 2. Automatic Fallback: If primary target failed (e.g. invalid personal teacher User ID or bot not in that class group)
    // and we have a distinct main teacherGroupId configured, automatically deliver to the fallback group so no alert is lost!
    if (fallbackGroup && fallbackGroup !== primaryTargetId && lastAttempt.status !== 401) {
      await sleepMs(250);
      const fallbackMsg = `${messageText}\n\n📌 [ระบบส่งสำรองถึง: ${recipientLabel} เนื่องจากรหัส LINE ปลายทาง ${primaryTargetId.slice(0, 8)}... ขัดข้อง]`;
      const fallbackAttempt = await attemptPushToLineTarget({
        bridgeUrl,
        token,
        to: fallbackGroup,
        messageText: fallbackMsg
      });

      if (fallbackAttempt.ok) {
        return {
          ok: true,
          simulated: false,
          logEntry: {
            time: nowStr,
            recipient: `${recipientLabel} (ส่งสำรองเข้ากลุ่มหลัก)`,
            period: periodLabel,
            status: 'SENT',
            message: fallbackMsg,
            source,
            targetId: fallbackGroup,
            fallbackUsed: true,
            retriedCount,
            errorDetail: `รหัสเดิม (${primaryTargetId.slice(0, 10)}...) ส่งไม่ผ่าน ระบบจึงส่งสำรองเข้ากลุ่มรวมครูสำเร็จ`
          }
        };
      }
    }

    return {
      ok: false,
      simulated: false,
      logEntry: {
        time: nowStr,
        recipient: recipientLabel,
        period: periodLabel,
        status: 'ERROR',
        message: messageText,
        source,
        targetId: primaryTargetId,
        retriedCount,
        errorDetail: lastAttempt.errorDetail || 'เกิดข้อผิดพลาดในการส่งข้อความไปยัง LINE API'
      }
    };
  }

  async function syncTimetableToGoogleAppsScriptCloud(data: AppData): Promise<{
    ok: boolean;
    syncedAt: string;
    cloudBridgeConfigured: boolean;
  }> {
    const syncedAt = new Date().toISOString();
    const bridgeUrl = (data.lineConfig?.bridgeUrl || '').trim();
    if (!bridgeUrl) {
      return { ok: true, syncedAt, cloudBridgeConfigured: false };
    }

    try {
      await fetch(bridgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'SYNC_TIMETABLE',
          payload: {
            schoolInfo: data.schoolInfo,
            periods: data.periods,
            teachers: data.teachers,
            subjects: data.subjects,
            schedule: data.schedule,
            lineConfig: {
              ...data.lineConfig,
              logs: []
            },
            syncedAt
          }
        })
      });
      return { ok: true, syncedAt, cloudBridgeConfigured: true };
    } catch (err) {
      console.warn('GAS Cloud Sync warning:', err);
      return { ok: false, syncedAt, cloudBridgeConfigured: true };
    }
  }

  // Endpoint: Sync timetable + LINE config to Server Background Scheduler & Google Apps Script Cloud
  app.post('/api/line/sync-cloud-schedule', async (req, res) => {
    const { lineConfig, teacherTargetIds } = req.body || {};
    if (lineConfig) {
      dbState.lineConfig = {
        ...dbState.lineConfig,
        ...lineConfig,
        backgroundServerEnabled: lineConfig.backgroundServerEnabled !== false
      };
    }

    // If teacherTargetIds map was updated from the LINE menu, sync to teachers array too
    const targetMap = teacherTargetIds || lineConfig?.teacherTargetIds;
    if (targetMap && typeof targetMap === 'object') {
      dbState.teachers = dbState.teachers.map(t => ({
        ...t,
        lineTargetId: sanitizeLineTargetId(targetMap[t.id] ?? t.lineTargetId)
      }));
    }

    const syncResult = await syncTimetableToGoogleAppsScriptCloud(dbState);
    dbState.lineConfig.lastCloudSyncedAt = syncResult.syncedAt;
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();
    broadcastToAll('timetable:updated', { data: dbState, cacheStats });

    res.json({
      ok: true,
      syncedAt: syncResult.syncedAt,
      cloudBridgeConfigured: syncResult.cloudBridgeConfigured,
      data: dbState
    });
  });

  // Endpoint: Unlock / Reset today's sentHistoryKeys so periods can be re-notified immediately after fixing Group/Teacher IDs
  app.post('/api/line/reset-today-history', (_req, res) => {
    dbState.lineConfig.sentHistoryKeys = {};
    dbState.version += 1;
    savePersistedDatabase(dbState);
    redisCache.invalidatePrefix('timetable:');
    warmUpRedisCache(dbState);

    const cacheStats = redisCache.getStats();
    broadcastToAll('timetable:updated', { data: dbState, cacheStats });

    // Trigger an immediate background scheduler check in case a period is currently active
    setTimeout(() => {
      void runServerBackgroundLineScheduler();
    }, 200);

    res.json({
      ok: true,
      message: 'ล้างล็อกประวัติการส่งของวันนี้เรียบร้อยแล้ว ระบบพร้อมส่งแจ้งเตือนคาบเรียนใหม่อีกครั้ง',
      data: dbState
    });
  });

  // Endpoint: Dispatch manual or period broadcast from Server (with 300ms queue pacing to prevent rate limit drops)
  app.post('/api/line/dispatch', async (req, res) => {
    const { mode = 'SINGLE', dayKey = 'MON', periodId = 'P1', targetId = '', recipientLabel = '', messageText = '', periodLabel = '', lineConfig } = req.body || {};

    if (lineConfig) {
      dbState.lineConfig = { ...dbState.lineConfig, ...lineConfig };
      if (lineConfig.teacherTargetIds && typeof lineConfig.teacherTargetIds === 'object') {
        dbState.teachers = dbState.teachers.map(t => ({
          ...t,
          lineTargetId: sanitizeLineTargetId(lineConfig.teacherTargetIds[t.id] ?? t.lineTargetId)
        }));
      }
    }

    const activeCfg = dbState.lineConfig;
    const newLogs: LineNotificationLog[] = [];
    let sentCount = 0;
    let errorCount = 0;
    let simulatedAny = false;

    if (mode === 'SINGLE') {
      const result = await dispatchSingleLineMessageOnServer({
        targetId,
        fallbackTargetId: activeCfg.teacherGroupId,
        recipientLabel: recipientLabel || 'กลุ่มเป้าหมาย',
        messageText,
        periodLabel: periodLabel || 'ทดสอบส่ง',
        cfg: activeCfg,
        source: 'WEB'
      });
      newLogs.push(result.logEntry);
      if (result.ok) sentCount = 1;
      else errorCount = 1;
      simulatedAny = result.simulated;
    } else if (mode === 'PERIOD_BROADCAST') {
      const items = buildPeriodBroadcastPayloads(dbState, dayKey, periodId, true, activeCfg);
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (idx > 0) {
          // 280ms queue pacing between messages so LINE API and Google Apps Script never drop burst messages
          await sleepMs(280);
        }
        const result = await dispatchSingleLineMessageOnServer({
          targetId: item.targetId,
          fallbackTargetId: item.fallbackTargetId || activeCfg.teacherGroupId,
          recipientLabel: item.recipientLabel,
          messageText: item.messageText,
          periodLabel: item.periodLabel,
          cfg: activeCfg,
          source: 'WEB'
        });
        newLogs.push(result.logEntry);
        if (result.ok) sentCount++;
        else errorCount++;
        if (result.simulated) simulatedAny = true;
      }
    }

    if (newLogs.length > 0) {
      dbState.lineConfig.logs = [...newLogs, ...(dbState.lineConfig.logs || [])].slice(0, 60);
      dbState.version += 1;
      savePersistedDatabase(dbState);
      redisCache.invalidatePrefix('timetable:');
      warmUpRedisCache(dbState);
      broadcastToAll('timetable:updated', {
        data: dbState,
        cacheStats: redisCache.getStats()
      });
    }

    res.json({
      ok: sentCount > 0 || errorCount === 0,
      sentCount,
      errorCount,
      simulatedAny,
      logs: dbState.lineConfig.logs,
      data: dbState
    });
  });

  // Background Server Cron: Checks every 15 seconds and dispatches due period alerts automatically
  // even when 0 browsers are open! Uses per-recipient delivery tracking + 300ms queue pacing.
  let isCheckingBackgroundSchedule = false;
  const recipientRetryCounter = new Map<string, number>();

  async function runServerBackgroundLineScheduler() {
    if (isCheckingBackgroundSchedule) return;
    isCheckingBackgroundSchedule = true;
    try {
      // Use Thailand local time (Asia/Bangkok, UTC+7) for accurate school period matching
      const bangkokNowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
      const bangkokNow = new Date(bangkokNowStr);

      const duePeriods = findDuePeriodsForBackgroundAlert(dbState, bangkokNow);
      if (duePeriods.length === 0) return;

      const createdLogs: LineNotificationLog[] = [];
      if (!dbState.lineConfig.sentHistoryKeys) {
        dbState.lineConfig.sentHistoryKeys = {};
      }

      for (const due of duePeriods) {
        const payloads = buildPeriodBroadcastPayloads(dbState, due.dayKey, due.period.id, false, dbState.lineConfig);
        if (payloads.length === 0) {
          dbState.lineConfig.sentHistoryKeys[due.historyKey] = true;
          continue;
        }

        let allRecipientsDone = true;
        let dispatchedInCycle = 0;

        for (const item of payloads) {
          const recipientKey = `${due.historyKey}__${item.recipientLabel}`;
          if (dbState.lineConfig.sentHistoryKeys[recipientKey]) {
            continue; // Already successfully delivered to this recipient today
          }

          if (dispatchedInCycle > 0) {
            await sleepMs(300); // Queue pacing to prevent rate limit or GAS drop
          }
          dispatchedInCycle++;

          const res = await dispatchSingleLineMessageOnServer({
            targetId: item.targetId,
            fallbackTargetId: item.fallbackTargetId || dbState.lineConfig.teacherGroupId,
            recipientLabel: `${item.recipientLabel} [อัตโนมัติหลังบ้าน]`,
            messageText: item.messageText,
            periodLabel: item.periodLabel,
            cfg: dbState.lineConfig,
            source: 'SERVER_BG'
          });
          createdLogs.push(res.logEntry);

          if (res.ok) {
            dbState.lineConfig.sentHistoryKeys[recipientKey] = true;
            recipientRetryCounter.delete(recipientKey);
          } else {
            const prevTries = (recipientRetryCounter.get(recipientKey) || 0) + 1;
            recipientRetryCounter.set(recipientKey, prevTries);
            if (prevTries >= 3) {
              // Stop auto-retrying after 3 consecutive cycles to avoid infinite error spam until user resets or changes config
              dbState.lineConfig.sentHistoryKeys[recipientKey] = true;
            } else {
              allRecipientsDone = false;
            }
          }
        }

        if (allRecipientsDone) {
          dbState.lineConfig.sentHistoryKeys[due.historyKey] = true;
        }
      }

      if (createdLogs.length > 0) {
        dbState.lineConfig.logs = [...createdLogs, ...(dbState.lineConfig.logs || [])].slice(0, 60);
        dbState.version += 1;
        savePersistedDatabase(dbState);
        redisCache.invalidatePrefix('timetable:');
        warmUpRedisCache(dbState);
        broadcastToAll('timetable:updated', {
          data: dbState,
          cacheStats: redisCache.getStats()
        });
      }
    } catch (err) {
      console.warn('Background LINE scheduler error:', err);
    } finally {
      isCheckingBackgroundSchedule = false;
    }
  }

  setInterval(() => {
    void runServerBackgroundLineScheduler();
  }, 15000);

  // Mount Vite in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server + WebSocket + Redis Cache + Background LINE Scheduler running on http://0.0.0.0:${PORT}`);

    // Subscribe server to external changes in `donkaew_timetable/full_state` on Firebase RTDB (`dpk-asset`)
    void bootstrapAndSyncFirebaseDatabase(() => {
      broadcastToAll('timetable:updated', {
        data: dbState,
        cacheStats: redisCache.getStats()
      });
    })
      .then(() => {
        fbOnValue(
          fbRef(firebaseRtdb, 'donkaew_timetable/full_state'),
          snapshot => {
            if (isWritingToFirebase || !snapshot.exists()) return;
            const incoming = restoreFromFirebase(snapshot.val()) as AppData;
            if (
              incoming &&
              incoming.schoolInfo &&
              incoming.schedule &&
              typeof incoming.version === 'number' &&
              incoming.version > dbState.version
            ) {
              dbState = incoming;
              savePersistedDatabase(dbState, false);
              redisCache.invalidatePrefix('timetable:');
              warmUpRedisCache(dbState);
              broadcastToAll('timetable:updated', {
                data: dbState,
                cacheStats: redisCache.getStats()
              });
            }
          },
          () => {
            // Ignore transient listener error
          }
        );
      })
      .catch(err => {
        console.warn('Initial Firebase RTDB sync warning:', err);
      });
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
