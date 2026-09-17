
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase.ts';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { ref, set, update, get, onValue } from 'firebase/database';
import { useLanguage } from '../LanguageContext.tsx';
import RobotCaptcha from './RobotCaptcha.tsx';
import { fetchClientIp, sanitizeIpKey } from '../utils/ipHelper.ts';

interface AuthScreenProps {
  bannedMessage?: string | null;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ bannedMessage }) => {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtherOptions, setShowOtherOptions] = useState(false);

  // Robot CAPTCHA state
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);

  // Client IP & Ban detection
  const [clientIp, setClientIp] = useState<string>('');
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [ipBanReason, setIpBanReason] = useState<string>('');

  // Password Reset / Recovery Modal States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetchClientIp().then((ip) => {
      if (!isMounted || !ip) return;
      setClientIp(ip);

      const sanitized = sanitizeIpKey(ip);
      const ipBanRef = ref(db, `bannedIps/${sanitized}`);
      
      const unsub = onValue(ipBanRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          setIsIpBanned(true);
          setIpBanReason(val?.reason || 'Pelanggaran ketentuan layanan');
        } else {
          setIsIpBanned(false);
          setIpBanReason('');
        }
      });

      return () => unsub();
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Validate form before asking for permission or processing
  const validateForm = (): boolean => {
    setError('');

    if (isIpBanned) {
      setError(`Alamat IP Anda (${clientIp}) telah diblokir secara permanen oleh Admin.`);
      return false;
    }

    if (!email.trim() || !password.trim()) {
      setError('Email dan kata sandi wajib diisi!');
      return false;
    }

    if (!isLogin && !username.trim()) {
      setError(t('auth_error_username'));
      return false;
    }

    if (!isCaptchaVerified) {
      setError('Harap centang verifikasi "Saya bukan robot" terlebih dahulu untuk melanjutkan!');
      return false;
    }

    return true;
  };

  // Direct Form Submit (No blocking permission popup)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      const activeIp = clientIp || await fetchClientIp();

      // Check real-time IP blacklist before action
      if (activeIp) {
        const sanitized = sanitizeIpKey(activeIp);
        const checkSnap = await get(ref(db, `bannedIps/${sanitized}`));
        if (checkSnap.exists()) {
          setIsIpBanned(true);
          setError(`Alamat IP (${activeIp}) terdeteksi dalam daftar blokir Admin.`);
          setLoading(false);
          return;
        }
      }

      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Record last IP on login
        try {
          const updatePayload: any = {
            lastLoginAt: Date.now()
          };
          if (activeIp) updatePayload.lastIp = activeIp;
          await update(ref(db, `users/${user.uid}`), updatePayload);
        } catch {}
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const trimmedUsername = username.trim();

        // Update profile display name in Firebase Auth
        await updateProfile(user, { displayName: trimmedUsername });

        // Generate serial code & recovery key for new user
        const randomSerial = 'ORB-' + Math.floor(100000 + Math.random() * 900000);
        const randomRecovery = Math.random().toString(36).substring(2, 12).toUpperCase();

        // Save user profile directly to Realtime Database
        const userRef = ref(db, `users/${user.uid}`);
        const newUserData: any = {
          name: trimmedUsername,
          email: user.email || email,
          bio: 'A wandering soul in Orbit.',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.uid}&backgroundColor=000000`,
          followers: {},
          following: {},
          recentCaptures: {},
          totalLikes: 0,
          isAdmin: false,
          isVerified: false,
          serialCode: randomSerial,
          recoveryKey: randomRecovery,
          registeredIp: activeIp || 'unknown',
          lastIp: activeIp || 'unknown',
          createdAt: Date.now()
        };

        await set(userRef, newUserData);
      }
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        setError(t('auth_error_email_in_use'));
      } else if (err?.code === 'auth/weak-password') {
        setError(t('auth_error_weak_pass'));
      } else if (err?.code === 'auth/invalid-email') {
        setError(t('auth_error_invalid_email'));
      } else if (err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        setError('Email atau kata sandi tidak cocok. Silakan periksa kembali atau gunakan Lupa Password.');
      } else {
        setError(err?.message || t('auth_error_general'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Google Sign-in Handler: Grants random Serial Code & Verified status!
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const activeIp = clientIp || await fetchClientIp();
      const userRef = ref(db, `users/${user.uid}`);
      const snap = await get(userRef);

      const randomSerial = 'VMS-' + Math.floor(100000 + Math.random() * 900000);
      const randomRecovery = Math.random().toString(36).substring(2, 12).toUpperCase();

      if (!snap.exists()) {
        // Brand new account via Google: Kelebihan dapat Kode Seri Random & Otomatis Terverifikasi!
        const newUserData: any = {
          name: user.displayName || (user.email ? user.email.split('@')[0] : 'Vimos User'),
          email: user.email || '',
          bio: 'Pengguna Terverifikasi VIMOS',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.uid}&backgroundColor=000000`,
          followers: {},
          following: {},
          recentCaptures: {},
          totalLikes: 0,
          isAdmin: false,
          isVerified: true, // Kelebihan Akun Google: Terverifikasi!
          serialCode: randomSerial, // Kelebihan Akun Google: Kode Seri Random!
          authProvider: 'google',
          recoveryKey: randomRecovery,
          registeredIp: activeIp || 'unknown',
          lastIp: activeIp || 'unknown',
          createdAt: Date.now()
        };
        await set(userRef, newUserData);
      } else {
        // Existing user logging in via Google: Pastikan status Terverifikasi & punya Kode Seri
        const existingData = snap.val();
        const updates: any = {
          lastLoginAt: Date.now(),
          isVerified: true, // Google login grants verified status
          authProvider: 'google'
        };
        if (!existingData.serialCode) {
          updates.serialCode = randomSerial;
        }
        if (!existingData.recoveryKey) {
          updates.recoveryKey = randomRecovery;
        }
        if (activeIp) updates.lastIp = activeIp;
        await update(userRef, updates);
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // User intentionally closed the popup
        return;
      }
      if (err?.code === 'auth/popup-blocked') {
        setError('Jendela pop-up masuk diblokir oleh browser. Harap izinkan pop-up atau buka aplikasi di tab browser terpisah.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('Domain aplikasi belum terdaftar di Firebase Authorized Domains. Tambahkan domain ini di Firebase Console atau gunakan login email.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setError('Metode login Google belum diaktifkan di Firebase Console (Authentication > Sign-in method). Silakan aktifkan terlebih dahulu atau gunakan login email.');
      } else {
        setError('Gagal masuk dengan Google: ' + (err?.message || 'Silakan coba lagi atau gunakan opsi email.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Reset Password using Recovery Key or Email
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetMsg({ type: 'error', text: 'Email akun wajib diisi!' });
      return;
    }

    setResetLoading(true);
    setResetMsg(null);

    try {
      // Optional check recovery key against database
      if (recoveryKeyInput.trim()) {
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
          const allUsers = usersSnap.val();
          const targetEntry = Object.values(allUsers).find((u: any) => 
            u && u.email && u.email.toLowerCase() === resetEmail.trim().toLowerCase()
          ) as any;

          if (targetEntry) {
            if (targetEntry.recoveryKey && targetEntry.recoveryKey.trim().toUpperCase() !== recoveryKeyInput.trim().toUpperCase()) {
              setResetMsg({
                type: 'error',
                text: 'Recovery Key tidak cocok dengan email akun ini! Silakan periksa kembali atau kosongkan kolom key untuk kirim link email.'
              });
              setResetLoading(false);
              return;
            }
          }
        }
      }

      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetMsg({
        type: 'success',
        text: `Tautan reset password berhasil dikirim ke ${resetEmail.trim()}! Silakan periksa kotak masuk atau spam email Anda untuk memasukkan password baru.`
      });
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        setResetMsg({ type: 'error', text: 'Email tidak terdaftar di sistem.' });
      } else if (err?.code === 'auth/invalid-email') {
        setResetMsg({ type: 'error', text: 'Format email tidak valid.' });
      } else {
        setResetMsg({ type: 'error', text: 'Gagal mengirim email reset: ' + (err?.message || 'Coba lagi') });
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-[100dvh] max-h-[100dvh] overflow-y-auto p-6 bg-white max-w-xl mx-auto border-x border-gray-100 overscroll-contain scroll-contain">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-black tracking-tighter mb-2">VIMOS</h1>
        <p className="text-xs uppercase tracking-[0.3em] font-bold text-gray-400">
          {isLogin ? t('auth_tagline_login') : t('auth_tagline_register')}
        </p>
      </div>

      {/* Alert if IP is banned */}
      {isIpBanned && (
        <div className="w-full mb-5 p-4 bg-red-500 text-white rounded-2xl shadow-lg animate-fade-in flex items-start space-x-3 text-left">
          <i className="fas fa-ban text-2xl mt-0.5 shrink-0"></i>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider">Akses IP Diblokir</h4>
            <p className="text-[11px] font-bold leading-relaxed mt-1 opacity-95">
              Alamat IP Anda ({clientIp}) telah diblokir secara permanen oleh Admin. Anda tidak dapat membuat akun baru atau masuk ke dalam Vimos.
            </p>
            {ipBanReason && (
              <p className="text-[10px] font-medium mt-1 bg-black/20 px-2.5 py-1 rounded-lg inline-block">
                Alasan: {ipBanReason}
              </p>
            )}
          </div>
        </div>
      )}

      {bannedMessage && !isIpBanned && (
        <div className="w-full mb-4 p-3 bg-red-50 border border-red-500 text-xs font-bold uppercase text-center text-red-600 animate-pulse rounded-xl">
          {bannedMessage}
        </div>
      )}

      {error && (
        <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 text-xs font-bold text-center text-red-600 rounded-xl">
          {error}
        </div>
      )}

      {/* METODE PRIORITAS UTAMA: MASUK DENGAN GOOGLE (GMAIL) */}
      <div className="w-full mb-5 space-y-3">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || isIpBanned}
          className="w-full py-4 px-5 bg-black hover:bg-neutral-800 text-white border-2 border-black rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          </div>
          <span>{isLogin ? 'Masuk dengan Akun Google' : 'Daftar dengan Akun Google'}</span>
        </button>

        {/* Keunggulan Akun Google */}
        <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl flex items-center space-x-3 text-left">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <i className="fas fa-certificate text-xs text-yellow-300"></i>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-900">Perk Akun Google</span>
              <span className="text-[8px] bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">Prioritas</span>
            </div>
            <p className="text-[11px] font-bold text-neutral-600 leading-tight mt-0.5">
              Otomatis dapat <strong>Kode Seri Random</strong> &amp; status <strong>Terverifikasi (Centang Biru)</strong>!
            </p>
          </div>
        </div>
      </div>

      {/* OPSI LAIN: MASUK DENGAN EMAIL & PASSWORD (TERSEMBUNYI SECARA DEFAULT) */}
      <div className="w-full">
        <button
          type="button"
          onClick={() => setShowOtherOptions(!showOtherOptions)}
          className="w-full py-3 px-4 bg-white hover:bg-neutral-50 border-2 border-neutral-200 hover:border-black rounded-2xl text-xs font-black uppercase tracking-wider text-neutral-700 hover:text-black transition-all flex items-center justify-between cursor-pointer shadow-xs active:scale-[0.99]"
        >
          <div className="flex items-center space-x-2">
            <i className="fas fa-envelope text-neutral-400"></i>
            <span>Opsi Lain: Gunakan Email &amp; Password</span>
          </div>
          <div className="flex items-center space-x-1.5 text-[10px] font-bold text-neutral-400">
            <span>{showOtherOptions ? 'Tutup Formulir' : 'Buka Formulir'}</span>
            <i className={`fas fa-chevron-${showOtherOptions ? 'up' : 'down'} text-[9px]`}></i>
          </div>
        </button>

        {showOtherOptions && (
          <form onSubmit={handleSubmit} className="w-full space-y-4 mt-4 p-5 bg-neutral-50 border-2 border-neutral-200 rounded-3xl animate-fade-in text-left">
            <div className="pb-1 border-b border-neutral-200 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                Formulir Email &amp; Password Manual
              </span>
              <span className="text-[9px] font-bold text-neutral-400">
                {isLogin ? 'Masuk Manual' : 'Daftar Manual'}
              </span>
            </div>

            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-gray-700">
                  {t('auth_username_label')}
                </label>
                <input
                  type="text"
                  required
                  disabled={isIpBanned}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-3.5 bg-white border-2 border-neutral-300 rounded-xl focus:outline-none focus:border-black transition-all text-sm font-medium disabled:opacity-50"
                  placeholder={t('auth_username_placeholder')}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-gray-700">
                {t('auth_email_label')}
              </label>
              <input
                type="email"
                required
                disabled={isIpBanned}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3.5 bg-white border-2 border-neutral-300 rounded-xl focus:outline-none focus:border-black transition-all text-sm font-medium disabled:opacity-50"
                placeholder={t('auth_email_placeholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest ml-1 text-gray-700">
                {t('auth_password_label')}
              </label>
              <input
                type="password"
                required
                disabled={isIpBanned}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3.5 bg-white border-2 border-neutral-300 rounded-xl focus:outline-none focus:border-black transition-all text-sm font-medium disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            {/* Robot Verification CAPTCHA */}
            <RobotCaptcha
              isVerified={isCaptchaVerified}
              onVerify={(val) => {
                setIsCaptchaVerified(val);
                if (val) setError('');
              }}
              disabled={isIpBanned || loading}
            />

            <button
              type="submit"
              disabled={loading || isIpBanned}
              className="w-full bg-black text-white p-3.5 rounded-xl font-black uppercase tracking-widest hover:bg-neutral-800 transition-all disabled:opacity-50 mt-2 shadow-sm flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
            >
              <span>{loading ? t('auth_processing') : (isLogin ? t('auth_submit_login') : t('auth_submit_register'))}</span>
              {!loading && <i className="fas fa-arrow-right text-xs"></i>}
            </button>
          </form>
        )}
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
            setIsCaptchaVerified(false);
          }}
          className="text-xs font-black uppercase tracking-widest hover:underline text-gray-600"
        >
          {isLogin ? t('auth_switch_to_register') : t('auth_switch_to_login')}
        </button>
        
        <button
          className="text-xs font-black uppercase tracking-widest hover:underline text-gray-500 flex items-center space-x-1.5"
          onClick={() => {
            setResetEmail(email || '');
            setRecoveryKeyInput('');
            setResetMsg(null);
            setShowResetModal(true);
          }}
        >
          <i className="fas fa-key text-[10px]"></i>
          <span>Lupa Password / Gunakan Recovery Key</span>
        </button>
      </div>

      {/* Password Recovery Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-black space-y-4 animate-scale-up text-left">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center">
                  <i className="fas fa-shield-halved text-sm"></i>
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-tight text-neutral-900">Reset Kata Sandi</h3>
                  <p className="text-[10px] text-neutral-500 font-bold">Pulihkan akses akun dengan Recovery Key</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center text-xs"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {resetMsg && (
              <div className={`p-3 rounded-2xl text-xs font-bold leading-relaxed ${
                resetMsg.type === 'success' 
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' 
                  : 'bg-red-50 border border-red-300 text-red-700'
              }`}>
                {resetMsg.text}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-700 ml-1">
                  Email Akun Terdaftar
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full p-3.5 bg-neutral-50 border border-neutral-300 rounded-xl text-xs font-medium focus:outline-none focus:border-black"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-700">
                    Recovery Key Unik (Opsional)
                  </label>
                  <span className="text-[9px] text-neutral-400 font-bold">10 Karakter</span>
                </div>
                <input
                  type="text"
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value.toUpperCase())}
                  placeholder="Misal: 9B2KX8Z1W0"
                  className="w-full p-3.5 bg-neutral-50 border border-neutral-300 rounded-xl text-xs font-mono font-bold tracking-widest focus:outline-none focus:border-black uppercase"
                />
                <p className="text-[10px] text-neutral-500 font-medium ml-1">
                  Recovery Key dapat dilihat pada halaman profil saat Anda login. Jika tidak ingat, kosongkan untuk langsung kirim tautan reset ke email.
                </p>
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-3.5 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 shadow-md flex items-center justify-center space-x-2"
              >
                <span>{resetLoading ? 'Memeriksa & Mengirim...' : 'Kirim Tautan Reset Password'}</span>
                {!resetLoading && <i className="fas fa-paper-plane text-xs"></i>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthScreen;
