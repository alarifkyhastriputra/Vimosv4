import React, { useState, useEffect, useRef } from 'react';
import { User, Announcement, BannedIpRecord } from '../types';
import { db } from '../firebase';
import { ref, onValue, set, remove, update } from 'firebase/database';
import { AI_AVATAR_PRESETS } from './HengkurAIChat';
import { sanitizeIpKey } from '../utils/ipHelper';
import IpLocationModal from './IpLocationModal';

interface AdminPanelProps {
  users: User[];
  announcements: Announcement[];
  onAddAnnouncement: (text: string) => void;
  onUpdateAnnouncement: (id: string, text: string) => void;
  onDeleteAnnouncement: (id: string) => void;
  onSetRole: (userId: string, role: string, color?: string) => void;
  onBanUser: (userId: string) => void;
  onToggleAdmin?: (userId: string, currentStatus: boolean) => void;
  onUserClick: (uid: string) => void;
}

const PRESET_COLORS = [
  '#000000', '#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#6B7280', '#06B6D4', '#00000000'
];

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  users, announcements, onAddAnnouncement, onUpdateAnnouncement, onDeleteAnnouncement, onSetRole, onBanUser, onToggleAdmin, onUserClick 
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'broadcast' | 'aibot' | 'ipshield'>('users');
  const [adminSearch, setAdminSearch] = useState('');
  const [editingRoleUser, setEditingRoleUser] = useState<User | null>(null);
  const [newRoleValue, setNewRoleValue] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#000000');
  
  const [broadcastText, setBroadcastText] = useState('');
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);

  // IP Ban Shield States
  const [bannedIps, setBannedIps] = useState<BannedIpRecord[]>([]);
  const [manualIpInput, setManualIpInput] = useState('');
  const [manualIpReason, setManualIpReason] = useState('Pelanggaran spam/bot akun');
  const [ipSearch, setIpSearch] = useState('');
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [ipActionSuccess, setIpActionSuccess] = useState<string | null>(null);

  // IP Geolocation & Maps Modal Inspection State
  const [inspectingIpData, setInspectingIpData] = useState<{
    ip: string;
    userName?: string;
    userEmail?: string;
    userPhoto?: string;
    isBanned?: boolean;
    gpsLat?: number;
    gpsLon?: number;
    gpsAccuracy?: number;
    gpsAddress?: string;
    gpsStreet?: string;
    gpsVillage?: string;
    gpsDistrict?: string;
    gpsRegency?: string;
    gpsProvince?: string;
    gpsPostcode?: string;
    gpsUpdatedAt?: number; deviceInfo?: any;
  } | null>(null);

  // Quick IP Geolocation Search input in IP Shield
  const [quickLookupIp, setQuickLookupIp] = useState('');

  // AI Bot Admin Management
  const [botName, setBotName] = useState('vimos.ai');
  const [botAvatar, setBotAvatar] = useState('');
  const [botBio, setBotBio] = useState('Asisten Cerdas Resmi Vimos • Online 24/7');

  const [editingBotNameInput, setEditingBotNameInput] = useState('vimos.ai');
  const [editingBotAvatarInput, setEditingBotAvatarInput] = useState('');
  const [editingBotBioInput, setEditingBotBioInput] = useState('Asisten Cerdas Resmi Vimos • Online 24/7');

  const [botSaveSuccess, setBotSaveSuccess] = useState(false);
  const [isSavingBot, setIsSavingBot] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Listen to banned IPs in real time
    const bannedIpsRef = ref(db, 'bannedIps');
    const unsubBanned = onValue(bannedIpsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: BannedIpRecord[] = Object.entries(data).map(([key, val]: [string, any]) => ({
          sanitizedIp: key,
          ip: val.ip || key.replace(/_/g, '.'),
          bannedAt: val.bannedAt || Date.now(),
          reason: val.reason || 'Diblokir oleh Administrator',
          bannedBy: val.bannedBy || 'Admin',
          associatedUserId: val.associatedUserId,
          associatedUserEmail: val.associatedUserEmail,
          associatedUserName: val.associatedUserName
        }));
        setBannedIps(list.sort((a, b) => b.bannedAt - a.bannedAt));
      } else {
        setBannedIps([]);
      }
    });

    const configRef = ref(db, 'appConfig');
    const unsubConfig = onValue(configRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val) {
          const loadedName = typeof val.aiBotName === 'string' && val.aiBotName.trim() ? val.aiBotName.trim() : 'vimos.ai';
          const loadedAvatar = typeof val.aiBotAvatar === 'string' ? val.aiBotAvatar.trim() : '';
          const loadedBio = typeof val.aiBotBio === 'string' && val.aiBotBio.trim() ? val.aiBotBio.trim() : 'Asisten Cerdas Resmi Vimos • Online 24/7';

          setBotName(loadedName);
          setBotAvatar(loadedAvatar);
          setBotBio(loadedBio);

          setEditingBotNameInput(loadedName);
          setEditingBotAvatarInput(loadedAvatar);
          setEditingBotBioInput(loadedBio);
          return;
        }
      }
      setBotName('vimos.ai');
      setBotAvatar('');
      setBotBio('Asisten Cerdas Resmi Vimos • Online 24/7');
    });
    return () => {
      unsubBanned();
      unsubConfig();
    };
  }, []);

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const handleBanUserAndIp = async (targetUser: User) => {
    const targetIp = targetUser.lastIp || targetUser.registeredIp;
    if (!targetIp || targetIp === 'unknown') {
      const confirmBan = window.confirm(`Pengguna ${targetUser.name} belum memiliki IP yang tercatat. Tetap blokir akun?`);
      if (confirmBan) onBanUser(targetUser.id);
      return;
    }

    const sanitized = sanitizeIpKey(targetIp);
    const isAlreadyBanned = bannedIps.some(b => b.sanitizedIp === sanitized || b.ip === targetIp);

    if (isAlreadyBanned) {
      const confirmUnban = window.confirm(`Alamat IP ${targetIp} milik ${targetUser.name} saat ini diblokir. Apakah Anda ingin membuka blokir IP ini?`);
      if (confirmUnban) {
        await remove(ref(db, `bannedIps/${sanitized}`));
        await update(ref(db, `users/${targetUser.id}`), { isBanned: false });
        setIpActionSuccess(`Blokir IP ${targetIp} berhasil dicabut.`);
        setTimeout(() => setIpActionSuccess(null), 3000);
      }
      return;
    }

    const reason = window.prompt(`Masukkan alasan pemblokiran IP untuk ${targetUser.name} (${targetIp}):`, 'Pelanggaran spam/bot akun');
    if (reason === null) return;

    try {
      await set(ref(db, `bannedIps/${sanitized}`), {
        ip: targetIp,
        sanitizedIp: sanitized,
        bannedAt: Date.now(),
        bannedBy: 'Admin Command Center',
        reason: reason || 'Diblokir oleh Administrator',
        associatedUserId: targetUser.id,
        associatedUserName: targetUser.name,
        associatedUserEmail: targetUser.email
      });
      await update(ref(db, `users/${targetUser.id}`), { isBanned: true });
      setIpActionSuccess(`Alamat IP ${targetIp} dan Akun ${targetUser.name} berhasil diblokir total!`);
      setTimeout(() => setIpActionSuccess(null), 4000);
    } catch (e) {
      alert('Gagal memproses pemblokiran IP.');
    }
  };

  const handleManualBanIp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedIp = manualIpInput.trim();
    if (!trimmedIp) return;

    const sanitized = sanitizeIpKey(trimmedIp);
    try {
      await set(ref(db, `bannedIps/${sanitized}`), {
        ip: trimmedIp,
        sanitizedIp: sanitized,
        bannedAt: Date.now(),
        bannedBy: 'Admin Manual Shield',
        reason: manualIpReason.trim() || 'Diblokir manual oleh Admin',
      });
      setManualIpInput('');
      setIpActionSuccess(`Alamat IP ${trimmedIp} berhasil ditambahkan ke daftar blokir permanen.`);
      setTimeout(() => setIpActionSuccess(null), 4000);
    } catch (e) {
      alert('Gagal menambahkan IP ke daftar blokir.');
    }
  };

  const handleUnbanIp = async (sanitizedKey: string, rawIp: string) => {
    if (!window.confirm(`Yakin ingin membuka blokir alamat IP ${rawIp}? Pengguna dari IP ini akan dapat mengakses kembali.`)) return;

    try {
      await remove(ref(db, `bannedIps/${sanitizedKey}`));
      setIpActionSuccess(`Alamat IP ${rawIp} berhasil dihapus dari blacklist.`);
      setTimeout(() => setIpActionSuccess(null), 3000);
    } catch (e) {
      alert('Gagal membuka blokir IP.');
    }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar yang valid (JPG, PNG, WebP).');
      return;
    }

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setEditingBotAvatarInput(compressedDataUrl);
        }
        setIsUploadingAvatar(false);
      };
      img.onerror = () => {
        setIsUploadingAvatar(false);
        alert('Gagal memproses gambar.');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBotProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editingBotNameInput.trim() || 'vimos.ai';
    const trimmedAvatar = editingBotAvatarInput.trim();
    const trimmedBio = editingBotBioInput.trim() || 'Asisten Cerdas Resmi Vimos • Online 24/7';

    setIsSavingBot(true);
    try {
      await set(ref(db, 'appConfig/aiBotName'), trimmedName);
      await set(ref(db, 'appConfig/aiBotAvatar'), trimmedAvatar);
      await set(ref(db, 'appConfig/aiBotBio'), trimmedBio);

      setBotName(trimmedName);
      setBotAvatar(trimmedAvatar);
      setBotBio(trimmedBio);
      setBotSaveSuccess(true);
      setTimeout(() => setBotSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving AI bot profile:', err);
      alert('Gagal menyimpan profil bot AI. Silakan coba lagi.');
    } finally {
      setIsSavingBot(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const safeSearch = (adminSearch || '').toLowerCase();
    return (u.name || '').toLowerCase().includes(safeSearch) || (u.email || '').toLowerCase().includes(safeSearch);
  });

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    if (editingAnnId) {
      onUpdateAnnouncement(editingAnnId, broadcastText);
      setEditingAnnId(null);
    } else {
      onAddAnnouncement(broadcastText);
    }
    setBroadcastText('');
  };

  const startEditAnn = (ann: Announcement) => {
    setEditingAnnId(ann.id);
    setBroadcastText(ann.text);
  };

  return (
    <div className="p-6 pb-24 animate-fade-in relative max-w-4xl mx-auto">
      {/* Toast Notification */}
      {ipActionSuccess && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] bg-neutral-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/20 text-xs font-bold flex items-center space-x-2 animate-bounce">
          <i className="fas fa-shield-halved text-emerald-400 text-sm"></i>
          <span>{ipActionSuccess}</span>
        </div>
      )}

      {copiedIp && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[90] bg-black text-white px-4 py-2 rounded-xl shadow-xl text-xs font-bold animate-fade-in flex items-center space-x-2">
          <i className="fas fa-check text-emerald-400"></i>
          <span>Alamat IP {copiedIp} disalin ke clipboard!</span>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">Command Center</h2>
        <div className="flex space-x-4 border-b-2 border-black/5 overflow-x-auto scrollbar-none pb-1">
          <button 
            onClick={() => setActiveTab('users')}
            className={`pb-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap ${activeTab === 'users' ? 'border-black text-black' : 'border-transparent text-gray-300'}`}
          >
            User Orchestration
          </button>
          <button 
            onClick={() => setActiveTab('broadcast')}
            className={`pb-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 whitespace-nowrap ${activeTab === 'broadcast' ? 'border-black text-black' : 'border-transparent text-gray-300'}`}
          >
            Broadcast Center
          </button>
          <button 
            onClick={() => setActiveTab('ipshield')}
            className={`pb-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${activeTab === 'ipshield' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-300'}`}
          >
            <i className="fas fa-shield-halved text-xs"></i>
            <span>IP Ban Shield</span>
            {bannedIps.length > 0 && (
              <span className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.2 rounded-full">
                {bannedIps.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('aibot')}
            className={`pb-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${activeTab === 'aibot' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-300'}`}
          >
            <i className="fas fa-robot text-xs"></i>
            <span>AI Bot Profile ({botName})</span>
          </button>
        </div>
      </div>

      {activeTab === 'users' && (
        <>
          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black opacity-30">
              <i className="fas fa-filter text-xs"></i>
            </span>
            <input 
              type="text" 
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
              placeholder="Filter by name, email, or IP address..."
              className="w-full bg-gray-50 border-2 border-black rounded-2xl pl-10 pr-4 py-3 text-xs focus:outline-none focus:ring-0 transition-all font-bold"
            />
          </div>

          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="py-20 text-center opacity-20">
                <i className="fas fa-search-minus text-4xl mb-4"></i>
                <p className="font-black uppercase tracking-widest text-xs">No records found</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const userIp = user.lastIp || user.registeredIp;
                const sanitized = userIp ? sanitizeIpKey(userIp) : '';
                const isThisIpBanned = userIp ? bannedIps.some(b => b.sanitizedIp === sanitized || b.ip === userIp) : false;

                return (
                  <div key={user.id} className={`p-4 border-2 rounded-2xl bg-white shadow-sm flex flex-col space-y-3 transition-all ${isThisIpBanned ? 'border-red-500 bg-red-50/20' : 'border-black'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <img 
                          src={user.photoURL} 
                          className={`w-12 h-12 rounded-full border-2 border-black object-cover cursor-pointer ${user.isBanned ? 'grayscale opacity-30' : ''}`}
                          onClick={() => onUserClick(user.id)}
                          alt={user.name}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className={`font-black uppercase tracking-tighter truncate ${user.isBanned ? 'text-gray-400 line-through' : 'text-black'}`}>
                              {user.name}
                            </h4>
                            {user.isAdmin && <span className="bg-yellow-400 text-black text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Admin</span>}
                            {user.role && <span className="text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter" style={{ backgroundColor: user.roleColor || '#000000' }}>{user.role}</span>}
                          </div>
                          <p className="text-[9px] font-bold text-gray-400 truncate uppercase tracking-widest">{user.email}</p>
                          
                          {/* IP Address & Granular Geolocation Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <div 
                              onClick={() => {
                                if (userIp || user.gpsLat) {
                                  setInspectingIpData({
                                    ip: userIp || 'GPS Direct',
                                    userName: user.name,
                                    userEmail: user.email,
                                    userPhoto: user.photoURL,
                                    isBanned: isThisIpBanned,
                                    gpsLat: user.gpsLat,
                                    gpsLon: user.gpsLon,
                                    gpsAccuracy: user.gpsAccuracy,
                                    gpsAddress: user.gpsAddress,
                                    gpsStreet: user.gpsStreet,
                                    gpsVillage: user.gpsVillage,
                                    gpsDistrict: user.gpsDistrict,
                                    gpsRegency: user.gpsRegency,
                                    gpsProvince: user.gpsProvince,
                                    gpsPostcode: user.gpsPostcode,
                                    gpsUpdatedAt: user.gpsUpdatedAt,
                                    deviceInfo: user.deviceInfo
                                  });
                                }
                              }}
                              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-all ${
                                isThisIpBanned 
                                  ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' 
                                  : 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200 hover:border-black'
                              }`}
                              title="Klik untuk melihat rincian Kecamatan, Gang, Desa & Peta Google Maps"
                            >
                              <i className={`fas ${isThisIpBanned ? 'fa-ban text-red-500' : 'fa-map-pin text-emerald-600'} text-[9px]`}></i>
                              <span>IP: {userIp || 'Belum tercatat'}</span>
                              {userIp && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyIp(userIp);
                                  }}
                                  className="ml-1 text-neutral-400 hover:text-black transition-colors"
                                  title="Salin Alamat IP"
                                >
                                  <i className="fas fa-copy text-[9px]"></i>
                                </button>
                              )}
                            </div>

                            {/* Real GPS Physical Location Tag with Kecamatan & Gang */}
                            {(user.gpsAddress || user.gpsDistrict || user.gpsStreet) && (
                              <div 
                                onClick={() => {
                                  setInspectingIpData({
                                    ip: userIp || 'GPS Direct',
                                    userName: user.name,
                                    userEmail: user.email,
                                    userPhoto: user.photoURL,
                                    isBanned: isThisIpBanned,
                                    gpsLat: user.gpsLat,
                                    gpsLon: user.gpsLon,
                                    gpsAccuracy: user.gpsAccuracy,
                                    gpsAddress: user.gpsAddress,
                                    gpsStreet: user.gpsStreet,
                                    gpsVillage: user.gpsVillage,
                                    gpsDistrict: user.gpsDistrict,
                                    gpsRegency: user.gpsRegency,
                                    gpsProvince: user.gpsProvince,
                                    gpsPostcode: user.gpsPostcode,
                                    gpsUpdatedAt: user.gpsUpdatedAt,
                                    deviceInfo: user.deviceInfo
                                  });
                                }}
                                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-[9px] font-bold cursor-pointer hover:bg-emerald-200 transition-all max-w-[280px] truncate shadow-2xs"
                                title={`Lokasi Fisik: ${user.gpsAddress || 'Terdeteksi'}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <i className="fas fa-location-dot text-[8px] text-emerald-600"></i>
                                <span className="truncate">
                                  {user.gpsDistrict ? `Kec. ${user.gpsDistrict}` : ''}
                                  {user.gpsDistrict && (user.gpsStreet || user.gpsVillage) ? ' • ' : ''}
                                  {user.gpsStreet || user.gpsVillage || user.gpsRegency || user.gpsAddress?.split(',')[0] || 'GPS Terdeteksi'}
                                </span>
                              </div>
                            )}
                            
                            {(userIp || user.gpsLat) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectingIpData({
                                    ip: userIp || 'GPS Direct',
                                    userName: user.name,
                                    userEmail: user.email,
                                    userPhoto: user.photoURL,
                                    isBanned: isThisIpBanned,
                                    gpsLat: user.gpsLat,
                                    gpsLon: user.gpsLon,
                                    gpsAccuracy: user.gpsAccuracy,
                                    gpsAddress: user.gpsAddress,
                                    gpsStreet: user.gpsStreet,
                                    gpsVillage: user.gpsVillage,
                                    gpsDistrict: user.gpsDistrict,
                                    gpsRegency: user.gpsRegency,
                                    gpsProvince: user.gpsProvince,
                                    gpsPostcode: user.gpsPostcode,
                                    gpsUpdatedAt: user.gpsUpdatedAt,
                                    deviceInfo: user.deviceInfo
                                  });
                                }}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-wider transition-all shadow-xs"
                                title="Lihat Kecamatan, Gang & Peta Akurat"
                              >
                                <i className="fas fa-map-location-dot text-[9px]"></i>
                                <span>Lihat Peta & Wilayah</span>
                              </button>
                            )}

                            {isThisIpBanned && (
                              <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                IP Terblokir
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {user.isBanned && <span className="text-[8px] font-black text-red-600 border border-red-600 px-2 py-1 rounded-full uppercase tracking-tighter">Banished</span>}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <button 
                        onClick={() => onToggleAdmin && onToggleAdmin(user.id, Boolean(user.isAdmin))} 
                        className={`py-2 px-1 rounded-xl text-[9px] font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center space-x-1 ${
                          user.isAdmin 
                            ? 'bg-amber-100 border-amber-500 text-amber-900 hover:bg-amber-200' 
                            : 'bg-neutral-900 border-black text-white hover:bg-black'
                        }`}
                        title={user.isAdmin ? 'Cabut Akses Admin' : 'Jadikan Admin Vimos'}
                      >
                        <i className={`fas fa-crown text-[8px] ${user.isAdmin ? 'text-amber-600' : 'text-yellow-400'}`}></i>
                        <span className="truncate">{user.isAdmin ? 'Revoke' : 'Admin'}</span>
                      </button>
                      <button onClick={() => { setEditingRoleUser(user); setNewRoleValue(user.role || ''); setNewRoleColor(user.roleColor || '#000000'); }} className="bg-white border-2 border-black text-black py-2 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-black hover:text-white transition-all truncate">Set Role</button>
                      <button onClick={() => onBanUser(user.id)} className={`border-2 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all truncate ${user.isBanned ? 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white' : 'border-neutral-600 text-neutral-700 hover:bg-neutral-900 hover:text-white'}`}>{user.isBanned ? 'Restore' : 'Banish'}</button>
                      <button 
                        onClick={() => handleBanUserAndIp(user)}
                        className={`border-2 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all truncate flex items-center justify-center space-x-1 ${
                          isThisIpBanned
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white'
                            : 'bg-red-50 border-red-600 text-red-600 hover:bg-red-600 hover:text-white'
                        }`}
                        title={isThisIpBanned ? 'Buka Blokir IP Pengguna' : 'Blokir IP & Akun Pengguna'}
                      >
                        <i className={`fas ${isThisIpBanned ? 'fa-unlock' : 'fa-ban'} text-[8px]`}></i>
                        <span>{isThisIpBanned ? 'Unban IP' : 'Ban IP'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {activeTab === 'ipshield' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Shield Info */}
          <div className="p-5 bg-gradient-to-br from-neutral-900 to-black text-white rounded-3xl border-2 border-black shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400">
                  <i className="fas fa-shield-halved text-xl"></i>
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">Perlindungan Anti-Spam, Blokir IP & Pelacakan Maps</h3>
                  <p className="text-[10px] text-neutral-400 font-medium">Lacak koordinat GPS, alamat presisi, dan peta Google Maps pengguna serta blokir IP pelanggar.</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-red-400">{bannedIps.length}</span>
                <span className="block text-[8px] font-black uppercase tracking-widest text-neutral-400">IP Diblokir</span>
              </div>
            </div>
          </div>

          {/* Quick IP Geolocation & Maps Inspector Tool */}
          <div className="p-5 border-2 border-black rounded-3xl bg-emerald-50/50 shadow-sm space-y-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xs">
                <i className="fas fa-map-location-dot"></i>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">
                  Pelacak Lokasi & Google Maps Akurat
                </h4>
                <p className="text-[10px] text-neutral-600 font-medium">
                  Ketik alamat IP apa pun untuk melihat estimasi alamat kota/wilayah, ISP, dan peta Google Maps langsung.
                </p>
              </div>
            </div>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (quickLookupIp.trim()) {
                  setInspectingIpData({ ip: quickLookupIp.trim() });
                }
              }}
              className="flex items-center space-x-2"
            >
              <input
                type="text"
                value={quickLookupIp}
                onChange={(e) => setQuickLookupIp(e.target.value)}
                placeholder="Masukkan alamat IP (cth: 182.253.120.45)..."
                className="flex-1 bg-white border-2 border-black rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-0"
              />
              <button
                type="submit"
                disabled={!quickLookupIp.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-xs flex items-center space-x-1.5"
              >
                <i className="fas fa-search-location"></i>
                <span>Cek Maps</span>
              </button>
            </form>
          </div>

          {/* Form Tambah Manual Blokir IP */}
          <div className="p-5 border-2 border-black rounded-3xl bg-white shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-black flex items-center space-x-2">
              <i className="fas fa-plus-circle text-red-500"></i>
              <span>Tambah Blokir Alamat IP Baru</span>
            </h4>
            <form onSubmit={handleManualBanIp} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-600">
                    Alamat IP (IPv4 / IPv6)
                  </label>
                  <input
                    type="text"
                    required
                    value={manualIpInput}
                    onChange={(e) => setManualIpInput(e.target.value)}
                    placeholder="Contoh: 182.253.120.45"
                    className="w-full bg-neutral-50 border-2 border-black rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:outline-none focus:bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-600">
                    Alasan Pemblokiran
                  </label>
                  <input
                    type="text"
                    value={manualIpReason}
                    onChange={(e) => setManualIpReason(e.target.value)}
                    placeholder="Contoh: Akun bot spam, pelanggaran aturan"
                    className="w-full bg-neutral-50 border-2 border-black rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:bg-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!manualIpInput.trim()}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-40 flex items-center justify-center space-x-2"
              >
                <i className="fas fa-ban"></i>
                <span>Terapkan Blokir Alamat IP</span>
              </button>
            </form>
          </div>

          {/* Daftar IP yang Diblokir */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-neutral-500">
                Daftar IP Terblokir ({bannedIps.length})
              </h4>
              <div className="relative w-48">
                <input
                  type="text"
                  value={ipSearch}
                  onChange={(e) => setIpSearch(e.target.value)}
                  placeholder="Cari IP atau nama..."
                  className="w-full bg-neutral-100 border border-black/10 rounded-xl px-3 py-1.5 text-[10px] font-bold focus:outline-none focus:bg-white"
                />
              </div>
            </div>

            {bannedIps.length === 0 ? (
              <div className="py-12 text-center bg-white border-2 border-dashed border-neutral-300 rounded-3xl">
                <i className="fas fa-shield-check text-4xl text-neutral-300 mb-2"></i>
                <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Tidak ada IP yang diblokir saat ini</p>
                <p className="text-[10px] text-neutral-400 font-medium mt-1">Sistem bersih dari ancaman bot.</p>
              </div>
            ) : (
              bannedIps
                .filter(b => {
                  const s = ipSearch.toLowerCase();
                  return b.ip.toLowerCase().includes(s) || 
                    (b.associatedUserName || '').toLowerCase().includes(s) ||
                    (b.reason || '').toLowerCase().includes(s);
                })
                .map((b) => (
                  <div key={b.sanitizedIp} className="p-4 bg-white border-2 border-red-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-sm text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-200">
                          {b.ip}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyIp(b.ip)}
                          className="text-neutral-400 hover:text-black"
                          title="Salin IP"
                        >
                          <i className="fas fa-copy text-xs"></i>
                        </button>
                        {b.associatedUserName && (
                          <span className="text-[10px] font-bold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-md truncate max-w-[150px]">
                            User: {b.associatedUserName}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-neutral-800">
                        {b.reason}
                      </p>
                      <div className="flex items-center space-x-3 text-[9px] text-neutral-400 font-medium">
                        <span>Waktu: {new Date(b.bannedAt).toLocaleString('id-ID')}</span>
                        <span>Oleh: {b.bannedBy}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectingIpData({
                            ip: b.ip,
                            userName: b.associatedUserName,
                            userEmail: b.associatedUserEmail,
                            isBanned: true
                          });
                        }}
                        className="px-3 py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-emerald-300 flex items-center space-x-1.5"
                      >
                        <i className="fas fa-map-location-dot text-[9px]"></i>
                        <span>Lihat Maps</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnbanIp(b.sanitizedIp, b.ip)}
                        className="px-4 py-2 bg-neutral-100 hover:bg-emerald-500 hover:text-white text-neutral-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-neutral-300 hover:border-emerald-600 shrink-0 flex items-center space-x-1"
                      >
                        <i className="fas fa-unlock text-[9px]"></i>
                        <span>Buka Blokir</span>
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'broadcast' && (
        <div className="space-y-8">
          <form onSubmit={handleBroadcastSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Proclamation Message</label>
              <textarea 
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="What must the Orbit know?"
                className="w-full bg-gray-50 border-2 border-black rounded-2xl p-4 text-sm font-bold focus:outline-none focus:bg-white transition-all h-32 resize-none"
              />
            </div>
            <div className="flex space-x-2">
              {editingAnnId && (
                <button 
                  type="button" 
                  onClick={() => { setEditingAnnId(null); setBroadcastText(''); }}
                  className="px-6 border-2 border-black rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  Cancel
                </button>
              )}
              <button 
                type="submit"
                className="flex-1 bg-black text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {editingAnnId ? 'Update Proclamation' : 'Post Proclamation'}
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Active Proclamations</h3>
            {announcements.length === 0 ? (
              <p className="text-center py-10 text-[10px] text-gray-300 font-black uppercase tracking-widest">Silence persists...</p>
            ) : (
              announcements.map(ann => (
                <div key={ann.id} className="p-4 border-2 border-black rounded-2xl bg-white shadow-sm space-y-3">
                  <p className="text-sm font-bold">{ann.text}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">{new Date(ann.timestamp).toLocaleString()}</span>
                    <div className="flex space-x-2">
                      <button onClick={() => startEditAnn(ann)} className="text-[8px] font-black uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full">Edit</button>
                      <button onClick={() => onDeleteAnnouncement(ann.id)} className="text-[8px] font-black uppercase tracking-widest bg-red-50 text-red-600 px-3 py-1 rounded-full">Delete</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'aibot' && (
        <div className="space-y-6">
          {/* Main AI Profile Customizer Card */}
          <div className="p-6 border-2 border-black rounded-3xl bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shadow-md">
                  <i className="fas fa-robot text-xl text-emerald-400"></i>
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase text-neutral-900">Profil & Konfigurasi Bot AI</h3>
                  <p className="text-xs text-neutral-500 font-medium">Ubah foto profil, nama resmi, dan bio bot AI yang tampil untuk seluruh pengguna Vimos</p>
                </div>
              </div>
            </div>

            {/* Live Visual Preview of AI Bot */}
            <div className="p-4 bg-white border-2 border-black/10 rounded-2xl shadow-xs">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">
                👁️ Live Preview Tampilan Pengguna
              </p>
              <div className="flex items-center space-x-3 p-3 bg-neutral-50 border border-neutral-200 rounded-2xl">
                <div className="relative shrink-0">
                  {editingBotAvatarInput ? (
                    <img
                      src={editingBotAvatarInput}
                      alt="AI Preview"
                      className="w-12 h-12 rounded-2xl object-cover border-2 border-black shadow-sm"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center border-2 border-black shadow-sm">
                      <i className="fas fa-robot text-xl text-emerald-400"></i>
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-black text-sm uppercase text-neutral-900 truncate">
                      {editingBotNameInput || 'vimos.ai'}
                    </span>
                    <span className="bg-black text-white text-[8px] font-black px-1.5 py-0.5 rounded-md flex items-center space-x-1">
                      <i className="fas fa-sparkles text-[7px] text-yellow-300"></i>
                      <span>OFFICIAL</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 font-bold truncate">
                    {editingBotBioInput || 'Asisten Cerdas Resmi Vimos • Online 24/7'}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveBotProfile} className="space-y-5">
              {/* Photo & Avatar Controls */}
              <div className="p-4 bg-white border-2 border-black rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-wider text-neutral-800">
                    1. Foto Profil / Avatar AI
                  </label>
                  {editingBotAvatarInput && (
                    <button
                      type="button"
                      onClick={() => setEditingBotAvatarInput('')}
                      className="text-[10px] font-bold text-red-600 hover:underline flex items-center space-x-1"
                    >
                      <i className="fas fa-rotate-left"></i>
                      <span>Reset ke Ikon Default</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="relative shrink-0">
                    {editingBotAvatarInput ? (
                      <img
                        src={editingBotAvatarInput}
                        alt="Bot Avatar"
                        className="w-20 h-20 rounded-3xl object-cover border-3 border-black shadow-md"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-3xl bg-black text-white flex items-center justify-center border-3 border-black shadow-md">
                        <i className="fas fa-robot text-3xl text-emerald-400"></i>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 w-full">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="w-full py-2.5 px-4 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all active:scale-98 shadow-sm"
                    >
                      <i className={`fas ${isUploadingAvatar ? 'fa-spinner fa-spin' : 'fa-arrow-up-from-bracket text-emerald-400'}`}></i>
                      <span>{isUploadingAvatar ? 'Memproses Foto...' : 'Upload Foto dari Galeri / PC'}</span>
                    </button>
                    <p className="text-[10px] text-neutral-400 font-bold">
                      Format: PNG, JPG, WebP. Gambar otomatis dioptimasi untuk kecepatan tinggi.
                    </p>
                  </div>
                </div>

                {/* Preset Avatar Gallery */}
                <div className="pt-2 border-t border-neutral-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-2">
                    Atau Pilih Dari Preset Avatar AI Keren:
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                    {AI_AVATAR_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditingBotAvatarInput(preset.url)}
                        className={`relative rounded-2xl overflow-hidden aspect-square border-2 transition-all group hover:scale-105 ${
                          editingBotAvatarInput === preset.url ? 'border-emerald-500 ring-2 ring-emerald-400 scale-105' : 'border-neutral-200'
                        }`}
                        title={preset.name}
                      >
                        <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-white font-black uppercase transition-opacity">
                          {preset.name}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Direct Image URL input */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-neutral-500 block mb-1">
                    Atau Masukkan URL Gambar:
                  </label>
                  <input
                    type="url"
                    value={editingBotAvatarInput}
                    onChange={(e) => setEditingBotAvatarInput(e.target.value)}
                    placeholder="https://example.com/foto-ai.jpg"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium focus:outline-none focus:bg-white focus:border-black"
                  />
                </div>
              </div>

              {/* Bot Name Input & Quick Presets */}
              <div className="p-4 bg-white border-2 border-black rounded-2xl space-y-3">
                <label className="text-[11px] font-black uppercase tracking-wider text-neutral-800 block">
                  2. Nama Bot AI
                </label>
                <input
                  type="text"
                  value={editingBotNameInput}
                  onChange={(e) => setEditingBotNameInput(e.target.value)}
                  placeholder="Contoh: vimos.ai"
                  className="w-full bg-neutral-50 border-2 border-black rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:bg-white"
                  required
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['vimos.ai', 'Vimos AI', 'Vimos Bot', 'Hengkur AI', 'Vimos Intelligence'].map((name) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() => setEditingBotNameInput(name)}
                      className="bg-neutral-100 hover:bg-black hover:text-white text-neutral-800 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Bio / Status Tagline */}
              <div className="p-4 bg-white border-2 border-black rounded-2xl space-y-3">
                <label className="text-[11px] font-black uppercase tracking-wider text-neutral-800 block">
                  3. Bio / Tagline Status AI
                </label>
                <input
                  type="text"
                  value={editingBotBioInput}
                  onChange={(e) => setEditingBotBioInput(e.target.value)}
                  placeholder="Contoh: Asisten Cerdas Resmi Vimos • Online 24/7"
                  className="w-full bg-neutral-50 border-2 border-black rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:bg-white"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'Asisten Cerdas Resmi Vimos • Online 24/7',
                    'Kreator Konten & Ide Viral Vimos • 24/7',
                    'AI Asisten Pintar & Sahabat Komunitas Vimos',
                  ].map((bio) => (
                    <button
                      type="button"
                      key={bio}
                      onClick={() => setEditingBotBioInput(bio)}
                      className="bg-neutral-100 hover:bg-black hover:text-white text-neutral-800 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors truncate max-w-full"
                    >
                      {bio}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Save Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingBot || !editingBotNameInput.trim()}
                  className="w-full py-3.5 bg-black hover:bg-neutral-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 shadow-lg active:scale-98 flex items-center justify-center space-x-2"
                >
                  <i className={`fas ${isSavingBot ? 'fa-spinner fa-spin' : 'fa-floppy-disk text-emerald-400'}`}></i>
                  <span>{isSavingBot ? 'Menyimpan Profil AI...' : 'Simpan Seluruh Perubahan Profil AI'}</span>
                </button>
              </div>

              {botSaveSuccess && (
                <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold flex items-center space-x-2 animate-fade-in">
                  <i className="fas fa-circle-check text-emerald-600"></i>
                  <span>Profil AI berhasil diperbarui secara global dan tersinkronisasi untuk seluruh pengguna!</span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {editingRoleUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border-4 border-black w-full max-w-sm rounded-3xl overflow-hidden shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col">
            <div className="p-6 border-b-4 border-black bg-black text-white">
              <h3 className="font-black uppercase tracking-[0.2em] text-sm">Update Destiny</h3>
              <p className="text-[8px] uppercase tracking-widest opacity-60 mt-1">Assign role to {editingRoleUser.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <input type="text" autoFocus value={newRoleValue} onChange={(e) => setNewRoleValue(e.target.value)} placeholder="Role Name" className="w-full bg-gray-50 border-2 border-black rounded-xl p-4 font-bold focus:outline-none" />
              <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-xl">
                {PRESET_COLORS.map(color => (
                  <button key={color} onClick={() => setNewRoleColor(color)} className={`w-7 h-7 rounded-full border-2 ${newRoleColor === color ? 'border-black scale-110' : 'border-transparent'}`} style={{ backgroundColor: color === '#00000000' ? '#fff' : color }} />
                ))}
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setEditingRoleUser(null)} className="flex-1 border-2 border-black p-3 rounded-xl font-black uppercase text-xs">Cancel</button>
                <button onClick={() => { onSetRole(editingRoleUser.id, newRoleValue.trim(), newRoleColor); setEditingRoleUser(null); }} className="flex-1 bg-black text-white p-3 rounded-xl font-black uppercase text-xs">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IP Geolocation & Interactive Maps Modal */}
      {inspectingIpData && (
        <IpLocationModal
          ip={inspectingIpData.ip}
          userName={inspectingIpData.userName}
          userEmail={inspectingIpData.userEmail}
          userPhoto={inspectingIpData.userPhoto}
          isBanned={inspectingIpData.isBanned}
          gpsLat={inspectingIpData.gpsLat}
          gpsLon={inspectingIpData.gpsLon}
          gpsAccuracy={inspectingIpData.gpsAccuracy}
          gpsAddress={inspectingIpData.gpsAddress}
          gpsStreet={inspectingIpData.gpsStreet}
          gpsVillage={inspectingIpData.gpsVillage}
          gpsDistrict={inspectingIpData.gpsDistrict}
          gpsRegency={inspectingIpData.gpsRegency}
          gpsProvince={inspectingIpData.gpsProvince}
          gpsPostcode={inspectingIpData.gpsPostcode}
          gpsUpdatedAt={inspectingIpData.gpsUpdatedAt}
          onClose={() => setInspectingIpData(null)}
          onBanIp={async (targetIp) => {
            const sanitized = sanitizeIpKey(targetIp);
            const reason = window.prompt(`Masukkan alasan pemblokiran IP ${targetIp}:`, 'Pelanggaran spam/bot akun');
            if (reason === null) return;
            try {
              await set(ref(db, `bannedIps/${sanitized}`), {
                ip: targetIp,
                sanitizedIp: sanitized,
                bannedAt: Date.now(),
                bannedBy: 'Admin Geolocation Inspector',
                reason: reason || 'Diblokir oleh Administrator',
                associatedUserName: inspectingIpData.userName,
                associatedUserEmail: inspectingIpData.userEmail
              });
              setIpActionSuccess(`Alamat IP ${targetIp} berhasil diblokir!`);
              setTimeout(() => setIpActionSuccess(null), 4000);
            } catch (e) {
              alert('Gagal memproses pemblokiran IP.');
            }
          }}
          onUnbanIp={async (targetIp) => {
            const sanitized = sanitizeIpKey(targetIp);
            try {
              await remove(ref(db, `bannedIps/${sanitized}`));
              setIpActionSuccess(`Blokir alamat IP ${targetIp} berhasil dicabut.`);
              setTimeout(() => setIpActionSuccess(null), 3000);
            } catch (e) {
              alert('Gagal membuka blokir IP.');
            }
          }}
        />
      )}
    </div>
  );
};

export default AdminPanel;
