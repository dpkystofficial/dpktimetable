import React, { useState } from 'react';
import {
  DAYS,
  GRADES,
  GRADE_FULL_NAMES,
  type AppData,
  type TimetableChangeNotification
} from '../utils/timetableLogic';

interface StudentRealtimePortalProps {
  appData: AppData;
  selectedGrade: string;
  onSelectGrade: (grade: string) => void;
  wsConnected: boolean;
  lastCacheSource: string;
  lastLatencyMs: number;
  recentUpdatedSlotKey: string | null;
  onManualAjaxRefresh: () => void;
  unreadNotifications: TimetableChangeNotification[];
  onClearUnread: () => void;
}

export const StudentRealtimePortal: React.FC<StudentRealtimePortalProps> = ({
  appData,
  selectedGrade,
  onSelectGrade,
  wsConnected,
  lastCacheSource,
  lastLatencyMs,
  recentUpdatedSlotKey,
  onManualAjaxRefresh,
  unreadNotifications,
  onClearUnread
}) => {
  const [selectedDayMobile, setSelectedDayMobile] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const homeroomTeacher = appData.teachers.find(t => t.homeroom === selectedGrade);
  const gradeChangeLogs = (appData.changeLogs || []).filter(
    log => log.grade === selectedGrade || log.grade.includes('ทุกชั้น') || log.grade.includes(selectedGrade)
  );

  const getTeacherById = (id: string) => appData.teachers.find(t => t.id === id) || null;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Student Class Selector Banner */}
      <div className="pastel-card p-4 md:p-6 bg-gradient-to-r from-sky-50 via-pink-50 to-purple-50 border-2 border-sky-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 text-white flex flex-col items-center justify-center shadow-md shrink-0">
              <i className="fa-solid fa-user-graduate text-xl md:text-2xl"></i>
              <span className="text-[9px] font-extrabold tracking-wider">STUDENT</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  ตารางเรียนออนไลน์ (อัปเดตอัตโนมัติ)
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800">
                  ภาคเรียนที่ {appData.schoolInfo.semester}/{appData.schoolInfo.academicYear}
                </span>
              </div>
              <h2 className="text-base md:text-xl font-extrabold text-gray-800 mt-1">
                ตารางเรียนสำหรับนักเรียน ชั้น{GRADE_FULL_NAMES[selectedGrade]} ({selectedGrade})
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {homeroomTeacher
                  ? `ครูประจำชั้น: ${homeroomTeacher.prefix}${homeroomTeacher.fullName} • `
                  : ''}
                อัปเดตข้อมูลล่าสุดเวลา: {new Date(appData.lastUpdatedAt).toLocaleTimeString('th-TH')} น.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onManualAjaxRefresh}
              className="btn-pastel px-4 py-2.5 rounded-2xl bg-white hover:bg-sky-50 text-sky-700 border-2 border-sky-200 font-extrabold text-xs flex items-center gap-2"
            >
              <i className="fa-solid fa-arrows-rotate text-sky-500"></i>
              <span>รีเฟรชตารางเรียน</span>
            </button>
          </div>
        </div>

        {/* Grade Pill Selector (Scrollable on Mobile) */}
        <div className="mt-4 pt-3 border-t border-sky-200/60">
          <div className="text-xs font-extrabold text-gray-700 mb-2 flex flex-wrap items-center justify-between gap-1">
            <span><i className="fa-solid fa-layer-group text-pink-500 mr-1"></i>เลือกระดับชั้นเรียน (ป.1 - ม.3):</span>
            <span className="text-[11px] text-sky-700 font-semibold sm:hidden">ปัดซ้าย-ขวา</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {GRADES.map(g => {
              const active = g === selectedGrade;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => onSelectGrade(g)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold shrink-0 transition ${
                    active
                      ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-sm scale-105'
                      : 'bg-white text-gray-700 border border-pink-200 hover:bg-pink-50'
                  }`}
                >
                  ชั้น {g}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Real-Time Alert Banner when Timetable Changes Occur */}
      {unreadNotifications.length > 0 && (
        <div
          role="alert"
          className="pastel-card p-4 bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 border-2 border-rose-300 shadow-lg animate-bounce-short"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center text-lg shrink-0 shadow-sm">
                <i className="fa-solid fa-bell fa-shake"></i>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold">
                    แจ้งเตือนตารางเรียนเปลี่ยนแปลงทันที!
                  </span>
                  <span className="text-[11px] font-bold text-rose-700">
                    ({unreadNotifications.length} รายการใหม่)
                  </span>
                </div>
                <div className="text-xs md:text-sm font-extrabold text-gray-900 mt-1">
                  {unreadNotifications[0].summary}
                </div>
                <div className="text-[11px] text-gray-600">
                  ผู้แก้ไข: {unreadNotifications[0].actorName} • เวลา {new Date(unreadNotifications[0].timestamp).toLocaleTimeString('th-TH')} น.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearUnread}
              className="btn-pastel px-3.5 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs shrink-0 self-end sm:self-center"
            >
              <i className="fa-solid fa-check mr-1"></i> รับทราบการเปลี่ยนแปลง
            </button>
          </div>
        </div>
      )}

      {/* Mobile Day Filter & Search Bar */}
      <div className="pastel-card p-3.5 md:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedDayMobile('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 transition ${
              selectedDayMobile === 'ALL'
                ? 'bg-pink-500 text-white'
                : 'bg-pink-50 text-pink-700 border border-pink-200'
            }`}
          >
            แสดงทั้งสัปดาห์ (จ.-ศ.)
          </button>
          {DAYS.map(d => (
            <button
              key={d.key}
              type="button"
              onClick={() => setSelectedDayMobile(d.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 transition ${
                selectedDayMobile === d.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-700 border border-purple-200 hover:bg-purple-50'
              }`}
            >
              วัน{d.name}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-gray-400 text-xs"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ค้นหาวิชา, รหัสวิชา, ชื่อครู..."
            aria-label="ค้นหาวิชาในตารางเรียน"
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-pink-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
          />
        </div>
      </div>

      {/* Responsive Mobile Cards View (Shown on small screens or when a specific day is filtered) */}
      <div className={`${selectedDayMobile !== 'ALL' ? 'block' : 'block lg:hidden'} space-y-4`}>
        {DAYS.filter(d => selectedDayMobile === 'ALL' || d.key === selectedDayMobile).map(day => (
          <div key={day.key} className="pastel-card overflow-hidden border-2 border-pink-100">
            <div
              className="px-4 py-2.5 font-extrabold text-sm text-gray-800 flex items-center justify-between border-b border-pink-100"
              style={{ backgroundColor: day.color }}
            >
              <span><i className="fa-solid fa-calendar-day mr-1.5"></i>วัน{day.name}</span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/80 text-gray-700">
                ชั้น {selectedGrade}
              </span>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {appData.periods.map(period => {
                if (period.type === 'lunch') {
                  return (
                    <div
                      key={period.id}
                      className="sm:col-span-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center text-xs font-extrabold text-amber-800 flex items-center justify-center gap-2"
                    >
                      <i className="fa-solid fa-utensils"></i>
                      <span>{period.label} ({period.start} - {period.end} น.)</span>
                    </div>
                  );
                }

                const slotKey = `${selectedGrade}_${day.key}_${period.id}`;
                const entry = appData.schedule[slotKey];
                const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
                const teacher = sub ? getTeacherById(sub.teacherId) : null;

                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase();
                  const match = sub && (
                    sub.name.toLowerCase().includes(q) ||
                    sub.code.toLowerCase().includes(q) ||
                    (teacher && teacher.fullName.toLowerCase().includes(q))
                  );
                  if (!match) return null;
                }

                const isHighlighted = recentUpdatedSlotKey === slotKey;

                return (
                  <div
                    key={period.id}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      isHighlighted ? 'realtime-slot-flash ring-2 ring-pink-500' : ''
                    } ${sub ? 'border-black/10 shadow-xs' : 'bg-gray-50/70 border-dashed border-gray-200'}`}
                    style={{ backgroundColor: sub && teacher ? teacher.color : undefined }}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-white/90 text-gray-800 font-extrabold text-[10px]">
                          {period.label} ({period.start}-{period.end})
                        </span>
                        {sub && (
                          <span className="text-[11px] font-extrabold text-pink-900">{sub.code}</span>
                        )}
                      </div>
                      {sub ? (
                        <>
                          <div className="text-sm font-extrabold text-gray-900 truncate">{sub.name}</div>
                          <div className="text-[11px] font-semibold text-gray-700 flex items-center gap-2">
                            <span><i className="fa-solid fa-chalkboard-user mr-1"></i>{teacher ? `${teacher.prefix}${teacher.fullName}` : '-'}</span>
                            {entry?.roomNote && (
                              <span className="px-1.5 py-0.5 rounded bg-white/80 text-[10px] font-bold">
                                ห้อง: {entry.roomNote}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400 font-semibold pt-1">คาบเรียนว่าง / ทบทวนบทเรียน</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Full Desktop Weekly Table View (Shown on lg+ when ALL days selected) */}
      {selectedDayMobile === 'ALL' && (
        <div className="hidden lg:block pastel-card p-5 space-y-4 overflow-x-auto">
          <div className="flex items-center justify-between border-b border-pink-100 pb-3">
            <div className="flex items-center gap-3">
              <span className="px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-extrabold text-sm">
                ตารางเรียนชั้น {selectedGrade}
              </span>
              <div>
                <h3 className="font-bold text-base text-gray-800">
                  ตารางเรียนประจำสัปดาห์ ชั้น{GRADE_FULL_NAMES[selectedGrade]} (อัปเดตอัตโนมัติแบบเรียลไทม์)
                </h3>
                <p className="text-xs text-gray-500">
                  เมื่อฝ่ายวิชาการหรือครูผู้สอนแก้ไขคาบเรียน ข้อมูลในตารางนี้จะเปลี่ยนทันทีโดยไม่ต้องกดรีเฟรชหน้าเว็บ
                </p>
              </div>
            </div>
          </div>

          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-sky-100/70 text-gray-800 text-xs">
                <th className="p-3 border border-sky-200 rounded-tl-xl w-28">วัน / เวลา</th>
                {appData.periods.map(p => (
                  <th key={p.id} className="p-2.5 border border-sky-200 text-center">
                    <div className="font-extrabold text-gray-800">{p.label}</div>
                    <div className="text-[11px] font-semibold text-gray-500">{p.start} - {p.end}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day => (
                <tr key={day.key}>
                  <td
                    className="p-3 border border-sky-200 font-extrabold text-sm text-center"
                    style={{ backgroundColor: day.color }}
                  >
                    {day.name}
                  </td>
                  {appData.periods.map(period => {
                    if (period.type === 'lunch') {
                      return (
                        <td
                          key={period.id}
                          className="p-2 border border-sky-200 bg-amber-50/80 text-center align-middle"
                        >
                          <div className="text-xs font-extrabold text-amber-800">
                            <i className="fa-solid fa-utensils mr-1"></i>พักกลางวัน
                          </div>
                        </td>
                      );
                    }

                    const slotKey = `${selectedGrade}_${day.key}_${period.id}`;
                    const entry = appData.schedule[slotKey];
                    const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
                    const teacher = sub ? getTeacherById(sub.teacherId) : null;

                    const isSearchDimmed = searchQuery.trim() !== '' && sub && !(
                      sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      sub.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (teacher && teacher.fullName.toLowerCase().includes(searchQuery.toLowerCase()))
                    );

                    const isHighlighted = recentUpdatedSlotKey === slotKey;

                    return (
                      <td
                        key={period.id}
                        className={`slot-cell p-2 border border-sky-200 align-top transition ${
                          isSearchDimmed ? 'opacity-25' : ''
                        }`}
                      >
                        {sub ? (
                          <div
                            className={`h-full p-2.5 rounded-xl border border-black/10 shadow-xs flex flex-col justify-between ${
                              isHighlighted ? 'realtime-slot-flash ring-2 ring-pink-500' : ''
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
                            <div className="mt-2 pt-1 border-t border-black/10 text-[10px] text-gray-800 font-semibold flex items-center justify-between">
                              <span className="truncate">
                                <i className="fa-solid fa-user mr-1"></i>
                                {teacher ? teacher.fullName.split(' ')[0] : '-'}
                              </span>
                              {entry?.roomNote && (
                                <span className="px-1 rounded bg-white/80 font-bold">{entry.roomNote}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full min-h-[70px] rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-[11px] text-gray-300">
                            ว่าง
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Real-Time Timetable Change Notification History Feed for Students */}
      <div className="pastel-card p-4 md:p-5 space-y-3 border-2 border-pink-100">
        <div className="flex items-center justify-between border-b border-pink-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <i className="fa-solid fa-bell"></i>
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-gray-800">
                บันทึกการแจ้งเตือนเมื่อมีการเปลี่ยนแปลงตารางเรียน (Real-Time Change Feed)
              </h3>
              <p className="text-[11px] text-gray-500">
                แจ้งเตือนนักเรียนทันทีเมื่อครูหรือฝ่ายวิชาการปรับเปลี่ยนวิชา เวลาเรียน หรือห้องเรียน
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-pink-100 text-pink-700 font-extrabold text-xs">
            {gradeChangeLogs.length} รายการล่าสุด
          </span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {gradeChangeLogs.length === 0 ? (
            <div className="p-4 rounded-xl bg-gray-50 text-center text-xs text-gray-400 font-semibold">
              ยังไม่มีประวัติการเปลี่ยนแปลงตารางเรียนสำหรับชั้น {selectedGrade}
            </div>
          ) : (
            gradeChangeLogs.map(log => (
              <div
                key={log.id}
                className="p-3 rounded-2xl bg-gradient-to-r from-pink-50/60 via-white to-sky-50/60 border border-pink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <span className="px-2 py-0.5 rounded-lg bg-pink-500 text-white font-extrabold text-[10px] shrink-0 mt-0.5">
                    {log.grade}
                  </span>
                  <div>
                    <div className="font-extrabold text-gray-800">{log.summary}</div>
                    <div className="text-[11px] text-gray-500">
                      โดย: {log.actorName}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-gray-500 shrink-0 self-end sm:self-center">
                  <i className="fa-regular fa-clock mr-1"></i>
                  {new Date(log.timestamp).toLocaleTimeString('th-TH')} น.
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
