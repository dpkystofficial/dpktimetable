import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultAppData,
  createDefaultUsers,
  createDefaultAccessPolicy,
  verifyUserCredentials,
  canManageTimetable,
  canAccessAdminPanel,
  findTeacherConflictsAtSlot,
  getScheduledHoursForSubject,
  autoScheduleEngine,
  findDuePeriodsForBackgroundAlert,
  buildPeriodBroadcastPayloads,
  getSchoolPeriodTimeStatus,
  sanitizeLineTargetId,
  validateLineTargetId,
  diagnoseLineNotificationReadiness
} from './timetableLogic';
import { HighPerformanceRedisCache } from './redisCache';

test('createDefaultAppData generates complete initial timetable for P.1 - M.3', () => {
  const data = createDefaultAppData();
  assert.equal(data.schoolInfo.schoolName, 'โรงเรียนดอนแก้วปากเป่งคุยสำโรง');
  assert.equal(data.teachers.length, 9);
  assert.ok(data.subjects.length >= 100);
  const p1MonP1 = data.schedule['ป.1_MON_P1'];
  assert.ok(p1MonP1, 'Expected P.1 Monday Period 1 to be scheduled');
});

test('findTeacherConflictsAtSlot detects teacher overlap across grades', () => {
  const data = createDefaultAppData();
  data.schedule = {};
  const p1Thai = data.subjects.find(s => s.grade === 'ป.1' && s.name === 'ภาษาไทย')!;
  const p2SubWithSameTeacher = {
    ...p1Thai,
    id: 'SUB_TEST_CONFLICT',
    grade: 'ป.2',
    teacherId: p1Thai.teacherId
  };
  data.subjects.push(p2SubWithSameTeacher);

  data.schedule['ป.1_MON_P1'] = { subjectId: p1Thai.id, allowOverlap: false };
  const clashes = findTeacherConflictsAtSlot(data, 'MON', 'P1', p1Thai.teacherId, 'ป.2');
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].grade, 'ป.1');
});

test('autoScheduleEngine schedules all required hours for a grade', () => {
  const data = createDefaultAppData();
  const res = autoScheduleEngine(data, {
    grades: ['ป.1'],
    noSameDayDuplicate: true,
    coreMorning: true,
    lockActivities: true,
    allowCombinedSubjects: true,
    clearExisting: true
  });
  assert.ok(res.placedCount > 20);
  const p1Math = data.subjects.find(s => s.grade === 'ป.1' && s.name === 'คณิตศาสตร์')!;
  const hours = getScheduledHoursForSubject(res.schedule, data.periods, 'ป.1', p1Math.id);
  assert.equal(hours, p1Math.hours);
});

test('HighPerformanceRedisCache records cache hits, misses, and invalidations', () => {
  const cache = new HighPerformanceRedisCache(60);
  const miss = cache.get('timetable:full');
  assert.equal(miss.hit, false);

  cache.set('timetable:full', { version: 1 });
  const hit = cache.get<{ version: number }>('timetable:full');
  assert.equal(hit.hit, true);
  assert.equal(hit.data?.version, 1);

  const statsBefore = cache.getStats();
  assert.equal(statsBefore.hits, 1);
  assert.equal(statsBefore.misses, 1);

  const removed = cache.invalidatePrefix('timetable:');
  assert.equal(removed, 1);
  const afterInvalidate = cache.get('timetable:full');
  assert.equal(afterInvalidate.hit, false);
});

test('Authentication and RBAC helpers enforce Admin, Teacher, and Student permissions', () => {
  const users = createDefaultUsers();
  const policy = createDefaultAccessPolicy();

  // Valid admin login (dpkyst11 / dpkyst11)
  const adminAuth = verifyUserCredentials(users, 'dpkyst11', 'dpkyst11');
  assert.equal(adminAuth.ok, true);
  assert.equal(adminAuth.user?.role, 'admin');
  assert.equal(canAccessAdminPanel(adminAuth.user!), true);
  assert.equal(canManageTimetable(adminAuth.user!, policy), true);

  // Valid teacher login
  const teacherAuth = verifyUserCredentials(users, 'somying', 'teacher1234');
  assert.equal(teacherAuth.ok, true);
  assert.equal(teacherAuth.user?.role, 'teacher');
  assert.equal(canAccessAdminPanel(teacherAuth.user!), false);
  assert.equal(canManageTimetable(teacherAuth.user!, policy), true);

  // Valid student login
  const studentAuth = verifyUserCredentials(users, 'student.p1', 'student1234');
  assert.equal(studentAuth.ok, true);
  assert.equal(studentAuth.user?.role, 'student');
  assert.equal(canAccessAdminPanel(studentAuth.user!), false);
  assert.equal(canManageTimetable(studentAuth.user!, policy), false);

  // Wrong password
  const badAuth = verifyUserCredentials(users, 'dpkyst11', 'wrongpass');
  assert.equal(badAuth.ok, false);
});

