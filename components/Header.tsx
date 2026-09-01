
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { useLanguage } from '../LanguageContext';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

interface HeaderProps {
  onSearch: (term: string) => void;
  users: User[];
  onUserClick: (userId: string) => void;
  onLeaderboardClick: () => void;
  onShopClick?: () => void;
  onAIClick?: () => void;
  isAdmin?: boolean;
  onAdminClick?: () => void;
  userCoins?: number;
}

const Header: React.FC<HeaderProps> = ({ 
  onSearch, 
  users, 
  onUserClick, 
  onLeaderboardClick, 
  onShopClick,
  onAIClick,
  isAdmin, 
  onAdminClick,
  userCoins = 500
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [botName, setBotName] = useState('vimos.ai');
  const [botAvatar, setBotAvatar] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const configRef = ref(db, 'appConfig');
    const unsub = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val) {
          if (typeof val.aiBotName === 'string' && val.aiBotName.trim()) {
            setBotName(val.aiBotName.trim());
          } else {
            setBotName('vimos.ai');
          }
          if (typeof val.aiBotAvatar === 'string') {
            setBotAvatar(val.aiBotAvatar.trim());
          } else {
            setBotAvatar('');
          }
          return;
        }
      }
      setBotName('vimos.ai');
      setBotAvatar('');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (query.trim().length > 0) {
      const filtered = users.filter(u => 
        (u.name || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);
      setResults(filtered);
    } else {
      setResults([]);
    }
    onSearch(query);
  }, [query, users, onSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (uid: string) => {
    onUserClick(uid);
    setQuery('');
    setResults([]);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 border-b border-black/10 px-3.5 py-2.5 backdrop-blur-md shadow-xs">
      <div className="flex items-center w-full justify-between gap-2 max-w-4xl mx-auto">
        <div className="flex items-center shrink-0 cursor-pointer" onClick={() => onSearch('')}>
          <h1 className="text-lg font-black tracking-tighter text-black">VIMOS</h1>
        </div>

        <div className="flex-1 relative min-w-0" ref={dropdownRef}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <i className="fas fa-search text-xs"></i>
          </span>
          <input
            type="search"
            value={query}
            placeholder={t('search')}
            className="w-full bg-neutral-100/90 border border-transparent focus:border-black/20 focus:bg-white rounded-full pl-8 pr-3 py-1.5 text-xs text-black placeholder-neutral-400 focus:outline-none transition-all shadow-inner"
            onChange={(e) => setQuery(e.target.value)}
          />

          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-black rounded-2xl shadow-2xl overflow-hidden animate-fade-in z-50">
              <div className="p-2 border-b border-black/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">{t('found_shadows')}</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {results.map(user => {
                  const fallbackPhoto = `https://api.dicebear.com/7.x/initials/svg?seed=${user.name || 'Orbit'}&backgroundColor=000000&fontFamily=Inter&fontWeight=700`;
                  return (
                    <div 
                      key={user.id}
                      onClick={() => handleSelect(user.id)}
                      className="flex items-center p-3 hover:bg-black hover:text-white transition-all cursor-pointer group"
                    >
                      <img 
                        src={user.photoURL || fallbackPhoto} 
                        alt={user.name} 
                        className="w-9 h-9 rounded-full border border-black/10 mr-3 group-hover:border-white/20 object-cover" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs truncate uppercase tracking-tight">{user.name || 'Unknown'}</p>
                        <p className="text-[9px] font-medium opacity-50 truncate">{(user.followers || []).length} Following</p>
                      </div>
                      <i className="fas fa-arrow-right text-xs opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all"></i>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center shrink-0 space-x-1.5">
          {onAIClick && (
            <button
              onClick={onAIClick}
              className="h-8 px-2.5 flex items-center justify-center space-x-1.5 border border-emerald-500/60 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-full transition-all active:scale-90 shadow-xs"
              title={`Chat ${botName}`}
            >
              {botAvatar ? (
                <img src={botAvatar} alt={botName} className="w-4 h-4 rounded-full object-cover ring-1 ring-emerald-400" />
              ) : (
                <i className="fas fa-robot text-xs text-emerald-600 animate-pulse"></i>
              )}
              <span className="text-[10px] font-black uppercase text-emerald-950 hidden xs:inline sm:inline max-w-[80px] truncate">{botName}</span>
            </button>
          )}

          <button 
            onClick={onLeaderboardClick}
            className="w-8 h-8 flex items-center justify-center border border-neutral-300 rounded-full hover:bg-black hover:text-white transition-all active:scale-90 text-neutral-800"
            title="Elite Rankings"
          >
            <i className="fas fa-medal text-xs"></i>
          </button>

          {onShopClick && (
            <button 
              onClick={onShopClick}
              className="h-8 px-2 sm:px-3 flex items-center justify-center space-x-1 border border-neutral-900 bg-yellow-400 hover:bg-yellow-300 text-black rounded-full transition-all active:scale-90 shadow-xs"
              title={t('shop')}
            >
              <i className="fas fa-store text-xs"></i>
              <span className="text-[10px] font-black uppercase hidden sm:inline">{t('shop')}</span>
            </button>
          )}

          {isAdmin && (
            <button 
              onClick={onAdminClick}
              className="w-8 h-8 flex items-center justify-center border border-black bg-black text-white rounded-full hover:bg-white hover:text-black transition-all active:scale-90 shadow-xs"
              title={t('admin')}
            >
              <i className="fas fa-shield-halved text-xs"></i>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
