import React, { useState, useEffect } from 'react';
import {
  GRADES,
  GRADE_FULL_NAMES,
  DAYS,
  createDefaultAppData,
  type AppData
} from '../utils/timetableLogic';

export function buildOfficialPageHeaderHTML(appData: AppData, titleLine: string, subtitleLine: string): string {
  const info = appData.schoolInfo;
  return `
    <div style="text-align:center; margin-bottom: 6px;">
      <img src="${info.logoUrl}" alt="โลโก้โรงเรียน" style="height: 54px; width: auto; object-fit: contain; display: block; margin: 0 auto 2px auto;" onerror="this.style.display='none'" />
      <div style="font-size: 18pt; font-weight: 700; line-height: 1.15;">
        ${titleLine}
      </div>
      <div style="font-size: 15pt; font-weight: 700; line-height: 1.15;">
        ${info.schoolName} ${info.affiliation}
      </div>
      <div style="font-size: 14pt; font-weight: 600; line-height: 1.15;">
        ${subtitleLine}
      </div>
    </div>
  `;
}

export function buildOfficialSignatureBlockHTML(appData: AppData): string {
  const info = appData.schoolInfo;
  const subPosHtml = (info.showDirectorSubPos && info.directorSubPos)
    ? `<div style="font-size: 13pt; line-height: 1.2;">${info.directorSubPos}</div>`
    : '';

  return `
    <table style="width: 100%; border: none; border-collapse: collapse; margin-top: 8px; font-size: 13.5pt;">
      <tr>
        <td style="width: 50%; text-align: center; vertical-align: top; border: none; padding: 2px;">
          <div>ลงชื่อ..........................................................ผู้เสนอ/ตรวจสอบ</div>
          <div style="font-weight: 700; margin-top: 2px;">(${info.academicName || '..........................................................'})</div>
          <div>ตำแหน่ง ${info.academicPos || 'หัวหน้างานวิชาการ'}</div>
        </td>
        <td style="width: 50%; text-align: center; vertical-align: top; border: none; padding: 2px;">
          <div>ลงชื่อ..........................................................ผู้รับรอง/อนุมัติ</div>
          <div style="font-weight: 700; margin-top: 2px;">(${info.directorName || '..........................................................'})</div>
          <div>${info.directorMainPos || 'ผู้อำนวยการ' + info.schoolName}</div>
          ${subPosHtml}
        </td>
      </tr>
    </table>
  `;
}

