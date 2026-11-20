import React, { useState, useEffect } from 'react';
import {
  GRADES,
  GRADE_FULL_NAMES,
  PASTEL_PALETTE,
  type AppData,
  type SchoolInfo,
  type Teacher,
  type Subject,
  type PeriodSlot
} from '../utils/timetableLogic';

interface SettingsSectionProps {
  appData: AppData;
  onSyncMasterData: (
    partial: {
      schoolInfo?: SchoolInfo;
      teachers?: Teacher[];
      subjects?: Subject[];
      periods?: PeriodSlot[];
    },
    summaryText: string
  ) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  appData,
  onSyncMasterData,
  onShowToast
}) => {
  const [subTab, setSubTab] = useState<'school' | 'teachers' | 'subjects' | 'timeslots'>('school');
  const [schoolForm, setSchoolForm] = useState<SchoolInfo>(appData.schoolInfo);
  const [periodsForm, setPeriodsForm] = useState<PeriodSlot[]>(appData.periods);
  const [filterSubjectGrade, setFilterSubjectGrade] = useState<string>('ALL');

  // Teacher Modal State
  const [teacherModalOpen, setTeacherModalOpen] = useState<boolean>(false);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [tPrefix, setTPrefix] = useState('นางสาว');
  const [tFullName, setTFullName] = useState('');
  const [tPosition, setTPosition] = useState('ครูชำนาญการ');
  const [tHomeroom, setTHomeroom] = useState('-');
  const [tDept, setTDept] = useState('');
  const [tLineId, setTLineId] = useState('');
  const [tColor, setTColor] = useState(PASTEL_PALETTE[0].bg);

  // Subject Modal State
  const [subjectModalOpen, setSubjectModalOpen] = useState<boolean>(false);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [sGrade, setSGrade] = useState('ป.1');
  const [sCode, setSCode] = useState('');
  const [sName, setSName] = useState('');
  const [sCategory, setSCategory] = useState('วิชาพื้นฐาน');
  const [sHours, setSHours] = useState(2);
  const [sTeacherId, setSTeacherId] = useState(appData.teachers[0]?.id || 'T01');
  const [sAllowCombined, setSAllowCombined] = useState(false);
  const [sCoreMorning, setSCoreMorning] = useState(true);

  // Custom Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    setSchoolForm(appData.schoolInfo);
    setPeriodsForm(appData.periods);
  }, [appData.schoolInfo, appData.periods]);

  const getTeacherTeachingHours = (teacherId: string) => {
    const seen = new Set<string>();
    Object.entries(appData.schedule).forEach(([slotKey, item]) => {
      const sub = appData.subjects.find(s => s.id === item.subjectId);
      if (sub && sub.teacherId === teacherId) {
        const [, dayKey, periodId] = slotKey.split('_');
        seen.add(`${dayKey}_${periodId}`);
      }
    });
    return seen.size;
  };

  const openTeacherModal = (teacher?: Teacher) => {
    if (teacher) {
      setEditTeacher(teacher);
      setTPrefix(teacher.prefix);
      setTFullName(teacher.fullName);
      setTPosition(teacher.position);
      setTHomeroom(teacher.homeroom || '-');
      setTDept(teacher.dept || '');
      setTLineId(teacher.lineTargetId || '');
      setTColor(teacher.color || PASTEL_PALETTE[0].bg);
    } else {
      setEditTeacher(null);
      setTPrefix('นางสาว');
      setTFullName('');
      setTPosition('ครูชำนาญการ');
      setTHomeroom('-');
      setTDept('');
      setTLineId('');
      setTColor(PASTEL_PALETTE[appData.teachers.length % PASTEL_PALETTE.length].bg);
    }
    setTeacherModalOpen(true);
  };

  const handleSaveTeacher = () => {
    if (!tFullName.trim()) {
      onShowToast('กรุณากรอกชื่อ-นามสกุลครูผู้สอน', 'warning');
      return;
    }
    let nextTeachers: Teacher[];
    if (editTeacher) {
      nextTeachers = appData.teachers.map(t =>
        t.id === editTeacher.id
          ? {
              ...t,
              prefix: tPrefix.trim() || 'ครู',
              fullName: tFullName.trim(),
              position: tPosition.trim() || 'ครู',
              homeroom: tHomeroom,
              dept: tDept.trim(),
              lineTargetId: tLineId.trim(),
              color: tColor
            }
          : t
      );
    } else {
      const nextNum = appData.teachers.length + 1;
      const newTeacher: Teacher = {
        id: 'T' + String(nextNum).padStart(2, '0'),
        prefix: tPrefix.trim() || 'ครู',
        fullName: tFullName.trim(),
        position: tPosition.trim() || 'ครู',
        homeroom: tHomeroom,
        dept: tDept.trim(),
        lineTargetId: tLineId.trim(),
        color: tColor
      };
      nextTeachers = [...appData.teachers, newTeacher];
    }
    onSyncMasterData({ teachers: nextTeachers }, `อัปเดตข้อมูลครูผู้สอน (${tPrefix}${tFullName.trim()})`);
    setTeacherModalOpen(false);
  };

  const handleDeleteTeacher = (teacher: Teacher) => {
    setConfirmState({
      open: true,
      title: 'ยืนยันการลบข้อมูลครู',
      message: `ต้องการลบข้อมูลของ "${teacher.prefix}${teacher.fullName}" หรือไม่?`,
      onConfirm: () => {
        const nextTeachers = appData.teachers.filter(t => t.id !== teacher.id);
        onSyncMasterData({ teachers: nextTeachers }, `ลบข้อมูลครูผู้สอน ${teacher.prefix}${teacher.fullName}`);
        setConfirmState(prev => ({ ...prev, open: false }));
      }
    });
  };

  const openSubjectModal = (sub?: Subject) => {
    if (sub) {
      setEditSubject(sub);
      setSGrade(sub.grade);
      setSCode(sub.code);
      setSName(sub.name);
      setSCategory(sub.category);
      setSHours(sub.hours);
      setSTeacherId(sub.teacherId);
      setSAllowCombined(sub.allowCombined);
      setSCoreMorning(sub.coreMorning);
    } else {
      setEditSubject(null);
      setSGrade(filterSubjectGrade !== 'ALL' ? filterSubjectGrade : 'ป.1');
      setSCode('');
      setSName('');
      setSCategory('วิชาพื้นฐาน');
      setSHours(2);
      setSTeacherId(appData.teachers[0]?.id || 'T01');
      setSAllowCombined(false);
      setSCoreMorning(true);
    }
    setSubjectModalOpen(true);
  };

  const handleSaveSubject = () => {
    if (!sName.trim()) {
      onShowToast('กรุณากรอกชื่อรายวิชาหรือกิจกรรม', 'warning');
      return;
    }
    let nextSubjects: Subject[];
    if (editSubject) {
      nextSubjects = appData.subjects.map(s =>
        s.id === editSubject.id
          ? {
              ...s,
              grade: sGrade,
              code: sCode.trim() || 'รหัสวิชา',
              name: sName.trim(),
              category: sCategory,
              hours: sHours,
              teacherId: sTeacherId,
              allowCombined: sAllowCombined,
              coreMorning: sCoreMorning
            }
          : s
      );
    } else {
      const newSub: Subject = {
        id: 'SUB' + Date.now().toString().slice(-5),
        grade: sGrade,
        code: sCode.trim() || 'รหัสวิชา',
        name: sName.trim(),
        category: sCategory,
        hours: sHours,
        teacherId: sTeacherId,
        allowCombined: sAllowCombined,
        coreMorning: sCoreMorning
      };
      nextSubjects = [...appData.subjects, newSub];
    }
    onSyncMasterData({ subjects: nextSubjects }, `อัปเดตรายวิชา ${sCode} ${sName} ชั้น ${sGrade}`);
    setSubjectModalOpen(false);
  };

  const handleToggleSubjectCombined = (subjectId: string, checked: boolean) => {
    const nextSubjects = appData.subjects.map(s =>
      s.id === subjectId ? { ...s, allowCombined: checked } : s
    );
    const targetSub = appData.subjects.find(s => s.id === subjectId);
    onSyncMasterData(
      { subjects: nextSubjects },
      `ตั้งค่าการสอนรวมชั้นของวิชา ${targetSub ? targetSub.name : subjectId}`
    );
  };

  const handleDeleteSubject = (sub: Subject) => {
    setConfirmState({
      open: true,
      title: 'ยืนยันการลบรายวิชา',
      message: `ต้องการลบวิชา "${sub.code} ${sub.name} (${sub.grade})" หรือไม่?`,
      onConfirm: () => {
        const nextSubjects = appData.subjects.filter(s => s.id !== sub.id);
        onSyncMasterData({ subjects: nextSubjects }, `ลบรายวิชา ${sub.code} ${sub.name} (${sub.grade})`);
        setConfirmState(prev => ({ ...prev, open: false }));
      }
    });
  };

  const handleAddPeriodSlot = () => {
    const nextNum = periodsForm.filter(p => p.type === 'study').length + 1;
    const nextPeriods: PeriodSlot[] = [
      ...periodsForm,
      {
        id: 'P' + Date.now().toString().slice(-3),
        order: periodsForm.length + 1,
        label: `คาบที่ ${nextNum}`,
        start: '15:30',
        end: '16:30',
        type: 'study'
      }
    ];
    setPeriodsForm(nextPeriods);
  };

  const handleRemovePeriodSlot = (index: number) => {
    if (periodsForm.length <= 2) {
      onShowToast('ต้องมีคาบเรียนอย่างน้อย 2 คาบ', 'warning');
      return;
    }
    const nextPeriods = periodsForm.filter((_, idx) => idx !== index).map((p, idx) => ({
      ...p,
      order: idx + 1
    }));
    setPeriodsForm(nextPeriods);
  };

  return (
    <section className="space-y-6">
      {/* Sub-navigation for Settings */}
      <div className="pastel-card p-4 bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-pink-400 text-white flex items-center justify-center text-lg shadow-sm shrink-0">
            <i className="fa-solid fa-gear"></i>
          </div>
          <div>
            <h2 className="text-base md:text-lg font-extrabold text-gray-800">
              ตั้งค่าข้อมูลพื้นฐานของโรงเรียนและบุคลากร
            </h2>
            <p className="text-xs text-gray-600">
              กำหนดข้อมูลโรงเรียน ผู้บริหาร ครูผู้สอน รายวิชา/กิจกรรมพัฒนาผู้เรียน และโครงสร้างเวลาเรียน
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubTab('school')}
            className={`btn-pastel px-4 py-2 rounded-xl text-xs font-bold ${
              subTab === 'school' ? 'bg-pink-500 text-white' : 'bg-white text-gray-700 border border-pink-200'
            }`}
          >
            <i className="fa-solid fa-school mr-1"></i> ข้อมูลโรงเรียน & ผู้บริหาร
          </button>
          <button
            type="button"
            onClick={() => setSubTab('teachers')}
            className={`btn-pastel px-4 py-2 rounded-xl text-xs font-bold ${
              subTab === 'teachers' ? 'bg-pink-500 text-white' : 'bg-white text-gray-700 border border-pink-200'
            }`}
          >
            <i className="fa-solid fa-chalkboard-user mr-1"></i> ข้อมูลบุคลากรครู ({appData.teachers.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('subjects')}
            className={`btn-pastel px-4 py-2 rounded-xl text-xs font-bold ${
              subTab === 'subjects' ? 'bg-pink-500 text-white' : 'bg-white text-gray-700 border border-pink-200'
            }`}
          >
            <i className="fa-solid fa-book-open mr-1"></i> รายวิชา & กิจกรรม ({appData.subjects.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('timeslots')}
            className={`btn-pastel px-4 py-2 rounded-xl text-xs font-bold ${
              subTab === 'timeslots' ? 'bg-pink-500 text-white' : 'bg-white text-gray-700 border border-pink-200'
            }`}
          >
            <i className="fa-solid fa-clock mr-1"></i> ตั้งค่าช่วงชั้น & เวลาเรียน
          </button>
        </div>
      </div>

      {/* SUBTAB 1: SCHOOL & EXECUTIVES INFO */}
      {subTab === 'school' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* School Info Card */}
          <div className="pastel-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-pink-100 pb-3">
              <span className="w-8 h-8 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                <i className="fa-solid fa-building-columns"></i>
              </span>
              <h3 className="font-bold text-base text-gray-800">ข้อมูลพื้นฐานของสถานศึกษา</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-gray-700 mb-1">ชื่อสถานศึกษา</label>
                <input
                  type="text"
                  value={schoolForm.schoolName}
                  onChange={e => setSchoolForm({ ...schoolForm, schoolName: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-gray-700 mb-1">สังกัด (สำนักงานเขตพื้นที่การศึกษา)</label>
                <input
                  type="text"
                  value={schoolForm.affiliation}
                  onChange={e => setSchoolForm({ ...schoolForm, affiliation: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">ภาคเรียนที่</label>
                <select
                  value={schoolForm.semester}
                  onChange={e => setSchoolForm({ ...schoolForm, semester: e.target.value })}
                  aria-label="ภาคเรียนที่"
                  className="w-full px-3.5 py-2 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm font-bold bg-white"
                >
                  <option value="1">ภาคเรียนที่ 1</option>
                  <option value="2">ภาคเรียนที่ 2</option>
                  <option value="ฤดูร้อน">ภาคเรียนฤดูร้อน</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">ปีการศึกษา (พ.ศ.)</label>
                <input
                  type="text"
                  value={schoolForm.academicYear}
                  onChange={e => setSchoolForm({ ...schoolForm, academicYear: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-gray-700 mb-1">ลิงก์โลโก้โรงเรียน (URL)</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-200 p-1.5 flex items-center justify-center shrink-0">
                    <img
                      src={schoolForm.logoUrl || 'https://i.postimg.cc/8P6Y6MxB/baebs-him-t-dph-n.png'}
                      alt="School Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <input
                    type="text"
                    value={schoolForm.logoUrl}
                    onChange={e => setSchoolForm({ ...schoolForm, logoUrl: e.target.value })}
                    placeholder="https://i.postimg.cc/8P6Y6MxB/baebs-him-t-dph-n.png"
                    className="w-full px-3.5 py-2 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Director & Academic Officer Info Card */}
          <div className="pastel-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-purple-100 pb-3">
              <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <i className="fa-solid fa-user-tie"></i>
              </span>
              <h3 className="font-bold text-base text-gray-800">ข้อมูลผู้อำนวยการและผู้รับรองรายงาน</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-3">
                <div className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
                  <i className="fa-solid fa-star text-amber-400"></i>
                  <span>ข้อมูลผู้อำนวยการสถานศึกษา (ผู้รับรองหลัก)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-gray-600 mb-1">
                      ชื่อ - นามสกุล ผู้อำนวยการ (พร้อมคำนำหน้า)
                    </label>
                    <input
                      type="text"
                      value={schoolForm.directorName}
                      onChange={e => setSchoolForm({ ...schoolForm, directorName: e.target.value })}
                      placeholder="เช่น นายสมชาย ใจดี"
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm bg-white font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-gray-600 mb-1">ตำแหน่งหลักของผู้อำนวยการ</label>
                    <input
                      type="text"
                      value={schoolForm.directorMainPos}
                      onChange={e => setSchoolForm({ ...schoolForm, directorMainPos: e.target.value })}
                      placeholder="เช่น ผู้อำนวยการโรงเรียนดอนแก้วปากเป่งคุยสำโรง"
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm bg-white font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-gray-600">ตำแหน่งรอง / รักษาการในตำแหน่ง (ถ้ามี)</label>
                      <label className="inline-flex items-center gap-1.5 text-xs text-purple-700 font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!schoolForm.showDirectorSubPos}
                          onChange={e => setSchoolForm({ ...schoolForm, showDirectorSubPos: e.target.checked })}
                          className="rounded text-purple-600 focus:ring-purple-400"
                        />
                        <span>แสดงตำแหน่งรองในรายงาน</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={schoolForm.directorSubPos || ''}
                      onChange={e => setSchoolForm({ ...schoolForm, directorSubPos: e.target.value })}
                      placeholder="เช่น รักษาการในตำแหน่งผู้อำนวยการโรงเรียนดอนแก้วปากเป่งคุยสำโรง"
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 text-sm bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-3">
                <div className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                  <i className="fa-solid fa-file-signature text-blue-500"></i>
                  <span>ข้อมูลหัวหน้างานวิชาการ / เจ้าหน้าที่วิชาการ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-600 mb-1">ชื่อ - นามสกุล หัวหน้างานวิชาการ</label>
                    <input
                      type="text"
                      value={schoolForm.academicName}
                      onChange={e => setSchoolForm({ ...schoolForm, academicName: e.target.value })}
                      placeholder="เช่น นางสาวกานดา พัฒนาดี"
                      className="w-full px-3 py-2 rounded-xl border border-blue-200 text-sm bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-600 mb-1">ตำแหน่งในรายงาน</label>
                    <input
                      type="text"
                      value={schoolForm.academicPos}
                      onChange={e => setSchoolForm({ ...schoolForm, academicPos: e.target.value })}
                      placeholder="เช่น หัวหน้างานวิชาการ"
                      className="w-full px-3 py-2 rounded-xl border border-blue-200 text-sm bg-white font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onSyncMasterData({ schoolInfo: schoolForm }, 'บันทึกข้อมูลพื้นฐานของโรงเรียนเรียบร้อย')}
                className="btn-pastel px-6 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold text-sm flex items-center gap-2"
              >
                <i className="fa-solid fa-floppy-disk"></i>
                <span>บันทึกข้อมูลพื้นฐานโรงเรียน</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: TEACHERS CRUD */}
      {subTab === 'teachers' && (
        <div className="pastel-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
                <i className="fa-solid fa-users"></i>
              </span>
              <div>
                <h3 className="font-bold text-base text-gray-800">จัดการข้อมูลบุคลากรครูผู้สอน</h3>
                <p className="text-xs text-gray-500">
                  เพิ่ม แก้ไข หรือลบรายชื่อครู พร้อมกำหนดตำแหน่ง รหัส LINE ส่วนตัว และสีพาสเทลประจำตัว
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openTeacherModal()}
              className="btn-pastel px-4 py-2 rounded-xl bg-teal-500 text-white font-bold text-xs flex items-center gap-2"
            >
              <i className="fa-solid fa-user-plus"></i> เพิ่มข้อมูลครูผู้สอน
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-pink-50/80 text-gray-700 border-b border-pink-100">
                  <th className="p-3 rounded-tl-xl">รหัส</th>
                  <th className="p-3">ชื่อ - นามสกุล</th>
                  <th className="p-3">ตำแหน่ง</th>
                  <th className="p-3">กลุ่มสาระ/วิชาที่รับผิดชอบ</th>
                  <th className="p-3">ครูประจำชั้น</th>
                  <th className="p-3">LINE ID / Target ID</th>
                  <th className="p-3 text-center">ภาระสอนปัจจุบัน</th>
                  <th className="p-3 text-center rounded-tr-xl">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pink-50">
                {appData.teachers.map(t => (
                  <tr key={t.id} className="hover:bg-pink-50/40 transition">
                    <td className="p-3 font-bold text-xs text-gray-600">{t.id}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                          style={{ backgroundColor: t.color }}
                        ></span>
                        <span className="font-bold text-gray-800">{t.prefix}{t.fullName}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-600">{t.position || '-'}</td>
                    <td className="p-3 text-xs text-gray-600">{t.dept || '-'}</td>
                    <td className="p-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                        {t.homeroom || '-'}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {t.lineTargetId ? (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px]">
                          <i className="fa-brands fa-line mr-1"></i>
                          {t.lineTargetId.length > 12 ? `${t.lineTargetId.slice(0, 12)}...` : t.lineTargetId}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">ใช้กลุ่มรวมครู</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                        {getTeacherTeachingHours(t.id)} คาบ/สัปดาห์
                      </span>
                    </td>
                    <td className="p-3 text-center space-x-1">
                      <button
                        type="button"
                        onClick={() => openTeacherModal(t)}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold"
                      >
                        <i className="fa-solid fa-pen"></i> แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTeacher(t)}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold"
                        title="ลบข้อมูลครู"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: SUBJECTS & ACTIVITIES CRUD */}
      {subTab === 'subjects' && (
        <div className="pastel-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <i className="fa-solid fa-book"></i>
              </span>
              <div>
                <h3 className="font-bold text-base text-gray-800">
                  จัดการรายวิชาและกิจกรรมพัฒนาผู้เรียน (ป.1 - ม.3)
                </h3>
                <p className="text-xs text-gray-500">
                  กำหนดรายวิชาพื้นฐาน เพิ่มเติม และกิจกรรม (แนะแนว, ลูกเสือ-เนตรนารี, ชุมนุม ฯลฯ) พร้อมตั้งค่าการสอนรวมชั้นได้
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterSubjectGrade}
                onChange={e => setFilterSubjectGrade(e.target.value)}
                aria-label="กรองระดับชั้นวิชา"
                className="px-3 py-2 rounded-xl border border-purple-200 text-xs font-bold bg-white"
              >
                <option value="ALL">แสดงทุกระดับชั้น (ป.1 - ม.3)</option>
                {GRADES.map(g => (
                  <option key={g} value={g}>
                    {GRADE_FULL_NAMES[g]} ({g})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => openSubjectModal()}
                className="btn-pastel px-4 py-2 rounded-xl bg-purple-500 text-white font-bold text-xs flex items-center gap-2"
              >
                <i className="fa-solid fa-plus"></i> เพิ่มรายวิชา / กิจกรรม
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-purple-50/90 text-gray-700 border-b border-purple-100 sticky top-0">
                  <th className="p-3 rounded-tl-xl">ระดับชั้น</th>
                  <th className="p-3">รหัสวิชา</th>
                  <th className="p-3">ชื่อรายวิชา / กิจกรรม</th>
                  <th className="p-3">ประเภท</th>
                  <th className="p-3 text-center">ชม./สัปดาห์</th>
                  <th className="p-3">ครูผู้สอน</th>
                  <th className="p-3 text-center">สอนรวมหลายชั้นได้</th>
                  <th className="p-3 text-center rounded-tr-xl">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50">
                {appData.subjects
                  .filter(s => filterSubjectGrade === 'ALL' || s.grade === filterSubjectGrade)
                  .map(s => {
                    const t = appData.teachers.find(item => item.id === s.teacherId);
                    const isActivity = s.category.includes('กิจกรรม');
                    return (
                      <tr key={s.id} className="hover:bg-purple-50/40 transition">
                        <td className="p-3">
                          <span className="px-2.5 py-0.5 rounded-lg font-bold text-xs bg-pink-100 text-pink-700">
                            {s.grade}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-xs text-gray-700">{s.code}</td>
                        <td className="p-3 font-bold text-gray-800">{s.name}</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isActivity ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {s.category}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-xs">{s.hours} ชม.</td>
                        <td className="p-3 text-xs">
                          {t ? (
                            <span className="inline-flex items-center gap-1.5 font-semibold">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: t.color }}
                              ></span>
                              {t.prefix}{t.fullName}
                            </span>
                          ) : (
                            <span className="text-gray-400">ไม่ระบุ</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={!!s.allowCombined}
                            onChange={e => handleToggleSubjectCombined(s.id, e.target.checked)}
                            className="rounded text-teal-600 w-4 h-4 cursor-pointer"
                            title="ติ๊กเพื่ออนุญาตให้สอนรวมหลายชั้นพร้อมกันได้"
                          />
                        </td>
                        <td className="p-3 text-center space-x-1">
                          <button
                            type="button"
                            onClick={() => openSubjectModal(s)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold"
                          >
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubject(s)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold"
                            title="ลบรายวิชา"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: TIME SLOTS CONFIGURATION */}
      {subTab === 'timeslots' && (
        <div className="pastel-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <i className="fa-solid fa-clock"></i>
              </span>
              <div>
                <h3 className="font-bold text-base text-gray-800">
                  ตั้งค่าโครงสร้างเวลาเรียนและคาบเรียน (ป.1 - ม.3)
                </h3>
                <p className="text-xs text-gray-500">
                  ปรับแต่งเวลาเริ่ม-สิ้นสุดของแต่ละคาบเรียน และคาบพักกลางวัน
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddPeriodSlot}
                className="btn-pastel px-3.5 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <i className="fa-solid fa-plus"></i> เพิ่มคาบเรียน
              </button>
              <button
                type="button"
                onClick={() => onSyncMasterData({ periods: periodsForm }, 'บันทึกโครงสร้างเวลาเรียนเรียบร้อย')}
                className="btn-pastel px-4 py-2 rounded-xl bg-pink-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <i className="fa-solid fa-floppy-disk"></i> บันทึกโครงสร้างเวลาเรียน
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {periodsForm.map((p, idx) => (
              <div
                key={p.id}
                className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                  p.type === 'lunch' ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-pink-100'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-pink-100 text-pink-700 font-bold text-xs flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500">ชื่อคาบเรียน</label>
                    <input
                      type="text"
                      value={p.label}
                      onChange={e => {
                        const next = [...periodsForm];
                        next[idx] = { ...p, label: e.target.value };
                        setPeriodsForm(next);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-pink-200 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500">ประเภทคาบ</label>
                    <select
                      value={p.type}
                      onChange={e => {
                        const next = [...periodsForm];
                        next[idx] = { ...p, type: e.target.value as 'study' | 'lunch' };
                        setPeriodsForm(next);
                      }}
                      aria-label={`ประเภทคาบที่ ${idx + 1}`}
                      className="px-3 py-1.5 rounded-xl border border-pink-200 text-xs font-bold bg-white"
                    >
                      <option value="study">คาบเรียนปกติ</option>
                      <option value="lunch">พักกลางวัน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500">เวลาเริ่ม</label>
                    <input
                      type="time"
                      value={p.start}
                      onChange={e => {
                        const next = [...periodsForm];
                        next[idx] = { ...p, start: e.target.value };
                        setPeriodsForm(next);
                      }}
                      className="px-2.5 py-1.5 rounded-xl border border-pink-200 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500">เวลาสิ้นสุด</label>
                    <input
                      type="time"
                      value={p.end}
                      onChange={e => {
                        const next = [...periodsForm];
                        next[idx] = { ...p, end: e.target.value };
                        setPeriodsForm(next);
                      }}
                      className="px-2.5 py-1.5 rounded-xl border border-pink-200 text-xs font-bold"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePeriodSlot(idx)}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs font-bold"
                >
                  <i className="fa-solid fa-trash-can mr-1"></i> ลบคาบ
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teacher Add / Edit Modal */}
      {teacherModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-md w-full p-6 space-y-4 border-2 border-teal-200">
            <div className="flex items-center justify-between border-b border-teal-100 pb-3">
              <h3 className="font-bold text-base text-gray-800">
                {editTeacher ? `แก้ไขข้อมูลครู (${editTeacher.id})` : 'เพิ่มข้อมูลครูผู้สอนใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setTeacherModalOpen(false)}
                className="w-8 h-8 rounded-full bg-teal-50 text-gray-500 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">คำนำหน้า</label>
                  <input
                    type="text"
                    value={tPrefix}
                    onChange={e => setTPrefix(e.target.value)}
                    placeholder="นาย/นาง/น.ส."
                    className="w-full px-3 py-2 rounded-xl border border-teal-200"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">ชื่อ - นามสกุล</label>
                  <input
                    type="text"
                    value={tFullName}
                    onChange={e => setTFullName(e.target.value)}
                    placeholder="ชื่อ นามสกุล"
                    className="w-full px-3 py-2 rounded-xl border border-teal-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ตำแหน่ง</label>
                  <input
                    type="text"
                    value={tPosition}
                    onChange={e => setTPosition(e.target.value)}
                    placeholder="เช่น ครูชำนาญการ"
                    className="w-full px-3 py-2 rounded-xl border border-teal-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ครูประจำชั้น</label>
                  <select
                    value={tHomeroom}
                    onChange={e => setTHomeroom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-teal-200 bg-white"
                  >
                    <option value="-">ไม่ระบุ / สอนหลายชั้น</option>
                    {GRADES.map(g => (
                      <option key={g} value={g}>
                        {GRADE_FULL_NAMES[g]} ({g})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">กลุ่มสาระ / วิชาที่รับผิดชอบ</label>
                <input
                  type="text"
                  value={tDept}
                  onChange={e => setTDept(e.target.value)}
                  placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี / ประถมศึกษา"
                  className="w-full px-3 py-2 rounded-xl border border-teal-200"
                />
              </div>
              <div>
                <label className="block font-bold text-emerald-800 mb-1">
                  <i className="fa-brands fa-line text-emerald-600 mr-1"></i>
                  LINE User ID / Group ID ส่วนตัวครู (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={tLineId}
                  onChange={e => setTLineId(e.target.value)}
                  placeholder="เช่น U1234567890abcdef... (เว้นว่างเพื่อส่งเข้ากลุ่มรวมครู)"
                  className="w-full px-3 py-2 rounded-xl border border-emerald-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">โทนสีพาสเทลประจำตัวครู</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PASTEL_PALETTE.map(p => {
                    const isSelected = tColor === p.bg;
                    return (
                      <button
                        key={p.bg}
                        type="button"
                        onClick={() => setTColor(p.bg)}
                        className={`w-8 h-8 rounded-xl border-2 transition flex items-center justify-center ${
                          isSelected ? 'border-gray-900 scale-110 shadow-xs' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: p.bg }}
                        title={p.name}
                      >
                        {isSelected && <i className="fa-solid fa-check text-xs text-gray-800"></i>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-teal-100">
              <button
                type="button"
                onClick={() => setTeacherModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveTeacher}
                className="btn-pastel px-5 py-2 rounded-xl bg-teal-500 text-white font-bold text-xs"
              >
                บันทึกข้อมูลครู
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subject Add / Edit Modal */}
      {subjectModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-lg w-full p-6 space-y-4 border-2 border-purple-200">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <h3 className="font-bold text-base text-gray-800">
                {editSubject ? `แก้ไขรายวิชา (${editSubject.code})` : 'เพิ่มรายวิชา / กิจกรรมพัฒนาผู้เรียน'}
              </h3>
              <button
                type="button"
                onClick={() => setSubjectModalOpen(false)}
                className="w-8 h-8 rounded-full bg-purple-50 text-gray-500 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ระดับชั้น</label>
                  <select
                    value={sGrade}
                    onChange={e => setSGrade(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 bg-white font-bold"
                  >
                    {GRADES.map(g => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">รหัสวิชา</label>
                  <input
                    type="text"
                    value={sCode}
                    onChange={e => setSCode(e.target.value)}
                    placeholder="เช่น ว11101 / ก11901"
                    className="w-full px-3 py-2 rounded-xl border border-purple-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">จำนวนชั่วโมง/สัปดาห์</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={sHours}
                    onChange={e => setSHours(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ชื่อรายวิชา / กิจกรรม</label>
                  <input
                    type="text"
                    value={sName}
                    onChange={e => setSName(e.target.value)}
                    placeholder="เช่น วิทยาศาสตร์ / ลูกเสือ-เนตรนารี"
                    className="w-full px-3 py-2 rounded-xl border border-purple-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ประเภทวิชา / กิจกรรม</label>
                  <select
                    value={sCategory}
                    onChange={e => setSCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 bg-white"
                  >
                    <option value="วิชาพื้นฐาน">รายวิชาพื้นฐาน</option>
                    <option value="วิชาเพิ่มเติม">รายวิชาเพิ่มเติม</option>
                    <option value="กิจกรรมแนะแนว">กิจกรรมพัฒนาผู้เรียน (แนะแนว)</option>
                    <option value="กิจกรรมลูกเสือ-เนตรนารี">กิจกรรมพัฒนาผู้เรียน (ลูกเสือ-เนตรนารี)</option>
                    <option value="กิจกรรมชุมนุม">กิจกรรมพัฒนาผู้เรียน (ชุมนุม)</option>
                    <option value="กิจกรรมเพื่อสังคมฯ">กิจกรรมเพื่อสังคมและสาธารณประโยชน์</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ครูผู้สอนประจำวิชา</label>
                <select
                  value={sTeacherId}
                  onChange={e => setSTeacherId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-purple-200 bg-white font-semibold"
                >
                  {appData.teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.prefix}{t.fullName} ({t.dept || t.position})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-teal-50 border border-teal-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sAllowCombined}
                    onChange={e => setSAllowCombined(e.target.checked)}
                    className="mt-0.5 rounded text-teal-600 w-4 h-4"
                  />
                  <div>
                    <div className="font-bold text-teal-900">สอนรวมหลายชั้นพร้อมกันได้</div>
                    <div className="text-[11px] text-teal-700">
                      อนุญาตให้ครูสอนวิชานี้ซ้ำคาบกับชั้นอื่นได้โดยไม่ถือว่าชน
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sCoreMorning}
                    onChange={e => setSCoreMorning(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 w-4 h-4"
                  />
                  <div>
                    <div className="font-bold text-blue-900">เน้นจัดเรียนในช่วงเช้า</div>
                    <div className="text-[11px] text-blue-700">
                      ระบบอัตโนมัติจะพยายามจัดลงคาบเช้า และไม่ให้ซ้ำกันใน 1 วัน
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-purple-100">
              <button
                type="button"
                onClick={() => setSubjectModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveSubject}
                className="btn-pastel px-5 py-2 rounded-xl bg-purple-500 text-white font-bold text-xs"
              >
                บันทึกรายวิชา
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmState.open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-sm w-full p-6 space-y-4 border-2 border-pink-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center text-xl mx-auto">
              <i className="fa-solid fa-circle-question"></i>
            </div>
            <h3 className="font-bold text-base text-gray-800">{confirmState.title}</h3>
            <p className="text-xs text-gray-600">{confirmState.message}</p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmState(prev => ({ ...prev, open: false }))}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmState.onConfirm}
                className="btn-pastel px-5 py-2 rounded-xl bg-pink-500 text-white font-bold text-xs"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
