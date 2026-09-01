import React, { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';

interface RobotCaptchaProps {
  onVerify: (isVerified: boolean) => void;
  isVerified: boolean;
  disabled?: boolean;
}

interface ChallengeOption {
  id: number;
  label: string;
  icon: string;
  isCorrect: boolean;
}

const CHALLENGE_SETS = [
  {
    targetLabel: 'Kamera / Foto',
    targetIcon: 'fa-camera',
    instruction: 'Pilih semua ikon kamera fotografi:',
    items: [
      { id: 1, label: 'Kamera Digital', icon: 'fas fa-camera', isCorrect: true },
      { id: 2, label: 'Mobil', icon: 'fas fa-car', isCorrect: false },
      { id: 3, label: 'Kamera Video', icon: 'fas fa-video', isCorrect: true },
      { id: 4, label: 'Pohon', icon: 'fas fa-tree', isCorrect: false },
      { id: 5, label: 'Kamera Polaroid', icon: 'fas fa-camera-retro', isCorrect: true },
      { id: 6, label: 'Kopi', icon: 'fas fa-mug-hot', isCorrect: false },
    ]
  },
  {
    targetLabel: 'Bintang / Cahaya',
    targetIcon: 'fa-star',
    instruction: 'Pilih semua ikon bintang atau galaksi:',
    items: [
      { id: 1, label: 'Bintang', icon: 'fas fa-star', isCorrect: true },
      { id: 2, label: 'Bulan', icon: 'fas fa-moon', isCorrect: true },
      { id: 3, label: 'Sepeda', icon: 'fas fa-bicycle', isCorrect: false },
      { id: 4, label: 'Matahari', icon: 'fas fa-sun', isCorrect: true },
      { id: 5, label: 'Pesawat', icon: 'fas fa-plane', isCorrect: false },
      { id: 6, label: 'Buku', icon: 'fas fa-book', isCorrect: false },
    ]
  },
  {
    targetLabel: 'Keamanan / Kunci',
    targetIcon: 'fa-shield-halved',
    instruction: 'Pilih semua ikon keamanan dan perlindungan:',
    items: [
      { id: 1, label: 'Gembok', icon: 'fas fa-lock', isCorrect: true },
      { id: 2, label: 'Perisai', icon: 'fas fa-shield-halved', isCorrect: true },
      { id: 3, label: 'Kunci', icon: 'fas fa-key', isCorrect: true },
      { id: 4, label: 'Gitar', icon: 'fas fa-guitar', isCorrect: false },
      { id: 5, label: 'Sepatu', icon: 'fas fa-shoe-prints', isCorrect: false },
      { id: 6, label: 'Payung', icon: 'fas fa-umbrella', isCorrect: false },
    ]
  }
];

const RobotCaptcha: React.FC<RobotCaptchaProps> = ({ onVerify, isVerified, disabled = false }) => {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [challengeError, setChallengeError] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  const activeChallenge = CHALLENGE_SETS[currentSetIndex];

  const handleCheckboxClick = () => {
    if (disabled || isVerified || checking) return;

    setChecking(true);
    setChallengeError(false);

    // Random check: 50% instant fast human-check or 50% visual challenge
    const requiresVisualChallenge = true; // Always challenge or human-verify to ensure bot prevention

    setTimeout(() => {
      setChecking(false);
      if (requiresVisualChallenge) {
        // Pick random challenge set
        const nextIndex = Math.floor(Math.random() * CHALLENGE_SETS.length);
        setCurrentSetIndex(nextIndex);
        setSelectedItemIds([]);
        setShowChallengeModal(true);
      } else {
        markAsVerified();
      }
    }, 600);
  };

  const toggleItemSelection = (id: number) => {
    setChallengeError(false);
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleChallengeSubmit = () => {
    const correctIds = activeChallenge.items.filter(item => item.isCorrect).map(item => item.id);
    const isExactMatch = 
      selectedItemIds.length === correctIds.length &&
      selectedItemIds.every(id => correctIds.includes(id));

    if (isExactMatch) {
      setShowChallengeModal(false);
      markAsVerified();
    } else {
      setChallengeError(true);
      // Switch to another challenge set on error
      setTimeout(() => {
        const nextIndex = (currentSetIndex + 1) % CHALLENGE_SETS.length;
        setCurrentSetIndex(nextIndex);
        setSelectedItemIds([]);
        setChallengeError(false);
      }, 900);
    }
  };

  const markAsVerified = () => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setVerifiedAt(timeStr);
    onVerify(true);
  };

  const handleRefreshChallenge = () => {
    const nextIndex = (currentSetIndex + 1) % CHALLENGE_SETS.length;
    setCurrentSetIndex(nextIndex);
    setSelectedItemIds([]);
    setChallengeError(false);
  };

  return (
    <div className="w-full my-2">
      <div 
        onClick={handleCheckboxClick}
        className={`w-full p-3.5 bg-neutral-50/90 hover:bg-neutral-100/90 border-2 rounded-2xl transition-all cursor-pointer select-none flex items-center justify-between shadow-2xs ${
          isVerified 
            ? 'border-emerald-500 bg-emerald-50/40' 
            : 'border-neutral-200 hover:border-neutral-400'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex items-center space-x-3">
          {/* Checkbox box */}
          <div className="relative flex items-center justify-center">
            {checking ? (
              <div className="w-6 h-6 border-3 border-neutral-300 border-t-neutral-800 rounded-full animate-spin"></div>
            ) : isVerified ? (
              <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-xs animate-scale-up">
                <i className="fas fa-check text-xs"></i>
              </div>
            ) : (
              <div className="w-6 h-6 bg-white border-2 border-neutral-300 rounded-lg hover:border-neutral-600 transition-colors flex items-center justify-center shadow-2xs"></div>
            )}
          </div>

          <div className="flex flex-col">
            <span className={`text-xs font-black tracking-tight ${isVerified ? 'text-emerald-800' : 'text-neutral-800'}`}>
              {isVerified ? 'Saya bukan robot' : 'Saya bukan robot'}
            </span>
            <span className="text-[9px] font-bold text-neutral-400">
              {isVerified && verifiedAt ? `Terverifikasi aman • ${verifiedAt}` : 'Verifikasi keamanan anti-spam'}
            </span>
          </div>
        </div>

        {/* Orbit / Shield logo */}
        <div className="flex flex-col items-center justify-center pl-2 border-l border-neutral-200/80 text-neutral-400">
          <i className={`fas fa-shield-halved text-lg mb-0.5 ${isVerified ? 'text-emerald-500' : 'text-neutral-400'}`}></i>
          <span className="text-[7px] font-black uppercase tracking-widest leading-none text-neutral-500">
            Orbit Shield
          </span>
        </div>
      </div>

      {/* Challenge Interactive Modal */}
      {showChallengeModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border-2 border-neutral-200 animate-scale-up flex flex-col">
            {/* Header */}
            <div className="bg-neutral-900 text-white p-3.5 rounded-2xl mb-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Verifikasi Manusia</p>
                <h4 className="text-xs font-black text-white">{activeChallenge.instruction}</h4>
              </div>
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
                <i className={`fas ${activeChallenge.targetIcon} text-sm`}></i>
              </div>
            </div>

            {challengeError && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider text-center animate-shake">
                Pilihan belum tepat. Silakan coba kembali!
              </div>
            )}

            {/* 6 Grid items */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {activeChallenge.items.map((item) => {
                const isSelected = selectedItemIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItemSelection(item.id)}
                    className={`aspect-square rounded-2xl border-2 p-2 flex flex-col items-center justify-center transition-all relative ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 scale-[0.98] shadow-xs' 
                        : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    <i className={`${item.icon} text-2xl mb-1.5`}></i>
                    <span className="text-[9px] font-bold text-center leading-tight">{item.label}</span>
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[9px]">
                        <i className="fas fa-check"></i>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleRefreshChallenge}
                  className="w-8 h-8 rounded-xl border border-neutral-200 hover:bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs transition-colors"
                  title="Ganti tantangan"
                >
                  <i className="fas fa-rotate-right"></i>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowChallengeModal(false);
                    setSelectedItemIds([]);
                  }}
                  className="px-3 py-1.5 rounded-xl text-neutral-500 hover:text-neutral-900 text-xs font-bold transition-colors"
                >
                  Batal
                </button>
              </div>

              <button
                type="button"
                onClick={handleChallengeSubmit}
                disabled={selectedItemIds.length === 0}
                className="bg-black hover:bg-neutral-800 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs flex items-center space-x-1.5"
              >
                <span>Verifikasi</span>
                <i className="fas fa-arrow-right text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RobotCaptcha;
