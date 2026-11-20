import React, { useState } from 'react';
import {
  GRADES,
  GRADE_FULL_NAMES,
  createDefaultUsers,
  createDefaultAccessPolicy,
  type AppData,
  type UserAccount,
  type UserRole,
  type UserStatus,
  type AccessPolicy
} from '../utils/timetableLogic';
import { firebaseConfig, syncStateToFirebaseRTDB } from '../services/firebaseClient';

interface AdminDashboardSectionProps {
  appData: AppData;
  currentUser: UserAccount | null;
  onAppDataUpdated: (nextData: AppData) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  onOpenAuthModal: () => void;
}

export const AdminDashboardSection: React.FC<AdminDashboardSectionProps> = ({
  appData,
  currentUser,
  onAppDataUpdated,
  onShowToast,
  onOpenAuthModal
}) => {
  const users = appData.users && appData.users.length > 0 ? appData.users : createDefaultUsers();
  const policy = appData.accessPolicy || createDefaultAccessPolicy();
  const auditLogs = appData.auditLogs || [];

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserStatus>('ALL');
  const [syncingFirebase, setSyncingFirebase] = useState<boolean>(false);
  const [lastFirebaseSyncTime, setLastFirebaseSyncTime] = useState<string>(
    new Date().toLocaleTimeString('th-TH')
  );

  // Add / Edit Member Modal State
  const [editingUser, setEditingUser] = useState<Partial<UserAccount> | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.assignedGrade || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const adminCount = users.filter(u => u.role === 'admin').length;
  const teacherCount = users.filter(u => u.role === 'teacher').length;
  const studentCount = users.filter(u => u.role === 'student').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;

  const handleSaveUser = async (userPayload: Partial<UserAccount>) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: userPayload,
          actorName: currentUser?.fullName || 'ผู้ดูแลระบบสูงสุด (Admin)'
        })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        onShowToast(json.error || 'ไม่สามารถบันทึกข้อมูลสมาชิกได้', 'error');
        return;
      }
      if (json.data) {
        onAppDataUpdated(json.data);
      }
      setEditingUser(null);
      onShowToast(`บันทึกข้อมูลสมาชิก "${userPayload.fullName}" เรียบร้อยแล้ว`, 'success');
    } catch {
      onShowToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    }
  };

  const handleDeleteUser = async (targetUser: UserAccount) => {
    if (targetUser.id === currentUser?.id) {
      onShowToast('ไม่สามารถลบบัญชีที่คุณกำลังใช้งานอยู่ได้', 'warning');
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        onShowToast(json.error || 'ไม่สามารถลบสมาชิกได้', 'error');
        return;
      }
      if (json.data) {
        onAppDataUpdated(json.data);
      }
      onShowToast(`ลบบัญชีของ "${targetUser.fullName}" ออกจากระบบแล้ว`, 'info');
    } catch {
      onShowToast('เกิดข้อผิดพลาดในการลบสมาชิก', 'error');
    }
  };

  const handleUpdatePolicy = async (nextPartial: Partial<AccessPolicy>) => {
    const updatedPolicy = { ...policy, ...nextPartial };
    try {
      const res = await fetch('/api/admin/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessPolicy: updatedPolicy,
          actorName: currentUser?.fullName || 'ผู้ดูแลระบบสูงสุด (Admin)'
        })
      });
      const json = await res.json();
      if (json.ok && json.data) {
        onAppDataUpdated(json.data);
        onShowToast('อัปเดตนโยบายความปลอดภัยและสิทธิ์การเข้าถึงเรียบร้อยแล้ว', 'success');
      }
    } catch {
      onShowToast('ไม่สามารถบันทึกนโยบายสิทธิ์ได้', 'error');
    }
  };

  const handleManualFirebaseSync = async () => {
    setSyncingFirebase(true);
    try {
      await syncStateToFirebaseRTDB(appData);
      setLastFirebaseSyncTime(new Date().toLocaleTimeString('th-TH'));
      onShowToast('บันทึกและอัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว', 'success');
    } finally {
      setSyncingFirebase(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* Top Banner: Admin Control Header */}
      <div className="pastel-card p-5 bg-gradient-to-r from-purple-50 via-pink-50 to-sky-50 border-2 border-purple-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-xl bg-purple-600 text-white text-xs font-extrabold flex items-center gap-1.5">
              <i className="fa-solid fa-user-shield"></i>
              <span>ระบบผู้ดูแลและจัดการสมาชิก</span>
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-extrabold text-gray-800 pt-1">
            บริหารจัดการบัญชีผู้ใช้ และกำหนดสิทธิ์การเข้าถึง (ผู้ดูแลระบบ / ครูผู้สอน / นักเรียน)
          </h2>
          <p className="text-xs text-gray-600 font-medium">
            {appData.schoolInfo.schoolName} • อัปเดตข้อมูลล่าสุดเวลา <span className="font-bold">{lastFirebaseSyncTime} น.</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleManualFirebaseSync}
            disabled={syncingFirebase}
            className="btn-pastel px-4 py-2.5 rounded-2xl bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 font-extrabold text-xs flex items-center gap-2"
          >
            <i className={`fa-solid fa-arrows-rotate ${syncingFirebase ? 'animate-spin' : ''}`}></i>
            <span>{syncingFirebase ? 'กำลังอัปเดต...' : 'อัปเดตข้อมูลสมาชิก'}</span>
          </button>

          {isAdmin ? (
            <button
              type="button"
              onClick={() =>
                setEditingUser({
                  username: '',
                  email: '',
                  password: 'user1234',
                  fullName: '',
                  role: 'student',
                  status: 'active',
                  assignedGrade: 'ป.1',
                  teacherId: appData.teachers[0]?.id || 'T01'
                })
              }
              className="btn-pastel px-4 py-2.5 rounded-2xl bg-pink-500 text-white font-extrabold text-xs flex items-center gap-2"
            >
              <i className="fa-solid fa-user-plus"></i>
              <span>+ เพิ่มสมาชิกใหม่</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="btn-pastel px-4 py-2.5 rounded-2xl bg-purple-600 text-white font-extrabold text-xs flex items-center gap-2"
            >
              <i className="fa-solid fa-key"></i>
              <span>สลับเป็นบัญชีผู้ดูแลระบบ (Admin)</span>
            </button>
          )}
        </div>
      </div>

      {/* Non-admin notice if viewing as teacher/student */}
      {!isAdmin && (
        <div className="pastel-card p-4 bg-amber-50 border-2 border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-900 font-bold">
            <i className="fa-solid fa-lock text-amber-600 text-base"></i>
            <span>
              ขณะนี้คุณกำลังเข้าใช้งานในสิทธิ์{' '}
              <strong>
                {currentUser
                  ? `${currentUser.fullName} (${currentUser.role === 'teacher' ? 'ครูผู้สอน' : 'นักเรียน'})`
                  : 'ผู้เยี่ยมชม'}
              </strong>{' '}
              — การแก้ไขสิทธิ์สมาชิกหรือนโยบายระบบสงวนไว้สำหรับ <strong>ผู้ดูแลระบบ (Admin)</strong> เท่านั้น
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="btn-pastel px-3.5 py-1.5 rounded-xl bg-amber-500 text-white font-extrabold text-xs"
          >
            เข้าสู่ระบบผู้ดูแล (Admin)
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="pastel-card p-4 bg-white border border-purple-200 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg shrink-0">
            <i className="fa-solid fa-users"></i>
          </div>
          <div>
            <div className="text-[11px] font-bold text-gray-500">สมาชิกทั้งหมดในระบบ</div>
            <div className="text-xl font-extrabold text-gray-900">{users.length} บัญชี</div>
            {pendingCount > 0 && (
              <div className="text-[10px] font-bold text-amber-600">รออนุมัติ {pendingCount} บัญชี</div>
            )}
          </div>
        </div>

        <div className="pastel-card p-4 bg-white border border-pink-200 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center text-lg shrink-0">
            <i className="fa-solid fa-user-shield"></i>
          </div>
          <div>
            <div className="text-[11px] font-bold text-gray-500">ผู้ดูแลระบบ (Admin)</div>
            <div className="text-xl font-extrabold text-purple-700">{adminCount} ท่าน</div>
            <div className="text-[10px] text-gray-500">สิทธิ์จัดการระบบสูงสุด</div>
          </div>
        </div>

        <div className="pastel-card p-4 bg-white border border-teal-200 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center text-lg shrink-0">
            <i className="fa-solid fa-chalkboard-user"></i>
          </div>
          <div>
            <div className="text-[11px] font-bold text-gray-500">ครูผู้สอน (Teacher)</div>
            <div className="text-xl font-extrabold text-teal-700">{teacherCount} ท่าน</div>
            <div className="text-[10px] text-gray-500">ผูกตารางสอนรายบุคคล</div>
          </div>
        </div>

        <div className="pastel-card p-4 bg-white border border-sky-200 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center text-lg shrink-0">
            <i className="fa-solid fa-user-graduate"></i>
          </div>
          <div>
            <div className="text-[11px] font-bold text-gray-500">นักเรียน / ผู้ปกครอง</div>
            <div className="text-xl font-extrabold text-sky-700">{studentCount} คน</div>
            <div className="text-[10px] text-gray-500">ซิงค์ตารางเรียน ป.1 - ม.3</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Member Table (8 cols) + Security Policy & Audit Logs (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Member Management Table */}
        <div className="lg:col-span-8 pastel-card p-4 sm:p-5 bg-white space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-address-book text-pink-500"></i>
                <span>รายชื่อสมาชิกและการกำหนดสิทธิ์ (Member Directory & Role Assignment)</span>
              </h3>
              <p className="text-xs text-gray-500">
                สามารถเปลี่ยนระดับสิทธิ์ (Admin / ครู / นักเรียน) ผูกชั้นเรียน หรือระงับการใช้งานได้ทันที
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 text-xs">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่อ-นามสกุล, อีเมล, ชื่อผู้ใช้ หรือชั้นเรียน..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-pink-200 bg-pink-50/20 font-semibold"
              />
            </div>

            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'ALL' | UserRole)}
              aria-label="กรองตามระดับสิทธิ์"
              className="px-3 py-2 rounded-xl border border-pink-200 bg-white font-bold text-gray-700"
            >
              <option value="ALL">ทุกบทบาท ({users.length})</option>
              <option value="admin">ผู้ดูแลระบบ ({adminCount})</option>
              <option value="teacher">ครูผู้สอน ({teacherCount})</option>
              <option value="student">นักเรียน ({studentCount})</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | UserStatus)}
              aria-label="กรองตามสถานะบัญชี"
              className="px-3 py-2 rounded-xl border border-pink-200 bg-white font-bold text-gray-700"
            >
              <option value="ALL">ทุกสถานะ</option>
              <option value="active">ใช้งานปกติ (Active)</option>
              <option value="pending">รออนุมัติ (Pending)</option>
              <option value="suspended">ระงับสิทธิ์ (Suspended)</option>
            </select>
          </div>

          {/* Responsive Member List */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs min-w-[680px]">
              <thead>
                <tr className="bg-pink-50 text-gray-700 border-y border-pink-200">
                  <th className="p-2.5 text-left">สมาชิก / อีเมล</th>
                  <th className="p-2.5 text-left">ระดับสิทธิ์ (Role)</th>
                  <th className="p-2.5 text-left">ชั้นเรียน / ข้อมูลครู</th>
                  <th className="p-2.5 text-center">สถานะบัญชี</th>
                  <th className="p-2.5 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pink-100">
                {filteredUsers.map(u => {
                  const linkedTeacher = u.teacherId
                    ? appData.teachers.find(t => t.id === u.teacherId)
                    : null;
                  return (
                    <tr key={u.id} className="hover:bg-pink-50/30">
                      <td className="p-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm text-gray-800 border border-black/10 shrink-0"
                            style={{ backgroundColor: u.avatarColor || '#FFD6E0' }}
                          >
                            {u.fullName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-extrabold text-gray-900 flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {u.id === currentUser?.id && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 text-[10px]">
                                  คุณ
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {u.email} • <span className="text-purple-600">@{u.username}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-2.5">
                        {isAdmin ? (
                          <select
                            value={u.role}
                            onChange={e =>
                              handleSaveUser({
                                ...u,
                                role: e.target.value as UserRole
                              })
                            }
                            aria-label={`เปลี่ยนระดับสิทธิ์ของ ${u.fullName}`}
                            className="px-2.5 py-1.5 rounded-xl border border-purple-200 bg-white font-extrabold text-gray-800"
                          >
                            <option value="admin">🛡️ ผู้ดูแลระบบ (Admin)</option>
                            <option value="teacher">👩‍🏫 ครูผู้สอน (Teacher)</option>
                            <option value="student">🎒 นักเรียน (Student)</option>
                          </select>
                        ) : (
                          <span className="font-extrabold text-gray-800">{u.role.toUpperCase()}</span>
                        )}
                      </td>

                      <td className="p-2.5">
                        <div className="space-y-0.5">
                          {u.assignedGrade && (
                            <span className="inline-block px-2 py-0.5 rounded-lg bg-pink-100 text-pink-800 font-extrabold text-[11px]">
                              ชั้น {u.assignedGrade}
                            </span>
                          )}
                          {linkedTeacher && (
                            <div className="text-[10px] text-gray-600 font-semibold">
                              ครู: {linkedTeacher.prefix}{linkedTeacher.fullName}
                            </div>
                          )}
                          {u.studentCode && (
                            <div className="text-[10px] text-sky-700 font-semibold">
                              รหัสนักเรียน: {u.studentCode}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-2.5 text-center">
                        {isAdmin ? (
                          <select
                            value={u.status}
                            onChange={e =>
                              handleSaveUser({
                                ...u,
                                status: e.target.value as UserStatus
                              })
                            }
                            aria-label={`เปลี่ยนสถานะของ ${u.fullName}`}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                              u.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : u.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            <option value="active">ใช้งานปกติ</option>
                            <option value="pending">รออนุมัติ</option>
                            <option value="suspended">ระงับสิทธิ์</option>
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            {u.status}
                          </span>
                        )}
                      </td>

                      <td className="p-2.5 text-right">
                        {isAdmin && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingUser({ ...u })}
                              className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold"
                            >
                              <i className="fa-solid fa-pen"></i> แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold"
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Access Policy & Security Audit Logs */}
        <div className="lg:col-span-4 space-y-6">
          {/* Security & RBAC Policy Card */}
          <div className="pastel-card p-4 sm:p-5 bg-white space-y-3.5">
            <div className="border-b border-purple-100 pb-2.5">
              <h3 className="font-extrabold text-sm text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-sliders text-purple-600"></i>
                <span>ตั้งค่านโยบายสิทธิ์และความปลอดภัย (RBAC Policy)</span>
              </h3>
              <p className="text-[11px] text-gray-500">
                กำหนดขอบเขตการเข้าถึงของนักเรียน ครูผู้สอน และการซิงค์ Firebase
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-sky-50/70 border border-sky-100 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={policy.allowGuestStudentView}
                  onChange={e => handleUpdatePolicy({ allowGuestStudentView: e.target.checked })}
                  className="mt-0.5 rounded text-sky-600 w-4 h-4"
                />
                <div>
                  <div className="font-extrabold text-gray-800">
                    อนุญาตให้นักเรียน/ผู้ปกครองดูตารางเรียนได้ทันที
                  </div>
                  <div className="text-[11px] text-gray-500">
                    เปิดให้นักเรียนเข้าดูตารางเรียนแบบเรียลไทม์ได้สะดวกแม้ยังไม่ได้ล็อกอิน
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-pink-50/70 border border-pink-100 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={policy.allowTeacherTimetableEdit}
                  onChange={e => handleUpdatePolicy({ allowTeacherTimetableEdit: e.target.checked })}
                  className="mt-0.5 rounded text-pink-600 w-4 h-4"
                />
                <div>
                  <div className="font-extrabold text-gray-800">
                    อนุญาตให้บัญชี &quot;ครูผู้สอน&quot; แก้ไขและสลับคาบเรียนได้
                  </div>
                  <div className="text-[11px] text-gray-500">
                    หากปิด เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่จะแก้ไขตารางเรียนได้
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-purple-50/70 border border-purple-100 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={policy.autoApproveStudentRegistration}
                  onChange={e =>
                    handleUpdatePolicy({ autoApproveStudentRegistration: e.target.checked })
                  }
                  className="mt-0.5 rounded text-purple-600 w-4 h-4"
                />
                <div>
                  <div className="font-extrabold text-gray-800">
                    อนุมัติการสมัครสมาชิกใหม่อัตโนมัติ (Auto-Approve)
                  </div>
                  <div className="text-[11px] text-gray-500">
                    หากปิด สมาชิกที่สมัครใหม่จะต้องรอให้ Admin กดอนุมัติก่อนเข้าใช้งาน
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={policy.firebaseRealtimeSyncEnabled}
                  onChange={e =>
                    handleUpdatePolicy({ firebaseRealtimeSyncEnabled: e.target.checked })
                  }
                  className="mt-0.5 rounded text-emerald-600 w-4 h-4"
                />
                <div>
                  <div className="font-extrabold text-gray-800">
                    เปิดซิงค์ข้อมูลอัตโนมัติกับ Firebase (dpk-asset)
                  </div>
                  <div className="text-[11px] text-gray-500">
                    ซิงค์สถานะตารางเรียนและจำนวนสมาชิกลง Realtime Database อัตโนมัติ
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Audit Logs Card */}
          <div className="pastel-card p-4 sm:p-5 bg-white space-y-3">
            <div className="border-b border-pink-100 pb-2">
              <h3 className="font-extrabold text-sm text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-clock-rotate-left text-pink-500"></i>
                <span>บันทึกประวัติความปลอดภัย (Security Audit Logs)</span>
              </h3>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
              {auditLogs.map(log => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-extrabold text-[10px]">
                      {log.action}
                    </span>
                    <span className="text-[10px] font-mono text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString('th-TH')} น.
                    </span>
                  </div>
                  <div className="font-bold text-gray-800">{log.details}</div>
                  <div className="text-[10px] text-gray-500">
                    โดย: {log.actorName} ({log.actorRole})
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Member Modal */}
      {editingUser && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="pastel-card max-w-lg w-full p-5 sm:p-6 bg-white border-2 border-purple-200 space-y-4">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <h3 className="font-extrabold text-base text-gray-800">
                {editingUser.id ? 'แก้ไขข้อมูลสมาชิกและสิทธิ์' : 'เพิ่มสมาชิกใหม่เข้าสู่ระบบ'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-full bg-purple-50 text-gray-500 flex items-center justify-center"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ชื่อ - นามสกุล *</label>
                  <input
                    type="text"
                    value={editingUser.fullName || ''}
                    onChange={e => setEditingUser({ ...editingUser, fullName: e.target.value })}
                    placeholder="เช่น นางสมหญิง รักเด็กดี"
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ชื่อผู้ใช้ (Username)</label>
                  <input
                    type="text"
                    value={editingUser.username || ''}
                    onChange={e => setEditingUser({ ...editingUser, username: e.target.value })}
                    placeholder="เช่น somying"
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">อีเมล (Email) *</label>
                  <input
                    type="email"
                    value={editingUser.email || ''}
                    onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="เช่น teacher@donkaew.ac.th"
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    รหัสผ่าน (ตั้งใหม่หรือเว้นว่างไว้)
                  </label>
                  <input
                    type="text"
                    value={editingUser.password || ''}
                    onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                    placeholder="กำหนดรหัสผ่าน"
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ระดับสิทธิ์ (Role)</label>
                  <select
                    value={editingUser.role || 'student'}
                    onChange={e =>
                      setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-bold bg-white"
                  >
                    <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                    <option value="teacher">ครูผู้สอน (Teacher)</option>
                    <option value="student">นักเรียน (Student)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">สถานะบัญชี</label>
                  <select
                    value={editingUser.status || 'active'}
                    onChange={e =>
                      setEditingUser({ ...editingUser, status: e.target.value as UserStatus })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-bold bg-white"
                  >
                    <option value="active">ใช้งานปกติ (Active)</option>
                    <option value="pending">รออนุมัติ (Pending)</option>
                    <option value="suspended">ระงับสิทธิ์ (Suspended)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ระดับชั้นที่สังกัด</label>
                  <select
                    value={editingUser.assignedGrade || 'ป.1'}
                    onChange={e =>
                      setEditingUser({ ...editingUser, assignedGrade: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 font-bold bg-white"
                  >
                    {GRADES.map(g => (
                      <option key={g} value={g}>
                        {g} ({GRADE_FULL_NAMES[g]})
                      </option>
                    ))}
                  </select>
                </div>

                {editingUser.role === 'teacher' ? (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">ผูกกับครูในตารางสอน</label>
                    <select
                      value={editingUser.teacherId || appData.teachers[0]?.id || 'T01'}
                      onChange={e =>
                        setEditingUser({ ...editingUser, teacherId: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 font-bold bg-white"
                    >
                      {appData.teachers.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.prefix}{t.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">รหัสนักเรียน</label>
                    <input
                      type="text"
                      value={editingUser.studentCode || ''}
                      onChange={e =>
                        setEditingUser({ ...editingUser, studentCode: e.target.value })
                      }
                      placeholder="เช่น 69101"
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 font-semibold"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-purple-100">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleSaveUser(editingUser)}
                className="btn-pastel px-5 py-2 rounded-xl bg-purple-600 text-white font-extrabold text-xs"
              >
                <i className="fa-solid fa-check mr-1"></i>บันทึกข้อมูลสมาชิก
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
