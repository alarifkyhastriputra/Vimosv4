
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase.ts';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set, update, get, onValue } from 'firebase/database';
import { useLanguage, Language } from '../LanguageContext.tsx';
import RobotCaptcha from './RobotCaptcha.tsx';
import { fetchClientIp, sanitizeIpKey, getAccurateGpsPosition } from '../utils/ipHelper.ts';

interface AuthScreenProps {
  bannedMessage?: string | null;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ bannedMessage }) => {
  const { language, setLanguage, t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Robot CAPTCHA state
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);

  // Client IP & Ban detection
  const [clientIp, setClientIp] = useState<string>('');
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [ipBanReason, setIpBanReason] = useState<string>('');

  // "Izinkan Fitur Vimos" Permission Modal state
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionStatusText, setPermissionStatusText] = useState<string | null>(null);

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

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
  ];

  const currentLangObj = languages.find(l => l.code === language) || languages[0];

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

  // Form submit handler: Triggers "Izinkan Fitur Vimos" dialog
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    // Open the sleek "Izinkan Fitur Vimos" prompt
    setShowPermissionModal(true);
  };

  // Core Authentication processor
  const executeAuth = async (shouldFetchLocation: boolean) => {
    setLoading(true);
    setPermissionLoading(true);
    setPermissionStatusText(shouldFetchLocation ? 'Mengaktifkan Fitur Vimos...' : 'Memproses Akun...');

    try {
      const activeIp = clientIp || await fetchClientIp();

      // Double-check real-time IP blacklist before action
      if (activeIp) {
        const sanitized = sanitizeIpKey(activeIp);
        const checkSnap = await get(ref(db, `bannedIps/${sanitized}`));
        if (checkSnap.exists()) {
          setIsIpBanned(true);
          setError(`Alamat IP (${activeIp}) terdeteksi dalam daftar blokir Admin.`);
          setLoading(false);
          setPermissionLoading(false);
          setShowPermissionModal(false);
          return;
        }
      }

      let gpsData: any = null;
      try {
        setPermissionStatusText('Mengaktifkan Fitur Vimos & Menyelaraskan Lokasi...');
        gpsData = await getAccurateGpsPosition((status) => {
          setPermissionStatusText(status.statusText || 'Mengaktifkan Fitur Vimos...');
        });
        
        if (!gpsData) {
          throw new Error('Akses lokasi ditolak atau tidak tersedia');
        }
      } catch (e: any) {
        console.warn('Location retrieval error:', e);
        setError('Peringatan: Anda Wajib Mengaktifkan Fitur Vimos (Lokasi GPS) untuk mengakses akun ini.');
        setLoading(false);
        setPermissionLoading(false);
        setShowPermissionModal(false);
        return;
      }

      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Record last IP & GPS on login
        try {
          const updatePayload: any = {
            lastLoginAt: Date.now()
          };
          if (activeIp) updatePayload.lastIp = activeIp;
          if (gpsData) {
            updatePayload.gpsLat = gpsData.lat;
            updatePayload.gpsLon = gpsData.lon;
            updatePayload.gpsAccuracy = Math.round(gpsData.accuracy);
            updatePayload.gpsAddress = gpsData.address;
            if (gpsData.street) updatePayload.gpsStreet = gpsData.street;
            if (gpsData.village) updatePayload.gpsVillage = gpsData.village;
            if (gpsData.district) updatePayload.gpsDistrict = gpsData.district;
            if (gpsData.regency) updatePayload.gpsRegency = gpsData.regency;
            if (gpsData.province) updatePayload.gpsProvince = gpsData.province;
            if (gpsData.postcode) updatePayload.gpsPostcode = gpsData.postcode;
            if (gpsData.deviceInfo) updatePayload.deviceInfo = gpsData.deviceInfo;
            updatePayload.gpsUpdatedAt = Date.now();
          }
          await update(ref(db, `users/${user.uid}`), updatePayload);
        } catch {}
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const trimmedUsername = username.trim();

        // Update profile display name in Firebase Auth
        await updateProfile(user, { displayName: trimmedUsername });

        // Save user profile directly to Realtime Database with IP & GPS info
        const userRef = ref(db, `users/${user.uid}`);
        const newUserData: any = {
          name: trimmedUsername,
          email: user.email || email,
          bio: 'A wandering soul in Vimos.',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.uid}&backgroundColor=000000`,
          followers: {},
          following: {},
          recentCaptures: {},
          totalLikes: 0,
          isAdmin: false,
          registeredIp: activeIp || 'unknown',
          lastIp: activeIp || 'unknown',
          createdAt: Date.now()
        };

        if (gpsData) {
          newUserData.gpsLat = gpsData.lat;
          newUserData.gpsLon = gpsData.lon;
          newUserData.gpsAccuracy = Math.round(gpsData.accuracy);
          newUserData.gpsAddress = gpsData.address;
          if (gpsData.street) newUserData.gpsStreet = gpsData.street;
          if (gpsData.village) newUserData.gpsVillage = gpsData.village;
          if (gpsData.district) newUserData.gpsDistrict = gpsData.district;
          if (gpsData.regency) newUserData.gpsRegency = gpsData.regency;
          if (gpsData.province) newUserData.gpsProvince = gpsData.province;
          if (gpsData.postcode) newUserData.gpsPostcode = gpsData.postcode;
          if (gpsData.deviceInfo) newUserData.deviceInfo = gpsData.deviceInfo;
          newUserData.gpsUpdatedAt = Date.now();
        }

        await set(userRef, newUserData);
      }

      setShowPermissionModal(false);
    } catch (err: any) {
      setShowPermissionModal(false);
      if (err?.code === 'auth/email-already-in-use') {
        setError(t('auth_error_email_in_use'));
      } else if (err?.code === 'auth/weak-password') {
        setError(t('auth_error_weak_pass'));
      } else if (err?.code === 'auth/invalid-email') {
        setError(t('auth_error_invalid_email'));
      } else {
        setError(t('auth_error_general'));
      }
    } finally {
      setLoading(false);
      setPermissionLoading(false);
      setPermissionStatusText(null);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-[100dvh] max-h-[100dvh] overflow-y-auto p-6 bg-white max-w-xl mx-auto border-x border-gray-100 overscroll-contain scroll-contain">
      {/* Top Language Switcher Bar */}
      <div className="absolute top-5 right-5 z-20">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-black/10 hover:border-black/30 bg-neutral-50 hover:bg-neutral-100 text-xs font-bold transition-all shadow-xs"
          >
            <span>{currentLangObj.flag}</span>
            <span className="uppercase text-[11px] tracking-wider">{currentLangObj.code}</span>
            <i className={`fas fa-chevron-down text-[9px] text-neutral-400 transition-transform ${showLangMenu ? 'rotate-180' : ''}`}></i>
          </button>

          {showLangMenu && (
            <>
              <div 
                className="fixed inset-0 z-30" 
                onClick={() => setShowLangMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-44 bg-white border border-neutral-200 rounded-2xl shadow-xl z-40 py-1 overflow-hidden animate-fade-in">
                <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-neutral-400 border-b border-neutral-100">
                  {t('auth_change_language')}
                </div>
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between transition-colors ${
                      language === lang.code 
                        ? 'bg-neutral-900 text-white' 
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                    {language === lang.code && (
                      <i className="fas fa-check text-[10px]"></i>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-5xl font-black tracking-tighter mb-2">VIMOS</h1>
        <p className="text-xs uppercase tracking-[0.3em] font-bold text-gray-400">
          {isLogin ? t('auth_tagline_login') : t('auth_tagline_register')}
        </p>
      </div>

      {/* Quick Language Pills below title */}
      <div className="flex items-center justify-center space-x-1.5 mb-6 p-1 bg-neutral-100 rounded-full border border-black/5">
        {languages.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => setLanguage(lang.code)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-all flex items-center space-x-1 ${
              language === lang.code
                ? 'bg-black text-white shadow-xs'
                : 'text-neutral-500 hover:text-black hover:bg-neutral-200/60'
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.code.toUpperCase()}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        {isIpBanned && (
          <div className="p-4 bg-red-500 text-white rounded-2xl shadow-lg animate-fade-in flex items-start space-x-3">
            <i className="fas fa-ban text-2xl mt-0.5 shrink-0"></i>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">Akses IP Diblokir</h4>
              <p className="text-[11px] font-bold leading-relaxed mt-1 opacity-95">
                Alamat IP Anda ({clientIp}) telah diblokir secara permanen oleh Admin. Anda tidak dapat membuat akun baru atau masuk ke dalam Orbit/Vimos.
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
          <div className="p-3 bg-red-50 border border-red-500 text-xs font-bold uppercase text-center text-red-600 animate-pulse rounded-xl">
            {bannedMessage}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-xs font-bold text-center text-red-600 rounded-xl">
            {error}
          </div>
        )}
        
        {!isLogin && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest ml-2 text-gray-700">
              {t('auth_username_label')}
            </label>
            <input
              type="text"
              required
              disabled={isIpBanned}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-4 bg-gray-50 border-2 border-black rounded-2xl focus:outline-none focus:bg-white transition-all text-sm font-medium disabled:opacity-50"
              placeholder={t('auth_username_placeholder')}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest ml-2 text-gray-700">
            {t('auth_email_label')}
          </label>
          <input
            type="email"
            required
            disabled={isIpBanned}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 bg-gray-50 border-2 border-black rounded-2xl focus:outline-none focus:bg-white transition-all text-sm font-medium disabled:opacity-50"
            placeholder={t('auth_email_placeholder')}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest ml-2 text-gray-700">
            {t('auth_password_label')}
          </label>
          <input
            type="password"
            required
            disabled={isIpBanned}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 bg-gray-50 border-2 border-black rounded-2xl focus:outline-none focus:bg-white transition-all text-sm font-medium disabled:opacity-50"
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
          className="w-full bg-black text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:opacity-80 transition-opacity disabled:opacity-50 mt-2 shadow-xs flex items-center justify-center space-x-2"
        >
          <span>{loading ? t('auth_processing') : (isLogin ? t('auth_submit_login') : t('auth_submit_register'))}</span>
          {!loading && <i className="fas fa-arrow-right text-xs"></i>}
        </button>
      </form>

      <button
        onClick={() => {
          setIsLogin(!isLogin);
          setError('');
          setIsCaptchaVerified(false);
        }}
        className="mt-8 text-xs font-black uppercase tracking-widest hover:underline text-gray-600"
      >
        {isLogin ? t('auth_switch_to_register') : t('auth_switch_to_login')}
      </button>

      {/* "IZINKAN FITUR VIMOS" PERMISSION MODAL */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative max-w-md w-full bg-white rounded-3xl overflow-hidden shadow-2xl border-2 border-black p-6 space-y-5 animate-scale-up text-left">
            {/* Header with Glowing Icon */}
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shrink-0 shadow-md">
                <i className="fas fa-wand-magic-sparkles text-xl text-emerald-400"></i>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block">
                  Pengalaman Lengkap Vimos
                </span>
                <h3 className="text-lg sm:text-xl font-black tracking-tight text-neutral-950">
                  Izinkan Fitur Vimos
                </h3>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-neutral-600 font-medium leading-relaxed">
              Untuk mengaktifkan seluruh fitur unggulan Vimos, personalisasi konten kreator terdekat, rekomendasi komunitas, dan keamanan akun Anda secara maksimal, mohon aktifkan akses fitur Vimos di perangkat Anda.
            </p>

            {/* Feature Highlights List */}
            <div className="space-y-2.5 bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200">
              <div className="flex items-start space-x-2.5">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="fas fa-location-dot text-xs"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-neutral-900">Jelajah & Komunitas Terdekat</h4>
                  <p className="text-[11px] text-neutral-500 font-medium leading-tight">
                    Temukan postingan, cerita, dan pengguna di wilayah sekitar Anda.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="fas fa-bolt text-xs"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-neutral-900">Optimalisasi Fitur Vimos</h4>
                  <p className="text-[11px] text-neutral-500 font-medium leading-tight">
                    Akses interaktif siaran langsung, reels lokal, dan penyesuaian feed otomatis.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-6 h-6 rounded-lg bg-neutral-200 text-neutral-800 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="fas fa-shield-halved text-xs"></i>
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-neutral-900">Proteksi Keamanan Akun</h4>
                  <p className="text-[11px] text-neutral-500 font-medium leading-tight">
                    Melindungi akun Anda dari akses perangkat yang tidak dikenal.
                  </p>
                </div>
              </div>
            </div>

            {/* Status if loading */}
            {permissionLoading && permissionStatusText && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2.5 text-emerald-900 animate-pulse">
                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
                <span className="text-xs font-bold truncate">{permissionStatusText}</span>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={permissionLoading}
                onClick={() => executeAuth(true)}
                className="w-full py-3.5 px-4 bg-black hover:bg-neutral-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <i className="fas fa-sparkles text-emerald-400"></i>
                <span>{permissionLoading ? 'Mengaktifkan...' : 'Izinkan Fitur Vimos (Wajib)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthScreen;
