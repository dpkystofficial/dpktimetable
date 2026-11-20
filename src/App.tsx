import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DAYS,
  GRADES,
  GRADE_FULL_NAMES,
  createDefaultAppData,
  createDefaultUsers,
  canManageTimetable,
  findTeacherConflictsAtSlot,
  getAllTeacherOverlaps,
  getScheduledHoursForSubject,
  type AppData,
  type UserAccount,
  type RedisCacheStats,
  type TimetableChangeNotification,
  type LineConfig
} from './utils/timetableLogic';
import { StudentRealtimePortal } from './components/StudentRealtimePortal';
import { RedisCacheModal } from './components/RedisCacheModal';
import { OfficialReportSection } from './components/OfficialReportSection';
import { LineNotificationSection } from './components/LineNotificationSection';
import { SettingsSection } from './components/SettingsSection';
import { AuthModal } from './components/AuthModal';
import { AdminDashboardSection } from './components/AdminDashboardSection';
import {
  signOutFromFirebase,
  syncStateToFirebaseRTDB,
  subscribeToFirebaseTimetableState,
  clearLegacyBrowserCacheAndCookies
} from './services/firebaseClient';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export default function App() {
  const [appData, setAppData] = useState<AppData>(() => createDefaultAppData());
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = sessionStorage.getItem('donkaew_auth_session');
      if (saved) return JSON.parse(saved) as UserAccount;
    } catch {
      // ignore storage errors
    }
    return null;
  });
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [mainTab, setMainTab] = useState<'student_live' | 'scheduler' | 'admin_members' | 'settings' | 'linenotify' | 'reports'>('scheduler');
  const [schedulerMode, setSchedulerMode] = useState<'class' | 'teacher' | 'overview'>('class');
  const [selectedGrade, setSelectedGrade] = useState<string>('ป.1');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('T01');
  const [overviewDay, setOverviewDay] = useState<string>('MON');
  const [mobileDayFilter, setMobileDayFilter] = useState<string>('ALL');

  // Real-time WebSocket & Redis Cache states
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [cacheStats, setCacheStats] = useState<RedisCacheStats | null>(null);
  const [lastCacheSource, setLastCacheSource] = useState<string>('HIT');
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0.24);
  const [connectedClients, setConnectedClients] = useState<{ totalConnected: number; studentCount: number; teacherCount: number }>({
    totalConnected: 1,
    studentCount: 1,
    teacherCount: 1
  });
  const [recentUpdatedSlotKey, setRecentUpdatedSlotKey] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<TimetableChangeNotification[]>([]);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState<boolean>(false);
  const [redisModalOpen, setRedisModalOpen] = useState<boolean>(false);

  // Modals in Scheduler
  const [slotModalContext, setSlotModalContext] = useState<{ grade: string; dayKey: string; periodId: string } | null>(null);
  const [slotModalSubjectId, setSlotModalSubjectId] = useState<string>('');
  const [slotModalAllowOverlap, setSlotModalAllowOverlap] = useState<boolean>(false);
  const [slotModalRoomNote, setSlotModalRoomNote] = useState<string>('');

  const [autoModalOpen, setAutoModalOpen] = useState<boolean>(false);
  const [autoScope, setAutoScope] = useState<string>('CURRENT');
  const [autoNoSameDay, setAutoNoSameDay] = useState<boolean>(true);
  const [autoCoreMorning, setAutoCoreMorning] = useState<boolean>(true);
  const [autoLockActivities, setAutoLockActivities] = useState<boolean>(true);
  const [autoAllowCombined, setAutoAllowCombined] = useState<boolean>(true);
  const [autoClearExisting, setAutoClearExisting] = useState<boolean>(true);

  const [conflictModalOpen, setConflictModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);

  const versionRef = useRef<number>(1);
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    const id = 'TST_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // AJAX Fetch / Polling Function (with Redis Cache headers inspection)
  const fetchTimetableViaAjax = useCallback(async (showManualToast = false) => {
    try {
      const res = await fetch(`/api/timetable?version=${ showManualToast ? 0 : versionRef.current }`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.cacheSource) setLastCacheSource(json.cacheSource);
      if (typeof json.latencyMs === 'number') setLastLatencyMs(json.latencyMs);
      if (json.cacheStats) setCacheStats(json.cacheStats);

      if (!json.upToDate && json.data) {
        setAppData(json.data);
        versionRef.current = json.data.version;
      }
      if (showManualToast) {
        showToast('อัปเดตข้อมูลตารางเรียนล่าสุดเรียบร้อยแล้ว', 'info');
      }
    } catch (err) {
      console.warn('AJAX sync fallback notice:', err);
    }
  }, [showToast]);

  // Connect WebSocket + Firebase SDK real-time listener + clear legacy browser caches
  useEffect(() => {
    clearLegacyBrowserCacheAndCookies();
    fetchTimetableViaAjax(false);

    const unsubscribeFirebase = subscribeToFirebaseTimetableState((remoteData) => {
      if (remoteData && (remoteData.version || 0) >= versionRef.current) {
        setAppData(remoteData);
        versionRef.current = remoteData.version || versionRef.current;
      }
    });

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;

    const connectWebSocket = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isUnmounted) return;
        setWsConnected(true);
        socket.send(
          JSON.stringify({
            type: 'presence:role',
            role: mainTab === 'student_live' ? 'student' : 'teacher',
            grade: selectedGrade
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'timetable:init' && msg.payload?.data) {
            setAppData(msg.payload.data);
            versionRef.current = msg.payload.data.version;
            if (msg.payload.cacheStats) setCacheStats(msg.payload.cacheStats);
            setLastCacheSource('HIT');
          } else if (msg.event === 'timetable:updated' && msg.payload?.data) {
            setAppData(msg.payload.data);
            versionRef.current = msg.payload.data.version;
            if (msg.payload.cacheStats) setCacheStats(msg.payload.cacheStats);
            if (msg.payload.slotKey) {
              setRecentUpdatedSlotKey(msg.payload.slotKey);
              setTimeout(() => setRecentUpdatedSlotKey(null), 2600);
            }
            if (msg.payload.notification) {
              const notif: TimetableChangeNotification = msg.payload.notification;
              setUnreadNotifications(prev => {
                if (prev.some(item => item.id === notif.id)) return prev;
                return [notif, ...prev].slice(0, 20);
              });
              showToast(`🔔 แจ้งเตือนเรียลไทม์: ${notif.summary}`, 'info');
            }
          } else if (msg.event === 'presence:update' && msg.payload) {
            setConnectedClients(msg.payload);
          }
        } catch (e) {
          console.warn('WS parse error:', e);
        }
      };

      socket.onclose = () => {
        if (isUnmounted) return;
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    // Background AJAX Polling every 8 seconds as resilience layer
    const ajaxPollInterval = setInterval(() => {
      fetchTimetableViaAjax(false);
    }, 8000);

    return () => {
      isUnmounted = true;
      unsubscribeFirebase();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(ajaxPollInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchTimetableViaAjax, showToast]);

  // Notify server when user switches between Student view and Teacher view
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'presence:role',
          role: mainTab === 'student_live' ? 'student' : 'teacher',
          grade: selectedGrade
        })
      );
    }
  }, [mainTab, selectedGrade]);

  const getTeacherById = (id: string) => appData.teachers.find(t => t.id === id) || null;
  const overlaps = getAllTeacherOverlaps(appData);
  const unallowedConflictCount = overlaps.filter(o => !o.isAllowed).length;

  const handleAuthSuccess = (user: UserAccount, updatedData?: unknown, welcomeMsg?: string) => {
    setCurrentUser(user);
    try {
      sessionStorage.setItem('donkaew_auth_session', JSON.stringify(user));
    } catch {
      // ignore storage errors
    }
    if (updatedData && typeof updatedData === 'object' && 'version' in updatedData) {
      const nextApp = updatedData as AppData;
      setAppData(nextApp);
      versionRef.current = nextApp.version;
    }
    if (user.assignedGrade) {
      setSelectedGrade(user.assignedGrade);
    }
    if (user.teacherId) {
      setSelectedTeacherId(user.teacherId);
    }
    if (user.role === 'student') {
      setMainTab('student_live');
    } else {
      setMainTab('scheduler');
    }
    if (welcomeMsg) {
      showToast(welcomeMsg, 'success');
    }
  };

  const handleLogout = async () => {
    await signOutFromFirebase();
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('donkaew_auth_session');
    } catch {
      // ignore storage errors
    }
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  };

  // Server Mutation Helpers
  const assignOrUpdateSlotOnServer = async (params: {
    grade: string;
    dayKey: string;
    periodId: string;
    subjectId?: string;
    allowOverlap?: boolean;
    roomNote?: string;
    action?: 'ASSIGN' | 'REMOVE' | 'SWAP';
    swapFromKey?: string;
  }) => {
    if (!canManageTimetable(currentUser, appData.accessPolicy)) {
      showToast('คุณไม่มีสิทธิ์แก้ไขตารางเรียน กรุณาเข้าสู่ระบบด้วยบัญชีครูผู้สอนหรือผู้ดูแลระบบ (Admin)', 'warning');
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/timetable/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          actorName: currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'ฝ่ายวิชาการ / ครูผู้สอน'
        })
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setAppData(json.data);
        versionRef.current = json.data.version;
        if (json.cacheStats) setCacheStats(json.cacheStats);
        if (json.data.accessPolicy?.firebaseRealtimeSyncEnabled !== false) {
          syncStateToFirebaseRTDB(json.data).catch(() => null);
        }
      }
    } catch (e) {
      showToast('ไม่สามารถซิงค์กับเซิร์ฟเวอร์ได้', 'error');
    }
  };

  const openSlotModal = (grade: string, dayKey: string, periodId: string) => {
    if (!canManageTimetable(currentUser, appData.accessPolicy)) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) หรือครูผู้สอนเท่านั้นที่สามารถแก้ไขคาบเรียนได้', 'warning');
      setAuthModalOpen(true);
      return;
    }
    setSlotModalContext({ grade, dayKey, periodId });
    const slotKey = `${grade}_${dayKey}_${periodId}`;
    const existing = appData.schedule[slotKey];
    const gradeSubs = appData.subjects.filter(s => s.grade === grade);

    if (existing) {
      setSlotModalSubjectId(existing.subjectId);
      setSlotModalAllowOverlap(!!existing.allowOverlap);
      setSlotModalRoomNote(existing.roomNote || '');
    } else {
      const firstSub = gradeSubs[0];
      setSlotModalSubjectId(firstSub ? firstSub.id : '');
      setSlotModalAllowOverlap(firstSub ? !!firstSub.allowCombined : false);
      setSlotModalRoomNote('');
    }
  };

  const handleSaveSlotModal = async () => {
    if (!slotModalContext || !slotModalSubjectId) return;
    await assignOrUpdateSlotOnServer({
      grade: slotModalContext.grade,
      dayKey: slotModalContext.dayKey,
      periodId: slotModalContext.periodId,
      subjectId: slotModalSubjectId,
      allowOverlap: slotModalAllowOverlap,
      roomNote: slotModalRoomNote.trim(),
      action: 'ASSIGN'
    });
    setSlotModalContext(null);
  };

  const handleRemoveSlotModal = async () => {
    if (!slotModalContext) return;
    await assignOrUpdateSlotOnServer({
      grade: slotModalContext.grade,
      dayKey: slotModalContext.dayKey,
      periodId: slotModalContext.periodId,
      action: 'REMOVE'
    });
    setSlotModalContext(null);
  };

  const handleRunSmartAutoSchedule = async () => {
    let targetGrades: string[] = [selectedGrade];
    if (autoScope === 'PRIMARY_LOW') targetGrades = ['ป.1', 'ป.2', 'ป.3'];
    else if (autoScope === 'PRIMARY_HIGH') targetGrades = ['ป.4', 'ป.5', 'ป.6'];
    else if (autoScope === 'PRIMARY_ALL') targetGrades = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
    else if (autoScope === 'JUNIOR_ALL') targetGrades = ['ม.1', 'ม.2', 'ม.3'];
    else if (autoScope === 'ALL') targetGrades = [...GRADES];

    try {
      const res = await fetch('/api/timetable/auto-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grades: targetGrades,
          noSameDayDuplicate: autoNoSameDay,
          coreMorning: autoCoreMorning,
          lockActivities: autoLockActivities,
          allowCombinedSubjects: autoAllowCombined,
          clearExisting: autoClearExisting,
          actorName: 'ระบบจัดตารางอัตโนมัติ (Smart Auto)'
        })
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setAppData(json.data);
        versionRef.current = json.data.version;
        if (json.cacheStats) setCacheStats(json.cacheStats);
        syncStateToFirebaseRTDB(json.data).catch(() => null);
        setAutoModalOpen(false);
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการจัดตารางอัตโนมัติ', 'error');
    }
  };

  const handleClearCurrentGrade = async () => {
    try {
      const res = await fetch('/api/timetable/clear-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: selectedGrade, actorName: 'ฝ่ายวิชาการ' })
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setAppData(json.data);
        versionRef.current = json.data.version;
        if (json.cacheStats) setCacheStats(json.cacheStats);
        syncStateToFirebaseRTDB(json.data).catch(() => null);
      }
    } catch {
      showToast('ไม่สามารถล้างตารางได้', 'error');
    }
  };

  const handleSyncMasterData = async (
    partial: Partial<Pick<AppData, 'schoolInfo' | 'teachers' | 'subjects' | 'periods' | 'schedule' | 'lineConfig'>>,
    summaryText: string
  ) => {
    try {
      const res = await fetch('/api/timetable/master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...partial,
          summary: summaryText,
          actorName: 'ฝ่ายวิชาการ / ผู้ดูแลระบบ'
        })
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setAppData(json.data);
        versionRef.current = json.data.version;
        if (json.cacheStats) setCacheStats(json.cacheStats);
        syncStateToFirebaseRTDB(json.data).catch(() => null);
        showToast(summaryText, 'success');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
  };

  const handleUpdateLineConfig = (nextConfig: LineConfig, showNotice = true) => {
    handleSyncMasterData(
      { lineConfig: nextConfig },
      showNotice ? 'บันทึกการตั้งค่าระบบแจ้งเตือน LINE เรียบร้อยแล้ว' : 'อัปเดตประวัติการส่งแจ้งเตือน LINE'
    );
  };

  const handleSyncAllToFirebase = async () => {
    setIsSyncingFirebase(true);
    try {
      clearLegacyBrowserCacheAndCookies();
      await syncStateToFirebaseRTDB(appData);
      const res = await fetch('/api/firebase/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: appData })
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setAppData(json.data);
        versionRef.current = json.data.version;
        const c = json.collectionsCount;
        showToast(
          `อัปโหลดข้อมูลขึ้น Firebase (dpk-asset) สำเร็จ! (ครู ${c?.teachers || 0} ท่าน, วิชา ${c?.subjects || 0} วิชา, ตาราง ${c?.scheduleSlots || 0} คาบ, สมาชิก ${c?.users || 0} บัญชี)`,
          'success'
        );
      } else {
        showToast('ซิงค์ข้อมูลกับ Firebase (dpk-asset) สำเร็จ', 'success');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการซิงค์ข้อมูลขึ้น Firebase', 'error');
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  const handleWarmRedisCache = async () => {
    const res = await fetch('/api/cache/warm', { method: 'POST' });
    const json = await res.json();
    if (json.cacheStats) setCacheStats(json.cacheStats);
    showToast(json.message || 'อุ่นข้อมูล Redis Cache สำเร็จ', 'success');
  };

  const handleFlushRedisCache = async () => {
    const res = await fetch('/api/cache/flush', { method: 'POST' });
    const json = await res.json();
    if (json.cacheStats) setCacheStats(json.cacheStats);
    showToast(json.message || 'ล้างข้อมูล Redis Cache สำเร็จ', 'info');
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ข้อมูลตารางเรียน_${appData.schoolInfo.schoolName}_${appData.schoolInfo.academicYear}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('สำรองข้อมูล (JSON) สำเร็จแล้ว', 'success');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (parsed && parsed.schoolInfo && parsed.teachers && parsed.subjects) {
          handleSyncMasterData(
            {
              schoolInfo: parsed.schoolInfo,
              teachers: parsed.teachers,
              subjects: parsed.subjects,
              periods: parsed.periods,
              schedule: parsed.schedule
            },
            'นำเข้าข้อมูลตารางเรียนจากไฟล์ JSON และซิงค์ให้นักเรียนทันที'
          );
        } else {
          showToast('รูปแบบไฟล์ JSON ไม่ถูกต้อง', 'error');
        }
      } catch {
        showToast('ไม่สามารถอ่านไฟล์ JSON ได้', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Drag and Drop on Desktop Grid
  const handleSlotDrop = async (ev: React.DragEvent<HTMLTableCellElement>, targetGrade: string, targetDayKey: string, targetPeriodId: string) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    try {
      const payload = JSON.parse(ev.dataTransfer.getData('text/plain'));
      if (payload.type === 'PALETTE_SUBJECT') {
        await assignOrUpdateSlotOnServer({
          grade: targetGrade,
          dayKey: targetDayKey,
          periodId: targetPeriodId,
          subjectId: payload.subjectId,
          allowOverlap: false,
          action: 'ASSIGN'
        });
      } else if (payload.type === 'GRID_SLOT') {
        const fromKey = `${payload.fromGrade}_${payload.fromDayKey}_${payload.fromPeriodId}`;
        const toKey = `${targetGrade}_${targetDayKey}_${targetPeriodId}`;
        if (fromKey === toKey) return;
        const fromEntry = appData.schedule[fromKey];
        if (!fromEntry) return;
        await assignOrUpdateSlotOnServer({
          grade: targetGrade,
          dayKey: targetDayKey,
          periodId: targetPeriodId,
          subjectId: fromEntry.subjectId,
          allowOverlap: fromEntry.allowOverlap,
          roomNote: fromEntry.roomNote,
          action: 'SWAP',
          swapFromKey: fromKey
        });
      }
    } catch (err) {
      console.warn('Drop error:', err);
    }
  };

  // Calculate subject palette hours for selectedGrade
  const gradeSubjects = appData.subjects.filter(s => s.grade === selectedGrade);
  let totalRequiredHours = 0;
  let totalScheduledHours = 0;
  gradeSubjects.forEach(s => {
    totalRequiredHours += s.hours;
    totalScheduledHours += getScheduledHoursForSubject(appData.schedule, appData.periods, selectedGrade, s.id);
  });
  const progressPercent = totalRequiredHours > 0 ? Math.min(100, Math.round((totalScheduledHours / totalRequiredHours) * 100)) : 0;

  // Require user login before accessing the web application
  if (!currentUser) {
    return (
      <>
        <AuthModal
          isOpen={true}
          isFullPageGate={true}
          schoolInfo={appData.schoolInfo}
          currentUser={null}
          teachers={appData.teachers}
          onAuthSuccess={handleAuthSuccess}
          onLogout={handleLogout}
          onShowToast={showToast}
        />
        <div className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0">
          {toasts.map(t => {
            const colors = {
              success: 'bg-teal-600 text-white border-teal-400',
              warning: 'bg-amber-500 text-white border-amber-300',
              error: 'bg-rose-600 text-white border-rose-400',
              info: 'bg-purple-600 text-white border-purple-400'
            };
            return (
              <div
                key={t.id}
                className={`px-4 py-3 rounded-2xl shadow-lg border ${colors[t.type]} text-xs font-extrabold flex items-center gap-2 pointer-events-auto`}
              >
                <i className="fa-solid fa-bell"></i>
                <span>{t.message}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-20 lg:pb-6">
      {/* TOP NAVIGATION HEADER */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b-2 border-pink-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 md:py-3 flex flex-wrap items-center justify-between gap-2.5">
          {/* School Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-tr from-pink-100 via-purple-50 to-blue-100 p-1.5 shadow-inner flex items-center justify-center border border-pink-200 shrink-0">
              <img
                src={appData.schoolInfo.logoUrl}
                alt="โลโก้โรงเรียนดอนแก้วปากเป่งคุยสำโรง"
                className="w-full h-full object-contain"
                onError={e => {
                  (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/100x100/FFD6E0/4A4063?text=LOGO';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm sm:text-base md:text-lg font-extrabold text-pink-600 truncate">
                  {appData.schoolInfo.schoolName}
                </h1>
                <span className="px-2.5 py-0.5 text-[10px] sm:text-xs font-extrabold rounded-full bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                  ภาคเรียนที่ {appData.schoolInfo.semester}/{appData.schoolInfo.academicYear}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-500 font-semibold truncate">
                {appData.schoolInfo.affiliation}
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav aria-label="เมนูหลักของระบบ" className="hidden lg:flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setMainTab('student_live')}
              className={`btn-pastel px-3.5 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 ${
                mainTab === 'student_live'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white'
                  : 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'
              }`}
            >
              <i className="fa-solid fa-user-graduate"></i>
              <span>ตารางเรียนนักเรียน (เรียลไทม์)</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('scheduler')}
              className={`btn-pastel px-3.5 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 ${
                mainTab === 'scheduler'
                  ? 'bg-pink-500 text-white'
                  : 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100'
              }`}
            >
              <i className="fa-solid fa-calendar-days"></i>
              <span>จัดตารางเรียน/สอน</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('admin_members')}
              className={`btn-pastel px-3.5 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 ${
                mainTab === 'admin_members'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white'
                  : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
              }`}
            >
              <i className="fa-solid fa-user-shield"></i>
              <span>ระบบผู้ดูแล & สมาชิก</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('settings')}
              className={`btn-pastel px-3.5 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 ${
                mainTab === 'settings'
                  ? 'bg-pink-500 text-white'
                  : 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100'
              }`}
            >
              <i className="fa-solid fa-sliders"></i>
              <span>ตั้งค่าข้อมูลพื้นฐาน</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('linenotify')}
              className={`btn-pastel px-3.5 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 ${
                mainTab === 'linenotify'
                  ? 'bg-[#06C755] text-white'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <i className="fa-brands fa-line text-sm"></i>
              <span>แจ้งเตือน LINE</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('reports')}
              className={`btn-pastel px-3.5 py-2 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 ${
                mainTab === 'reports'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
              }`}
            >
              <i className="fa-solid fa-print"></i>
              <span>พิมพ์รายงาน PDF / Word</span>
            </button>
          </nav>

          {/* Right Status Badges: Auth/Member Profile, Redis Cache, Notifications, Backup */}
          <div className="flex items-center gap-1.5">
            {/* User Account / Login Button */}
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              title="ระบบสมาชิก การลงชื่อเข้าใช้ และสลับบทบาทผู้ใช้งาน"
              className="btn-pastel px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 text-purple-900 border border-purple-200 hover:bg-purple-100 text-xs font-extrabold flex items-center gap-1.5"
            >
              <i
                className={`fa-solid ${
                  currentUser?.role === 'admin'
                    ? 'fa-user-shield text-purple-600'
                    : currentUser?.role === 'teacher'
                    ? 'fa-chalkboard-user text-pink-600'
                    : currentUser?.role === 'student'
                    ? 'fa-user-graduate text-sky-600'
                    : 'fa-right-to-bracket text-pink-600'
                }`}
              ></i>
              <span className="max-w-[115px] truncate">
                {currentUser ? currentUser.fullName.split(' ')[0] : 'เข้าสู่ระบบ'}
              </span>
              {currentUser && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9px] text-white font-extrabold ${
                    currentUser.role === 'admin'
                      ? 'bg-purple-600'
                      : currentUser.role === 'teacher'
                      ? 'bg-pink-500'
                      : 'bg-sky-500'
                  }`}
                >
                  {currentUser.role === 'admin'
                    ? 'Admin'
                    : currentUser.role === 'teacher'
                    ? 'ครู'
                    : `นร.${currentUser.assignedGrade || ''}`}
                </span>
              )}
            </button>

            {/* Real-time Change Notification Bell */}
            <button
              type="button"
              onClick={() => setNotifDrawerOpen(!notifDrawerOpen)}
              aria-label="เปิดรายการแจ้งเตือนการเปลี่ยนแปลงตารางเรียน"
              className="btn-pastel relative p-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-extrabold"
            >
              <i className="fa-solid fa-bell"></i>
              {(unreadNotifications.length > 0 || (appData.changeLogs?.length ?? 0) > 0) && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-extrabold">
                  {unreadNotifications.length > 0 ? unreadNotifications.length : appData.changeLogs.length}
                </span>
              )}
            </button>

            {/* Direct Firebase Cloud Upload & Sync Button */}
            <button
              type="button"
              onClick={handleSyncAllToFirebase}
              disabled={isSyncingFirebase}
              title="อัปโหลดและซิงค์ข้อมูลทั้งหมดขึ้นฐานข้อมูล Firebase (dpk-asset)"
              aria-label="ซิงค์ฐานข้อมูล Firebase"
              className="btn-pastel px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-extrabold flex items-center gap-1.5"
            >
              <i className={`fa-solid ${isSyncingFirebase ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-amber-600`}></i>
              <span className="hidden md:inline">{isSyncingFirebase ? 'กำลังซิงค์...' : 'ซิงค์ Firebase'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJSON}
              title="สำรองข้อมูล (Export JSON)"
              aria-label="สำรองข้อมูล JSON"
              className="btn-pastel p-2.5 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 text-xs font-bold hidden sm:flex items-center gap-1"
            >
              <i className="fa-solid fa-download"></i>
            </button>

            <label
              title="นำเข้าข้อมูล (Import JSON)"
              className="btn-pastel p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-xs font-bold hidden sm:flex items-center gap-1 cursor-pointer"
            >
              <i className="fa-solid fa-upload"></i>
              <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
            </label>
          </div>
        </div>

        {/* Notification Dropdown Panel */}
        {notifDrawerOpen && (
          <div className="max-w-7xl mx-auto px-4 pb-3">
            <div className="pastel-card p-4 bg-white border-2 border-rose-200 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-bell text-rose-500"></i>
                  <span className="font-extrabold text-xs sm:text-sm text-gray-800">
                    ศูนย์แจ้งเตือนการเปลี่ยนแปลงตารางเรียนแบบเรียลไทม์ (Real-Time Change Alerts)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {unreadNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUnreadNotifications([])}
                      className="text-[11px] font-bold text-teal-700 hover:underline"
                    >
                      ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotifDrawerOpen(false)}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold"
                  >
                    ปิด
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
                {(appData.changeLogs || []).map(item => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
                    <div>
                      <span className="px-2 py-0.5 rounded bg-rose-500 text-white font-extrabold text-[10px] mr-2">
                        {item.grade}
                      </span>
                      <span className="font-bold text-gray-800">{item.summary}</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 shrink-0">
                      {new Date(item.timestamp).toLocaleTimeString('th-TH')} น.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="no-print flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-4 md:py-6 space-y-6">
        {/* TAB 1: REAL-TIME STUDENT PORTAL */}
        {mainTab === 'student_live' && (
          <StudentRealtimePortal
            appData={appData}
            selectedGrade={selectedGrade}
            onSelectGrade={setSelectedGrade}
            wsConnected={wsConnected}
            lastCacheSource={lastCacheSource}
            lastLatencyMs={lastLatencyMs}
            recentUpdatedSlotKey={recentUpdatedSlotKey}
            onManualAjaxRefresh={() => fetchTimetableViaAjax(true)}
            unreadNotifications={unreadNotifications}
            onClearUnread={() => setUnreadNotifications([])}
          />
        )}

        {/* TAB 2: INTERACTIVE TIMETABLE SCHEDULER */}
        {mainTab === 'scheduler' && (
          <section className="space-y-4 md:space-y-6">
            {/* Top Control Bar for Scheduler */}
            <div className="pastel-card p-3.5 md:p-4 bg-gradient-to-r from-pink-50 via-white to-blue-50 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex rounded-2xl p-1 bg-pink-100/80 border border-pink-200 w-full sm:w-auto justify-center">
                  <button
                    type="button"
                    onClick={() => setSchedulerMode('class')}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      schedulerMode === 'class' ? 'bg-white text-pink-600 shadow-xs' : 'text-gray-600 hover:text-pink-600'
                    }`}
                  >
                    <i className="fa-solid fa-graduation-cap mr-1"></i> ตารางเรียนรายชั้น
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedulerMode('teacher')}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      schedulerMode === 'teacher' ? 'bg-white text-pink-600 shadow-xs' : 'text-gray-600 hover:text-pink-600'
                    }`}
                  >
                    <i className="fa-solid fa-chalkboard-user mr-1"></i> ตารางสอนครู
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedulerMode('overview')}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      schedulerMode === 'overview' ? 'bg-white text-pink-600 shadow-xs' : 'text-gray-600 hover:text-pink-600'
                    }`}
                  >
                    <i className="fa-solid fa-table-cells mr-1"></i> ภาพรวมทุกชั้น
                  </button>
                </div>

                {/* Grade Buttons Bar */}
                {schedulerMode === 'class' && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
                    {GRADES.map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setSelectedGrade(g)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 transition ${
                          selectedGrade === g
                            ? 'btn-pastel bg-pink-500 text-white'
                            : 'bg-white text-gray-700 border border-pink-200 hover:bg-pink-50'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}

                {/* Teacher Dropdown */}
                {schedulerMode === 'teacher' && (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label className="text-xs font-bold text-gray-600 shrink-0">เลือกครูผู้สอน:</label>
                    <select
                      value={selectedTeacherId}
                      onChange={e => setSelectedTeacherId(e.target.value)}
                      aria-label="เลือกครูผู้สอน"
                      className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-pink-300 bg-white text-xs font-bold text-gray-700"
                    >
                      {appData.teachers.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.prefix}{t.fullName} ({t.homeroom !== '-' ? `ประจำชั้น ${t.homeroom}` : t.dept})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoModalOpen(true)}
                  className="btn-pastel flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-extrabold text-xs flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  <span>จัดตารางอัตโนมัติ (Smart Auto)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConflictModalOpen(true)}
                  className="btn-pastel px-3.5 py-2.5 rounded-2xl bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-xs flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>
                    ตรวจเวลาสอนซ้ำ ({unallowedConflictCount > 0 ? `${unallowedConflictCount} ชน` : overlaps.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleClearCurrentGrade}
                  className="btn-pastel px-3 py-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs flex items-center gap-1"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  <span>ล้างตารางชั้นนี้</span>
                </button>
              </div>
            </div>

            {/* CLASS OR TEACHER SCHEDULER VIEW */}
            {schedulerMode !== 'overview' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Subject Palette (Class mode) */}
                {schedulerMode === 'class' && (
                  <div className="lg:col-span-3 pastel-card p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-pink-100 pb-2.5">
                      <div>
                        <h3 className="font-extrabold text-sm text-gray-800 flex items-center gap-1.5">
                          <i className="fa-solid fa-swatchbook text-pink-500"></i>
                          <span>รายวิชาประจำชั้น <span className="text-pink-600">{selectedGrade}</span></span>
                        </h3>
                        <p className="text-[11px] text-gray-500">คลิกที่ช่องตารางเรียน หรือลากวาง</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-100 text-xs space-y-1.5">
                      <div className="flex justify-between font-extrabold text-purple-900">
                        <span>จัดคาบเรียนแล้ว</span>
                        <span>{totalScheduledHours} / {totalRequiredHours} ชม. ({progressPercent}%)</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-purple-200 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:max-h-[500px] pb-1 lg:pr-1">
                      {gradeSubjects.map(s => {
                        const used = getScheduledHoursForSubject(appData.schedule, appData.periods, selectedGrade, s.id);
                        const t = getTeacherById(s.teacherId);
                        const isComplete = used >= s.hours;
                        return (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={ev => {
                              ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'PALETTE_SUBJECT', subjectId: s.id }));
                            }}
                            onClick={() => showToast(`คลิกที่ช่องคาบเรียนในตารางเพื่อจัดวิชา "${s.name}" ลงคาบเรียนได้เลยค่ะ`, 'info')}
                            className={`min-w-[210px] lg:min-w-0 p-2.5 rounded-xl border transition cursor-grab active:cursor-grabbing hover:shadow-md shrink-0 ${
                              isComplete ? 'bg-gray-50/90 border-gray-200 opacity-80' : 'bg-white border-pink-200'
                            }`}
                            style={{ borderLeft: `5px solid ${t ? t.color : '#FFD6E0'}` }}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-extrabold text-xs text-gray-800 truncate">{s.code} {s.name}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                                isComplete ? 'bg-teal-100 text-teal-800' : 'bg-pink-100 text-pink-700'
                              }`}>
                                {used}/{s.hours} ชม.
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
                              <span className="truncate"><i className="fa-solid fa-user-pen mr-1"></i>{t ? `${t.prefix}${t.fullName}` : '-'}</span>
                              {s.allowCombined && (
                                <span className="text-[10px] text-teal-700 font-bold shrink-0">สอนรวมได้</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Timetable Interactive Grid (Responsive Mobile Day Cards + Desktop Table) */}
                <div className={`${schedulerMode === 'class' ? 'lg:col-span-9' : 'lg:col-span-12'} pastel-card p-4 md:p-5 space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pink-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="px-3.5 py-1.5 rounded-2xl bg-pink-500 text-white font-extrabold text-xs md:text-sm shadow-xs">
                        {schedulerMode === 'class'
                          ? `ชั้น${GRADE_FULL_NAMES[selectedGrade]}`
                          : `ตารางสอนครู`}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm md:text-base text-gray-800">
                          {schedulerMode === 'class'
                            ? `ตารางเรียนชั้น${GRADE_FULL_NAMES[selectedGrade]} (${selectedGrade})`
                            : (() => {
                                const t = getTeacherById(selectedTeacherId);
                                return t ? `ตารางสอน ${t.prefix}${t.fullName}` : 'ตารางสอนครู';
                              })()}
                        </h3>
                        <p className="text-xs text-gray-500">
                          คลิกหรือแตะที่ช่องคาบเรียนเพื่อเปลี่ยนวิชา (ซิงค์เข้าหน้าเว็บนักเรียนทันที)
                        </p>
                      </div>
                    </div>

                    {/* Mobile Day Filter Pills */}
                    <div className="flex lg:hidden items-center gap-1 overflow-x-auto w-full pt-1">
                      <button
                        type="button"
                        onClick={() => setMobileDayFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                          mobileDayFilter === 'ALL' ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-700'
                        }`}
                      >
                        ทุกวัน
                      </button>
                      {DAYS.map(d => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setMobileDayFilter(d.key)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                            mobileDayFilter === d.key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mobile Card-Based Interactive Timetable (No awkward horizontal scroll on phones!) */}
                  <div className="block lg:hidden space-y-3">
                    {DAYS.filter(d => mobileDayFilter === 'ALL' || d.key === mobileDayFilter).map(day => (
                      <div key={day.key} className="rounded-2xl border border-pink-200 overflow-hidden bg-white">
                        <div
                          className="px-3.5 py-2 font-extrabold text-xs text-gray-800 flex items-center justify-between"
                          style={{ backgroundColor: day.color }}
                        >
                          <span>วัน{day.name}</span>
                          <span className="text-[11px] font-bold">แตะคาบเรียนเพื่อแก้ไข</span>
                        </div>
                        <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {appData.periods.map(period => {
                            if (period.type === 'lunch') {
                              return (
                                <div
                                  key={period.id}
                                  className="sm:col-span-2 py-1.5 px-3 rounded-xl bg-amber-50 text-amber-800 text-center text-xs font-bold"
                                >
                                  <i className="fa-solid fa-utensils mr-1"></i>พักกลางวัน ({period.start}-{period.end})
                                </div>
                              );
                            }

                            const targetGrade = schedulerMode === 'class' ? selectedGrade : 'ป.1';
                            const slotKey = `${targetGrade}_${day.key}_${period.id}`;
                            const entry = appData.schedule[slotKey];
                            const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
                            const teacher = sub ? getTeacherById(sub.teacherId) : null;

                            return (
                              <button
                                key={period.id}
                                type="button"
                                onClick={() => openSlotModal(targetGrade, day.key, period.id)}
                                className={`text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                                  sub ? 'border-black/10 shadow-2xs' : 'border-dashed border-pink-200 bg-pink-50/20'
                                }`}
                                style={{ backgroundColor: sub && teacher ? teacher.color : undefined }}
                              >
                                <div className="min-w-0">
                                  <div className="text-[10px] font-extrabold text-gray-700">
                                    {period.label} ({period.start}-{period.end})
                                  </div>
                                  {sub ? (
                                    <>
                                      <div className="text-xs font-extrabold text-gray-900 truncate">
                                        {sub.code} {sub.name}
                                      </div>
                                      <div className="text-[10px] text-gray-700 font-semibold truncate">
                                        {teacher ? `${teacher.prefix}${teacher.fullName}` : '-'}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs font-bold text-pink-400">+ แตะเพื่อเพิ่มวิชา</div>
                                  )}
                                </div>
                                <i className="fa-solid fa-pen-to-square text-xs text-gray-500 shrink-0"></i>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Full Table Interactive Grid */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full border-collapse min-w-[820px]">
                      <thead>
                        <tr className="bg-pink-100/70 text-gray-800 text-xs">
                          <th className="p-3 border border-pink-200 rounded-tl-xl w-28">วัน / เวลา</th>
                          {appData.periods.map(p => (
                            <th key={p.id} className="p-2.5 border border-pink-200 text-center">
                              <div className="font-extrabold text-gray-800">{p.label}</div>
                              <div className="text-[11px] font-medium text-gray-500">{p.start} - {p.end}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map(day => (
                          <tr key={day.key}>
                            <td
                              className="p-3 border border-pink-200 font-extrabold text-sm text-center"
                              style={{ backgroundColor: day.color }}
                            >
                              {day.name}
                            </td>
                            {appData.periods.map(period => {
                              if (period.type === 'lunch') {
                                return (
                                  <td
                                    key={period.id}
                                    className="p-2 border border-pink-200 bg-amber-50/70 text-center align-middle"
                                  >
                                    <div className="text-xs font-bold text-amber-800">
                                      <i className="fa-solid fa-utensils mr-1"></i>พักกลางวัน
                                    </div>
                                  </td>
                                );
                              }

                              if (schedulerMode === 'teacher') {
                                // Teacher timetable cell
                                const taughtItems: Array<{ grade: string; sub: typeof appData.subjects[number]; allowOverlap: boolean }> = [];
                                GRADES.forEach(g => {
                                  const e = appData.schedule[`${g}_${day.key}_${period.id}`];
                                  if (e) {
                                    const s = appData.subjects.find(item => item.id === e.subjectId);
                                    if (s && s.teacherId === selectedTeacherId) {
                                      taughtItems.push({ grade: g, sub: s, allowOverlap: e.allowOverlap || s.allowCombined });
                                    }
                                  }
                                });
                                const teacherObj = getTeacherById(selectedTeacherId);
                                return (
                                  <td key={period.id} className="slot-cell p-2 border border-pink-200 align-top">
                                    {taughtItems.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => openSlotModal(taughtItems[0].grade, day.key, period.id)}
                                        className="w-full h-full text-left p-2.5 rounded-xl border border-black/15 cursor-pointer flex flex-col justify-between"
                                        style={{ backgroundColor: teacherObj?.color || '#FFE0B2' }}
                                      >
                                        <div>
                                          <div className="flex items-center justify-between">
                                            <span className="px-2 py-0.5 rounded bg-white/90 text-gray-900 font-extrabold text-[11px]">
                                              ชั้น {taughtItems.map(i => i.grade).join(', ')}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-700">{taughtItems[0].sub.code}</span>
                                          </div>
                                          <div className="text-xs font-extrabold text-gray-900 mt-1">
                                            {taughtItems[0].sub.name}
                                          </div>
                                        </div>
                                      </button>
                                    ) : (
                                      <div className="h-full min-h-[68px] flex items-center justify-center text-[11px] text-gray-300">
                                        -
                                      </div>
                                    )}
                                  </td>
                                );
                              }

                              // Class mode cell
                              const slotKey = `${selectedGrade}_${day.key}_${period.id}`;
                              const entry = appData.schedule[slotKey];
                              const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
                              const teacher = sub ? getTeacherById(sub.teacherId) : null;
                              const clashes = sub ? findTeacherConflictsAtSlot(appData, day.key, period.id, sub.teacherId, selectedGrade) : [];
                              const hasClash = clashes.length > 0;
                              const isOverlapAllowed = entry && (entry.allowOverlap || (sub && sub.allowCombined));
                              const isFlash = recentUpdatedSlotKey === slotKey;

                              return (
                                <td
                                  key={period.id}
                                  onDragOver={ev => {
                                    ev.preventDefault();
                                    ev.currentTarget.classList.add('drag-over');
                                  }}
                                  onDragLeave={ev => ev.currentTarget.classList.remove('drag-over')}
                                  onDrop={ev => handleSlotDrop(ev, selectedGrade, day.key, period.id)}
                                  className="slot-cell p-2 border border-pink-200 align-top hover:bg-pink-50/40"
                                >
                                  {sub ? (
                                    <button
                                      type="button"
                                      draggable
                                      onDragStart={ev => {
                                        ev.stopPropagation();
                                        ev.dataTransfer.setData(
                                          'text/plain',
                                          JSON.stringify({
                                            type: 'GRID_SLOT',
                                            fromGrade: selectedGrade,
                                            fromDayKey: day.key,
                                            fromPeriodId: period.id
                                          })
                                        );
                                      }}
                                      onClick={() => openSlotModal(selectedGrade, day.key, period.id)}
                                      aria-label={`แก้ไขคาบเรียน วัน${day.name} ${period.label} วิชา${sub.name}`}
                                      className={`w-full h-full text-left p-2 rounded-xl border border-black/10 shadow-xs flex flex-col justify-between cursor-pointer ${
                                        isFlash ? 'realtime-slot-flash ring-2 ring-pink-500' : ''
                                      }`}
                                      style={{ backgroundColor: teacher ? teacher.color : '#FFFFFF' }}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[11px] font-extrabold text-gray-800">{sub.code}</span>
                                          {sub.category.includes('กิจกรรม') && (
                                            <span className="text-[9px] px-1.5 rounded bg-white/80 text-purple-800 font-bold">
                                              กิจกรรม
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs font-extrabold text-gray-900 leading-tight mt-0.5">
                                          {sub.name}
                                        </div>
                                      </div>
                                      <div className="mt-1.5 pt-1 border-t border-black/10 text-[10px] text-gray-700 font-semibold flex items-center justify-between">
                                        <span className="truncate">
                                          <i className="fa-solid fa-user mr-1"></i>
                                          {teacher ? teacher.fullName.split(' ')[0] : '-'}
                                        </span>
                                        {entry?.roomNote && (
                                          <span className="px-1 rounded bg-white/70">{entry.roomNote}</span>
                                        )}
                                      </div>
                                      {hasClash && (
                                        <div
                                          className={`mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center justify-between gap-1 ${
                                            isOverlapAllowed
                                              ? 'bg-teal-100 text-teal-800'
                                              : 'bg-rose-600 text-white animate-pulse'
                                          }`}
                                        >
                                          <span>
                                            {isOverlapAllowed ? 'รวม: ' : 'ซ้ำกับ '}
                                            {clashes.map(c => c.grade).join(',')}
                                          </span>
                                        </div>
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openSlotModal(selectedGrade, day.key, period.id)}
                                      aria-label={`เพิ่มวิชาในวัน${day.name} ${period.label}`}
                                      className="w-full h-full min-h-[70px] rounded-xl border border-dashed border-pink-200 flex flex-col items-center justify-center text-gray-400 hover:text-pink-500 transition cursor-pointer"
                                    >
                                      <i className="fa-solid fa-plus text-xs"></i>
                                      <span className="text-[10px]">ว่าง</span>
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* MASTER OVERVIEW ALL GRADES */
              <div className="pastel-card p-4 md:p-5 space-y-4 overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-3">
                  <div>
                    <h3 className="font-extrabold text-base text-gray-800">
                      มุมมองตารางเรียนรวมทุกระดับชั้น (ป.1 - ม.3)
                    </h3>
                    <p className="text-xs text-gray-500">
                      เลือกวันเพื่อตรวจสอบความสอดคล้องของคาบเรียนและครูผู้สอนทั้งโรงเรียน
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map(d => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setOverviewDay(d.key)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold ${
                          overviewDay === d.key
                            ? 'btn-pastel bg-pink-500 text-white'
                            : 'bg-white text-gray-700 border border-pink-200'
                        }`}
                      >
                        วัน{d.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[820px] text-xs">
                    <thead>
                      <tr className="bg-pink-100 text-gray-800">
                        <th className="p-2.5 border border-pink-200 w-20">ระดับชั้น</th>
                        {appData.periods.map(p => (
                          <th key={p.id} className="p-2 border border-pink-200 text-center">
                            <div className="font-bold">{p.label}</div>
                            <div className="text-[10px] text-gray-500">{p.start}-{p.end}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {GRADES.map(g => (
                        <tr key={g}>
                          <td className="p-2.5 border border-pink-200 font-extrabold text-center bg-pink-50">{g}</td>
                          {appData.periods.map(p => {
                            if (p.type === 'lunch') {
                              return (
                                <td key={p.id} className="p-2 border border-pink-200 bg-amber-50 text-center font-bold text-amber-700">
                                  พัก
                                </td>
                              );
                            }
                            const entry = appData.schedule[`${g}_${overviewDay}_${p.id}`];
                            const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
                            const t = sub ? getTeacherById(sub.teacherId) : null;
                            return (
                              <td
                                key={p.id}
                                onClick={() => openSlotModal(g, overviewDay, p.id)}
                                className="p-2 border border-pink-200 cursor-pointer hover:opacity-90"
                                style={{ backgroundColor: sub && t ? t.color : '#FFFFFF' }}
                              >
                                {sub ? (
                                  <>
                                    <div className="font-extrabold text-gray-900">{sub.code} {sub.name}</div>
                                    <div className="text-[10px] text-gray-700">{t ? t.fullName.split(' ')[0] : ''}</div>
                                  </>
                                ) : (
                                  <span className="text-gray-300">ว่าง</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: ADMIN & MEMBER MANAGEMENT */}
        {mainTab === 'admin_members' && (
          <AdminDashboardSection
            appData={appData}
            currentUser={currentUser}
            onAppDataUpdated={next => {
              setAppData(next);
              versionRef.current = next.version;
            }}
            onShowToast={showToast}
            onOpenAuthModal={() => setAuthModalOpen(true)}
          />
        )}

        {/* TAB 4: SETTINGS */}
        {mainTab === 'settings' && (
          <SettingsSection
            appData={appData}
            onSyncMasterData={handleSyncMasterData}
            onShowToast={showToast}
          />
        )}

        {/* TAB 5: LINE NOTIFICATIONS */}
        {mainTab === 'linenotify' && (
          <LineNotificationSection
            appData={appData}
            onUpdateLineConfig={handleUpdateLineConfig}
            onShowToast={showToast}
          />
        )}

        {/* TAB 6: OFFICIAL REPORTS */}
        {mainTab === 'reports' && (
          <OfficialReportSection
            appData={appData}
            currentSelectedGrade={selectedGrade}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR (Responsive Fluid Access on All Screen Sizes) */}
      <nav
        aria-label="เมนูนำทางบนมือถือ"
        className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-pink-100 shadow-lg px-1.5 py-1.5 grid grid-cols-6 gap-1"
      >
        <button
          type="button"
          onClick={() => setMainTab('student_live')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition ${
            mainTab === 'student_live' ? 'bg-sky-500 text-white' : 'text-gray-600'
          }`}
        >
          <i className="fa-solid fa-user-graduate text-sm mb-0.5"></i>
          <span>นักเรียน</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('scheduler')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition ${
            mainTab === 'scheduler' ? 'bg-pink-500 text-white' : 'text-gray-600'
          }`}
        >
          <i className="fa-solid fa-calendar-days text-sm mb-0.5"></i>
          <span>จัดตาราง</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('admin_members')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition ${
            mainTab === 'admin_members' ? 'bg-purple-600 text-white' : 'text-gray-600'
          }`}
        >
          <i className="fa-solid fa-user-shield text-sm mb-0.5"></i>
          <span>ผู้ดูแล</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('settings')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition ${
            mainTab === 'settings' ? 'bg-pink-500 text-white' : 'text-gray-600'
          }`}
        >
          <i className="fa-solid fa-sliders text-sm mb-0.5"></i>
          <span>ตั้งค่า</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('linenotify')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition ${
            mainTab === 'linenotify' ? 'bg-[#06C755] text-white' : 'text-gray-600'
          }`}
        >
          <i className="fa-brands fa-line text-sm mb-0.5"></i>
          <span>LINE</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('reports')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-extrabold transition ${
            mainTab === 'reports' ? 'bg-purple-600 text-white' : 'text-gray-600'
          }`}
        >
          <i className="fa-solid fa-print text-sm mb-0.5"></i>
          <span>พิมพ์</span>
        </button>
      </nav>

      {/* DEDICATED PRINT OUTPUT WRAPPER */}
      <div id="printAreaWrapper" className="hidden official-doc-container"></div>

      {/* SLOT ASSIGN / EDIT MODAL */}
      {slotModalContext && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="slotModalTitle"
          className="no-print fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-lg w-full p-5 md:p-6 space-y-4 border-2 border-pink-200">
            <div className="flex items-center justify-between border-b border-pink-100 pb-3">
              <div>
                <h3 id="slotModalTitle" className="font-extrabold text-base text-gray-800">
                  กำหนดรายวิชา ชั้น{GRADE_FULL_NAMES[slotModalContext.grade]} ({slotModalContext.grade})
                </h3>
                <p className="text-xs text-pink-600 font-bold">
                  วัน{DAYS.find(d => d.key === slotModalContext.dayKey)?.name} •{' '}
                  {appData.periods.find(p => p.id === slotModalContext.periodId)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSlotModalContext(null)}
                aria-label="ปิดหน้าต่างกำหนดรายวิชา"
                className="w-8 h-8 rounded-full bg-pink-50 text-gray-500 hover:bg-pink-100 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="slotSubjectSelect" className="block font-bold text-gray-700 mb-1">
                  เลือกรายวิชา / กิจกรรมพัฒนาผู้เรียนของชั้นนี้
                </label>
                <select
                  id="slotSubjectSelect"
                  value={slotModalSubjectId}
                  onChange={e => setSlotModalSubjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-pink-200 text-xs sm:text-sm font-bold bg-white"
                >
                  {appData.subjects
                    .filter(s => s.grade === slotModalContext.grade)
                    .map(s => {
                      const t = getTeacherById(s.teacherId);
                      const used = getScheduledHoursForSubject(appData.schedule, appData.periods, slotModalContext.grade, s.id);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.code} {s.name} ({used}/{s.hours} ชม.) - {t ? `${t.prefix}${t.fullName}` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              {(() => {
                const sub = appData.subjects.find(s => s.id === slotModalSubjectId);
                const clashes = sub
                  ? findTeacherConflictsAtSlot(appData, slotModalContext.dayKey, slotModalContext.periodId, sub.teacherId, slotModalContext.grade)
                  : [];
                if (clashes.length === 0) return null;
                const t = sub ? getTeacherById(sub.teacherId) : null;
                return (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                    <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                    ครู {t ? `${t.prefix}${t.fullName}` : ''} มีตารางสอนในคาบนี้ที่ชั้น:{' '}
                    {clashes.map(c => `${c.grade} (${c.subject.name})`).join(', ')}
                  </div>
                );
              })()}

              <div className="p-3 rounded-2xl bg-teal-50/70 border border-teal-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slotModalAllowOverlap}
                    onChange={e => setSlotModalAllowOverlap(e.target.checked)}
                    className="mt-0.5 rounded text-teal-600 w-4 h-4"
                  />
                  <div>
                    <div className="font-bold text-teal-900">
                      อนุญาตให้ครูสอนซ้ำคาบกัน / สอนควบรวมหลายชั้นในคาบนี้
                    </div>
                    <div className="text-teal-700 text-[11px]">
                      ติ๊กเลือกหากวิชานี้เป็นการเรียนรวมหลายชั้นพร้อมกัน (เช่น พละ ลูกเสือ ชุมนุม)
                    </div>
                  </div>
                </label>
              </div>

              <div>
                <label htmlFor="slotRoomNoteInput" className="block font-bold text-gray-700 mb-1">
                  ห้องเรียน / หมายเหตุเพิ่มเติม (ถ้ามี)
                </label>
                <input
                  id="slotRoomNoteInput"
                  type="text"
                  value={slotModalRoomNote}
                  onChange={e => setSlotModalRoomNote(e.target.value)}
                  placeholder="เช่น ห้องวิทย์, สนามกีฬา, หอประชุม"
                  className="w-full px-3.5 py-2 rounded-xl border border-pink-200 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-pink-100">
              <button
                type="button"
                onClick={handleRemoveSlotModal}
                className="btn-pastel px-4 py-2 rounded-xl bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5"
              >
                <i className="fa-solid fa-eraser"></i> ลบคาบเรียนนี้
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setSlotModalContext(null)}
                  className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveSlotModal}
                  className="btn-pastel px-5 py-2 rounded-xl bg-pink-500 text-white font-extrabold text-xs flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-check"></i> บันทึก & แจ้งเตือนนักเรียนทันที
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMART AUTO-SCHEDULE MODAL */}
      {autoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-xl w-full p-5 md:p-6 space-y-4 border-2 border-purple-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <h3 className="font-extrabold text-base text-gray-800">
                ตั้งค่าระบบจัดตารางเรียนอัตโนมัติ (Smart Auto-Scheduler)
              </h3>
              <button
                type="button"
                onClick={() => setAutoModalOpen(false)}
                className="w-8 h-8 rounded-full bg-purple-50 text-gray-500 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-100 space-y-1.5">
                <label className="block font-bold text-purple-900">1. ขอบเขตระดับชั้นที่ต้องการจัดอัตโนมัติ</label>
                <select
                  value={autoScope}
                  onChange={e => setAutoScope(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-purple-200 font-bold text-gray-700 bg-white"
                >
                  <option value="CURRENT">เฉพาะชั้นที่กำลังเปิดดูอยู่ปัจจุบัน ({selectedGrade})</option>
                  <option value="PRIMARY_LOW">ช่วงชั้นประถมศึกษาตอนต้น (ป.1 - ป.3)</option>
                  <option value="PRIMARY_HIGH">ช่วงชั้นประถมศึกษาตอนปลาย (ป.4 - ป.6)</option>
                  <option value="PRIMARY_ALL">ระดับประถมศึกษาทั้งหมด (ป.1 - ป.6)</option>
                  <option value="JUNIOR_ALL">ระดับมัธยมศึกษาตอนต้นทั้งหมด (ม.1 - ม.3)</option>
                  <option value="ALL">จัดใหม่ทั้งโรงเรียน (ป.1 - ม.3 ทุกชั้นเรียน)</option>
                </select>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-pink-50/60 border border-pink-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoNoSameDay}
                  onChange={e => setAutoNoSameDay(e.target.checked)}
                  className="mt-0.5 rounded text-pink-600 w-4 h-4"
                />
                <span className="font-bold text-gray-800">
                  ป้องกันไม่ให้วิชาเดียวกันซ้ำใน 1 วัน และกระจายคาบเรียนอย่างสมดุล
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-blue-50/60 border border-blue-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCoreMorning}
                  onChange={e => setAutoCoreMorning(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 w-4 h-4"
                />
                <span className="font-bold text-gray-800">
                  จัดวิชาหลัก (คณิต วิทย์ ไทย อังกฤษ) ไว้ในช่วงคาบเช้าเป็นหลัก
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/60 border border-amber-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLockActivities}
                  onChange={e => setAutoLockActivities(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 w-4 h-4"
                />
                <span className="font-bold text-gray-800">
                  ล็อกคาบกิจกรรมพัฒนาผู้เรียน (ลูกเสือ ชุมนุม แนะแนว) ให้ตรงกัน
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-teal-50/60 border border-teal-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAllowCombined}
                  onChange={e => setAutoAllowCombined(e.target.checked)}
                  className="mt-0.5 rounded text-teal-600 w-4 h-4"
                />
                <span className="font-bold text-gray-800">
                  อนุญาตให้วิชาที่ตั้งค่า &quot;สอนรวมหลายชั้นได้&quot; ใช้ครูคนเดียวกันพร้อมกันได้
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-gray-50 border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoClearExisting}
                  onChange={e => setAutoClearExisting(e.target.checked)}
                  className="mt-0.5 rounded text-purple-600 w-4 h-4"
                />
                <span className="font-bold text-gray-800">
                  ล้างคาบเรียนเดิมของชั้นที่เลือกก่อนจัดใหม่อัตโนมัติ
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-purple-100">
              <button
                type="button"
                onClick={() => setAutoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleRunSmartAutoSchedule}
                className="btn-pastel px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-extrabold text-xs flex items-center gap-2"
              >
                <i className="fa-solid fa-bolt"></i> เริ่มจัดตารางเรียนอัตโนมัติทันที
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFLICT SUMMARY MODAL */}
      {conflictModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-2xl w-full p-5 md:p-6 space-y-4 border-2 border-amber-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <h3 className="font-extrabold text-base text-gray-800">
                รายการตรวจสอบเวลาสอนซ้ำของครู (ป.1 - ม.3)
              </h3>
              <button
                type="button"
                onClick={() => setConflictModalOpen(false)}
                className="w-8 h-8 rounded-full bg-amber-50 text-gray-500 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {overlaps.length === 0 ? (
                <div className="p-6 rounded-2xl bg-teal-50 border border-teal-200 text-center space-y-1">
                  <i className="fa-solid fa-circle-check text-2xl text-teal-500"></i>
                  <div className="font-extrabold text-teal-900">ไม่พบเวลาสอนซ้ำซ้อนในระบบ!</div>
                </div>
              ) : (
                overlaps.map((o, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 ${
                      o.isAllowed ? 'bg-teal-50/70 border-teal-200' : 'bg-rose-50 border-rose-200'
                    }`}
                  >
                    <div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold mr-2 ${
                          o.isAllowed ? 'bg-teal-600 text-white' : 'bg-rose-600 text-white'
                        }`}
                      >
                        {o.isAllowed ? 'อนุญาตสอนรวมแล้ว' : 'เวลาสอนชนกัน!'}
                      </span>
                      <span className="font-extrabold text-gray-800">
                        {o.teacher ? `${o.teacher.prefix}${o.teacher.fullName}` : 'ไม่ระบุครู'}
                      </span>
                      <span className="text-gray-600 ml-2">
                        วัน{o.day.name} {o.period.label} ({o.items.map(i => i.grade).join(', ')})
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-amber-100">
              <button
                type="button"
                onClick={() => setConflictModalOpen(false)}
                className="btn-pastel px-5 py-2 rounded-xl bg-pink-500 text-white font-bold text-xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REDIS CACHE MONITOR MODAL */}
      <RedisCacheModal
        isOpen={redisModalOpen}
        onClose={() => setRedisModalOpen(false)}
        stats={cacheStats}
        wsConnected={wsConnected}
        connectedClients={connectedClients}
        onWarmCache={handleWarmRedisCache}
        onFlushCache={handleFlushRedisCache}
        onAjaxRefresh={() => fetchTimetableViaAjax(true)}
      />

      {/* MEMBER & AUTHENTICATION MODAL */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        currentUser={currentUser}
        teachers={appData.teachers}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
        onShowToast={showToast}
      />

      {/* TOAST NOTIFICATIONS */}
      <div className="no-print fixed bottom-16 lg:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0">
        {toasts.map(t => {
          const colors = {
            success: 'bg-teal-600 text-white border-teal-400',
            warning: 'bg-amber-500 text-white border-amber-300',
            error: 'bg-rose-600 text-white border-rose-400',
            info: 'bg-purple-600 text-white border-purple-400'
          };
          return (
            <div
              key={t.id}
              className={`px-4 py-3 rounded-2xl shadow-lg border ${colors[t.type]} text-xs font-extrabold flex items-center gap-2 pointer-events-auto`}
            >
              <i className="fa-solid fa-bell"></i>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
