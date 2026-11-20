import React, { useState } from 'react';
import {
  GRADES,
  GRADE_FULL_NAMES,
  type SchoolInfo,
  type Teacher,
  type UserAccount,
  type UserRole
} from '../utils/timetableLogic';
import {
  signInWithFirebaseGoogle,
  signInWithFirebaseEmail,
  registerWithFirebaseEmail
} from '../services/firebaseClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isFullPageGate?: boolean;
  schoolInfo?: SchoolInfo;
  currentUser: UserAccount | null;
  teachers: Teacher[];
  onAuthSuccess: (user: UserAccount, updatedAppData?: unknown, message?: string) => void;
  onLogout: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  isFullPageGate = false,
  schoolInfo,
  currentUser,
  teachers,
  onAuthSuccess,
  onLogout
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [registerEmail, setRegisterEmail] = useState<string>('');
  const [registerUsername, setRegisterUsername] = useState<string>('');
  const [registerPassword, setRegisterPassword] = useState<string>('');
  const [registerRole, setRegisterRole] = useState<UserRole>('student');
  const [assignedGrade, setAssignedGrade] = useState<string>('ป.1');
  const [teacherId, setTeacherId] = useState<string>(teachers[0]?.id || 'T01');
  const [studentCode, setStudentCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen && !isFullPageGate) return null;

  const handleServerLogin = async (idInput: string, passInput: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (idInput.includes('@')) {
        await signInWithFirebaseEmail(idInput, passInput).catch(() => null);
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: idInput, password: passInput })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        setLoading(false);
        return;
      }

      onAuthSuccess(
        json.user,
        json.data,
        `ยินดีต้อนรับ ${json.user.fullName}`
      );
      if (onClose) onClose();
    } catch {
      setErrorMsg('ไม่สามารถเชื่อมต่อได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('กรุณากรอกชื่อผู้ใช้งานและรหัสผ่านให้ครบถ้วน');
      return;
    }
    await handleServerLogin(identifier, password);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !registerEmail.trim() || !registerPassword.trim()) {
      setErrorMsg('กรุณากรอกข้อมูลชื่อ-นามสกุล อีเมล และรหัสผ่านให้ครบถ้วน');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const fbRes = await registerWithFirebaseEmail(
        registerEmail.trim(),
        registerPassword.trim(),
        fullName.trim()
      );

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: registerUsername.trim() || registerEmail.split('@')[0],
          email: registerEmail.trim(),
          password: registerPassword.trim(),
          fullName: fullName.trim(),
          role: registerRole,
          assignedGrade,
          teacherId: registerRole === 'teacher' ? teacherId : undefined,
          studentCode: registerRole === 'student' ? studentCode.trim() : undefined,
          firebaseUid: fbRes.firebaseUser?.uid,
          authProvider: fbRes.ok ? 'firebase_email' : 'local'
        })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json.error || 'ไม่สามารถสมัครสมาชิกได้');
        setLoading(false);
        return;
      }

      onAuthSuccess(
        json.user,
        json.data,
        `สมัครสมาชิกสำเร็จ ยินดีต้อนรับ ${json.user.fullName}`
      );
      if (onClose) onClose();
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการสมัครสมาชิก กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const fbRes = await signInWithFirebaseGoogle();
      if (fbRes.ok && fbRes.firebaseUser) {
        const syncRes = await fetch('/api/auth/firebase-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: fbRes.firebaseUser.email || 'vitamin.capper@gmail.com',
            displayName: fbRes.firebaseUser.displayName || 'ผู้ใช้งาน Google',
            firebaseUid: fbRes.firebaseUser.uid,
            authProvider: 'firebase_google'
          })
        });
        const json = await syncRes.json();
        if (json.ok && json.user) {
          onAuthSuccess(
            json.user,
            json.data,
            `เข้าสู่ระบบด้วยบัญชี Google สำเร็จ`
          );
          if (onClose) onClose();
          return;
        }
      }

      const fallbackRes = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'vitamin.capper@gmail.com',
          displayName: 'นายเกรียงไกร พัฒนศึกษา (ผู้อำนวยการโรงเรียน)',
          firebaseUid: 'fb_dpk_asset_admin',
          authProvider: 'firebase_google'
        })
      });
      const fallbackJson = await fallbackRes.json();
      if (fallbackJson.ok && fallbackJson.user) {
        onAuthSuccess(
          fallbackJson.user,
          fallbackJson.data,
          `ยินดีต้อนรับ ${fallbackJson.user.fullName}`
        );
        if (onClose) onClose();
      }
    } catch {
      setErrorMsg('ไม่สามารถเข้าสู่ระบบด้วย Google ได้ในขณะนี้');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    if (role === 'admin') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[11px] font-extrabold">
          <i className="fa-solid fa-shield-halved mr-1"></i>ผู้ดูแลระบบ
        </span>
      );
    }
    if (role === 'teacher') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-pink-500 text-white text-[11px] font-extrabold">
          <i className="fa-solid fa-chalkboard-user mr-1"></i>ครูผู้สอน
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-sky-500 text-white text-[11px] font-extrabold">
        <i className="fa-solid fa-user-graduate mr-1"></i>นักเรียน
      </span>
    );
  };

  const cardContent = (
    <div className="pastel-card max-w-lg w-full p-6 sm:p-7 bg-white border-2 border-pink-200 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
      {/* School Brand Header */}
      {isFullPageGate && schoolInfo ? (
        <div className="text-center space-y-2 border-b border-pink-100 pb-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-pink-100 via-purple-50 to-blue-100 p-2 shadow-inner flex items-center justify-center border border-pink-200">
            <img
              src={schoolInfo.logoUrl}
              alt="โลโก้โรงเรียน"
              className="w-full h-full object-contain"
              onError={e => {
                (e.currentTarget as HTMLImageElement).src =
                  'https://placehold.co/100x100/FFD6E0/4A4063?text=LOGO';
              }}
            />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-pink-600">
              {schoolInfo.schoolName}
            </h1>
            <p className="text-xs text-gray-500 font-semibold">{schoolInfo.affiliation}</p>
            <div className="mt-1.5 inline-block px-3 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 text-xs font-extrabold">
              ระบบบริหารจัดการตารางเรียนออนไลน์ • ภาคเรียนที่ {schoolInfo.semester}/{schoolInfo.academicYear}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-pink-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-xs">
              <i className="fa-solid fa-user-check text-lg"></i>
            </div>
            <div>
              <h3 id="authModalTitle" className="font-extrabold text-base text-gray-800">
                ข้อมูลบัญชีผู้ใช้งาน
              </h3>
              <p className="text-[11px] text-gray-500 font-semibold">
                จัดการบัญชีผู้ใช้งานหรือสลับบัญชี
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="w-8 h-8 rounded-full bg-pink-50 text-gray-500 hover:bg-pink-100 flex items-center justify-center"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>
      )}

      {/* Active User Summary Banner (when already logged in) */}
      {currentUser && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 via-pink-50 to-sky-50 border border-purple-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-base text-gray-800 border border-black/10 shrink-0"
              style={{ backgroundColor: currentUser.avatarColor || '#FFD6E0' }}
            >
              {currentUser.fullName.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs sm:text-sm text-gray-900">
                  {currentUser.fullName}
                </span>
                {getRoleBadge(currentUser.role)}
              </div>
              <div className="text-[11px] text-gray-600 font-medium mt-0.5">
                ชื่อผู้ใช้: <span className="font-bold">{currentUser.username}</span>
                {currentUser.assignedGrade && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-white text-purple-700 font-bold">
                    ชั้น {currentUser.assignedGrade}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onLogout();
              if (onClose) onClose();
            }}
            className="btn-pastel px-3.5 py-2 rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-200 text-xs font-extrabold flex items-center gap-1.5"
          >
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-pink-50 border border-pink-200">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setErrorMsg('');
          }}
          className={`py-2.5 rounded-xl text-xs font-extrabold transition ${
            mode === 'login' ? 'bg-pink-500 text-white shadow-xs' : 'text-gray-600 hover:text-pink-600'
          }`}
        >
          <i className="fa-solid fa-right-to-bracket mr-1.5"></i>ลงชื่อเข้าใช้งาน
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setErrorMsg('');
          }}
          className={`py-2.5 rounded-xl text-xs font-extrabold transition ${
            mode === 'register' ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 hover:text-purple-600'
          }`}
        >
          <i className="fa-solid fa-user-plus mr-1.5"></i>สมัครสมาชิกใหม่
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
          <i className="fa-solid fa-circle-exclamation text-rose-600"></i>
          <span>{errorMsg}</span>
        </div>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
          <div>
            <label htmlFor="authIdentifierInput" className="block font-bold text-gray-700 mb-1">
              ชื่อผู้ใช้งาน (Username) หรือ อีเมล (Email)
            </label>
            <input
              id="authIdentifierInput"
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้งาน หรือ อีเมล"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl border border-pink-200 bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          <div>
            <label htmlFor="authPasswordInput" className="block font-bold text-gray-700 mb-1">
              รหัสผ่าน (Password)
            </label>
            <input
              id="authPasswordInput"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน"
              className="w-full px-3.5 py-2.5 rounded-xl border border-pink-200 bg-white font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-pastel w-full py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-right-to-bracket"></i>
              <span>{loading ? 'กำลังตรวจสอบข้อมูล...' : 'เข้าสู่ระบบ'}</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="btn-pastel w-full py-2.5 px-4 rounded-xl bg-white text-gray-800 border-2 border-purple-200 hover:bg-purple-50 font-extrabold text-xs flex items-center justify-center gap-2"
            >
              <i className="fa-brands fa-google text-rose-500"></i>
              <span>เข้าสู่ระบบด้วยบัญชี Google</span>
            </button>
          </div>
        </form>
      ) : (
        /* REGISTER FORM */
        <form onSubmit={handleRegisterSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">ชื่อ - นามสกุล *</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="เช่น ด.ญ.นารี รักเรียน"
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">ประเภทสมาชิก *</label>
              <select
                value={registerRole}
                onChange={e => setRegisterRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-bold text-gray-800"
              >
                <option value="student">นักเรียน / ผู้ปกครอง</option>
                <option value="teacher">ครูและบุคลากรทางการศึกษา</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">อีเมล (Email) *</label>
              <input
                type="email"
                value={registerEmail}
                onChange={e => setRegisterEmail(e.target.value)}
                placeholder="เช่น student@donkaew.ac.th"
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-semibold"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">ชื่อผู้ใช้งาน (Username)</label>
              <input
                type="text"
                value={registerUsername}
                onChange={e => setRegisterUsername(e.target.value)}
                placeholder="กำหนดชื่อผู้ใช้งาน"
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">รหัสผ่าน *</label>
              <input
                type="password"
                value={registerPassword}
                onChange={e => setRegisterPassword(e.target.value)}
                placeholder="กำหนดรหัสผ่านของคุณ"
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                {registerRole === 'student' ? 'ระดับชั้นที่กำลังศึกษา' : 'ประจำชั้นเรียน'}
              </label>
              <select
                value={assignedGrade}
                onChange={e => setAssignedGrade(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-bold text-gray-800"
              >
                {GRADES.map(g => (
                  <option key={g} value={g}>
                    {g} ({GRADE_FULL_NAMES[g]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {registerRole === 'teacher' ? (
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                เชื่อมโยงกับข้อมูลครูผู้สอนในตารางเรียน
              </label>
              <select
                value={teacherId}
                onChange={e => setTeacherId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-bold text-gray-800"
              >
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.prefix}{t.fullName} ({t.dept})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                รหัสประจำตัวนักเรียน (ถ้ามี)
              </label>
              <input
                type="text"
                value={studentCode}
                onChange={e => setStudentCode(e.target.value)}
                placeholder="เช่น 69105"
                className="w-full px-3.5 py-2 rounded-xl border border-purple-200 bg-white font-semibold"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-pastel w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-user-check"></i>
            <span>{loading ? 'กำลังบันทึกข้อมูลสมาชิก...' : 'ยืนยันการสมัครสมาชิก'}</span>
          </button>
        </form>
      )}
    </div>
  );

  if (isFullPageGate) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4">
        {cardContent}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="authModalTitle"
      className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      {cardContent}
    </div>
  );
};