export function generateOfficialReportPages(
  appData: AppData,
  repType: 'student' | 'teacher',
  scope: string,
  targetVal: string,
  includeSummary: boolean,
  showSubDetail: boolean
): string[] {
  const info = appData.schoolInfo;
  const getTeacherById = (id: string) => appData.teachers.find(t => t.id === id) || null;
  const getScheduledHours = (grade: string, subjectId: string) => {
    let count = 0;
    DAYS.forEach(d => {
      appData.periods.forEach(p => {
        const entry = appData.schedule[`${grade}_${d.key}_${p.id}`];
        if (entry && entry.subjectId === subjectId) count++;
      });
    });
    return count;
  };
  const getTeacherTeachingHours = (teacherId: string) => {
    let count = 0;
    const seen = new Set<string>();
    Object.entries(appData.schedule).forEach(([slotKey, item]) => {
      const sub = appData.subjects.find(s => s.id === item.subjectId);
      if (sub && sub.teacherId === teacherId) {
        const [, dayKey, periodId] = slotKey.split('_');
        seen.add(`${dayKey}_${periodId}`);
        count++;
      }
    });
    return { totalClassHours: count, uniqueTimeHours: seen.size };
  };

  const buildStudentTimetablePageHTML = (grade: string) => {
    const homeroomTeacher = appData.teachers.find(t => t.homeroom === grade);
    const homeroomText = homeroomTeacher ? `ครูประจำชั้น: ${homeroomTeacher.prefix}${homeroomTeacher.fullName}` : '';
    const headerHtml = buildOfficialPageHeaderHTML(
      appData,
      `ตารางเรียนชั้น${GRADE_FULL_NAMES[grade]} (${grade}) ภาคเรียนที่ ${info.semester} ปีการศึกษา ${info.academicYear}`,
      homeroomText
    );

    let tableHtml = `<table class="official-table" style="font-size: 13pt;">
      <thead>
        <tr>
          <th style="width: 85px; font-size: 13.5pt;">วัน / เวลา</th>`;
    appData.periods.forEach(p => {
      tableHtml += `<th style="font-size: 12.5pt;">
        <div>${p.label}</div>
        <div style="font-size: 11pt; font-weight: 600;">${p.start} - ${p.end}</div>
      </th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    DAYS.forEach(day => {
      tableHtml += `<tr>
        <td style="font-weight: 700; font-size: 13.5pt; height: 50px; background-color: #F9FAFB;">${day.name}</td>`;
      appData.periods.forEach(p => {
        if (p.type === 'lunch') {
          tableHtml += `<td style="font-weight: 700; font-size: 12.5pt; background-color: #F9FAFB;">พักกลางวัน</td>`;
          return;
        }
        const entry = appData.schedule[`${grade}_${day.key}_${p.id}`];
        const sub = entry ? appData.subjects.find(s => s.id === entry.subjectId) : null;
        const t = sub ? getTeacherById(sub.teacherId) : null;
        if (sub) {
          tableHtml += `<td style="padding: 3px 4px;">
            <div style="font-weight: 700; font-size: 12.5pt; line-height: 1.1;">${sub.code}</div>
            <div style="font-size: 12pt; line-height: 1.15;">${sub.name}</div>
            ${showSubDetail && t ? `<div style="font-size: 10.5pt; color: #222; line-height: 1.1;">(${t.fullName.split(' ')[0]})</div>` : ''}
          </td>`;
        } else {
          tableHtml += `<td>-</td>`;
        }
      });
      tableHtml += `</tr>`;
    });
    tableHtml += `</tbody></table>`;

    return `
      <div class="report-page">
        <div>
          ${headerHtml}
          ${tableHtml}
        </div>
        ${buildOfficialSignatureBlockHTML(appData)}
      </div>
    `;
  };

  const buildStudentSummaryHoursPageHTML = (grade: string) => {
    const homeroomTeacher = appData.teachers.find(t => t.homeroom === grade);
    const gradeSubs = appData.subjects.filter(s => s.grade === grade);
    const headerHtml = buildOfficialPageHeaderHTML(
      appData,
      `บัญชีสรุปจำนวนชั่วโมงเรียน ชั้น${GRADE_FULL_NAMES[grade]} (${grade})`,
      `ภาคเรียนที่ ${info.semester} ปีการศึกษา ${info.academicYear} ${homeroomTeacher ? '• ครูประจำชั้น: ' + homeroomTeacher.prefix + homeroomTeacher.fullName : ''}`
    );

    let totalAssigned = 0;
    let totalStructure = 0;
    let rowsHtml = '';
    gradeSubs.forEach((s, idx) => {
      const used = getScheduledHours(grade, s.id);
      const t = getTeacherById(s.teacherId);
      totalStructure += s.hours;
      totalAssigned += used;
      rowsHtml += `
        <tr>
          <td style="padding: 2px 4px;">${idx + 1}</td>
          <td style="padding: 2px 6px; font-weight: 700;">${s.code}</td>
          <td style="padding: 2px 8px; text-align: left;">${s.name}</td>
          <td style="padding: 2px 6px;">${s.category}</td>
          <td style="padding: 2px 6px; text-align: left;">${t ? t.prefix + t.fullName : '-'}</td>
          <td style="padding: 2px 6px; font-weight: 700;">${s.hours}</td>
          <td style="padding: 2px 6px; font-weight: 700;">${used}</td>
          <td style="padding: 2px 6px;">${s.allowCombined ? 'สอนรวมชั้นได้' : 'เรียนปกติ'}</td>
        </tr>
      `;
    });

    const tableHtml = `
      <table class="official-table" style="font-size: 12.5pt; margin-top: 2px;">
        <thead>
          <tr>
            <th style="width: 42px;">ที่</th>
            <th style="width: 85px;">รหัสวิชา</th>
            <th>ชื่อรายวิชา / กิจกรรมพัฒนาผู้เรียน</th>
            <th style="width: 155px;">ประเภทวิชา</th>
            <th style="width: 175px;">ครูผู้สอน</th>
            <th style="width: 90px;">โครงสร้าง (ชม.)</th>
            <th style="width: 90px;">จัดจริง (ชม.)</th>
            <th style="width: 95px;">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background-color: #F3F4F6; font-weight: 700;">
            <td colspan="5" style="text-align: right; padding-right: 12px;">รวมจำนวนชั่วโมงเรียนทั้งหมดต่อสัปดาห์</td>
            <td>${totalStructure} ชม.</td>
            <td>${totalAssigned} ชม.</td>
            <td>สัปดาห์</td>
          </tr>
        </tbody>
      </table>
    `;

    return `
      <div class="report-page">
        <div>
          ${headerHtml}
          ${tableHtml}
        </div>
        ${buildOfficialSignatureBlockHTML(appData)}
      </div>
    `;
  };

  const buildTeacherTimetablePageHTML = (teacher: typeof appData.teachers[number]) => {
    const hrs = getTeacherTeachingHours(teacher.id);
    const headerHtml = buildOfficialPageHeaderHTML(
      appData,
      `ตารางสอนของ ${teacher.prefix}${teacher.fullName} • ตำแหน่ง ${teacher.position}`,
      `ภาคเรียนที่ ${info.semester} ปีการศึกษา ${info.academicYear} (กลุ่มสาระ: ${teacher.dept || '-'} | ปฏิบัติการสอนรวม ${hrs.uniqueTimeHours} ชั่วโมง/สัปดาห์)`
    );

    let tableHtml = `<table class="official-table" style="font-size: 13pt;">
      <thead>
        <tr>
          <th style="width: 85px; font-size: 13.5pt;">วัน / เวลา</th>`;
    appData.periods.forEach(p => {
      tableHtml += `<th style="font-size: 12.5pt;">
        <div>${p.label}</div>
        <div style="font-size: 11pt; font-weight: 600;">${p.start} - ${p.end}</div>
      </th>`;
    });
    tableHtml += `</tr></thead><tbody>`;

    DAYS.forEach(day => {
      tableHtml += `<tr>
        <td style="font-weight: 700; font-size: 13.5pt; height: 50px; background-color: #F9FAFB;">${day.name}</td>`;
      appData.periods.forEach(p => {
        if (p.type === 'lunch') {
          tableHtml += `<td style="font-weight: 700; font-size: 12.5pt; background-color: #F9FAFB;">พักกลางวัน</td>`;
          return;
        }
        const taughtItems: Array<{ grade: string; sub: typeof appData.subjects[number] }> = [];
        GRADES.forEach(g => {
          const entry = appData.schedule[`${g}_${day.key}_${p.id}`];
          if (entry) {
            const sub = appData.subjects.find(s => s.id === entry.subjectId);
            if (sub && sub.teacherId === teacher.id) {
              taughtItems.push({ grade: g, sub });
            }
          }
        });

        if (taughtItems.length > 0) {
          const firstSub = taughtItems[0].sub;
          const gradesStr = taughtItems.map(i => i.grade).join(', ');
          tableHtml += `<td style="padding: 3px 4px;">
            <div style="font-weight: 700; font-size: 12.5pt; line-height: 1.1;">${firstSub.code}</div>
            <div style="font-size: 12pt; line-height: 1.15;">${firstSub.name}</div>
            ${showSubDetail ? `<div style="font-size: 11pt; font-weight: 700; line-height: 1.1;">ชั้น ${gradesStr}</div>` : ''}
          </td>`;
        } else {
          tableHtml += `<td>-</td>`;
        }
      });
      tableHtml += `</tr>`;
    });
    tableHtml += `</tbody></table>`;

    return `
      <div class="report-page">
        <div>
          ${headerHtml}
          ${tableHtml}
        </div>
        ${buildOfficialSignatureBlockHTML(appData)}
      </div>
    `;
  };

  const buildTeacherSummaryHoursPageHTML = (teacher: typeof appData.teachers[number]) => {
    const teacherSubs = appData.subjects.filter(s => s.teacherId === teacher.id);
    const hrs = getTeacherTeachingHours(teacher.id);
    const headerHtml = buildOfficialPageHeaderHTML(
      appData,
      `รายงานสรุปจำนวนชั่วโมงที่ปฏิบัติการสอนของ ${teacher.prefix}${teacher.fullName}`,
      `ตำแหน่ง ${teacher.position} • ภาคเรียนที่ ${info.semester} ปีการศึกษา ${info.academicYear}`
    );

    let rowsHtml = '';
    let sumScheduledByClass = 0;
    let sumBaseHours = 0;
    let sumExtraHours = 0;
    let sumActHours = 0;

    teacherSubs.forEach((s, idx) => {
      const used = getScheduledHours(s.grade, s.id);
      sumScheduledByClass += used;
      if (s.category === 'วิชาพื้นฐาน') sumBaseHours += used;
      else if (s.category === 'วิชาเพิ่มเติม') sumExtraHours += used;
      else sumActHours += used;

      rowsHtml += `
        <tr>
          <td style="padding: 2px 4px;">${idx + 1}</td>
          <td style="padding: 2px 6px; font-weight: 700;">${s.code}</td>
          <td style="padding: 2px 8px; text-align: left;">${s.name}</td>
          <td style="padding: 2px 6px; font-weight: 700;">${s.grade}</td>
          <td style="padding: 2px 6px;">${s.category}</td>
          <td style="padding: 2px 6px; font-weight: 700;">${used}</td>
          <td style="padding: 2px 6px;">${s.allowCombined ? 'สอนรวมชั้นได้' : 'สอนปกติ'}</td>
        </tr>
      `;
    });

    const tableHtml = `
      <table class="official-table" style="font-size: 12.5pt; margin-top: 2px;">
        <thead>
          <tr>
            <th style="width: 45px;">ที่</th>
            <th style="width: 90px;">รหัสวิชา</th>
            <th>ชื่อรายวิชา / กิจกรรมพัฒนาผู้เรียน</th>
            <th style="width: 85px;">ระดับชั้น</th>
            <th style="width: 170px;">ประเภทวิชา</th>
            <th style="width: 120px;">จำนวนชั่วโมงที่สอน/สัปดาห์</th>
            <th style="width: 110px;">รูปแบบการสอน</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="padding: 12px;">ยังไม่มีรายวิชาที่รับผิดชอบ</td></tr>`}
          <tr style="background-color: #F3F4F6; font-weight: 700;">
            <td colspan="5" style="text-align: right; padding-right: 12px;">
              รวมชั่วโมงตามรายชั้น (พื้นฐาน ${sumBaseHours} | เพิ่มเติม ${sumExtraHours} | กิจกรรม ${sumActHours})
            </td>
            <td>${sumScheduledByClass} ชม.</td>
            <td>ปฏิบัติจริง ${hrs.uniqueTimeHours} คาบ</td>
          </tr>
        </tbody>
      </table>
    `;

    return `
      <div class="report-page">
        <div>
          ${headerHtml}
          ${tableHtml}
        </div>
        ${buildOfficialSignatureBlockHTML(appData)}
      </div>
    `;
  };

  const pages: string[] = [];
  if (repType === 'student') {
    let targetGrades: string[] = [targetVal || 'ป.1'];
    if (scope === 'PRIMARY_LOW') targetGrades = ['ป.1', 'ป.2', 'ป.3'];
    else if (scope === 'PRIMARY_HIGH') targetGrades = ['ป.4', 'ป.5', 'ป.6'];
    else if (scope === 'PRIMARY_ALL') targetGrades = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
    else if (scope === 'JUNIOR_ALL') targetGrades = ['ม.1', 'ม.2', 'ม.3'];
    else if (scope === 'ALL_GRADES') targetGrades = [...GRADES];

    targetGrades.forEach(g => {
      pages.push(buildStudentTimetablePageHTML(g));
      if (includeSummary) pages.push(buildStudentSummaryHoursPageHTML(g));
    });
  } else {
    let targetTeachers = appData.teachers;
    if (scope === 'SINGLE_TEACHER') {
      const found = getTeacherById(targetVal) || appData.teachers[0];
      targetTeachers = found ? [found] : [];
    }
    targetTeachers.forEach(t => {
      pages.push(buildTeacherTimetablePageHTML(t));
      if (includeSummary) pages.push(buildTeacherSummaryHoursPageHTML(t));
    });
  }

  return pages;
}

interface OfficialReportSectionProps {
  appData: AppData;
  currentSelectedGrade: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const OfficialReportSection: React.FC<OfficialReportSectionProps> = ({
  appData,
  currentSelectedGrade,
  onShowToast
}) => {
  const [repType, setRepType] = useState<'student' | 'teacher'>('student');
  const [scope, setScope] = useState<string>('SINGLE_GRADE');
  const [targetVal, setTargetVal] = useState<string>(currentSelectedGrade);
  const [includeSummary, setIncludeSummary] = useState<boolean>(true);
  const [showSubDetail, setShowSubDetail] = useState<boolean>(true);

  useEffect(() => {
    if (repType === 'student') {
      setScope('SINGLE_GRADE');
      setTargetVal(currentSelectedGrade);
    } else {
      setScope('SINGLE_TEACHER');
      setTargetVal(appData.teachers[0]?.id || 'T01');
    }
  }, [repType, currentSelectedGrade, appData.teachers]);

  const pages = generateOfficialReportPages(appData, repType, scope, targetVal, includeSummary, showSubDetail);
  const joinedHtml = pages.join('');

  const handlePrint = () => {
    const printWrapper = document.getElementById('printAreaWrapper');
    if (printWrapper) {
      printWrapper.innerHTML = joinedHtml;
    }
    window.print();
  };

  const handleExportWord = () => {
    const info = appData.schoolInfo;
    const wordPagesHtml = pages.map((pageHtml, idx) => {
      const pageBreak = idx < pages.length - 1
        ? `<br clear="all" style="mso-special-character:line-break; page-break-before:always" />`
        : '';
      return `<div class="WordPage">${pageHtml}</div>${pageBreak}`;
    }).join('\n');

    const wordDocument = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>รายงานตารางเรียนตารางสอน - ${info.schoolName}</title>
        <style>
          @page WordSection1 {
            size: 29.7cm 21.0cm;
            mso-page-orientation: landscape;
            margin: 1.2cm 1.4cm 1.2cm 1.4cm;
          }
          div.WordSection1 {
            page: WordSection1;
            font-family: "TH Sarabun PSK", "TH Sarabun New", "Sarabun", sans-serif;
            color: #000000;
          }
          table.official-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5pt solid #000000;
            font-family: "TH Sarabun PSK", "Sarabun", sans-serif;
          }
          table.official-table th, table.official-table td {
            border: 1pt solid #000000;
            padding: 3pt 4pt;
            text-align: center;
            vertical-align: middle;
          }
          table.official-table th {
            background-color: #F3F4F6;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="WordSection1">
          ${wordPagesHtml}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordDocument], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ตารางเรียนตารางสอน_${info.schoolName}_${info.semester}_${info.academicYear}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('ดาวน์โหลดไฟล์ Word (.doc) เรียบร้อยแล้ว สามารถเปิดแก้ไขใน MS Word ได้ทันที', 'success');
  };

  return (
    <section className="space-y-6">
      <div className="pastel-card p-4 md:p-6 bg-gradient-to-r from-purple-50 via-pink-50 to-amber-50 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-200/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-purple-500 text-white flex items-center justify-center text-xl shadow-sm shrink-0">
              <i className="fa-solid fa-file-invoice"></i>
            </div>
            <div>
              <h2 className="text-base md:text-lg font-extrabold text-gray-800">
                ระบบพิมพ์รายงานราชการ (PDF) และส่งออกไฟล์ Word (.doc แก้ไขได้)
              </h2>
              <p className="text-xs text-gray-600">
                รูปแบบมาตรฐานราชการ ฟอนต์ TH Sarabun PSK พร้อมโลโก้โรงเรียน สรุปชั่วโมงแยกหน้า และการรับรองของผู้บริหาร
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePrint}
              className="btn-pastel flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-print"></i>
              <span>สั่งพิมพ์ / บันทึกเป็น PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportWord}
              className="btn-pastel flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-file-word"></i>
              <span>ดาวน์โหลดไฟล์ Word (.doc)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white/90 p-3.5 rounded-2xl border border-purple-100 space-y-1.5">
            <label className="block text-xs font-bold text-purple-900">1. ประเภทรายงาน</label>
            <select
              value={repType}
              onChange={e => setRepType(e.target.value as 'student' | 'teacher')}
              aria-label="ประเภทรายงาน"
              className="w-full px-3 py-2 rounded-xl border border-purple-200 text-xs md:text-sm font-bold text-gray-700 bg-white"
            >
              <option value="student">ตารางเรียนสำหรับนักเรียน (ประจำชั้น)</option>
              <option value="teacher">ตารางสอนสำหรับครูผู้สอน</option>
            </select>
          </div>

          <div className="bg-white/90 p-3.5 rounded-2xl border border-purple-100 space-y-1.5">
            <label className="block text-xs font-bold text-purple-900">2. ขอบเขตการพิมพ์</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value)}
              aria-label="ขอบเขตการพิมพ์"
              className="w-full px-3 py-2 rounded-xl border border-purple-200 text-xs md:text-sm font-bold text-gray-700 bg-white"
            >
              {repType === 'student' ? (
                <>
                  <option value="SINGLE_GRADE">เฉพาะชั้นเรียนที่เลือก (รายชั้น)</option>
                  <option value="PRIMARY_LOW">ช่วงชั้นประถมศึกษาตอนต้น (ป.1 - ป.3)</option>
                  <option value="PRIMARY_HIGH">ช่วงชั้นประถมศึกษาตอนปลาย (ป.4 - ป.6)</option>
                  <option value="PRIMARY_ALL">ระดับประถมศึกษาทั้งหมด (ป.1 - ป.6)</option>
                  <option value="JUNIOR_ALL">ระดับมัธยมศึกษาตอนต้นทั้งหมด (ม.1 - ม.3)</option>
                  <option value="ALL_GRADES">พิมพ์ทุกชั้นเรียนทั้งหมด (ป.1 - ม.3)</option>
                </>
              ) : (
                <>
                  <option value="SINGLE_TEACHER">เฉพาะครูผู้สอนที่เลือก (รายบุคคล)</option>
                  <option value="ALL_TEACHERS">พิมพ์ครูผู้สอนทั้งหมดทุกคน</option>
                </>
              )}
            </select>
          </div>

          <div className={`bg-white/90 p-3.5 rounded-2xl border border-purple-100 space-y-1.5 ${(scope !== 'SINGLE_GRADE' && scope !== 'SINGLE_TEACHER') ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block text-xs font-bold text-purple-900">3. เลือกชั้นเรียน / ครูผู้สอน</label>
            <select
              value={targetVal}
              onChange={e => setTargetVal(e.target.value)}
              aria-label="เลือกชั้นเรียนหรือครูผู้สอน"
              className="w-full px-3 py-2 rounded-xl border border-purple-200 text-xs md:text-sm font-bold text-gray-700 bg-white"
            >
              {repType === 'student' ? (
                GRADES.map(g => (
                  <option key={g} value={g}>ชั้น{GRADE_FULL_NAMES[g]} ({g})</option>
                ))
              ) : (
                appData.teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.prefix}{t.fullName} ({t.position})</option>
                ))
              )}
            </select>
          </div>

          <div className="bg-white/90 p-3.5 rounded-2xl border border-purple-100 space-y-2 flex flex-col justify-center">
            <label className="inline-flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={e => setIncludeSummary(e.target.checked)}
                className="mt-0.5 rounded text-pink-600 w-4 h-4"
              />
              <span className="text-xs font-bold text-gray-800 leading-snug">
                รายงานสรุปจำนวนชั่วโมง <span className="text-pink-600">(แยกหน้ากระดาษ)</span>
              </span>
            </label>
            <label className="inline-flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSubDetail}
                onChange={e => setShowSubDetail(e.target.checked)}
                className="mt-0.5 rounded text-purple-600 w-4 h-4"
              />
              <span className="text-xs font-semibold text-gray-600 leading-snug">
                แสดงชื่อครูผู้สอน/ชั้นเรียนในช่องตาราง
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-gray-600">
          <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 font-bold">
            จำนวนหน้าเอกสารทั้งหมด: {pages.length} หน้า (A4 แนวนอน)
          </span>
        </div>
      </div>

      <div className="bg-gray-200/80 p-3 md:p-8 rounded-3xl border-2 border-purple-100 overflow-x-auto">
        <div
          className="official-doc-container min-w-[297mm]"
          dangerouslySetInnerHTML={{ __html: joinedHtml }}
        />
      </div>
    </section>
  );
};
