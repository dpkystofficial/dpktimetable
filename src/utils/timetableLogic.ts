export interface SchoolInfo {
  schoolName: string;
  affiliation: string;
  semester: string;
  academicYear: string;
  logoUrl: string;
  directorName: string;
  directorMainPos: string;
  directorSubPos: string;
  showDirectorSubPos: boolean;
  academicName: string;
  academicPos: string;
}

export interface PeriodSlot {
  id: string;
  order: number;
  label: string;
  start: string;
  end: string;
  type: 'study' | 'lunch';
}

export interface Teacher {
  id: string;
  prefix: string;
  fullName: string;
  position: string;
  homeroom: string;
  dept: string;
  color: string;
  lineTargetId?: string;
}

export interface Subject {
  id: string;
  grade: string;
  code: string;
  name: string;
  category: string;
  hours: number;
  teacherId: string;
  allowCombined: boolean;
  coreMorning: boolean;
}

export interface ScheduleSlotEntry {
  subjectId: string;
  allowOverlap: boolean;
  roomNote?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface LineNotificationLog {
  time: string;
  recipient: string;
  period: string;
  status: 'SENT' | 'SIMULATED' | 'ERROR';
  message: string;
  source?: 'WEB' | 'SERVER_BG' | 'CLOUD_GAS';
  targetId?: string;
  errorDetail?: string;
  fallbackUsed?: boolean;
  retriedCount?: number;
}

export interface LineConfig {
  autoEnabled: boolean;
  backgroundServerEnabled?: boolean;
  lastCloudSyncedAt?: string;
  bridgeUrl: string;
  channelAccessToken: string;
  teacherGroupId: string;
  gradeGroupIds: Record<string, string>;
  teacherTargetIds?: Record<string, string>;
  leadMinutes: number;
  notifyTeachers: boolean;
  notifyStudents: boolean;
  notifyLunch: boolean;
  notifyFreePeriods?: boolean;
  teacherTemplate: string;
  studentTemplate: string;
  logs: LineNotificationLog[];
  sentHistoryKeys: Record<string, boolean>;
}

export type UserRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'active' | 'pending' | 'suspended';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  password?: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  assignedGrade?: string;
  teacherId?: string;
  studentCode?: string;
  avatarColor: string;
  authProvider: 'local' | 'firebase_email' | 'firebase_google';
  firebaseUid?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AccessPolicy {
  allowGuestStudentView: boolean;
  autoApproveStudentRegistration: boolean;
  allowTeacherTimetableEdit: boolean;
  firebaseRealtimeSyncEnabled: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: 'LOGIN' | 'REGISTER' | 'ROLE_CHANGE' | 'USER_UPDATE' | 'POLICY_UPDATE' | 'TIMETABLE_EDIT' | 'FIREBASE_SYNC';
  details: string;
}

export interface TimetableChangeNotification {
  id: string;
  timestamp: string;
  grade: string;
  dayKey: string;
  dayName: string;
  periodId: string;
  periodLabel: string;
  action: 'ASSIGN' | 'REMOVE' | 'SWAP' | 'AUTO_SCHEDULE' | 'CLEAR' | 'SETTINGS_UPDATE';
  subjectCode?: string;
  subjectName?: string;
  teacherName?: string;
  actorName: string;
  summary: string;
  readByGrades?: string[];
}

export interface AppData {
  version: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  schoolInfo: SchoolInfo;
  periods: PeriodSlot[];
  teachers: Teacher[];
  subjects: Subject[];
  schedule: Record<string, ScheduleSlotEntry>;
  lineConfig: LineConfig;
  changeLogs: TimetableChangeNotification[];
  users?: UserAccount[];
  accessPolicy?: AccessPolicy;
  auditLogs?: AuditLogEntry[];
}

export interface RedisCacheStats {
  engine: string;
  connected: boolean;
  hits: number;
  misses: number;
  hitRate: number;
  keysCount: number;
  keys: Array<{
    key: string;
    ttlRemainingSec: number;
    sizeBytes: number;
    lastAccessed: string;
  }>;
  avgCacheResponseMs: number;
  avgDbQueryMs: number;
  totalRequests: number;
  invalidationsCount: number;
  lastInvalidatedAt: string | null;
}

export const GRADES = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'] as const;

export const GRADE_FULL_NAMES: Record<string, string> = {
  'ป.1': 'ประถมศึกษาปีที่ 1',
  'ป.2': 'ประถมศึกษาปีที่ 2',
  'ป.3': 'ประถมศึกษาปีที่ 3',
  'ป.4': 'ประถมศึกษาปีที่ 4',
  'ป.5': 'ประถมศึกษาปีที่ 5',
  'ป.6': 'ประถมศึกษาปีที่ 6',
  'ม.1': 'มัธยมศึกษาปีที่ 1',
  'ม.2': 'มัธยมศึกษาปีที่ 2',
  'ม.3': 'มัธยมศึกษาปีที่ 3'
};

export const DAYS = [
  { key: 'MON', name: 'จันทร์', short: 'จ.', color: '#FFF4BD' },
  { key: 'TUE', name: 'อังคาร', short: 'อ.', color: '#FFD6E0' },
  { key: 'WED', name: 'พุธ', short: 'พ.', color: '#D4F5DC' },
  { key: 'THU', name: 'พฤหัสบดี', short: 'พฤ.', color: '#FFE0C2' },
  { key: 'FRI', name: 'ศุกร์', short: 'ศ.', color: '#D4F0F9' }
] as const;

export const PASTEL_PALETTE = [
  { bg: '#FFD6E0', border: '#F48FB1', text: '#880E4F', name: 'ชมพูพาสเทล' },
  { bg: '#D4F0F0', border: '#80DEEA', text: '#006064', name: 'ฟ้าพาสเทล' },
  { bg: '#E8DFF5', border: '#B39DDB', text: '#4A148C', name: 'ลาเวนเดอร์' },
  { bg: '#DCEDC8', border: '#AED581', text: '#33691E', name: 'มิ้นต์พาสเทล' },
  { bg: '#FFE0B2', border: '#FFCC80', text: '#E65100', name: 'พีชพาสเทล' },
  { bg: '#FFF9C4', border: '#FFF176', text: '#F57F17', name: 'เหลืองพาสเทล' },
  { bg: '#F8BBD0', border: '#F06292', text: '#880E4F', name: 'โรสพาสเทล' },
  { bg: '#C5CAE9', border: '#9FA8DA', text: '#1A237E', name: 'ครามพาสเทล' },
  { bg: '#B2DFDB', border: '#80CBC4', text: '#004D40', name: 'เขียวน้ำทะเล' },
  { bg: '#FFCCBC', border: '#FFAB91', text: '#BF360C', name: 'คอรัลพาสเทล' }
];

export const DEFAULT_TEACHER_LINE_TEMPLATE = `🔔 แจ้งเตือนเข้าคาบสอน ({school})\n📅 วัน{day} | {period} ({time} น.)\n👩‍🏫 ครูผู้สอน: {teacher}\n📚 รายวิชา: {code} {subject}\n🏫 ชั้นเรียน: {grade} {room}\nขอให้มีความสุขกับการจัดการเรียนการสอนค่ะ ✨`;

export const DEFAULT_STUDENT_LINE_TEMPLATE = `🎒 แจ้งเตือนเข้าเรียน ชั้น {grade}\n📅 วัน{day} | {period} ({time} น.)\n📖 วิชา: {code} {subject}\n👩‍🏫 ครูผู้สอน: {teacher} {room}\nให้นักเรียนเตรียมอุปกรณ์การเรียนให้พร้อมนะคะ 💖`;

export function createDefaultLineConfig(): LineConfig {
  const gradeGroupIds: Record<string, string> = {};
  GRADES.forEach(g => { gradeGroupIds[g] = ''; });
  return {
    autoEnabled: true,
    backgroundServerEnabled: true,
    bridgeUrl: '',
    channelAccessToken: '',
    teacherGroupId: '',
    gradeGroupIds,
    teacherTargetIds: {},
    leadMinutes: 5,
    notifyTeachers: true,
    notifyStudents: true,
    notifyLunch: true,
    notifyFreePeriods: true,
    teacherTemplate: DEFAULT_TEACHER_LINE_TEMPLATE,
    studentTemplate: DEFAULT_STUDENT_LINE_TEMPLATE,
    logs: [],
    sentHistoryKeys: {}
  };
}

export function sanitizeLineTargetId(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[\s\u200B-\u200D\uFEFF"']/g, '').trim();
}

export interface LineTargetValidationResult {
  valid: boolean;
  cleaned: string;
  type: 'USER' | 'GROUP' | 'ROOM' | 'EMPTY' | 'INVALID';
  reason?: string;
}

export function validateLineTargetId(raw?: string): LineTargetValidationResult {
  const cleaned = sanitizeLineTargetId(raw);
  if (!cleaned) {
    return { valid: true, cleaned: '', type: 'EMPTY' };
  }
  if (/^U[0-9a-fA-F]{32}$/.test(cleaned)) {
    return { valid: true, cleaned, type: 'USER' };
  }
  if (/^C[0-9a-fA-F]{32}$/.test(cleaned)) {
    return { valid: true, cleaned, type: 'GROUP' };
  }
  if (/^R[0-9a-fA-F]{32}$/.test(cleaned)) {
    return { valid: true, cleaned, type: 'ROOM' };
  }
  return {
    valid: false,
    cleaned,
    type: 'INVALID',
    reason: 'รหัส LINE ID ต้องขึ้นต้นด้วย C (กลุ่ม) หรือ U (บุคคล) ตามด้วยตัวอักษร/ตัวเลขฐานสิบหก 32 ตัว (รวม 33 ตัวอักษร)'
  };
}

export function timeStrToMinutes(tStr: string): number {
  const [h, m] = (tStr || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatLineMessageTemplate(tpl: string, vars: Record<string, string>): string {
  let msg = tpl || '';
  Object.entries(vars).forEach(([k, v]) => {
    msg = msg.split(`{${k}}`).join(v ?? '');
  });
  return msg.replace(/ +\n/g, '\n').trim();
}

export function buildStudentClassAlertMessage(
  appData: Pick<AppData, 'schoolInfo' | 'periods' | 'schedule' | 'subjects' | 'teachers' | 'lineConfig'>,
  grade: string,
  dayKey: string,
  periodId: string,
  customCfg?: LineConfig
): string {
  const activeCfg = customCfg || appData.lineConfig;
  const info = appData.schoolInfo;
  const dayObj = DAYS.find(d => d.key === dayKey) || DAYS[0];
  const periodObj = appData.periods.find(p => p.id === periodId) || appData.periods[0];
  if (!periodObj) return '';

  if (periodObj.type === 'lunch') {
    return `🍱 แจ้งเตือนเวลาพักกลางวัน (${info.schoolName})\n📅 วัน${dayObj.name} | เวลา ${periodObj.start} - ${periodObj.end} น.\nขอให้ครูและนักเรียนชั้น ${grade} รับประทานอาหารกลางวันอย่างมีความสุขค่ะ 🌸`;
  }

  const entry = appData.schedule[`${grade}_${dayKey}_${periodId}`];
  const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
  const teacher = sub ? appData.teachers.find(t => t.id === sub.teacherId) || null : null;

  if (!sub) {
    return `🎒 แจ้งเตือนตารางเรียน ชั้น ${grade}\n📅 วัน${dayObj.name} | ${periodObj.label} (${periodObj.start}-${periodObj.end} น.)\n📌 คาบเรียนว่าง / ทบทวนบทเรียนด้วยตนเอง`;
  }

  return formatLineMessageTemplate(activeCfg.studentTemplate || DEFAULT_STUDENT_LINE_TEMPLATE, {
    school: info.schoolName,
    day: dayObj.name,
    period: periodObj.label,
    time: `${periodObj.start} - ${periodObj.end}`,
    grade: `${GRADE_FULL_NAMES[grade] || grade} (${grade})`,
    code: sub.code,
    subject: sub.name,
    teacher: teacher ? `${teacher.prefix}${teacher.fullName}` : 'ไม่ระบุ',
    room: entry?.roomNote ? `(ห้อง: ${entry.roomNote})` : ''
  });
}

export function buildTeacherClassAlertMessage(
  appData: Pick<AppData, 'schoolInfo' | 'periods' | 'schedule' | 'subjects' | 'teachers' | 'lineConfig'>,
  teacherId: string,
  dayKey: string,
  periodId: string,
  customCfg?: LineConfig
): string {
  const activeCfg = customCfg || appData.lineConfig;
  const info = appData.schoolInfo;
  const teacher = appData.teachers.find(t => t.id === teacherId) || appData.teachers[0];
  const dayObj = DAYS.find(d => d.key === dayKey) || DAYS[0];
  const periodObj = appData.periods.find(p => p.id === periodId) || appData.periods[0];
  if (!teacher || !periodObj) return 'ไม่พบข้อมูลครูผู้สอน';

  if (periodObj.type === 'lunch') {
    return `🍱 แจ้งเตือนเวลาพักกลางวัน (${info.schoolName})\n📅 วัน${dayObj.name} | เวลา ${periodObj.start} - ${periodObj.end} น.`;
  }

  const taught: Array<{ grade: string; sub: Subject; roomNote?: string }> = [];
  GRADES.forEach(g => {
    const entry = appData.schedule[`${g}_${dayKey}_${periodId}`];
    if (entry) {
      const sub = appData.subjects.find(s => s.id === entry.subjectId);
      if (sub && sub.teacherId === teacher.id) {
        taught.push({ grade: g, sub, roomNote: entry.roomNote });
      }
    }
  });

  if (taught.length === 0) {
    return `🔔 แจ้งตารางสอน (${info.schoolName})\n📅 วัน${dayObj.name} | ${periodObj.label} (${periodObj.start}-${periodObj.end} น.)\n👩‍🏫 ${teacher.prefix}${teacher.fullName}\n✨ คาบนี้ไม่มีชั่วโมงสอน (คาบว่าง/เตรียมการสอนค่ะ)`;
  }

  const first = taught[0];
  const uniqueCodes = Array.from(new Set(taught.map(c => c.sub.code).filter(Boolean))).join(', ');
  const uniqueSubjects = Array.from(new Set(taught.map(c => c.sub.name).filter(Boolean))).join(' / ');
  const uniqueRooms = Array.from(new Set(taught.map(c => c.roomNote).filter(Boolean))).join(', ');

  return formatLineMessageTemplate(activeCfg.teacherTemplate || DEFAULT_TEACHER_LINE_TEMPLATE, {
    school: info.schoolName,
    day: dayObj.name,
    period: periodObj.label,
    time: `${periodObj.start} - ${periodObj.end}`,
    grade: taught.map(c => c.grade).join(', '),
    code: uniqueCodes || first.sub.code,
    subject: uniqueSubjects || first.sub.name,
    teacher: `${teacher.prefix}${teacher.fullName}`,
    room: uniqueRooms ? `(${uniqueRooms})` : ''
  });
}

export function buildSummaryPeriodAlertMessage(
  appData: Pick<AppData, 'schoolInfo' | 'periods' | 'schedule' | 'subjects' | 'teachers'>,
  dayKey: string,
  periodId: string
): string {
  const info = appData.schoolInfo;
  const dayObj = DAYS.find(d => d.key === dayKey) || DAYS[0];
  const periodObj = appData.periods.find(p => p.id === periodId) || appData.periods[0];
  if (!periodObj) return '';

  if (periodObj.type === 'lunch') {
    return `🍱 แจ้งเตือนเวลาพักกลางวัน (${info.schoolName})\n📅 วัน${dayObj.name} | เวลา ${periodObj.start} - ${periodObj.end} น.\nขอให้คณะครูและนักเรียนทุกคนรับประทานอาหารกลางวันอย่างมีความสุขค่ะ 🌸`;
  }

  const lines = [
    `🔔 แจ้งเตือนเข้าคาบเรียนรวมทุกชั้น (ป.1 - ม.3)`,
    `🏫 ${info.schoolName}`,
    `📅 วัน${dayObj.name} | ${periodObj.label} (${periodObj.start} - ${periodObj.end} น.)`,
    `━━━━━━━━━━━━━━━━━━`
  ];
  GRADES.forEach(g => {
    const entry = appData.schedule[`${g}_${dayKey}_${periodId}`];
    const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
    const t = sub ? appData.teachers.find(item => item.id === sub.teacherId) || null : null;
    lines.push(sub ? `• ${g}: ${sub.code} ${sub.name} (${t ? t.fullName.split(' ')[0] : '-'})` : `• ${g}: - (คาบว่าง)`);
  });
  return lines.join('\n');
}

export interface LineDispatchItem {
  targetId: string;
  fallbackTargetId?: string;
  recipientLabel: string;
  messageText: string;
  periodLabel: string;
}

export function buildPeriodBroadcastPayloads(
  appData: Pick<AppData, 'schoolInfo' | 'periods' | 'schedule' | 'subjects' | 'teachers' | 'lineConfig'>,
  dayKey: string,
  periodId: string,
  isManual = false,
  customCfg?: LineConfig
): LineDispatchItem[] {
  const activeCfg = customCfg || appData.lineConfig;
  const periodObj = appData.periods.find(p => p.id === periodId);
  if (!periodObj) return [];

  const fallbackTeacherGroup = sanitizeLineTargetId(activeCfg.teacherGroupId);
  const items: LineDispatchItem[] = [];

  if (periodObj.type === 'lunch') {
    if (activeCfg.notifyLunch || isManual) {
      items.push({
        targetId: fallbackTeacherGroup,
        fallbackTargetId: fallbackTeacherGroup,
        recipientLabel: 'พักกลางวัน (ครู & นักเรียน)',
        messageText: buildSummaryPeriodAlertMessage(appData, dayKey, periodId),
        periodLabel: periodObj.label
      });
    }
    return items;
  }

  // 1. Teacher notifications
  if (activeCfg.notifyTeachers || isManual) {
    const activeTeacherIds = new Set<string>();
    const unassignedSubjects: Array<{ grade: string; sub: Subject }> = [];

    GRADES.forEach(g => {
      const entry = appData.schedule[`${g}_${dayKey}_${periodId}`];
      if (entry) {
        const sub = appData.subjects.find(s => s.id === entry.subjectId);
        if (sub) {
          const teacherExists = sub.teacherId && appData.teachers.some(t => t.id === sub.teacherId);
          if (teacherExists) {
            activeTeacherIds.add(sub.teacherId);
          } else {
            unassignedSubjects.push({ grade: g, sub });
          }
        }
      }
    });

    // Also include teachers who have a dedicated personal LINE target ID configured when notifyFreePeriods is enabled
    if (activeCfg.notifyFreePeriods !== false) {
      appData.teachers.forEach(t => {
        const personalId = sanitizeLineTargetId(activeCfg.teacherTargetIds?.[t.id] || t.lineTargetId);
        if (personalId && personalId !== fallbackTeacherGroup) {
          activeTeacherIds.add(t.id);
        }
      });
    }

    for (const tid of activeTeacherIds) {
      const t = appData.teachers.find(item => item.id === tid);
      if (!t) continue;
      const personalId = sanitizeLineTargetId(activeCfg.teacherTargetIds?.[t.id] || t.lineTargetId);
      const chosenTarget = personalId || fallbackTeacherGroup;
      items.push({
        targetId: chosenTarget,
        fallbackTargetId: fallbackTeacherGroup,
        recipientLabel: `ครู ${t.prefix}${t.fullName}`,
        messageText: buildTeacherClassAlertMessage(appData, tid, dayKey, periodId, activeCfg),
        periodLabel: periodObj.label
      });
    }

    // If any scheduled subject in this period has no matching teacher assigned, send an alert to the main teacher group so the period is never silently missed
    for (const unassigned of unassignedSubjects) {
      const dayObj = DAYS.find(d => d.key === dayKey) || DAYS[0];
      items.push({
        targetId: fallbackTeacherGroup,
        fallbackTargetId: fallbackTeacherGroup,
        recipientLabel: `ครูประจำวิชา ${unassigned.sub.code} (ชั้น ${unassigned.grade})`,
        messageText: `🔔 แจ้งเตือนเข้าคาบสอน (${appData.schoolInfo.schoolName})\n📅 วัน${dayObj.name} | ${periodObj.label} (${periodObj.start} - ${periodObj.end} น.)\n📚 รายวิชา: ${unassigned.sub.code} ${unassigned.sub.name}\n🏫 ชั้นเรียน: ${unassigned.grade}\n⚠️ หมายเหตุ: รายวิชานี้ยังไม่ได้ผูกชื่อครูผู้สอนในระบบ`,
        periodLabel: periodObj.label
      });
    }
  }

  // 2. Student class notifications (ป.1 - ม.3)
  if (activeCfg.notifyStudents || isManual) {
    for (const g of GRADES) {
      const entry = appData.schedule[`${g}_${dayKey}_${periodId}`];
      const dedicatedClassGroup = sanitizeLineTargetId(activeCfg.gradeGroupIds && activeCfg.gradeGroupIds[g]);
      // Notify if slot has a scheduled subject, OR if notifyFreePeriods is enabled (default true), OR if class has its own group ID / manual trigger
      if (!entry && activeCfg.notifyFreePeriods === false && !dedicatedClassGroup && !isManual) {
        continue;
      }
      const classGroupId = dedicatedClassGroup || fallbackTeacherGroup;
      items.push({
        targetId: classGroupId,
        fallbackTargetId: fallbackTeacherGroup,
        recipientLabel: `นักเรียนชั้น ${g}`,
        messageText: buildStudentClassAlertMessage(appData, g, dayKey, periodId, activeCfg),
        periodLabel: periodObj.label
      });
    }
  }

  return items;
}

export interface LineDiagnosticIssue {
  level: 'error' | 'warning' | 'info';
  category: 'TOKEN' | 'TEACHER_GROUP' | 'CLASS_GROUP' | 'TEACHER_ID' | 'SCHEDULE';
  title: string;
  detail: string;
}

export interface LineDiagnosticReport {
  readyForLivePush: boolean;
  tokenConfigured: boolean;
  mainTeacherGroupValid: boolean;
  mainTeacherGroupType: string;
  dedicatedClassGroupCount: number;
  dedicatedTeacherIdCount: number;
  unassignedSubjectCount: number;
  emptySlotCountForSelectedPeriod: number;
  issues: LineDiagnosticIssue[];
}

export function diagnoseLineNotificationReadiness(
  appData: Pick<AppData, 'periods' | 'schedule' | 'subjects' | 'teachers' | 'lineConfig'>,
  dayKey = 'MON',
  periodId = 'P1',
  customCfg?: LineConfig
): LineDiagnosticReport {
  const cfg = customCfg || appData.lineConfig;
  const issues: LineDiagnosticIssue[] = [];
  const token = (cfg.channelAccessToken || '').trim();
  const tokenConfigured = token.length > 20;

  if (!tokenConfigured) {
    issues.push({
      level: 'warning',
      category: 'TOKEN',
      title: 'ยังไม่ได้กรอก LINE Channel Access Token',
      detail: 'ระบบจะทำงานในโหมดจำลอง (Simulated) จนกว่าจะนำ Channel Access Token จาก LINE Developers มาวาง'
    });
  }

  const mainGroupVal = validateLineTargetId(cfg.teacherGroupId);
  if (mainGroupVal.type === 'EMPTY') {
    issues.push({
      level: 'warning',
      category: 'TEACHER_GROUP',
      title: 'ยังไม่ได้ตั้งค่ารหัสกลุ่มรวมครูผู้สอน (Fallback Group ID)',
      detail: 'แนะนำให้ใส่ Group ID กลุ่มรวมครู เพื่อให้ระบบใช้เป็นกลุ่มสำรองอัตโนมัติหากครูหรือชั้นเรียนใดยังไม่ได้ระบุรหัสแยก'
    });
  } else if (!mainGroupVal.valid) {
    issues.push({
      level: 'error',
      category: 'TEACHER_GROUP',
      title: `รหัสกลุ่มรวมครูผู้สอนรูปแบบไม่ถูกต้อง (${mainGroupVal.cleaned})`,
      detail: mainGroupVal.reason || 'กรุณาพิมพ์ /id ในกลุ่ม LINE เพื่อคัดลอกรหัส 33 ตัวอักษรที่ขึ้นต้นด้วย C หรือ U'
    });
  }

  let dedicatedClassGroupCount = 0;
  GRADES.forEach(g => {
    const raw = cfg.gradeGroupIds?.[g] || '';
    const v = validateLineTargetId(raw);
    if (v.type !== 'EMPTY') {
      if (v.valid) {
        dedicatedClassGroupCount++;
      } else {
        issues.push({
          level: 'error',
          category: 'CLASS_GROUP',
          title: `รหัส Group ID ของชั้น ${g} รูปแบบไม่ถูกต้อง (${v.cleaned})`,
          detail: `ชั้น ${g}: ${v.reason} (ระบบจะสลับไปส่งเข้ากลุ่มรวมครูให้อัตโนมัติแทนชั่วคราว)`
        });
      }
    }
  });

  let dedicatedTeacherIdCount = 0;
  appData.teachers.forEach(t => {
    const raw = cfg.teacherTargetIds?.[t.id] || t.lineTargetId || '';
    const v = validateLineTargetId(raw);
    if (v.type !== 'EMPTY') {
      if (v.valid) {
        dedicatedTeacherIdCount++;
      } else {
        issues.push({
          level: 'error',
          category: 'TEACHER_ID',
          title: `รหัส LINE ID ของครู ${t.prefix}${t.fullName} รูปแบบไม่ถูกต้อง (${v.cleaned})`,
          detail: `${v.reason} (ระบบจะส่งสำรองเข้ากลุ่มรวมครูให้อัตโนมัติ)`
        });
      }
    }
  });

  const teacherIdSet = new Set(appData.teachers.map(t => t.id));
  const unassignedSubjects = appData.subjects.filter(s => !s.teacherId || !teacherIdSet.has(s.teacherId));
  if (unassignedSubjects.length > 0) {
    issues.push({
      level: 'warning',
      category: 'SCHEDULE',
      title: `พบ ${unassignedSubjects.length} รายวิชาที่ยังไม่ได้ผูกชื่อครูผู้สอน`,
      detail: `วิชา เช่น ${unassignedSubjects.slice(0, 3).map(s => `${s.code} (${s.grade})`).join(', ')} ยังไม่ระบุครู ระบบจะส่งแจ้งเตือนสำรองเข้ากลุ่มรวมครูให้แทน`
    });
  }

  let emptySlotCountForSelectedPeriod = 0;
  const periodObj = appData.periods.find(p => p.id === periodId);
  if (periodObj && periodObj.type !== 'lunch') {
    GRADES.forEach(g => {
      const entry = appData.schedule[`${g}_${dayKey}_${periodId}`];
      if (!entry) emptySlotCountForSelectedPeriod++;
    });
  }

  return {
    readyForLivePush: tokenConfigured && (mainGroupVal.valid && mainGroupVal.type !== 'EMPTY' || dedicatedClassGroupCount > 0 || dedicatedTeacherIdCount > 0),
    tokenConfigured,
    mainTeacherGroupValid: mainGroupVal.valid && mainGroupVal.type !== 'EMPTY',
    mainTeacherGroupType: mainGroupVal.type,
    dedicatedClassGroupCount,
    dedicatedTeacherIdCount,
    unassignedSubjectCount: unassignedSubjects.length,
    emptySlotCountForSelectedPeriod,
    issues
  };
}

export function getBangkokDate(baseDate: Date = new Date()): Date {
  const bangkokStr = baseDate.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  return new Date(bangkokStr);
}

export interface SchoolPeriodTimeStatus {
  currentPeriodSlot: PeriodSlot | null;
  currentRemainingMinutes: number;
  nextPeriodSlot: PeriodSlot | null;
  nextDiffMinutes: number;
  firstPeriodSlot: PeriodSlot | null;
  lastPeriodSlot: PeriodSlot | null;
  isInLastPeriod: boolean;
  isBeforeSchoolHours: boolean;
  isSchoolDayEnded: boolean;
}

export function getSchoolPeriodTimeStatus(
  periods: PeriodSlot[],
  nowMinutes: number
): SchoolPeriodTimeStatus {
  const sorted = [...periods].sort(
    (a, b) => timeStrToMinutes(a.start) - timeStrToMinutes(b.start)
  );

  const firstPeriodSlot = sorted[0] || null;
  const lastPeriodSlot = sorted[sorted.length - 1] || null;

  let currentPeriodSlot: PeriodSlot | null = null;
  let nextPeriodSlot: PeriodSlot | null = null;

  for (const p of sorted) {
    const startMin = timeStrToMinutes(p.start);
    const endMin = timeStrToMinutes(p.end);
    if (nowMinutes >= startMin && nowMinutes < endMin) {
      currentPeriodSlot = p;
    } else if (nowMinutes < startMin && !nextPeriodSlot) {
      nextPeriodSlot = p;
    }
  }

  const currentRemainingMinutes = currentPeriodSlot
    ? Math.max(1, timeStrToMinutes(currentPeriodSlot.end) - nowMinutes)
    : 0;

  const nextDiffMinutes = nextPeriodSlot
    ? Math.max(0, timeStrToMinutes(nextPeriodSlot.start) - nowMinutes)
    : 0;

  const firstStartMin = firstPeriodSlot ? timeStrToMinutes(firstPeriodSlot.start) : 0;
  const lastEndMin = lastPeriodSlot ? timeStrToMinutes(lastPeriodSlot.end) : 0;

  const isInLastPeriod = Boolean(currentPeriodSlot && !nextPeriodSlot);
  const isBeforeSchoolHours = Boolean(!currentPeriodSlot && firstPeriodSlot && nowMinutes < firstStartMin);
  const isSchoolDayEnded = Boolean(!currentPeriodSlot && !nextPeriodSlot && lastPeriodSlot && nowMinutes >= lastEndMin);

  return {
    currentPeriodSlot,
    currentRemainingMinutes,
    nextPeriodSlot,
    nextDiffMinutes,
    firstPeriodSlot,
    lastPeriodSlot,
    isInLastPeriod,
    isBeforeSchoolHours,
    isSchoolDayEnded
  };
}

export function findDuePeriodsForBackgroundAlert(
  appData: Pick<AppData, 'periods' | 'lineConfig'>,
  now: Date
): Array<{ dayKey: string; period: PeriodSlot; historyKey: string }> {
  const cfg = appData.lineConfig;
  if (!cfg || !cfg.autoEnabled || cfg.backgroundServerEnabled === false) return [];

  const jsDay = now.getDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
  if (jsDay < 1 || jsDay > 5) return [];

  const dayKeyMap: Record<number, string> = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI' };
  const currentDayKey = dayKeyMap[jsDay];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const lead = Number(cfg.leadMinutes) || 0;

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayDateKey = `${yyyy}-${mm}-${dd}`;

  const due: Array<{ dayKey: string; period: PeriodSlot; historyKey: string }> = [];
  const sortedPeriods = [...appData.periods].sort(
    (a, b) => timeStrToMinutes(a.start) - timeStrToMinutes(b.start)
  );

  for (const p of sortedPeriods) {
    const startMin = timeStrToMinutes(p.start);
    const endMin = timeStrToMinutes(p.end);
    const triggerMin = startMin - lead;
    // Trigger as soon as we enter [startMin - lead, endMin) if not yet sent today
    if (nowMinutes >= triggerMin && nowMinutes < endMin) {
      const historyKey = `${todayDateKey}_${currentDayKey}_${p.id}`;
      if (!cfg.sentHistoryKeys?.[historyKey]) {
        due.push({ dayKey: currentDayKey, period: p, historyKey });
      }
    }
  }

  return due;
}


export function findTeacherConflictsAtSlot(
  appData: Pick<AppData, 'schedule' | 'subjects'>,
  dayKey: string,
  periodId: string,
  teacherId: string,
  excludeGrade: string | null = null
) {
  if (!teacherId) return [];
  const clashes: Array<{ grade: string; subject: Subject; entry: ScheduleSlotEntry }> = [];
  GRADES.forEach(g => {
    if (g === excludeGrade) return;
    const key = `${g}_${dayKey}_${periodId}`;
    const entry = appData.schedule[key];
    if (entry) {
      const sub = appData.subjects.find(s => s.id === entry.subjectId);
      if (sub && sub.teacherId === teacherId) {
        clashes.push({ grade: g, subject: sub, entry });
      }
    }
  });
  return clashes;
}

export function getAllTeacherOverlaps(appData: Pick<AppData, 'schedule' | 'subjects' | 'periods' | 'teachers'>) {
  const overlaps: Array<{
    day: typeof DAYS[number];
    period: PeriodSlot;
    teacher: Teacher | null;
    items: Array<{ grade: string; key: string; entry: ScheduleSlotEntry; subject: Subject }>;
    isAllowed: boolean;
  }> = [];

  DAYS.forEach(d => {
    appData.periods.filter(p => p.type === 'study').forEach(p => {
      const byTeacher: Record<string, Array<{ grade: string; key: string; entry: ScheduleSlotEntry; subject: Subject }>> = {};
      GRADES.forEach(g => {
        const key = `${g}_${d.key}_${p.id}`;
        const entry = appData.schedule[key];
        if (entry) {
          const sub = appData.subjects.find(s => s.id === entry.subjectId);
          if (sub && sub.teacherId) {
            if (!byTeacher[sub.teacherId]) byTeacher[sub.teacherId] = [];
            byTeacher[sub.teacherId].push({ grade: g, key, entry, subject: sub });
          }
        }
      });

      Object.entries(byTeacher).forEach(([teacherId, list]) => {
        if (list.length > 1) {
          const isAllAllowed = list.every(item => item.entry.allowOverlap || item.subject.allowCombined);
          const teacher = appData.teachers.find(t => t.id === teacherId) || null;
          overlaps.push({
            day: d,
            period: p,
            teacher,
            items: list,
            isAllowed: isAllAllowed
          });
        }
      });
    });
  });

  return overlaps;
}

export function getScheduledHoursForSubject(schedule: Record<string, ScheduleSlotEntry>, periods: PeriodSlot[], grade: string, subjectId: string): number {
  let count = 0;
  DAYS.forEach(d => {
    periods.forEach(p => {
      const entry = schedule[`${grade}_${d.key}_${p.id}`];
      if (entry && entry.subjectId === subjectId) count++;
    });
  });
  return count;
}

export function autoScheduleEngine(
  appData: AppData,
  options: {
    grades: string[];
    noSameDayDuplicate: boolean;
    coreMorning: boolean;
    lockActivities: boolean;
    allowCombinedSubjects: boolean;
    clearExisting: boolean;
  }
): { placedCount: number; schedule: Record<string, ScheduleSlotEntry> } {
  const { grades, noSameDayDuplicate, coreMorning, lockActivities, allowCombinedSubjects, clearExisting } = options;
  const studyPeriods = appData.periods.filter(p => p.type === 'study');
  const nextSchedule: Record<string, ScheduleSlotEntry> = { ...appData.schedule };

  if (studyPeriods.length === 0) return { placedCount: 0, schedule: nextSchedule };

  const lunchIndex = appData.periods.findIndex(p => p.type === 'lunch');
  const morningPeriodIds = studyPeriods
    .filter(p => lunchIndex === -1 ? p.order <= 3 : appData.periods.indexOf(p) < lunchIndex)
    .map(p => p.id);
  const afternoonPeriodIds = studyPeriods
    .filter(p => !morningPeriodIds.includes(p.id))
    .map(p => p.id);

  const lastPeriodId = studyPeriods[studyPeriods.length - 1].id;

  if (clearExisting) {
    grades.forEach(g => {
      Object.keys(nextSchedule).forEach(k => {
        if (k.startsWith(g + '_')) delete nextSchedule[k];
      });
    });
  }

  let placedCount = 0;

  const hasSubjectOnDay = (grade: string, dayKey: string, subjectId: string) => {
    return studyPeriods.some(p => {
      const entry = nextSchedule[`${grade}_${dayKey}_${p.id}`];
      return entry && entry.subjectId === subjectId;
    });
  };

  const isTeacherAvailable = (grade: string, dayKey: string, periodId: string, subject: Subject) => {
    const clashes = findTeacherConflictsAtSlot({ schedule: nextSchedule, subjects: appData.subjects }, dayKey, periodId, subject.teacherId, grade);
    if (clashes.length === 0) return { ok: true, isCombined: false, clashes: [] };
    if (allowCombinedSubjects && subject.allowCombined) {
      const sameSubjectOrCombined = clashes.every(c => c.subject.allowCombined && c.subject.name === subject.name);
      if (sameSubjectOrCombined) {
        return { ok: true, isCombined: true, clashes };
      }
    }
    return { ok: false, isCombined: false, clashes: [] };
  };

  if (lockActivities) {
    grades.forEach(grade => {
      const gradeSubs = appData.subjects.filter(s => s.grade === grade);
      const scoutSub = gradeSubs.find(s => s.category === 'กิจกรรมลูกเสือ-เนตรนารี');
      const clubSub = gradeSubs.find(s => s.category === 'กิจกรรมชุมนุม');
      const guideSub = gradeSubs.find(s => s.category === 'กิจกรรมแนะแนว');
      const socialActSub = gradeSubs.find(s => s.category === 'กิจกรรมเพื่อสังคมฯ');

      if (scoutSub && getScheduledHoursForSubject(nextSchedule, appData.periods, grade, scoutSub.id) < scoutSub.hours) {
        const wedKey = `${grade}_WED_${lastPeriodId}`;
        if (!nextSchedule[wedKey]) {
          nextSchedule[wedKey] = { subjectId: scoutSub.id, allowOverlap: true, roomNote: 'ลานกิจกรรม' };
          placedCount++;
        }
      }
      if (clubSub && getScheduledHoursForSubject(nextSchedule, appData.periods, grade, clubSub.id) < clubSub.hours) {
        const friKey = `${grade}_FRI_${lastPeriodId}`;
        if (!nextSchedule[friKey]) {
          nextSchedule[friKey] = { subjectId: clubSub.id, allowOverlap: true, roomNote: '' };
          placedCount++;
        }
      }
      if (guideSub && getScheduledHoursForSubject(nextSchedule, appData.periods, grade, guideSub.id) < guideSub.hours) {
        const monKey = `${grade}_MON_${lastPeriodId}`;
        if (!nextSchedule[monKey]) {
          nextSchedule[monKey] = { subjectId: guideSub.id, allowOverlap: true, roomNote: '' };
          placedCount++;
        }
      }
      if (socialActSub && getScheduledHoursForSubject(nextSchedule, appData.periods, grade, socialActSub.id) < socialActSub.hours) {
        const thuKey = `${grade}_THU_${lastPeriodId}`;
        if (!nextSchedule[thuKey]) {
          nextSchedule[thuKey] = { subjectId: socialActSub.id, allowOverlap: true, roomNote: '' };
          placedCount++;
        }
      }
    });
  }

  grades.forEach((grade, gradeIdx) => {
    const gradeSubs = appData.subjects
      .filter(s => s.grade === grade)
      .sort((a, b) => {
        if (a.coreMorning !== b.coreMorning) return a.coreMorning ? -1 : 1;
        if (a.allowCombined !== b.allowCombined) return a.allowCombined ? 1 : -1;
        return b.hours - a.hours;
      });

    gradeSubs.forEach((sub, subIdx) => {
      const currentUsed = getScheduledHoursForSubject(nextSchedule, appData.periods, grade, sub.id);
      let needed = sub.hours - currentUsed;
      if (needed <= 0) return;

      const preferredPeriods = (coreMorning && sub.coreMorning)
        ? [...morningPeriodIds, ...afternoonPeriodIds]
        : [...afternoonPeriodIds, ...morningPeriodIds];

      const rotatedDays = DAYS.map((_, i) => DAYS[(i + subIdx + gradeIdx) % DAYS.length]);

      // Pass 1
      for (const d of rotatedDays) {
        if (needed <= 0) break;
        if (noSameDayDuplicate && hasSubjectOnDay(grade, d.key, sub.id)) continue;

        for (const pid of preferredPeriods) {
          if (needed <= 0) break;
          const slotKey = `${grade}_${d.key}_${pid}`;
          if (nextSchedule[slotKey]) continue;

          const avail = isTeacherAvailable(grade, d.key, pid, sub);
          if (avail.ok) {
            nextSchedule[slotKey] = {
              subjectId: sub.id,
              allowOverlap: avail.isCombined || !!sub.allowCombined,
              roomNote: ''
            };
            if (avail.isCombined && avail.clashes) {
              avail.clashes.forEach(c => {
                const ck = `${c.grade}_${d.key}_${pid}`;
                if (nextSchedule[ck]) nextSchedule[ck].allowOverlap = true;
              });
            }
            needed--;
            placedCount++;
            if (noSameDayDuplicate) break;
          }
        }
      }

      // Pass 2
      if (needed > 0) {
        for (const d of rotatedDays) {
          if (needed <= 0) break;
          for (const pid of preferredPeriods) {
            if (needed <= 0) break;
            const slotKey = `${grade}_${d.key}_${pid}`;
            if (nextSchedule[slotKey]) continue;

            const avail = isTeacherAvailable(grade, d.key, pid, sub);
            if (avail.ok) {
              nextSchedule[slotKey] = {
                subjectId: sub.id,
                allowOverlap: avail.isCombined || !!sub.allowCombined,
                roomNote: ''
              };
              needed--;
              placedCount++;
            }
          }
        }
      }

      // Pass 3: Fallback into any remaining free slot of the grade and mark all involved teacher slots as allowOverlap
      if (needed > 0) {
        for (const d of rotatedDays) {
          if (needed <= 0) break;
          for (const pid of preferredPeriods) {
            if (needed <= 0) break;
            const slotKey = `${grade}_${d.key}_${pid}`;
            if (!nextSchedule[slotKey]) {
              nextSchedule[slotKey] = {
                subjectId: sub.id,
                allowOverlap: true,
                roomNote: ''
              };
              const clashes = findTeacherConflictsAtSlot({ schedule: nextSchedule, subjects: appData.subjects }, d.key, pid, sub.teacherId, grade);
              clashes.forEach(c => {
                const ck = `${c.grade}_${d.key}_${pid}`;
                if (nextSchedule[ck]) nextSchedule[ck].allowOverlap = true;
              });
              needed--;
              placedCount++;
            }
          }
        }
      }
    });
  });

  return { placedCount, schedule: nextSchedule };
}

export function createDefaultAppData(): AppData {
  const schoolInfo: SchoolInfo = {
    schoolName: 'โรงเรียนดอนแก้วปากเป่งคุยสำโรง',
    affiliation: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษายโสธร เขต 1',
    semester: '1',
    academicYear: '2569',
    logoUrl: 'https://i.postimg.cc/8P6Y6MxB/baebs-him-t-dph-n.png',
    directorName: 'นายเกรียงไกร พัฒนศึกษา',
    directorMainPos: 'ผู้อำนวยการโรงเรียนดอนแก้วปากเป่งคุยสำโรง',
    directorSubPos: 'รักษาการในตำแหน่งผู้อำนวยการโรงเรียนดอนแก้วปากเป่งคุยสำโรง',
    showDirectorSubPos: false,
    academicName: 'นางสาวกานต์พิชชา วิชาการดี',
    academicPos: 'หัวหน้างานวิชาการ'
  };

  const periods: PeriodSlot[] = [
    { id: 'P1', order: 1, label: 'คาบที่ 1', start: '08:30', end: '09:30', type: 'study' },
    { id: 'P2', order: 2, label: 'คาบที่ 2', start: '09:30', end: '10:30', type: 'study' },
    { id: 'P3', order: 3, label: 'คาบที่ 3', start: '10:30', end: '11:30', type: 'study' },
    { id: 'LUNCH', order: 4, label: 'พักกลางวัน', start: '11:30', end: '12:30', type: 'lunch' },
    { id: 'P4', order: 5, label: 'คาบที่ 4', start: '12:30', end: '13:30', type: 'study' },
    { id: 'P5', order: 6, label: 'คาบที่ 5', start: '13:30', end: '14:30', type: 'study' },
    { id: 'P6', order: 7, label: 'คาบที่ 6', start: '14:30', end: '15:30', type: 'study' }
  ];

  const teachers: Teacher[] = [
    { id: 'T01', prefix: 'นาง', fullName: 'สมหญิง รักเด็กดี', position: 'ครูชำนาญการพิเศษ', homeroom: 'ป.1', dept: 'ภาษาไทย / ประถมวัย-ป.ต้น', color: '#FFD6E0' },
    { id: 'T02', prefix: 'นางสาว', fullName: 'กานต์พิชชา วิชาการดี', position: 'ครูชำนาญการ', homeroom: 'ป.2', dept: 'คณิตศาสตร์', color: '#D4F0F0' },
    { id: 'T03', prefix: 'นาย', fullName: 'ธีรภัทร วิทยาธร', position: 'ครูชำนาญการ', homeroom: 'ป.3', dept: 'วิทยาศาสตร์และเทคโนโลยี', color: '#DCEDC8' },
    { id: 'T04', prefix: 'นางสาว', fullName: 'พิมพ์ชนก อังกฤษคล่อง', position: 'ครู', homeroom: 'ป.4', dept: 'ภาษาต่างประเทศ (ภาษาอังกฤษ)', color: '#E8DFF5' },
    { id: 'T05', prefix: 'นาย', fullName: 'วีรพล คนขยัน', position: 'ครูชำนาญการ', homeroom: 'ป.5', dept: 'สังคมศึกษา ศาสนา และวัฒนธรรม', color: '#FFE0B2' },
    { id: 'T06', prefix: 'นาย', fullName: 'ชัชวาล พลานามัย', position: 'ครู', homeroom: 'ป.6', dept: 'สุขศึกษาและพลศึกษา / ศิลปะ', color: '#FFF9C4' },
    { id: 'T07', prefix: 'นางสาว', fullName: 'มณีรัตน์ คำนวณแม่น', position: 'ครูชำนาญการ', homeroom: 'ม.1', dept: 'คณิตศาสตร์ ม.ต้น', color: '#F8BBD0' },
    { id: 'T08', prefix: 'นาย', fullName: 'นพดล ค้นคว้าไกล', position: 'ครูชำนาญการพิเศษ', homeroom: 'ม.2', dept: 'วิทยาศาสตร์และเทคโนโลยี ม.ต้น', color: '#C5CAE9' },
    { id: 'T09', prefix: 'นาง', fullName: 'สุดารัตน์ วรรณศิลป์', position: 'ครูชำนาญการ', homeroom: 'ม.3', dept: 'ภาษาไทย / แนะแนว ม.ต้น', color: '#B2DFDB' }
  ];

  const subjects: Subject[] = [];
  let sIdx = 1;
  const addSub = (grade: string, code: string, name: string, category: string, hours: number, teacherId: string, allowCombined = false, coreMorning = false) => {
    subjects.push({
      id: 'SUB' + String(sIdx++).padStart(3, '0'),
      grade,
      code,
      name,
      category,
      hours,
      teacherId,
      allowCombined,
      coreMorning
    });
  };

  const gradeCodeMap: Record<string, string> = {
    'ป.1': '11', 'ป.2': '12', 'ป.3': '13',
    'ป.4': '14', 'ป.5': '15', 'ป.6': '16',
    'ม.1': '21', 'ม.2': '22', 'ม.3': '23'
  };

  GRADES.forEach((grade, idx) => {
    const gc = gradeCodeMap[grade];
    const isJunior = grade.startsWith('ม.');
    const thaiTeacher = isJunior ? 'T09' : (idx < 3 ? 'T01' : 'T05');
    const mathTeacher = isJunior ? 'T07' : 'T02';
    const sciTeacher = isJunior ? 'T08' : 'T03';
    const engTeacher = 'T04';
    const socTeacher = 'T05';
    const peArtTeacher = 'T06';

    addSub(grade, `ท${gc}101`, 'ภาษาไทย', 'วิชาพื้นฐาน', 4, thaiTeacher, false, true);
    addSub(grade, `ค${gc}101`, 'คณิตศาสตร์', 'วิชาพื้นฐาน', 4, mathTeacher, false, true);
    addSub(grade, `ว${gc}101`, 'วิทยาศาสตร์และเทคโนโลยี', 'วิชาพื้นฐาน', 3, sciTeacher, false, true);
    addSub(grade, `อ${gc}101`, 'ภาษาอังกฤษพื้นฐาน', 'วิชาพื้นฐาน', 3, engTeacher, false, true);
    addSub(grade, `ส${gc}101`, 'สังคมศึกษาฯ', 'วิชาพื้นฐาน', 2, socTeacher, false, false);
    addSub(grade, `ส${gc}102`, 'ประวัติศาสตร์', 'วิชาพื้นฐาน', 1, socTeacher, true, false);

    addSub(grade, `พ${gc}101`, 'สุขศึกษาและพลศึกษา', 'วิชาพื้นฐาน', 2, peArtTeacher, true, false);
    addSub(grade, `ศ${gc}101`, 'ศิลปะ (ดนตรี-นาฏศิลป์)', 'วิชาพื้นฐาน', 2, peArtTeacher, true, false);
    addSub(grade, `ง${gc}101`, 'การงานอาชีพ', 'วิชาพื้นฐาน', 1, sciTeacher, true, false);
    addSub(grade, `ว${gc}201`, 'คอมพิวเตอร์และวิทยาการคำนวณ', 'วิชาเพิ่มเติม', 2, isJunior ? 'T08' : 'T03', false, false);
    addSub(grade, `อ${gc}201`, 'ภาษาอังกฤษเพื่อการสื่อสาร', 'วิชาเพิ่มเติม', 2, engTeacher, true, false);

    addSub(grade, `ก${gc}901`, 'กิจกรรมแนะแนว', 'กิจกรรมแนะแนว', 1, isJunior ? 'T09' : teachers[idx].id, true, false);
    addSub(grade, `ก${gc}902`, 'ลูกเสือ - เนตรนารี', 'กิจกรรมลูกเสือ-เนตรนารี', 1, peArtTeacher, true, false);
    addSub(grade, `ก${gc}903`, 'กิจกรรมชุมนุมวิชาการ', 'กิจกรรมชุมนุม', 1, sciTeacher, true, false);
    addSub(grade, `ก${gc}904`, 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์', 'กิจกรรมเพื่อสังคมฯ', 1, socTeacher, true, false);
  });

  const defaultUsers: UserAccount[] = createDefaultUsers();
  const defaultPolicy: AccessPolicy = createDefaultAccessPolicy();
  const defaultAudits: AuditLogEntry[] = [
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

  const initialData: AppData = {
    version: 1,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: 'ฝ่ายวิชาการ',
    schoolInfo,
    periods,
    teachers,
    subjects,
    schedule: {},
    lineConfig: createDefaultLineConfig(),
    changeLogs: [
      {
        id: 'CHG_INIT_01',
        timestamp: new Date().toISOString(),
        grade: 'ป.1',
        dayKey: 'MON',
        dayName: 'จันทร์',
        periodId: 'P1',
        periodLabel: 'คาบที่ 1',
        action: 'AUTO_SCHEDULE',
        actorName: 'นางสาวกานต์พิชชา วิชาการดี (หัวหน้างานวิชาการ)',
        summary: 'จัดตารางเรียนประจำภาคเรียนครบทุกระดับชั้น ป.1 - ม.3 เรียบร้อยแล้ว'
      }
    ],
    users: defaultUsers,
    accessPolicy: defaultPolicy,
    auditLogs: defaultAudits
  };

  const scheduled = autoScheduleEngine(initialData, {
    grades: [...GRADES],
    noSameDayDuplicate: true,
    coreMorning: true,
    lockActivities: true,
    allowCombinedSubjects: true,
    clearExisting: true
  });
  initialData.schedule = scheduled.schedule;

  return initialData;
}

export function createDefaultAccessPolicy(): AccessPolicy {
  return {
    allowGuestStudentView: false,
    autoApproveStudentRegistration: true,
    allowTeacherTimetableEdit: true,
    firebaseRealtimeSyncEnabled: true
  };
}

export function createDefaultUsers(): UserAccount[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'USR_ADMIN_01',
      username: 'dpkyst11',
      email: 'dpkyst11@donkaew.ac.th',
      password: 'dpkyst11',
      fullName: 'นางสาวกานต์พิชชา วิชาการดี (ผู้ดูแลระบบวิชาการ)',
      role: 'admin',
      status: 'active',
      assignedGrade: 'ป.2',
      teacherId: 'T02',
      avatarColor: '#FFD6E0',
      authProvider: 'local',
      createdAt: now,
      lastLoginAt: now
    },
    {
      id: 'USR_ADMIN_SUPER',
      username: 'vitamin.capper',
      email: 'vitamin.capper@gmail.com',
      password: 'dpkyst11',
      fullName: 'นายเกรียงไกร พัฒนศึกษา (ผู้อำนวยการโรงเรียน)',
      role: 'admin',
      status: 'active',
      avatarColor: '#E8DFF5',
      authProvider: 'firebase_google',
      createdAt: now,
      lastLoginAt: now
    },
    {
      id: 'USR_TEACHER_01',
      username: 'somying',
      email: 'somying@donkaew.ac.th',
      password: 'teacher1234',
      fullName: 'นางสมหญิง รักเด็กดี',
      role: 'teacher',
      status: 'active',
      assignedGrade: 'ป.1',
      teacherId: 'T01',
      avatarColor: '#D4F0F0',
      authProvider: 'local',
      createdAt: now,
      lastLoginAt: now
    },
    {
      id: 'USR_TEACHER_02',
      username: 'theeraphat',
      email: 'theeraphat@donkaew.ac.th',
      password: 'teacher1234',
      fullName: 'นายธีรภัทร วิทยาธร',
      role: 'teacher',
      status: 'active',
      assignedGrade: 'ป.3',
      teacherId: 'T03',
      avatarColor: '#DCEDC8',
      authProvider: 'local',
      createdAt: now
    },
    {
      id: 'USR_STUDENT_01',
      username: 'student.p1',
      email: 'student.p1@donkaew.ac.th',
      password: 'student1234',
      fullName: 'ด.ช.ต้นกล้า รักเรียน',
      role: 'student',
      status: 'active',
      assignedGrade: 'ป.1',
      studentCode: '69101',
      avatarColor: '#FFF9C4',
      authProvider: 'local',
      createdAt: now,
      lastLoginAt: now
    },
    {
      id: 'USR_STUDENT_02',
      username: 'student.m1',
      email: 'student.m1@donkaew.ac.th',
      password: 'student1234',
      fullName: 'ด.ญ.แพรวพรรณ ขยันยิ่ง',
      role: 'student',
      status: 'active',
      assignedGrade: 'ม.1',
      studentCode: '69201',
      avatarColor: '#FFE0B2',
      authProvider: 'local',
      createdAt: now
    }
  ];
}

export function canAccessAdminPanel(user: UserAccount | null): boolean {
  return !!user && user.status === 'active' && user.role === 'admin';
}

export function canManageSettings(user: UserAccount | null): boolean {
  return !!user && user.status === 'active' && user.role === 'admin';
}

export function canManageTimetable(user: UserAccount | null, policy?: AccessPolicy): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'admin') return true;
  if (user.role === 'teacher') {
    return policy ? policy.allowTeacherTimetableEdit : true;
  }
  return false;
}

export function verifyUserCredentials(
  users: UserAccount[],
  identifier: string,
  passwordInput: string
): { ok: boolean; user?: UserAccount; error?: string } {
  const cleanId = identifier.trim().toLowerCase();
  const found = users.find(
    u => u.email.toLowerCase() === cleanId || u.username.toLowerCase() === cleanId
  );
  if (!found) {
    return { ok: false, error: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' };
  }
  if (found.status === 'suspended') {
    return { ok: false, error: 'บัญชีผู้ใช้งานนี้ถูกระงับสิทธิ์ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' };
  }
  if (found.status === 'pending') {
    return { ok: false, error: 'บัญชีผู้ใช้งานของคุณอยู่ระหว่างรอการอนุมัติจากผู้ดูแลระบบ' };
  }
  if (found.password && found.password !== passwordInput) {
    return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' };
  }
  return { ok: true, user: found };
}

