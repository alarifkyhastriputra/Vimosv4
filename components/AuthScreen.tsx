
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase.ts';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set, update, get, onValue } from 'firebase/database';
import { useLanguage, Language } from '../LanguageContext.tsx';
import RobotCaptcha from './RobotCaptcha.tsx';
import { fetchClientIp, sanitizeIpKey } from '../utils/ipHelper.ts';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check IP ban
    if (isIpBanned) {
      setError(`Alamat IP Anda (${clientIp}) telah diblokir secara permanen oleh Admin. Anda tidak dapat membuat akun baru atau masuk.`);
      return;
    }

    // Check Robot Captcha
    if (!isCaptchaVerified) {
      setError('Harap centang verifikasi "Saya bukan robot" terlebih dahulu untuk melanjutkan!');
      return;
    }

    setLoading(true);
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
          return;
        }
      }

      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Record last IP on login
        if (activeIp) {
          try {
            await update(ref(db, `users/${user.uid}`), {
              lastIp: activeIp,
              lastLoginAt: Date.now()
            });
          } catch {}
        }
      } else {
        if (!username.trim()) {
          setError(t('auth_error_username'));
          setLoading(false);
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const trimmedUsername = username.trim();

        // Update profile display name in Firebase Auth
        await updateProfile(user, { displayName: trimmedUsername });

        // Save user profile directly to Realtime Database with IP info
        const userRef = ref(db, `users/${user.uid}`);
        await set(userRef, {
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
        });
      }
    } catch (err: any) {
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
          className="w-full bg-black text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:opacity-80 transition-opacity disabled:opacity-50 mt-2 shadow-xs"
        >
          {loading ? t('auth_processing') : (isLogin ? t('auth_submit_login') : t('auth_submit_register'))}
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
    </div>
  );
};

export default AuthScreen;
