import React, { useState, useEffect, useRef } from 'react';
import {
  DAYS,
  GRADES,
  GRADE_FULL_NAMES,
  DEFAULT_TEACHER_LINE_TEMPLATE,
  DEFAULT_STUDENT_LINE_TEMPLATE,
   getBangkokDate,
  getSchoolPeriodTimeStatus,
  buildStudentClassAlertMessage,
  buildTeacherClassAlertMessage,
  buildSummaryPeriodAlertMessage,
  buildPeriodBroadcastPayloads,
  sanitizeLineTargetId,
  validateLineTargetId,
  diagnoseLineNotificationReadiness,
  type AppData,
  type LineConfig,
  type PeriodSlot
} from '../utils/timetableLogic';
import { syncStateToFirebaseRTDB } from '../services/firebaseClient';

interface LineNotificationSectionProps {
  appData: AppData;
  onUpdateLineConfig: (nextConfig: LineConfig, showNotice?: boolean) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const TEMPLATE_VARIABLES = [
  { key: '{school}', label: '{school}', desc: 'ชื่อโรงเรียน' },
  { key: '{day}', label: '{day}', desc: 'วันในสัปดาห์' },
  { key: '{period}', label: '{period}', desc: 'ชื่อคาบเรียน' },
  { key: '{time}', label: '{time}', desc: 'เวลาเรียน' },
  { key: '{grade}', label: '{grade}', desc: 'ระดับชั้น' },
  { key: '{code}', label: '{code}', desc: 'รหัสวิชา' },
  { key: '{subject}', label: '{subject}', desc: 'ชื่อวิชา' },
  { key: '{teacher}', label: '{teacher}', desc: 'ชื่อครูผู้สอน' },
  { key: '{room}', label: '{room}', desc: 'ห้องเรียน/หมายเหตุ' }
];

export function getGoogleAppsScriptBridgeCode(): string {
  return `// =========================================================================
// โค้ด Google Apps Script สำหรับระบบแจ้งเตือนตารางเรียนผ่าน LINE (ทำงานอัตโนมัติ 24 ชม. แม้ปิดหน้าเว็บ)
// โรงเรียนดอนแก้วปากเป่งคุยสำโรง สพป.ยโสธร เขต 1
// =========================================================================

var FIREBASE_SCHEDULE_URL = "https://dpk-asset-default-rtdb.asia-southeast1.firebasedatabase.app/dpk_timetable_system/cloud_schedule.json";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // กรณีที่ 1: LINE Webhook ส่งอีเวนต์เข้ามา (เมื่อมีคนพิมพ์ /id หรือ รหัสกลุ่ม ในกลุ่มหรือแชทส่วนตัว)
    if (data.events && data.events.length > 0) {
      var event = data.events[0];
      if (event.type === 'message' && event.message.type === 'text') {
        var text = event.message.text.trim();
        if (text === '/id' || text === 'รหัสกลุ่ม') {
          var sourceId = event.source.groupId || event.source.roomId || event.source.userId;
          var replyText = "✅ รหัสสำหรับใส่ในเว็บจัดตารางเรียน:\\n" + sourceId;
          var savedProps = PropertiesService.getScriptProperties().getProperty("TIMETABLE_DATA");
          var savedToken = savedProps ? (JSON.parse(savedProps).lineConfig.channelAccessToken || "") : "";
          var CHANNEL_TOKEN = savedToken || "ใส่_CHANNEL_ACCESS_TOKEN_ของคุณที่นี่_ถ้าต้องการให้ตอบกลับอัตโนมัติ";
          if (CHANNEL_TOKEN && CHANNEL_TOKEN.indexOf("ใส่_") === -1) {
            UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
              method: "post",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + CHANNEL_TOKEN
              },
              payload: JSON.stringify({
                replyToken: event.replyToken,
                messages: [{ type: "text", text: replyText }]
              })
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "webhook_ok" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // กรณีที่ 2: เว็บไซต์ซิงค์ตารางเรียนและตั้งค่า LINE มาเก็บไว้บน Google Cloud (เพื่อแจ้งเตือนอัตโนมัติแม้ปิดหน้าเว็บ)
    if (data.action === 'SYNC_TIMETABLE' && data.payload) {
      PropertiesService.getScriptProperties().setProperty("TIMETABLE_DATA", JSON.stringify(data.payload));
      setupAutoTrigger();
      return ContentService.createTextOutput(JSON.stringify({ status: "synced_and_trigger_ready" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // กรณีที่ 3: เว็บไซต์สั่งส่งข้อความแจ้งเตือนครูและนักเรียนทันที (Push Message)
    var token = data.token;
    var to = data.to;
    var message = data.message;

    var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      payload: JSON.stringify({
        to: to,
        messages: [{ type: "text", text: message }]
      }),
      muteHttpExceptions: true
    });

    return ContentService.createTextOutput(response.getContentText())
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันตั้งเวลาอัตโนมัติบน Google Cloud (กด Run ครั้งเดียว หรือให้เว็บซิงค์มาติดตั้งให้อัตโนมัติ)
function setupAutoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "checkScheduleAndNotifyEveryMinute") {
      return; // มี Trigger ทำงานอยู่แล้ว
    }
  }
  ScriptApp.newTrigger("checkScheduleAndNotifyEveryMinute")
    .timeBased()
    .everyMinutes(1)
    .create();
}

// ฟังก์ชันทำงานเบื้องหลังทุก 1 นาทีบน Google Cloud (แจ้งเตือนเข้า LINE แม้ปิดหน้าเว็บและปิดคอมพิวเตอร์)
function checkScheduleAndNotifyEveryMinute() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("TIMETABLE_DATA");

  // หากยังไม่มีใน Properties ให้ดึงจาก Firebase Cloud (dpk-asset) อัตโนมัติ
  if (!raw) {
    try {
      var fbRes = UrlFetchApp.fetch(FIREBASE_SCHEDULE_URL, { muteHttpExceptions: true });
      if (fbRes.getResponseCode() === 200 && fbRes.getContentText() !== "null") {
        raw = fbRes.getContentText();
      }
    } catch (e) {}
  }
  if (!raw) return;

  var appData = JSON.parse(raw);
  if (appData && appData.serializedState) {
    appData = JSON.parse(appData.serializedState);
  }
  var cfg = appData.lineConfig;
  if (!cfg || !cfg.autoEnabled || !cfg.channelAccessToken) return;

  var now = new Date();
  var dayOfWeek = Number(Utilities.formatDate(now, "Asia/Bangkok", "u")); // 1=Mon ... 5=Fri, 6=Sat, 7=Sun
  if (dayOfWeek < 1 || dayOfWeek > 5) return;

  var dayKeyMap = { 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI" };
  var dayNameMap = { "MON": "จันทร์", "TUE": "อังคาร", "WED": "พุธ", "THU": "พฤหัสบดี", "FRI": "ศุกร์" };
  var currentDayKey = dayKeyMap[dayOfWeek];
  var todayDateKey = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
  var hh = Number(Utilities.formatDate(now, "Asia/Bangkok", "HH"));
  var mm = Number(Utilities.formatDate(now, "Asia/Bangkok", "mm"));
  var nowMinutes = (hh * 60) + mm;
  var lead = Number(cfg.leadMinutes || 0);

  var sentHistoryRaw = props.getProperty("SENT_HISTORY_" + todayDateKey);
  var sentHistory = sentHistoryRaw ? JSON.parse(sentHistoryRaw) : {};

  var periods = appData.periods || [];
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    var startParts = (p.start || "00:00").split(":");
    var endParts = (p.end || "00:00").split(":");
    var startMin = (Number(startParts[0]) * 60) + Number(startParts[1] || 0);
    var endMin = (Number(endParts[0]) * 60) + Number(endParts[1] || 0);
    if (nowMinutes >= (startMin - lead) && nowMinutes < endMin) {
      var historyKey = todayDateKey + "_" + currentDayKey + "_" + p.id;
      if (!sentHistory[historyKey]) {
        sentHistory[historyKey] = true;
        props.setProperty("SENT_HISTORY_" + todayDateKey, JSON.stringify(sentHistory));
        sendPeriodNotificationsFromCloud(appData, currentDayKey, dayNameMap[currentDayKey], p);
      }
    }
  }
}

function sendPeriodNotificationsFromCloud(appData, dayKey, dayName, periodObj) {
  var cfg = appData.lineConfig;
  var schoolName = (appData.schoolInfo && appData.schoolInfo.schoolName) || "โรงเรียนดอนแก้วปากเป่งคุยสำโรง";
  var grades = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3"];

  if (periodObj.type === "lunch") {
    if (cfg.notifyLunch && cfg.teacherGroupId) {
      pushLineText(cfg.channelAccessToken, cfg.teacherGroupId,
        "🍱 แจ้งเตือนเวลาพักกลางวัน (" + schoolName + ")\\n📅 วัน" + dayName + " | เวลา " + periodObj.start + " - " + periodObj.end + " น.\\nขอให้คณะครูและนักเรียนทุกคนรับประทานอาหารกลางวันอย่างมีความสุขค่ะ 🌸");
    }
    return;
  }

  // ส่งแจ้งเตือนรายครูผู้สอน (รวมวิชาที่สอนควบชั้นในคาบเดียวกัน + มีระบบส่งสำรองเข้ากลุ่มหลักหาก ID ส่วนตัวครูขัดข้อง)
  var fallbackGroup = cleanLineId(cfg.teacherGroupId);
  var notifyFree = cfg.notifyFreePeriods !== false;

  if (cfg.notifyTeachers !== false) {
    var teacherClassesMap = {};
    for (var gIdx = 0; gIdx < grades.length; gIdx++) {
      var g = grades[gIdx];
      var gAlt = g.replace(".", "_");
      var entry = appData.schedule && (appData.schedule[g + "_" + dayKey + "_" + periodObj.id] || appData.schedule[gAlt + "_" + dayKey + "_" + periodObj.id]);
      if (!entry) continue;
      var sub = null;
      for (var sIdx = 0; sIdx < (appData.subjects || []).length; sIdx++) {
        if (appData.subjects[sIdx].id === entry.subjectId) { sub = appData.subjects[sIdx]; break; }
      }
      if (!sub) continue;
      var tid = sub.teacherId || "UNASSIGNED";
      if (!teacherClassesMap[tid]) teacherClassesMap[tid] = [];
      teacherClassesMap[tid].push({ grade: g, sub: sub });
    }

    var teacherList = appData.teachers || [];
    for (var tIdx = 0; tIdx < teacherList.length; tIdx++) {
      var t = teacherList[tIdx];
      var taughtList = teacherClassesMap[t.id] || [];
      var personalId = cleanLineId((cfg.teacherTargetIds && cfg.teacherTargetIds[t.id]) || t.lineTargetId);
      if (taughtList.length === 0 && (!notifyFree || !personalId)) continue;

      var targetToUse = personalId || fallbackGroup;
      if (!targetToUse) continue;

      var teacherMsg = "";
      if (taughtList.length === 0) {
        teacherMsg = "🔔 แจ้งตารางสอน (" + schoolName + ")\\n📅 วัน" + dayName + " | " + periodObj.label + " (" + periodObj.start + " - " + periodObj.end + " น.)\\n👩‍🏫 " + t.prefix + t.fullName + "\\n✨ คาบนี้ไม่มีชั่วโมงสอน (คาบว่าง/เตรียมการสอนค่ะ)";
      } else {
        var gradeNames = [];
        var subNames = [];
        for (var cIdx = 0; cIdx < taughtList.length; cIdx++) {
          gradeNames.push(taughtList[cIdx].grade);
          subNames.push(taughtList[cIdx].sub.code + " " + taughtList[cIdx].sub.name);
        }
        teacherMsg = "🔔 แจ้งเตือนเข้าคาบสอน (" + schoolName + ")\\n📅 วัน" + dayName + " | " + periodObj.label + " (" + periodObj.start + " - " + periodObj.end + " น.)\\n👩‍🏫 ครูผู้สอน: " + t.prefix + t.fullName + "\\n📚 รายวิชา: " + subNames.join(" / ") + "\\n🏫 ชั้นเรียน: " + gradeNames.join(", ");
      }
      pushLineTextWithFallback(cfg.channelAccessToken, targetToUse, teacherMsg, fallbackGroup);
      Utilities.sleep(300); // หน่วงเวลา 300ms ป้องกัน LINE API บล็อกเมื่อส่งหลายคนพร้อมกัน
    }
  }

  // ส่งแจ้งเตือนนักเรียนรายชั้นเรียน (ป.1 - ม.3)
  if (cfg.notifyStudents !== false) {
    for (var sgIdx = 0; sgIdx < grades.length; sgIdx++) {
      var sg = grades[sgIdx];
      var sgAlt = sg.replace(".", "_");
      var sEntry = appData.schedule && (appData.schedule[sg + "_" + dayKey + "_" + periodObj.id] || appData.schedule[sgAlt + "_" + dayKey + "_" + periodObj.id]);
      var classGroup = cleanLineId(cfg.gradeGroupIds && (cfg.gradeGroupIds[sg] || cfg.gradeGroupIds[sgAlt]));
      if (!sEntry && !notifyFree && !classGroup) continue;

      var finalClassTarget = classGroup || fallbackGroup;
      if (!finalClassTarget) continue;

      var sSub = null;
      if (sEntry) {
        for (var ssIdx = 0; ssIdx < (appData.subjects || []).length; ssIdx++) {
          if (appData.subjects[ssIdx].id === sEntry.subjectId) { sSub = appData.subjects[ssIdx]; break; }
        }
      }
      var sTeacher = null;
      if (sSub) {
        for (var stIdx = 0; stIdx < (appData.teachers || []).length; stIdx++) {
          if (appData.teachers[stIdx].id === sSub.teacherId) { sTeacher = appData.teachers[stIdx]; break; }
        }
      }

      var studentMsg = sSub
        ? ("🎒 แจ้งเตือนเข้าเรียน ชั้น " + sg + " (" + schoolName + ")\\n📅 วัน" + dayName + " | " + periodObj.label + " (" + periodObj.start + " - " + periodObj.end + " น.)\\n📖 วิชา: " + sSub.code + " " + sSub.name + "\\n👩‍🏫 ครูผู้สอน: " + (sTeacher ? (sTeacher.prefix + sTeacher.fullName) : "ไม่ระบุ"))
        : ("🎒 แจ้งเตือนตารางเรียน ชั้น " + sg + " (" + schoolName + ")\\n📅 วัน" + dayName + " | " + periodObj.label + " (" + periodObj.start + " - " + periodObj.end + " น.)\\n📌 คาบเรียนว่าง / ทบทวนบทเรียนด้วยตนเอง");

      pushLineTextWithFallback(cfg.channelAccessToken, finalClassTarget, studentMsg, fallbackGroup);
      Utilities.sleep(300); // หน่วงเวลา 300ms ป้องกันการตกหล่นบางกลุ่ม
    }
  }
}

function cleanLineId(raw) {
  if (!raw) return "";
  return String(raw).replace(/[\\s\\u200B-\\u200D\\uFEFF"']/g, "").trim();
}

function pushLineText(token, to, message) {
  return pushLineTextWithFallback(token, to, message, "");
}

function pushLineTextWithFallback(token, to, message, fallbackTo) {
  var cleanedTo = cleanLineId(to);
  var cleanedFallback = cleanLineId(fallbackTo);
  if (!token || !cleanedTo) return;

  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    payload: JSON.stringify({ to: cleanedTo, messages: [{ type: "text", text: message }] }),
    muteHttpExceptions: true
  });

  // หากส่งไปยัง ID เฉพาะไม่สำเร็จ (เช่น บอทไม่อยู่ในกลุ่มย่อย หรือ User ID ผิด) ให้ส่งสำรองเข้ากลุ่มรวมครูอัตโนมัติ
  if (res.getResponseCode() !== 200 && cleanedFallback && cleanedFallback !== cleanedTo) {
    Utilities.sleep(250);
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      payload: JSON.stringify({
        to: cleanedFallback,
        messages: [{ type: "text", text: message + "\\n\\n📌 [ระบบส่งสำรองเข้ากลุ่มหลัก เนื่องจากรหัสปลายทาง " + cleanedTo.substring(0, 8) + "... ขัดข้อง]" }]
      }),
      muteHttpExceptions: true
    });
  }
}`;
}

export const LineNotificationSection: React.FC<LineNotificationSectionProps> = ({
  appData,
  onUpdateLineConfig,
  onShowToast
}) => {
  const buildInitialTeacherTargets = (data: AppData): Record<string, string> => {
    const map: Record<string, string> = { ...(data.lineConfig.teacherTargetIds || {}) };
    (data.teachers || []).forEach(t => {
      if (t.lineTargetId && !map[t.id]) {
        map[t.id] = t.lineTargetId;
      }
    });
    return map;
  };

  const [cfg, setCfg] = useState<LineConfig>(() => ({
    ...appData.lineConfig,
    backgroundServerEnabled: appData.lineConfig.backgroundServerEnabled !== false,
    notifyFreePeriods: appData.lineConfig.notifyFreePeriods !== false,
    gradeGroupIds: { ...(appData.lineConfig.gradeGroupIds || {}) },
    teacherTargetIds: buildInitialTeacherTargets(appData),
    logs: appData.lineConfig.logs || [],
    sentHistoryKeys: { ...(appData.lineConfig.sentHistoryKeys || {}) }
  }));

  const [previewDay, setPreviewDay] = useState<string>('MON');
  const [previewPeriodId, setPreviewPeriodId] = useState<string>(appData.periods[0]?.id || 'P1');
  const [previewMode, setPreviewMode] = useState<'SUMMARY' | 'TEACHER' | 'STUDENT'>('SUMMARY');
  const [previewSubTarget, setPreviewSubTarget] = useState<string>(appData.teachers[0]?.id || 'T01');

  const [liveDateText, setLiveDateText] = useState<string>('วันจันทร์');
  const [clockText, setClockText] = useState<string>('08:30:00 น.');
  const [currentPeriodSlot, setCurrentPeriodSlot] = useState<PeriodSlot | null>(null);
  const [currentRemainingMinutes, setCurrentRemainingMinutes] = useState<number>(0);
  const [nextPeriodSlot, setNextPeriodSlot] = useState<PeriodSlot | null>(null);
  const [nextDiffMinutes, setNextDiffMinutes] = useState<number>(0);
  const [firstPeriodSlot, setFirstPeriodSlot] = useState<PeriodSlot | null>(appData.periods[0] || null);
  const [lastPeriodSlot, setLastPeriodSlot] = useState<PeriodSlot | null>(
    appData.periods[appData.periods.length - 1] || null
  );
  const [isInLastPeriod, setIsInLastPeriod] = useState<boolean>(false);

  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isGroupHelperOpen, setIsGroupHelperOpen] = useState<boolean>(false);
  const [isTeacherIdGridOpen, setIsTeacherIdGridOpen] = useState<boolean>(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState<boolean>(true);
  const [lastFocusedField, setLastFocusedField] = useState<'teacher' | 'student'>('teacher');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [isResettingHistory, setIsResettingHistory] = useState<boolean>(false);

  const teacherTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const studentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cfgRef = useRef<LineConfig>(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    setCfg({
      ...appData.lineConfig,
      backgroundServerEnabled: appData.lineConfig.backgroundServerEnabled !== false,
      notifyFreePeriods: appData.lineConfig.notifyFreePeriods !== false,
      gradeGroupIds: { ...(appData.lineConfig.gradeGroupIds || {}) },
      teacherTargetIds: buildInitialTeacherTargets(appData),
      logs: appData.lineConfig.logs || [],
      sentHistoryKeys: { ...(appData.lineConfig.sentHistoryKeys || {}) }
    });
  }, [appData.lineConfig, appData.teachers]);