test('Background 24/7 LINE scheduler detects due periods and builds LINE payloads without browser', () => {
  const data = createDefaultAppData();
  data.lineConfig.autoEnabled = true;
  data.lineConfig.backgroundServerEnabled = true;
  data.lineConfig.leadMinutes = 5;
  data.lineConfig.teacherGroupId = 'C1234567890abcdef1234567890abcdef';

  // Period 1 starts at 08:30. With leadMinutes = 5, trigger time is 08:25 on a Monday (2026-11-16 is Monday).
  const mondayAt0825 = new Date(2026, 10, 16, 8, 25, 0);
  const duePeriods = findDuePeriodsForBackgroundAlert(data, mondayAt0825);
  assert.equal(duePeriods.length, 1);
  assert.equal(duePeriods[0].period.id, 'P1');
  assert.equal(duePeriods[0].dayKey, 'MON');

  // Building broadcast payloads generates messages for teachers and student classes
  const payloads = buildPeriodBroadcastPayloads(data, 'MON', 'P1', false);
  assert.ok(payloads.length >= 1);
  assert.equal(payloads[0].targetId, 'C1234567890abcdef1234567890abcdef');
  assert.ok(payloads[0].messageText.includes('คาบที่ 1'));

  // Once marked sent in sentHistoryKeys, it does not duplicate in the same day/period
  data.lineConfig.sentHistoryKeys = {
    ...(data.lineConfig.sentHistoryKeys || {}),
    [duePeriods[0].historyKey]: true
  };
  const dueAgain = findDuePeriodsForBackgroundAlert(data, mondayAt0825);
  assert.equal(dueAgain.length, 0);
});

test('getSchoolPeriodTimeStatus accurately tracks active class in final period (14:30-15:30) as still in progress', () => {
  const data = createDefaultAppData();
  // At 14:41 (881 minutes), Period 6 (14:30 - 15:30) is still active with 49 minutes remaining
  const statusAt1441 = getSchoolPeriodTimeStatus(data.periods, 14 * 60 + 41);
  assert.equal(statusAt1441.currentPeriodSlot?.id, 'P6');
  assert.equal(statusAt1441.currentRemainingMinutes, 49);
  assert.equal(statusAt1441.isInLastPeriod, true);
  assert.equal(statusAt1441.isSchoolDayEnded, false);

  // Only at or after 15:30 (930 minutes) is the school day ended
  const statusAt1535 = getSchoolPeriodTimeStatus(data.periods, 15 * 60 + 35);
  assert.equal(statusAt1535.currentPeriodSlot, null);
  assert.equal(statusAt1535.isInLastPeriod, false);
  assert.equal(statusAt1535.isSchoolDayEnded, true);
});

test('LINE ID sanitization, validation, free-period coverage, and readiness diagnostics prevent missed alerts', () => {
  const dirtyGroupId = '  "C1234567890abcdef1234567890abcdef\u200B" \n';
  const cleaned = sanitizeLineTargetId(dirtyGroupId);
  assert.equal(cleaned, 'C1234567890abcdef1234567890abcdef');

  const validGroup = validateLineTargetId(dirtyGroupId);
  assert.equal(validGroup.valid, true);
  assert.equal(validGroup.type, 'GROUP');

  const invalidId = validateLineTargetId('wrong_id_123');
  assert.equal(invalidId.valid, false);
  assert.equal(invalidId.type, 'INVALID');

  const data = createDefaultAppData();
  data.lineConfig.teacherGroupId = dirtyGroupId;
  data.lineConfig.notifyFreePeriods = true;
  // Remove P.1 MON P1 entry to simulate a free period for P.1
  delete data.schedule['ป.1_MON_P1'];

  const payloads = buildPeriodBroadcastPayloads(data, 'MON', 'P1', false);
  const p1StudentPayload = payloads.find(p => p.recipientLabel === 'นักเรียนชั้น ป.1');
  assert.ok(p1StudentPayload, 'Expected P.1 student group to still be notified during a free period');
  assert.equal(p1StudentPayload?.targetId, 'C1234567890abcdef1234567890abcdef');
  assert.equal(p1StudentPayload?.fallbackTargetId, 'C1234567890abcdef1234567890abcdef');

  const diag = diagnoseLineNotificationReadiness(data, 'MON', 'P1');
  assert.equal(diag.mainTeacherGroupValid, true);
  assert.equal(diag.emptySlotCountForSelectedPeriod >= 1, true);
});