  const getTeacherById = (id: string) => appData.teachers.find(t => t.id === id) || null;

  // Sync timetable & LINE settings to Server Background Scheduler + Google Apps Script Cloud + Firebase RTDB
  const handleSyncCloudSchedule = async (nextConfigOverride?: LineConfig, showToastMsg = true) => {
    const targetCfg = {
      ...(nextConfigOverride || cfg),
      backgroundServerEnabled: (nextConfigOverride || cfg).backgroundServerEnabled !== false
    };
    setIsSyncingCloud(true);
    try {
      const res = await fetch('/api/line/sync-cloud-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineConfig: targetCfg })
      });
      const json = await res.json();
      const updatedCfg: LineConfig = {
        ...targetCfg,
        lastCloudSyncedAt: json.syncedAt || new Date().toISOString()
      };
      setCfg(updatedCfg);
      onUpdateLineConfig(updatedCfg, false);

      // Also sync to Firebase RTDB (dpk-asset) so Google Apps Script can pull directly from Firebase 24/7
      void syncStateToFirebaseRTDB({
        ...appData,
        lineConfig: updatedCfg
      });

      if (showToastMsg) {
        onShowToast(
          'บันทึกและเปิดระบบแจ้งเตือนเบื้องหลังอัตโนมัติ (ทำงานแม้ปิดหน้าเว็บ) เรียบร้อยแล้ว!',
          'success'
        );
      }
    } catch {
      onUpdateLineConfig(targetCfg, showToastMsg);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Broadcast to all active teachers and student classes in a period via Server API
  const triggerFullPeriodLineBroadcast = async (
    dayKey: string,
    periodId: string,
    isManual = false,
    overrideConfig?: LineConfig
  ) => {
    const activeCfg = overrideConfig || cfgRef.current;
    const periodObj = appData.periods.find(p => p.id === periodId);
    if (!periodObj) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/line/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'PERIOD_BROADCAST',
          dayKey,
          periodId,
          lineConfig: activeCfg
        })
      });
      const json = await res.json();
      if (json.ok && json.sentCount > 0) {
        const updated: LineConfig = { ...activeCfg, logs: json.logs || activeCfg.logs };
        setCfg(updated);
        onShowToast(
          json.simulatedAny
            ? `ส่งแจ้งเตือนจำลองรวม ${json.sentCount} รายการ สำหรับ ${periodObj.label} เรียบร้อยแล้ว`
            : `ส่งแจ้งเตือนเข้า LINE รวม ${json.sentCount} รายการ สำหรับ ${periodObj.label} เรียบร้อยแล้ว!`,
          'success'
        );
      } else if (isManual) {
        onShowToast('ไม่มีคาบเรียนในเวลานี้ หรือยังไม่ได้ติ๊กเลือกผู้รับ', 'warning');
      }
    } catch {
      if (isManual) {
        onShowToast('เกิดข้อผิดพลาดในการส่งแจ้งเตือน', 'error');
      }
    } finally {
      setIsSending(false);
    }
  };

  // Real-time Clock & Next Period Countdown display (always evaluated in Asia/Bangkok school time)
  useEffect(() => {
    const updateLiveClock = () => {
      const bangkokNow = getBangkokDate(new Date());
      const jsDay = bangkokNow.getDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
      const dayKeyMap: Record<number, string> = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI' };
      const currentDayKey = dayKeyMap[jsDay] || 'MON';
      const dayObj = DAYS.find(d => d.key === currentDayKey) || DAYS[0];

      const isWeekend = jsDay === 0 || jsDay === 6;
      setLiveDateText(isWeekend ? `วันหยุดสุดสัปดาห์ (จำลองตารางวัน${dayObj.name})` : `วัน${dayObj.name}`);

      const hh = String(bangkokNow.getHours()).padStart(2, '0');
      const mm = String(bangkokNow.getMinutes()).padStart(2, '0');
      const ss = String(bangkokNow.getSeconds()).padStart(2, '0');
      setClockText(`${hh}:${mm}:${ss} น.`);

      const nowMinutes = bangkokNow.getHours() * 60 + bangkokNow.getMinutes();
      const status = getSchoolPeriodTimeStatus(appData.periods, nowMinutes);

      setCurrentPeriodSlot(status.currentPeriodSlot);
      setCurrentRemainingMinutes(status.currentRemainingMinutes);
      setNextPeriodSlot(status.nextPeriodSlot);
      setNextDiffMinutes(status.nextDiffMinutes);
      setFirstPeriodSlot(status.firstPeriodSlot);
      setLastPeriodSlot(status.lastPeriodSlot);
      setIsInLastPeriod(status.isInLastPeriod);
    };

    updateLiveClock();
    const timer = setInterval(updateLiveClock, 1000);
    return () => clearInterval(timer);
  }, [appData.periods]);

  const previewPeriodObj = appData.periods.find(p => p.id === previewPeriodId) || appData.periods[0];

  const previewText = previewMode === 'TEACHER'
    ? buildTeacherClassAlertMessage(appData, previewSubTarget, previewDay, previewPeriodId, cfg)
    : previewMode === 'STUDENT'
      ? buildStudentClassAlertMessage(appData, previewSubTarget || 'ป.1', previewDay, previewPeriodId, cfg)
      : buildSummaryPeriodAlertMessage(appData, previewDay, previewPeriodId);

  const mockRoomTitle = previewMode === 'TEACHER'
    ? (() => {
        const t = getTeacherById(previewSubTarget) || appData.teachers[0];
        return t ? `LINE ครู: ${t.prefix}${t.fullName}` : 'กลุ่มรวมครูผู้สอน';
      })()
    : previewMode === 'STUDENT'
      ? `กลุ่มนักเรียนชั้น${GRADE_FULL_NAMES[previewSubTarget || 'ป.1']} (${previewSubTarget || 'ป.1'})`
      : 'กลุ่มแจ้งเตือนตารางเรียนรวม (ป.1 - ม.3)';

  const handleInsertVariable = (variableText: string) => {
    const isTeacherField = lastFocusedField === 'teacher';
    const textarea = isTeacherField ? teacherTextareaRef.current : studentTextareaRef.current;
    const currentVal = isTeacherField
      ? (cfg.teacherTemplate || DEFAULT_TEACHER_LINE_TEMPLATE)
      : (cfg.studentTemplate || DEFAULT_STUDENT_LINE_TEMPLATE);

    if (!textarea) {
      const nextVal = currentVal + variableText;
      setCfg(prev => ({
        ...prev,
        [isTeacherField ? 'teacherTemplate' : 'studentTemplate']: nextVal
      }));
      return;
    }

    const start = textarea.selectionStart ?? currentVal.length;
    const end = textarea.selectionEnd ?? currentVal.length;
    const nextVal = currentVal.substring(0, start) + variableText + currentVal.substring(end);

    setCfg(prev => ({
      ...prev,
      [isTeacherField ? 'teacherTemplate' : 'studentTemplate']: nextVal
    }));

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variableText.length;
    }, 0);
  };

  const handleResetDefaultTemplates = () => {
    const next: LineConfig = {
      ...cfg,
      teacherTemplate: DEFAULT_TEACHER_LINE_TEMPLATE,
      studentTemplate: DEFAULT_STUDENT_LINE_TEMPLATE
    };
    setCfg(next);
    void handleSyncCloudSchedule(next, false);
    onShowToast('คืนค่ารูปแบบข้อความแจ้งเตือนเริ่มต้นแล้ว', 'info');
  };

  const handleSendSinglePreview = async () => {
    if (!previewPeriodObj) return;
    setIsSending(true);
    try {
      let targetId = cfg.teacherGroupId;
      let recipientLabel = 'กลุ่มรวมทั้งโรงเรียน (ป.1-ม.3)';

      if (previewMode === 'TEACHER') {
        const t = getTeacherById(previewSubTarget);
        const personalId = t ? sanitizeLineTargetId(cfg.teacherTargetIds?.[t.id] || t.lineTargetId) : '';
        targetId = personalId || cfg.teacherGroupId;
        recipientLabel = t ? `ครู: ${t.prefix}${t.fullName}` : 'กลุ่มครูผู้สอน';
      } else if (previewMode === 'STUDENT') {
        const g = previewSubTarget || 'ป.1';
        targetId = sanitizeLineTargetId(cfg.gradeGroupIds && cfg.gradeGroupIds[g]) || cfg.teacherGroupId;
        recipientLabel = `นักเรียนชั้น ${g}`;
      }

      const res = await fetch('/api/line/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'SINGLE',
          targetId,
          recipientLabel,
          messageText: previewText,
          periodLabel: previewPeriodObj.label,
          lineConfig: cfg
        })
      });
      const json = await res.json();

      const updated: LineConfig = { ...cfg, logs: json.logs || cfg.logs };
      setCfg(updated);

      if (json.ok) {
        if (json.simulatedAny) {
          onShowToast(`จำลองส่งแจ้งเตือน LINE ไปยัง "${recipientLabel}" สำเร็จ! (ดูในประวัติด้านล่าง)`, 'info');
        } else {
          onShowToast(`ส่งแจ้งเตือนเข้า LINE ไปยัง "${recipientLabel}" เรียบร้อยแล้ว!`, 'success');
        }
      } else {
        const firstErr = json.logs?.[0]?.errorDetail || 'เกิดข้อผิดพลาดในการส่งข้อความแจ้งเตือน';
        onShowToast(firstErr, 'error');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleResetTodayHistory = async () => {
    setIsResettingHistory(true);
    try {
      const res = await fetch('/api/line/reset-today-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      const updated: LineConfig = { ...cfg, sentHistoryKeys: {} };
      setCfg(updated);
      onUpdateLineConfig(updated, false);
      onShowToast(
        json.message || 'ปลดล็อกประวัติการส่งของวันนี้แล้ว ระบบพร้อมส่งแจ้งเตือนซ้ำใหม่อีกครั้ง',
        'success'
      );
    } catch {
      const updated: LineConfig = { ...cfg, sentHistoryKeys: {} };
      setCfg(updated);
      onUpdateLineConfig(updated, false);
      onShowToast('ปลดล็อกประวัติการส่งของวันนี้เรียบร้อยแล้ว', 'info');
    } finally {
      setIsResettingHistory(false);
    }
  };

  const handleClearLogs = () => {
    const updated: LineConfig = { ...cfg, logs: [] };
    setCfg(updated);
    onUpdateLineConfig(updated, false);
    onShowToast('ล้างประวัติการแจ้งเตือน LINE แล้ว', 'info');
  };

  const diagnosticReport = diagnoseLineNotificationReadiness(appData, previewDay, previewPeriodId, cfg);
  const previewPayloads = buildPeriodBroadcastPayloads(appData, previewDay, previewPeriodId, true, cfg);
  const sentTodayCount = Object.keys(cfg.sentHistoryKeys || {}).length;

  const handleCopyGasCode = async () => {
    const code = getGoogleAppsScriptBridgeCode();
    try {
      await navigator.clipboard.writeText(code);
      onShowToast('คัดลอกโค้ด Google Apps Script ลงคลิปบอร์ดเรียบร้อยแล้ว!', 'success');
    } catch {
      const el = document.getElementById('gasCodeTextarea') as HTMLTextAreaElement | null;
      if (el) {
        el.select();
        document.execCommand('copy');
        onShowToast('คัดลอกโค้ด Google Apps Script ลงคลิปบอร์ดเรียบร้อยแล้ว!', 'success');
      }
    }
  };

  return (
    <section className="space-y-6">
      {/* Real-time Clock & 24/7 Background Notification Status Banner */}
      <div className="pastel-card p-4 md:p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-pink-50 border-2 border-emerald-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Left: Live Clock & Current Period Status */}
          <div className="lg:col-span-5 flex items-center gap-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex flex-col items-center justify-center shadow-md shrink-0">
              <i className="fa-brands fa-line text-3xl"></i>
              <span className="text-[9px] font-bold tracking-wider">LINE 24/7</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  {liveDateText}
                </span>
                {cfg.autoEnabled ? (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white"></span>
                    แจ้งเตือนอัตโนมัติทำงานอยู่ (แจ้งเตือนแม้ปิดหน้าเว็บ)
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gray-200 text-gray-600 flex items-center gap-1">
                    <i className="fa-solid fa-pause"></i>
                    ปิดการแจ้งเตือนอัตโนมัติชั่วคราว
                  </span>
                )}
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-gray-800 tracking-tight mt-1">
                {clockText}
              </div>
              <p className="text-xs font-semibold text-teal-800 mt-0.5">
                {currentPeriodSlot ? (
                  <>
                    <i className="fa-solid fa-circle-play text-emerald-600 mr-1"></i>
                    กำลังเรียนอยู่: <strong>{currentPeriodSlot.label}</strong> ({currentPeriodSlot.start} - {currentPeriodSlot.end} น.) • เหลือเวลาในคาบนี้อีก <strong>{currentRemainingMinutes} นาที</strong>
                  </>
                ) : nextPeriodSlot ? (
                  <>
                    <i className="fa-solid fa-clock text-teal-600 mr-1"></i>
                    รอเข้าสู่ <strong>{nextPeriodSlot.label}</strong> เวลา {nextPeriodSlot.start} - {nextPeriodSlot.end} น.
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-clock text-gray-500 mr-1"></i>
                    หลังเวลาเลิกเรียน ({lastPeriodSlot?.end || '15:30'} น.) • ระบบตั้งเวลาเตรียมแจ้งเตือนวันถัดไปอัตโนมัติ
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Middle: Current / Next Period Countdown & Background Status */}
          <div className="lg:col-span-4 p-3.5 rounded-2xl bg-white/90 border border-emerald-200 space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="font-bold text-gray-600">
                <i className="fa-solid fa-hourglass-half text-emerald-500 mr-1"></i>
                {isInLastPeriod ? 'สถานะคาบเรียนปัจจุบัน:' : 'สถานะคาบถัดไป:'}
              </span>
              {nextPeriodSlot ? (
                <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-bold">
                  อีก {nextDiffMinutes} นาที ({nextPeriodSlot.start} น.)
                </span>
              ) : isInLastPeriod && currentPeriodSlot ? (
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                  กำลังเรียนอยู่ • เหลืออีก {currentRemainingMinutes} นาที (เลิก {currentPeriodSlot.end} น.)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-800 font-bold">
                  เลิกเรียนวันนี้แล้ว ({lastPeriodSlot?.end || '15:30'} น.) • รอพรุ่งนี้ {firstPeriodSlot?.start || '08:30'} น.
                </span>
              )}
            </div>
            <div className="text-sm font-extrabold text-gray-800">
              {nextPeriodSlot
                ? `คาบถัดไป: ${nextPeriodSlot.label} (${nextPeriodSlot.start} - ${nextPeriodSlot.end} น.)`
                : isInLastPeriod && currentPeriodSlot
                  ? `กำลังเรียนใน${currentPeriodSlot.label} (${currentPeriodSlot.start} - ${currentPeriodSlot.end} น.) ยังไม่สิ้นสุดเวลาเรียน`
                  : `คาบถัดไป (วันทำการถัดไป): ${firstPeriodSlot?.label || 'คาบที่ 1'} (${firstPeriodSlot?.start || '08:30'} - ${firstPeriodSlot?.end || '09:30'} น.)`}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold">
              <i className="fa-solid fa-cloud-bolt mr-1"></i>
              ส่งแจ้งเตือนล่วงหน้า {cfg.leadMinutes || 0} นาทีอัตโนมัติผ่านเซิร์ฟเวอร์ & คลาวด์แม้ไม่ได้เปิดหน้าเว็บ
            </div>
          </div>

          {/* Right: Master Auto-Switch & Setup Guide Button */}
          <div className="lg:col-span-3 flex flex-col sm:flex-row lg:flex-col gap-2 justify-end">
            <label className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-white border-2 border-emerald-300 cursor-pointer shadow-xs">
              <div className="text-xs">
                <div className="font-extrabold text-emerald-900">เปิดแจ้งเตือนอัตโนมัติ 24 ชม.</div>
                <div className="text-[10px] text-gray-500">ทำงานเบื้องหลังแม้ปิดหน้าเว็บ</div>
              </div>
              <input
                type="checkbox"
                checked={cfg.autoEnabled}
                onChange={e => {
                  const checked = e.target.checked;
                  const next = {
                    ...cfg,
                    autoEnabled: checked,
                    backgroundServerEnabled: checked
                  };
                  setCfg(next);
                  void handleSyncCloudSchedule(next, false);
                  onShowToast(
                    checked
                      ? 'เปิดระบบแจ้งเตือนเข้าคาบเรียนอัตโนมัติ (ทำงานแม้ปิดหน้าเว็บ) แล้ว'
                      : 'ปิดการแจ้งเตือนอัตโนมัติชั่วคราว',
                    checked ? 'success' : 'info'
                  );
                }}
                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-400 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="btn-pastel px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-book-bookmark"></i>
              <span>วิธีเชื่อมต่อ LINE & โค้ดสคริปต์</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main LINE Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Connection Settings, Schedule Trigger Rules & Group Targets */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Connection & API Credentials */}
          <div className="pastel-card p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg shrink-0">
                  <i className="fa-solid fa-plug-circle-check"></i>
                </span>
                <div>
                  <h3 className="font-bold text-base text-gray-800">
                    1. ตั้งค่าการเชื่อมต่อ LINE Official Account (Messaging API)
                  </h3>
                  <p className="text-xs text-gray-500">
                    รองรับทั้งการส่งตรงจากเซิร์ฟเวอร์หลังบ้าน และผ่าน Google Apps Script Cloud Trigger (ทำงานอัตโนมัติแม้ปิดหน้าเว็บ)
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsGroupHelperOpen(!isGroupHelperOpen)}
                  className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 text-xs font-bold"
                >
                  <i className="fa-brands fa-line mr-1"></i> วิธีดึงรหัส Group LINE (/id)
                </button>
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold"
                >
                  <i className="fa-solid fa-circle-question mr-1"></i> ดูขั้นตอนทำทีละขั้น
                </button>
              </div>
            </div>

            {isGroupHelperOpen && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-emerald-900">
                    <i className="fa-solid fa-wand-magic-sparkles text-emerald-600 mr-1.5"></i>
                    วิธีดึงข้อมูลรหัส Group LINE (Group ID) อัตโนมัติผ่านบอท
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsGroupHelperOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-gray-700 leading-relaxed">
                  <li>นำ <strong>Google Apps Script Web App URL</strong> ไปวางในช่อง <strong>Webhook URL</strong> บน LINE Developers Console แล้วเปิด <strong>Use webhook</strong></li>
                  <li>เชิญบอทเข้ากลุ่ม LINE ครู หรือกลุ่ม LINE นักเรียนชั้น ป.1 – ม.3</li>
                  <li>พิมพ์คำว่า <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-300 font-mono font-bold text-emerald-800">/id</code> หรือ <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-300 font-mono font-bold text-emerald-800">รหัสกลุ่ม</code> ในห้องแชท บอทจะตอบกลับรหัสกลุ่ม (เช่น <code className="font-mono">C1234567890abcdef...</code>) ทันที</li>
                </ol>
                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGuideOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-code"></i> เปิดดูและคัดลอกโค้ด Google Apps Script
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Google Apps Script Web App URL (ตัวกลางส่งข้อความ & ตั้งเวลาแจ้งเตือนบนคลาวด์แม้ปิดหน้าเว็บ)
                </label>
                <input
                  type="text"
                  value={cfg.bridgeUrl}
                  onChange={e => setCfg({ ...cfg, bridgeUrl: e.target.value })}
                  placeholder="https://script.google.com/macros/s/xxxxxxxxxxxxxxxx/exec"
                  className="w-full px-3.5 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-xs font-mono"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  *ระบบรองรับการส่งแจ้งเตือนเบื้องหลังผ่านเซิร์ฟเวอร์โดยตรงเมื่อกรอก Channel Access Token และหากใส่ URL ของ Google Apps Script ระบบจะซิงค์ตารางเรียนขึ้น Google Cloud เพื่อให้ส่งแจ้งเตือนได้ตลอด 24 ชม.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">LINE Channel Access Token (Long-lived)</label>
                  <input
                    type="password"
                    value={cfg.channelAccessToken}
                    onChange={e => setCfg({ ...cfg, channelAccessToken: e.target.value })}
                    placeholder="วาง Channel Access Token จาก LINE Developers"
                    className="w-full px-3.5 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <label className="block font-bold text-gray-700">LINE Group ID / User ID (กลุ่มรวมครูผู้สอน & สำรอง)</label>
                    {(() => {
                      const v = validateLineTargetId(cfg.teacherGroupId);
                      if (v.type === 'EMPTY') return <span className="text-[10px] text-amber-600 font-bold">ยังไม่ระบุ</span>;
                      if (v.valid) return <span className="text-[10px] text-emerald-700 font-bold">✓ รหัส {v.type} ถูกต้อง</span>;
                      return <span className="text-[10px] text-rose-600 font-bold">⚠ รหัสผิดรูปแบบ</span>;
                    })()}
                  </div>
                  <input
                    type="text"
                    value={cfg.teacherGroupId}
                    onChange={e => setCfg({ ...cfg, teacherGroupId: e.target.value })}
                    placeholder="เช่น C1234567890abcdef... หรือ U1234..."
                    className="w-full px-3.5 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Student Class Group IDs (Grid for ป.1 - ม.3) */}
              <div className="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="font-bold text-teal-900 flex items-center gap-1.5">
                    <i className="fa-solid fa-users-line text-teal-600"></i>
                    <span>ตั้งค่า LINE Group ID ประจำชั้นเรียนสำหรับนักเรียน (ป.1 - ม.3)</span>
                  </div>
                  <span className="text-[10px] text-teal-700 font-semibold">
                    เว้นว่างไว้หากต้องการให้ส่งเข้ากลุ่มหลักรวมกัน (หากรหัสชั้นใดขัดข้อง ระบบจะส่งสำรองเข้ากลุ่มหลักให้อัตโนมัติ)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {GRADES.map(g => {
                    const rawVal = (cfg.gradeGroupIds && cfg.gradeGroupIds[g]) || '';
                    const v = validateLineTargetId(rawVal);
                    return (
                      <div
                        key={g}
                        className={`flex items-center gap-1.5 bg-white p-2 rounded-xl border ${
                          !v.valid ? 'border-rose-400 bg-rose-50/40' : v.type !== 'EMPTY' ? 'border-emerald-300' : 'border-teal-200'
                        }`}
                      >
                        <span className="px-2 py-0.5 rounded-lg bg-teal-100 text-teal-800 font-bold text-xs shrink-0">
                          {g}
                        </span>
                        <input
                          type="text"
                          value={rawVal}
                          onChange={e =>
                            setCfg({
                              ...cfg,
                              gradeGroupIds: {
                                ...(cfg.gradeGroupIds || {}),
                                [g]: e.target.value
                              }
                            })
                          }
                          placeholder={`Group ID ชั้น ${g}`}
                          aria-label={`Group ID ชั้น ${g}`}
                          className="w-full text-[11px] font-mono focus:outline-none bg-transparent"
                        />
                        {v.type !== 'EMPTY' && (
                          <span
                            title={v.valid ? `รหัส ${v.type} ถูกต้อง` : v.reason}
                            className={`text-[10px] font-bold shrink-0 ${v.valid ? 'text-emerald-600' : 'text-rose-600'}`}
                          >
                            {v.valid ? '✓' : '⚠'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Teacher Individual LINE Target IDs (Collapsible Grid so admin can fix any teacher directly) */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <i className="fa-solid fa-chalkboard-user text-emerald-600"></i>
                    <span>ตั้งค่า LINE User ID / Group ID รายครูผู้สอน ({appData.teachers.length} ท่าน)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTeacherIdGridOpen(!isTeacherIdGridOpen)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold text-[11px] hover:bg-emerald-100 transition"
                  >
                    {isTeacherIdGridOpen ? 'ซ่อนรายชื่อครู' : `เปิดดู/แก้ไขรหัส LINE ครูรายบุคคล (${diagnosticReport.dedicatedTeacherIdCount} ท่านระบุแยก)`}
                  </button>
                </div>
                <p className="text-[10px] text-emerald-800">
                  *หากเว้นว่างไว้ ระบบจะส่งแจ้งเตือนของครูท่านนั้นเข้า <strong>กลุ่มรวมครูผู้สอน</strong> โดยอัตโนมัติ และหากใส่รหัสส่วนตัวไว้แต่ส่งไม่ผ่าน ระบบจะสลับไปส่งสำรองเข้ากลุ่มรวมครูให้ทันทีโดยไม่ตกหล่น
                </p>
                {isTeacherIdGridOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {appData.teachers.map(t => {
                      const rawVal = (cfg.teacherTargetIds && cfg.teacherTargetIds[t.id]) ?? t.lineTargetId ?? '';
                      const v = validateLineTargetId(rawVal);
                      return (
                        <div
                          key={t.id}
                          className={`p-2 rounded-xl bg-white border space-y-1 ${
                            !v.valid ? 'border-rose-400 bg-rose-50/40' : v.type !== 'EMPTY' ? 'border-emerald-300' : 'border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-[11px] text-gray-800 truncate">
                              {t.prefix}{t.fullName}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                !v.valid
                                  ? 'bg-rose-100 text-rose-700'
                                  : v.type !== 'EMPTY'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {!v.valid ? 'รหัสผิดรูปแบบ' : v.type !== 'EMPTY' ? `แยกเฉพาะ (${v.type})` : 'ส่งเข้ากลุ่มรวมครู'}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={rawVal}
                            onChange={e =>
                              setCfg({
                                ...cfg,
                                teacherTargetIds: {
                                  ...(cfg.teacherTargetIds || {}),
                                  [t.id]: e.target.value
                                }
                              })
                            }
                            placeholder="เว้นว่าง = ส่งเข้ากลุ่มรวมครู หรือใส่ U... / C..."
                            aria-label={`LINE ID ของ ${t.prefix}${t.fullName}`}
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-emerald-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Automatic Trigger & Recipient Conditions */}
          <div className="pastel-card p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2.5 border-b border-pink-100 pb-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center text-lg shrink-0">
                  <i className="fa-solid fa-bell-concierge"></i>
                </span>
                <div>
                  <h3 className="font-bold text-base text-gray-800">
                    2. ตั้งค่าเงื่อนไขการแจ้งเตือนเข้าคาบเรียน (ทำงานอัตโนมัติแม้ปิดหน้าเว็บ)
                  </h3>
                  <p className="text-xs text-gray-500">
                    กำหนดเวลาแจ้งเตือนล่วงหน้า รูปแบบผู้รับ และข้อความแจ้งเตือน
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-pink-50/60 border border-pink-100 space-y-2">
                <label className="block font-bold text-gray-800">
                  จังหวะเวลาส่งแจ้งเตือนก่อนเข้าคาบเรียน
                </label>
                <select
                  value={String(cfg.leadMinutes ?? 5)}
                  onChange={e => {
                    const nextLead = parseInt(e.target.value, 10) || 0;
                    const next = { ...cfg, leadMinutes: nextLead };
                    setCfg(next);
                    void handleSyncCloudSchedule(next, false);
                  }}
                  aria-label="จังหวะเวลาส่งแจ้งเตือนก่อนเข้าคาบเรียน"
                  className="w-full px-3 py-2 rounded-xl border border-pink-200 bg-white font-bold text-gray-700"
                >
                  <option value="0">แจ้งเตือนตรงเวลาเริ่มคาบเรียนพอดี (0 นาที)</option>
                  <option value="5">แจ้งเตือนล่วงหน้า 5 นาที ก่อนเริ่มคาบ</option>
                  <option value="10">แจ้งเตือนล่วงหน้า 10 นาที ก่อนเริ่มคาบ</option>
                  <option value="15">แจ้งเตือนล่วงหน้า 15 นาที ก่อนเริ่มคาบ</option>
                  <option value="30">แจ้งเตือนล่วงหน้า 30 นาที ก่อนเริ่มคาบ</option>
                </select>

                <label className="flex items-center gap-2 pt-1 cursor-pointer font-bold text-emerald-800">
                  <input
                    type="checkbox"
                    checked={cfg.backgroundServerEnabled !== false}
                    onChange={e => {
                      const next = { ...cfg, backgroundServerEnabled: e.target.checked };
                      setCfg(next);
                      void handleSyncCloudSchedule(next, false);
                    }}
                    className="rounded text-emerald-600 w-4 h-4"
                  />
                  <span>ส่งแจ้งเตือนอัตโนมัติแม้ไม่ได้เปิดหน้าเว็บไว้</span>
                </label>
              </div>

              <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-1.5">
                <label className="block font-bold text-gray-800">รูปแบบการส่งแจ้งเตือนอัตโนมัติ</label>
                <div className="space-y-1 pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={cfg.notifyTeachers !== false}
                      onChange={e => {
                        const next = { ...cfg, notifyTeachers: e.target.checked };
                        setCfg(next);
                        void handleSyncCloudSchedule(next, false);
                      }}
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>แจ้งเตือนครูผู้สอน (กลุ่มครู / LINE ส่วนตัวครู)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={cfg.notifyStudents !== false}
                      onChange={e => {
                        const next = { ...cfg, notifyStudents: e.target.checked };
                        setCfg(next);
                        void handleSyncCloudSchedule(next, false);
                      }}
                      className="rounded text-pink-600 w-4 h-4"
                    />
                    <span>แจ้งเตือนนักเรียนแต่ละชั้นเรียน (ป.1 - ม.3)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={cfg.notifyLunch !== false}
                      onChange={e => {
                        const next = { ...cfg, notifyLunch: e.target.checked };
                        setCfg(next);
                        void handleSyncCloudSchedule(next, false);
                      }}
                      className="rounded text-amber-600 w-4 h-4"
                    />
                    <span>แจ้งเตือนเมื่อถึงเวลาพักกลางวัน</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-teal-800">
                    <input
                      type="checkbox"
                      checked={cfg.notifyFreePeriods !== false}
                      onChange={e => {
                        const next = { ...cfg, notifyFreePeriods: e.target.checked };
                        setCfg(next);
                        void handleSyncCloudSchedule(next, false);
                      }}
                      className="rounded text-teal-600 w-4 h-4"
                    />
                    <span>แจ้งเตือนคาบว่างด้วย (ครบทุกชั้น ป.1-ม.3 ไม่ข้ามคาบว่าง)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Message Templates */}
            <div className="space-y-3 text-xs pt-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-bold text-gray-700">
                  ตัวแปรที่ใช้ในข้อความได้ (คลิกเพื่อแทรกในช่องที่เลือก):
                </span>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => handleInsertVariable(v.key)}
                      title={`แทรก ${v.desc}`}
                      className="px-2 py-0.5 rounded bg-gray-100 hover:bg-pink-100 text-gray-700 hover:text-pink-800 text-[11px] font-mono border border-gray-200 transition"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-emerald-800 mb-1">
                    <i className="fa-solid fa-chalkboard-user mr-1"></i>
                    แพทเทิร์นแจ้งเตือนครูผู้สอน
                  </label>
                  <textarea
                    ref={teacherTextareaRef}
                    rows={5}
                    value={cfg.teacherTemplate}
                    onFocus={() => setLastFocusedField('teacher')}
                    onChange={e => setCfg({ ...cfg, teacherTemplate: e.target.value })}
                    className="w-full p-3 rounded-xl border border-emerald-200 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-pink-800 mb-1">
                    <i className="fa-solid fa-user-graduate mr-1"></i>
                    แพทเทิร์นแจ้งเตือนนักเรียน (รายชั้น)
                  </label>
                  <textarea
                    ref={studentTextareaRef}
                    rows={5}
                    value={cfg.studentTemplate}
                    onFocus={() => setLastFocusedField('student')}
                    onChange={e => setCfg({ ...cfg, studentTemplate: e.target.value })}
                    className="w-full p-3 rounded-xl border border-pink-200 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-pink-100">
              <div className="text-[11px] text-gray-500">
                {cfg.lastCloudSyncedAt ? (
                  <span>
                    <i className="fa-solid fa-circle-check text-emerald-600 mr-1"></i>
                    ซิงค์ตารางแจ้งเตือนเบื้องหลังล่าสุด: {new Date(cfg.lastCloudSyncedAt).toLocaleTimeString('th-TH')} น.
                  </span>
                ) : (
                  <span>
                    <i className="fa-solid fa-bolt text-emerald-600 mr-1"></i>
                    ระบบตั้งเวลาแจ้งเตือนหลังบ้านพร้อมทำงานอัตโนมัติ
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaultTemplates}
                  className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xs"
                >
                  คืนค่าข้อความเริ่มต้น
                </button>
                <button
                  type="button"
                  disabled={isSyncingCloud}
                  onClick={() => handleSyncCloudSchedule(cfg, true)}
                  className="btn-pastel px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  <span>บันทึก & ซิงค์แจ้งเตือนแม้ปิดหน้าเว็บ</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Live LINE Chat Preview & Manual Test Dispatcher */}
        <div className="lg:col-span-5 space-y-6">
          {/* LINE Chat Mockup & Instant Test Card */}
          <div className="pastel-card p-5 space-y-4 border-2 border-emerald-200">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <i className="fa-brands fa-line text-2xl text-[#06C755]"></i>
                <div>
                  <h3 className="font-bold text-sm text-gray-800">
                    ตัวอย่างข้อความแจ้งเตือน & ทดสอบส่งจริง
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    เลือกวัน คาบเรียน และผู้รับเพื่อดูตัวอย่างและกดส่งเข้า LINE ทันที
                  </p>
                </div>
              </div>
            </div>

            {/* Selectors for Preview & Test */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block font-bold text-gray-600 mb-1">เลือกวัน</label>
                <select
                  value={previewDay}
                  onChange={e => setPreviewDay(e.target.value)}
                  aria-label="เลือกวันตัวอย่าง LINE"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-white font-bold"
                >
                  {DAYS.map(d => (
                    <option key={d.key} value={d.key}>วัน{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-gray-600 mb-1">เลือกคาบเรียน</label>
                <select
                  value={previewPeriodId}
                  onChange={e => setPreviewPeriodId(e.target.value)}
                  aria-label="เลือกคาบเรียนตัวอย่าง LINE"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-white font-bold"
                >
                  {appData.periods.map(p => (
                    <option key={p.id} value={p.id}>{p.label} ({p.start}-{p.end})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block font-bold text-gray-600 mb-1">มุมมองผู้รับ</label>
                <select
                  value={previewMode}
                  onChange={e => {
                    const mode = e.target.value as 'SUMMARY' | 'TEACHER' | 'STUDENT';
                    setPreviewMode(mode);
                    if (mode === 'TEACHER') setPreviewSubTarget(appData.teachers[0]?.id || 'T01');
                    else if (mode === 'STUDENT') setPreviewSubTarget('ป.1');
                  }}
                  aria-label="มุมมองผู้รับ LINE"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-white font-bold"
                >
                  <option value="SUMMARY">สรุปรวมทุกชั้น (ป.1-ม.3)</option>
                  <option value="TEACHER">แจ้งเตือนรายครูผู้สอน</option>
                  <option value="STUDENT">แจ้งเตือนนักเรียนรายชั้น</option>
                </select>
              </div>
            </div>

            {previewMode !== 'SUMMARY' && (
              <div className="text-xs">
                <label className="block font-bold text-gray-600 mb-1">
                  {previewMode === 'TEACHER'
                    ? 'เลือกครูผู้สอนที่ต้องการดูตัวอย่าง / ทดสอบส่ง:'
                    : 'เลือกชั้นเรียนของนักเรียนที่ต้องการดูตัวอย่าง / ทดสอบส่ง:'}
                </label>
                <select
                  value={previewSubTarget}
                  onChange={e => setPreviewSubTarget(e.target.value)}
                  aria-label="เลือกเป้าหมาย LINE"
                  className="w-full px-3 py-1.5 rounded-xl border border-emerald-200 bg-white font-bold"
                >
                  {previewMode === 'TEACHER' ? (
                    appData.teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.prefix}{t.fullName} ({t.dept || t.position})
                      </option>
                    ))
                  ) : (
                    GRADES.map(g => (
                      <option key={g} value={g}>ชั้น{GRADE_FULL_NAMES[g]} ({g})</option>
                    ))
                  )}
                </select>
              </div>
            )}

            {/* Authentic LINE Chat Room UI Mockup */}
            <div className="rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner bg-[#8CABD9]">
              {/* LINE Top Bar */}
              <div className="bg-[#2A364B] text-white px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <i className="fa-solid fa-chevron-left text-gray-300"></i>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#06C755] shrink-0"></span>
                  <span className="font-bold truncate">{mockRoomTitle}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-300 shrink-0">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <i className="fa-solid fa-bars"></i>
                </div>
              </div>

              {/* LINE Message Area */}
              <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
                <div className="text-center">
                  <span className="px-3 py-0.5 rounded-full bg-black/20 text-white text-[10px]">
                    วันนี้
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-white p-1 shadow flex items-center justify-center shrink-0">
                    <img
                      src={appData.schoolInfo.logoUrl || 'https://i.postimg.cc/8P6Y6MxB/baebs-him-t-dph-n.png'}
                      alt="Bot"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="space-y-1 max-w-[85%]">
                    <div className="text-[11px] font-bold text-slate-800">
                      ระบบแจ้งเตือนตารางเรียนอัตโนมัติ
                    </div>
                    <div className="bg-white text-gray-800 p-3 rounded-2xl rounded-tl-xs shadow-sm text-xs whitespace-pre-line leading-relaxed font-sans">
                      {previewText}
                    </div>
                    <div className="text-[10px] text-slate-700 text-right font-semibold">
                      {previewPeriodObj ? `${previewPeriodObj.start} น.` : '08:30 น.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Send Test Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isSending}
                onClick={handleSendSinglePreview}
                className="btn-pastel py-2.5 px-4 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <i className="fa-brands fa-line text-base"></i>
                <span>ส่งข้อความตัวอย่างนี้เข้า LINE ทันที</span>
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={() => triggerFullPeriodLineBroadcast(previewDay, previewPeriodId, true)}
                className="btn-pastel py-2.5 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <i className="fa-solid fa-paper-plane"></i>
                <span>ส่งแจ้งเตือนทั้งครู & นักเรียนในคาบนี้</span>
              </button>
            </div>
          </div>

          {/* Diagnostic & Readiness Health Check Card */}
          <div className="pastel-card p-5 space-y-3 border-2 border-teal-200 bg-gradient-to-br from-white to-teal-50/40">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 pb-2.5">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-stethoscope text-teal-600 text-base"></i>
                <div>
                  <h3 className="font-bold text-sm text-gray-800">
                    ตรวจสอบความพร้อม & ป้องกันการแจ้งเตือนตกหล่น
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    มีระบบหน่วงเวลา 300ms ต่อข้อความ + ส่งซ้ำอัตโนมัติ + ส่งสำรองเข้ากลุ่มหลักเมื่อ ID ย่อยขัดข้อง
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiagnosticOpen(!isDiagnosticOpen)}
                className="text-[11px] font-bold text-teal-700 hover:underline"
              >
                {isDiagnosticOpen ? 'ย่อรายละเอียด' : 'ดูผลการตรวจสอบ'}
              </button>
            </div>

            {isDiagnosticOpen && (
              <div className="space-y-2.5 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-white border border-teal-200">
                    <div className="text-[10px] text-gray-500 font-semibold">ผู้รับในคาบที่เลือก ({previewPeriodObj?.label})</div>
                    <div className="text-sm font-extrabold text-teal-800 mt-0.5">
                      {previewPayloads.length} รายการ
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-teal-200">
                    <div className="text-[10px] text-gray-500 font-semibold">กลุ่มชั้นเรียนที่แยก ID</div>
                    <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                      {diagnosticReport.dedicatedClassGroupCount} / {GRADES.length} ชั้น
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-teal-200 col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-gray-500 font-semibold">ล็อกการส่งของวันนี้</div>
                    <div className="text-sm font-extrabold text-purple-800 mt-0.5">
                      บันทึกแล้ว {sentTodayCount} รายการ
                    </div>
                  </div>
                </div>

                {diagnosticReport.issues.length > 0 ? (
                  <div className="space-y-1.5">
                    {diagnosticReport.issues.map((iss, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${
                          iss.level === 'error'
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <i
                          className={`fa-solid ${
                            iss.level === 'error' ? 'fa-circle-exclamation text-rose-600' : 'fa-triangle-exclamation text-amber-600'
                          } mt-0.5`}
                        ></i>
                        <div>
                          <div className="font-bold">{iss.title}</div>
                          <div className="text-[10px] opacity-90">{iss.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-2">
                    <i className="fa-solid fa-circle-check text-emerald-600"></i>
                    <span>รหัส Token, กลุ่มรวมครู และรหัสกลุ่มทุกชั้นอยู่ในรูปแบบที่ถูกต้อง พร้อมส่งแจ้งเตือนครบทุกคน</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-gray-500">
                    *หากเพิ่งแก้ไข Group ID / User ID แล้วต้องการให้ระบบอัตโนมัติส่งแจ้งเตือนของวันนี้ใหม่อีกครั้ง กดปุ่มปลดล็อกด้านขวา:
                  </span>
                  <button
                    type="button"
                    disabled={isResettingHistory}
                    onClick={handleResetTodayHistory}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs disabled:opacity-60"
                  >
                    <i className="fa-solid fa-rotate-right"></i>
                    <span>ปลดล็อกประวัติการส่งของวันนี้ (ส่งซ้ำใหม่ได้)</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notification Dispatch History Log */}
          <div className="pastel-card p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-pink-100 pb-2.5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-purple-500"></i>
                <h3 className="font-bold text-sm text-gray-800">
                  ประวัติการส่งแจ้งเตือน LINE (Notification Log)
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isResettingHistory}
                  onClick={handleResetTodayHistory}
                  className="text-[11px] font-bold text-amber-700 hover:underline"
                >
                  รีเซ็ตล็อกวันนี้
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="text-[11px] font-bold text-rose-500 hover:underline"
                >
                  ล้างประวัติ
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[270px] overflow-y-auto text-xs pr-1">
              {(cfg.logs || []).length === 0 ? (
                <div className="p-4 rounded-xl bg-gray-50 text-center text-gray-400">
                  ยังไม่มีประวัติการส่งแจ้งเตือน กดปุ่มทดสอบด้านบนเพื่อทดลองส่งได้เลยค่ะ
                </div>
              ) : (
                (cfg.logs || []).map((item, i) => {
                  const firstLine = (item.message || '').split('\n').slice(0, 2).join(' • ');
                  return (
                    <div
                      key={i}
                      className={`p-2.5 rounded-xl border space-y-1 ${
                        item.status === 'ERROR'
                          ? 'bg-rose-50/70 border-rose-200'
                          : item.fallbackUsed
                            ? 'bg-amber-50/70 border-amber-200'
                            : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-800 truncate">
                          <i className="fa-brands fa-line text-[#06C755] mr-1"></i>
                          {item.recipient} ({item.period})
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.fallbackUsed && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              ส่งสำรองเข้ากลุ่มหลัก
                            </span>
                          )}
                          {item.status === 'SENT' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              ส่งเข้า LINE แล้ว
                            </span>
                          ) : item.status === 'SIMULATED' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                              จำลองการส่งสำเร็จ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                              ผิดพลาด
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 font-mono">{item.time}</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-600 truncate">{firstLine}</div>
                      {item.errorDetail && (
                        <div
                          className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${
                            item.status === 'ERROR'
                              ? 'bg-rose-100 text-rose-800'
                              : item.fallbackUsed
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-blue-50 text-blue-800'
                          }`}
                        >
                          <i className="fa-solid fa-circle-info mr-1"></i>
                          {item.errorDetail}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STEP-BY-STEP LINE CONNECTION GUIDE & GOOGLE APPS SCRIPT CODE MODAL */}
      {isGuideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-3xl w-full p-6 space-y-4 border-2 border-emerald-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#06C755] text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
                  <i className="fa-brands fa-line"></i>
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-800">
                    คู่มือการเชื่อมต่อ LINE แจ้งเตือนเข้าคาบเรียนอัตโนมัติ (ทำงานแม้ปิดหน้าเว็บ)
                  </h3>
                  <p className="text-xs text-gray-500">
                    รองรับทั้งระบบตั้งเวลาหลังบ้าน (Server Scheduler) และ Google Apps Script Cloud Trigger ตลอด 24 ชั่วโมง
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="w-8 h-8 rounded-full bg-emerald-50 text-gray-500 hover:bg-emerald-100 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-gray-700">
              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="font-extrabold text-sm text-emerald-900">
                  ขั้นตอนที่ 1: สร้างบอทแจ้งเตือนใน LINE Developers Console
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    เข้าไปที่เว็บไซต์{' '}
                    <span className="text-emerald-700 font-bold underline font-mono">
                      https://developers.line.biz/console/
                    </span>{' '}
                    แล้วล็อกอินด้วยบัญชี LINE ของโรงเรียนหรือแอดมิน
                  </li>
                  <li>
                    สร้าง <strong>Provider</strong> (เช่น ชื่อโรงเรียนดอนแก้วปากเป่งคุยสำโรง) และเลือกสร้าง Channel แบบ{' '}
                    <strong>&quot;Messaging API&quot;</strong>
                  </li>
                  <li>
                    ไปที่แท็บ <strong>Messaging API</strong> ของ Channel ที่สร้างขึ้น เลื่อนลงมาที่หัวข้อ{' '}
                    <strong>Channel access token (long-lived)</strong> แล้วกดปุ่ม <strong>Issue</strong> จากนั้นคัดลอกรหัส Token มาวางในช่อง{' '}
                    <em>LINE Channel Access Token</em> บนเว็บนี้
                  </li>
                  <li>
                    ในแท็บเดียวกัน ให้เปิดสวิตช์ <strong>Allow bot to join group chats</strong> เพื่อให้สามารถเชิญบอทเข้ากลุ่ม LINE ของครูและกลุ่ม LINE นักเรียน ป.1 - ม.3 ได้
                  </li>
                </ol>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold text-sm text-teal-900">
                    ขั้นตอนที่ 2: โค้ด Google Apps Script รุ่นอัปเกรด (แจ้งเตือนอัตโนมัติ 24 ชม. แม้ปิดหน้าเว็บ + ดูรหัสกลุ่ม /id)
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyGasCode}
                    className="btn-pastel px-3.5 py-1.5 rounded-xl bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-copy"></i> คัดลอกโค้ด Google Apps Script
                  </button>
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    ไปที่ <span className="text-teal-700 font-bold underline font-mono">https://script.google.com</span> กดปุ่ม{' '}
                    <strong>โครงการใหม่ (New Project)</strong>
                  </li>
                  <li>ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดด้านล่างนี้ลงไป:</li>
                </ol>
                <textarea
                  id="gasCodeTextarea"
                  readOnly
                  rows={10}
                  value={getGoogleAppsScriptBridgeCode()}
                  className="w-full p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] leading-snug"
                />
                <ol start={3} className="list-decimal list-inside space-y-1">
                  <li>
                    ในหน้า Google Apps Script ด้านบน ให้เลือกฟังก์ชัน <code>setupAutoTrigger</code> แล้วกดปุ่ม <strong>เรียกใช้ (Run)</strong> 1 ครั้งเพื่ออนุญาตสิทธิ์ตั้งเวลาอัตโนมัติทุก 1 นาทีบนคลาวด์ของ Google
                  </li>
                  <li>
                    กดปุ่ม <strong>การทำให้ใช้งานได้ (Deploy)</strong> มุมขวาบน &rarr; เลือก{' '}
                    <strong>การทำให้ใช้งานได้รายการใหม่ (New deployment)</strong> &rarr; เลือกประเภทเป็น <strong>เว็บแอป (Web app)</strong>, ช่อง <em>ดำเนินการในฐานะ (Execute as)</em> เลือก{' '}
                    <strong>&quot;ฉัน (Me)&quot;</strong> และช่อง <em>ผู้ที่มีสิทธิ์เข้าถึง (Who has access)</em> เลือกเป็น{' '}
                    <strong>&quot;ทุกคน (Anyone)&quot;</strong> จากนั้นกด Deploy
                  </li>
                  <li>
                    คัดลอก <strong>Web App URL</strong> ที่ลงท้ายด้วย <code>/exec</code> มาวางในช่อง{' '}
                    <em>Google Apps Script Web App URL</em> บนหน้าตั้งค่า LINE แล้วกดปุ่ม <strong>&quot;บันทึก & ซิงค์แจ้งเตือนแม้ปิดหน้าเว็บ&quot;</strong>
                  </li>
                </ol>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-1.5">
                <div className="font-extrabold text-sm text-purple-900">
                  ขั้นตอนที่ 3: วิธีดึงข้อมูลรหัส Group ID ของกลุ่มครูและกลุ่มนักเรียนแต่ละชั้นอย่างง่ายดาย
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    นำ <strong>Web App URL</strong> จากขั้นตอนที่ 2 ไปวางในช่อง <strong>Webhook URL</strong> ในหน้า LINE Developers (แท็บ Messaging API) แล้วเปิดสวิตช์{' '}
                    <strong>Use webhook</strong>
                  </li>
                  <li>แอดเพื่อนบอท แล้วเชิญบอทเข้ากลุ่ม LINE ครู หรือกลุ่ม LINE นักเรียนชั้น ป.1 - ม.3</li>
                  <li>
                    พิมพ์ข้อความว่า <code className="px-1.5 py-0.5 rounded bg-white border border-purple-200 font-mono font-bold">/id</code> หรือ{' '}
                    <code className="px-1.5 py-0.5 rounded bg-white border border-purple-200 font-mono font-bold">รหัสกลุ่ม</code> ในแชทส่วนตัวหรือในกลุ่ม LINE บอทจะตอบกลับพร้อมแจ้ง{' '}
                    <strong>Group ID (ขึ้นต้นด้วย C...)</strong> หรือ <strong>User ID (ขึ้นต้นด้วย U...)</strong> ให้ทราบทันที!
                  </li>
                  <li>
                    นำรหัส Group ID หรือ User ID ที่ได้มาใส่ในหน้าตั้งค่า LINE บนเว็บไซต์นี้ แล้วกดปุ่ม{' '}
                    <strong>&quot;บันทึก & ซิงค์แจ้งเตือนแม้ปิดหน้าเว็บ&quot;</strong> ระบบทั้งบนเซิร์ฟเวอร์และ Google Cloud จะแจ้งเตือนเข้า LINE ตามเวลาคาบเรียนให้อัตโนมัติแม้ไม่ได้เปิดหน้าเว็บทิ้งไว้ค่ะ
                  </li>
                </ol>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-emerald-100">
              <button
                type="button"
                onClick={handleCopyGasCode}
                className="btn-pastel px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <i className="fa-solid fa-copy"></i> คัดลอกโค้ด Apps Script
              </button>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="btn-pastel px-5 py-2 rounded-xl bg-pink-500 text-white font-bold text-xs"
              >
                เข้าใจแล้ว ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
