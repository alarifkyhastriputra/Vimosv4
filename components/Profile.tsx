
import React, { useState, useEffect } from 'react';
import { User, Post } from '../types.ts';
import UserListModal from './UserListModal.tsx';
import PostCard from './PostCard.tsx';
import { useLanguage } from '../LanguageContext.tsx';
import { SHOP_ITEMS } from './Shop.tsx';
import { compressImage } from '../services/imageCompressor.ts';
import { db } from '../firebase.ts';
import { ref, onValue, set, remove } from 'firebase/database';
import { isSharedGroupMember, canViewUserSerial } from '../utils/userPrivacy.ts';

interface ProfileProps {
  user: User;
  users: User[];
  posts?: Post[];
  currentUser: User;
  onToggleFollow: (id: string) => void;
  onUpdateProfile: (data: Partial<User>) => void;
  onAddCapture: (url: string) => void;
  onDeleteCapture?: (captureUrl: string) => void;
  onUserClick: (userId: string) => void;
  onLogout: () => void;
  onBanUser?: (userId: string) => void;
  onSetRole?: (userId: string, role: string, color?: string) => void;
  onToggleAdmin?: (userId: string, currentStatus: boolean) => void;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onComment?: (postId: string, text: string) => void;
  onTakeDownPost?: (id: string) => void;
  onDeletePost?: (id: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onPostClick?: (postId: string) => void;
}

const Profile = ({ 
  user, 
  users, 
  posts = [],
  currentUser, 
  onToggleFollow, 
  onUpdateProfile, 
  onAddCapture, 
  onDeleteCapture,
  onUserClick, 
  onLogout,
  onBanUser,
  onSetRole,
  onToggleAdmin,
  onLike,
  onDislike,
  onComment,
  onTakeDownPost,
  onDeletePost,
  onNavigateToChat,
  onPostClick
}: ProfileProps) => {
  const { t, language, setLanguage } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [modalType, setModalType] = useState<'followers' | 'following' | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedCaptureUrl, setSelectedCaptureUrl] = useState<string | null>(null);
  const [editData, setEditData] = useState({ 
    name: user.name || '', 
    bio: user.bio || '' 
  });

  const isMe = user.id === currentUser.id;
  const isFollowing = (currentUser.following || []).includes(user.id);
  const isAdminViewing = currentUser.isAdmin;
  const isTargetAdmin = user.isAdmin;
  const isBanned = user.isBanned;

  // Saved contact (WhatsApp-style contact name synchronization)
  const [savedContact, setSavedContact] = useState<{ customName: string; serialCode?: string } | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactCustomName, setContactCustomName] = useState('');
  const [inputSerialCode, setInputSerialCode] = useState('');
  const [serialError, setSerialError] = useState('');
  const [autoNavigateChatOnSave, setAutoNavigateChatOnSave] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [isSharedGroup, setIsSharedGroup] = useState(false);

  useEffect(() => {
    if (isMe || !currentUser?.id || !user?.id) {
      setSavedContact(null);
      return;
    }
    const contactRef = ref(db, `users/${currentUser.id}/savedContacts/${user.id}`);
    const unsub = onValue(contactRef, (snap) => {
      if (snap.exists()) {
        setSavedContact(snap.val());
      } else {
        setSavedContact(null);
      }
    });
    return () => unsub();
  }, [currentUser?.id, user?.id, isMe]);

  // Check if currentUser and this user share at least one group
  useEffect(() => {
    if (isMe || !currentUser?.id || !user?.id) {
      setIsSharedGroup(false);
      return;
    }
    const groupsRef = ref(db, 'groups');
    const unsub = onValue(groupsRef, (snap) => {
      if (snap.exists()) {
        setIsSharedGroup(isSharedGroupMember(currentUser.id, user.id, snap.val()));
      } else {
        setIsSharedGroup(false);
      }
    });
    return () => unsub();
  }, [currentUser?.id, user?.id, isMe]);

  const canViewSerial = canViewUserSerial({
    currentUserId: currentUser?.id,
    targetUserId: user.id,
    isSavedContact: Boolean(savedContact),
    isSharedGroup
  });

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id || !user?.id) return;
    const finalCustomName = contactCustomName.trim() || user.name || 'Kontak Vimos';

    setSerialError('');

    // If user does not currently have this person's serial code, verify it strictly!
    const targetSerial = (user.serialCode || ('ORB-' + user.id.substring(0, 6).toUpperCase())).toUpperCase();
    if (!canViewSerial) {
      const cleanInput = inputSerialCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cleanTarget = targetSerial.replace(/[^A-Z0-9]/g, '');
      const rawInput = inputSerialCode.trim().toUpperCase();

      if (!cleanInput) {
        setSerialError('Nomor seri wajib diisi untuk membuka obrolan atau menyimpan kontak.');
        return;
      }

      if (cleanInput !== cleanTarget && rawInput !== targetSerial) {
        setSerialError(`Nomor seri "${rawInput}" salah! Anda tidak bisa mengobrol tanpa nomor seri yang sesuai.`);
        return;
      }
    }

    setContactSaving(true);
    
    const contactRef = ref(db, `users/${currentUser.id}/savedContacts/${user.id}`);
    
    // Optimistic save
    set(contactRef, {
      id: user.id,
      contactUserId: user.id,
      userId: user.id,
      customName: finalCustomName,
      serialCode: targetSerial,
      savedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }).catch(err => {
      console.error('Gagal menyimpan kontak:', err);
    });

    setIsContactModalOpen(false);
    setInputSerialCode('');
    setSerialError('');
    setContactSaving(false);

    // If triggered from "Pesan" button, immediately navigate to chat now that serial code is verified!
    if (autoNavigateChatOnSave && onNavigateToChat) {
      onNavigateToChat(user.id);
    }
  };

  const handleDeleteContact = async () => {
    if (!currentUser?.id || !user?.id) return;
    if (!confirm('Hapus kontak ini dari daftar kontak tersimpan Anda?')) return;
    try {
      await remove(ref(db, `users/${currentUser.id}/savedContacts/${user.id}`));
      setIsContactModalOpen(false);
    } catch (err: any) {
      alert('Gagal menghapus kontak: ' + (err?.message || 'Coba lagi'));
    }
  };

  const followersList = users.filter(u => (user.followers || []).includes(u.id));
  const followingList = users.filter(u => (user.following || []).includes(u.id));

  // Fallback data
  const displayName = user.name && user.name.trim() !== '' ? user.name : 'Unknown Orbit';
  const displayBio = user.bio && user.bio.trim() !== '' ? user.bio : 'No bio shared yet.';
  const displayPhoto = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${displayName}&backgroundColor=000000&fontFamily=Inter&fontWeight=700`;

  const handleSave = () => {
    onUpdateProfile({
      name: editData.name.trim(),
      bio: editData.bio.trim()
    });
    setIsEditing(false);
  };

  const handleCaptureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1080, 1080, 0.82);
        onAddCapture(compressed);
      } catch {
        const reader = new FileReader();
        reader.onloadend = () => {
          onAddCapture(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSetRole = () => {
    // Note: To keep Profile simple, we'll use a prompt for role name, 
    // but the actual color selection is primarily in AdminPanel.
    // However, if onSetRole is called from here, it will use current color.
    const role = prompt("Assign a special role to this member (e.g., Visionary, Elite, Curator):", user.role || "");
    if (role !== null && onSetRole) {
      onSetRole(user.id, role, user.roleColor);
    }
  };

  const userPosts = posts.filter(p => p.userId === user.id);
  const totalCaptures = userPosts.length + (user.recentCaptures || []).length;

  const handlePostItemClick = (postId: string) => {
    if (onPostClick) {
      onPostClick(postId);
    } else {
      setSelectedPostId(postId);
    }
  };

  const equippedFrameItem = SHOP_ITEMS.find(i => i.id === user.equippedFrame);
  const frameClass = equippedFrameItem?.frameClass || '';

  return (
    <div className={`p-6 pb-24 relative transition-all duration-500 ${isBanned ? 'bg-red-50/30' : ''}`}>
      {/* Banned Investigation Banner */}
      {isBanned && (
        <div className="absolute top-0 left-0 right-0 z-50 animate-pulse">
          <div className="bg-red-600 text-white py-2 px-4 flex items-center justify-center space-x-2 shadow-lg">
            <i className="fas fa-triangle-exclamation text-xs"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Hati-hati, akun ini sedang dalam penyelidikan</span>
          </div>
        </div>
      )}

      {/* Admin King Label */}
      {isTargetAdmin && (
        <div className={`absolute top-6 right-6 z-10 ${isBanned ? 'mt-8' : ''}`}>
          <div className="bg-black text-white px-3 py-1.5 rounded-xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] flex items-center space-x-2 animate-bounce-subtle">
            <i className="fas fa-crown text-[10px] text-yellow-400"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Admin King</span>
          </div>
        </div>
      )}

      {/* Custom Role Badge with color */}
      {user.role && !isTargetAdmin && (
        <div className={`absolute top-6 right-6 z-10 ${isBanned ? 'mt-8' : ''}`}>
          <div 
            className="text-white px-3 py-1.5 rounded-xl border-2 border-black/10 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] flex items-center space-x-2"
            style={{ backgroundColor: user.roleColor || '#000000' }}
          >
            <i className="fas fa-star text-[10px]"></i>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{user.role}</span>
          </div>
        </div>
      )}

      <div className={`flex flex-col items-center mb-8 ${isBanned ? 'pt-12' : ''}`}>
        <div className="relative group mb-4">
          <div className={`w-32 h-32 rounded-full border-4 overflow-hidden shadow-xl transition-all duration-500 ${isBanned ? 'border-red-600 grayscale' : 'border-black bg-gray-100'} ${frameClass}`}>
            <img 
              src={displayPhoto} 
              alt={displayName} 
              className="w-full h-full object-cover" 
            />
          </div>
          {isMe && !isBanned && (
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
              <label className="cursor-pointer flex items-center justify-center w-full h-full">
                <i className="fas fa-camera text-white text-xl"></i>
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      const compressed = await compressImage(file, 400, 400, 0.85);
                      onUpdateProfile({ photoURL: compressed });
                    } catch {
                      const reader = new FileReader();
                      reader.onloadend = () => onUpdateProfile({ photoURL: reader.result as string });
                      reader.readAsDataURL(file);
                    }
                  }
                }} />
              </label>
            </div>
          )}
        </div>
        
        {isEditing ? (
          <div className="w-full space-y-4 animate-fade-in">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Identity</label>
              <input 
                type="text" 
                value={editData.name} 
                onChange={e => setEditData({...editData, name: e.target.value})}
                className="w-full border-2 border-black p-3 rounded-xl text-center font-bold focus:outline-none"
                placeholder="Name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Vibe</label>
              <textarea 
                value={editData.bio} 
                onChange={e => setEditData({...editData, bio: e.target.value})}
                className="w-full border-2 border-black p-3 rounded-xl text-sm text-center resize-none h-24 focus:outline-none"
                placeholder="Bio"
              />
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setIsEditing(false)} className="flex-1 border-2 border-black p-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="flex-1 bg-black text-white p-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">Save Changes</button>
            </div>
          </div>
        ) : (
          <div className="text-center w-full">
            {/* WhatsApp-style Custom Contact Name */}
            {savedContact && (
              <div className="inline-flex items-center space-x-1.5 bg-emerald-100/90 text-emerald-800 px-3 py-1 rounded-full mb-2 border border-emerald-300 shadow-2xs">
                <i className="fas fa-address-book text-emerald-600 text-xs"></i>
                <span className="text-xs font-black tracking-tight">
                  Kontak: {savedContact.customName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setContactCustomName(savedContact.customName);
                    setIsContactModalOpen(true);
                  }}
                  className="text-emerald-700 hover:text-emerald-950 ml-1 p-0.5 cursor-pointer"
                  title="Ganti Nama Kontak"
                >
                  <i className="fas fa-pen text-[10px]"></i>
                </button>
              </div>
            )}

            <div className="flex items-center justify-center space-x-2 mb-1.5">
              <h2 
                className={`text-2xl font-black uppercase tracking-tight flex items-center justify-center space-x-1.5 ${isBanned ? 'text-red-600' : ''}`}
                style={user.roleColor ? { color: user.roleColor } : undefined}
              >
                <span>{displayName}</span>
                {user.isVerified && (
                  <span className="text-blue-500 text-lg" title="Akun Terverifikasi">
                    <i className="fas fa-circle-check"></i>
                  </span>
                )}
                {user.equippedBadge && <span className="text-lg ml-1">{user.equippedBadge}</span>}
              </h2>
            </div>

            {/* Display Serial Code with Strict Privacy (Only Self, Saved Contacts, or Shared Group) */}
            {canViewSerial ? (
              <div className="inline-flex items-center space-x-2 bg-neutral-900 text-white px-3.5 py-1.5 rounded-full mb-3 shadow-xs">
                <i className="fas fa-id-badge text-yellow-400 text-xs"></i>
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  {isMe ? 'Kode Seri Anda:' : savedContact ? 'Kode Seri (Kontak):' : 'Kode Seri (Satu Grup):'}
                </span>
                <span className="font-mono font-black text-xs tracking-wider text-white">
                  {user.serialCode || ('ORB-' + user.id.substring(0, 6).toUpperCase())}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const code = user.serialCode || ('ORB-' + user.id.substring(0, 6).toUpperCase());
                    navigator.clipboard?.writeText(code);
                    alert(`Kode Seri (${code}) berhasil disalin!`);
                  }}
                  className="text-neutral-400 hover:text-white transition-colors ml-1 p-0.5 cursor-pointer"
                  title="Salin Kode Seri"
                >
                  <i className="fas fa-copy text-[11px]"></i>
                </button>
              </div>
            ) : (
              <div 
                className="inline-flex items-center space-x-2 bg-neutral-100 text-neutral-600 px-3.5 py-1.5 rounded-full mb-3 border border-neutral-200"
                title="Kode seri disembunyikan untuk privasi. Hanya bisa dilihat jika satu grup atau sudah disimpan ke kontak."
              >
                <i className="fas fa-lock text-neutral-400 text-xs"></i>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Kode Seri:</span>
                <span className="font-mono text-xs text-neutral-400 tracking-widest font-black">••••••••</span>
                <span className="text-[9px] bg-neutral-200 text-neutral-600 font-bold px-1.5 py-0.5 rounded-md">
                  Privat
                </span>
              </div>
            )}
            
            {/* Display Recovery Key for Profile Owner */}
            {isMe && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl mb-4 max-w-sm mx-auto shadow-xs text-center">
                <div className="flex items-center justify-center space-x-1.5 text-amber-900 mb-1">
                  <i className="fas fa-key text-xs text-amber-600"></i>
                  <p className="text-[10px] font-black uppercase tracking-widest">Kunci Pemulihan Akun (Recovery Key)</p>
                </div>
                <div className="flex items-center justify-center space-x-2 bg-white border border-amber-200 py-1.5 px-3 rounded-xl">
                  <p className="text-base font-mono font-black text-neutral-900 tracking-wider">
                    {user.recoveryKey || 'ORB-REC-KEY'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (user.recoveryKey) {
                        navigator.clipboard?.writeText(user.recoveryKey);
                        alert(`Recovery Key (${user.recoveryKey}) berhasil disalin! Simpan dengan aman untuk reset password.`);
                      }
                    }}
                    className="p-1 hover:bg-amber-100 rounded-lg text-amber-700 transition-colors cursor-pointer"
                    title="Salin Recovery Key"
                  >
                    <i className="fas fa-copy text-xs"></i>
                  </button>
                </div>
                <p className="text-[9px] text-amber-700 font-semibold mt-1">
                  Gunakan key ini untuk mereset kata sandi akun jika lupa password.
                </p>
              </div>
            )}

            {/* Admin-only Email View */}
            {isAdminViewing && (
              <div className="flex items-center justify-center space-x-1.5 mb-2 group">
                <i className={`fas fa-envelope text-[10px] group-hover:text-black transition-colors ${isBanned ? 'text-red-400' : 'text-gray-400'}`}></i>
                <span className={`text-[10px] font-black uppercase tracking-widest group-hover:text-black transition-colors ${isBanned ? 'text-red-400' : 'text-gray-400'}`}>
                  {user.email || 'No email data'}
                </span>
                <i className="fas fa-shield-halved text-[8px] text-red-500 opacity-50" title="Visible only to Admin King"></i>
              </div>
            )}

            <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto italic font-medium">"{displayBio}"</p>
            <div className="flex flex-col items-center space-y-3">
              <div className="flex flex-wrap justify-center gap-2">
                {isMe ? (
                  <>
                    {!isBanned && (
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="px-8 py-2 border-2 border-black rounded-full text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all shadow-md active:scale-95"
                      >
                        {t('edit_profile')}
                      </button>
                    )}
                    <button 
                      onClick={() => setIsSettingsOpen(true)}
                      className="w-10 h-10 flex items-center justify-center border-2 border-black text-black rounded-full hover:bg-black hover:text-white transition-all shadow-md active:scale-90"
                      title={t('settings')}
                    >
                      <i className="fas fa-cog"></i>
                    </button>
                  </>
                ) : (
                  <>
                    {!isBanned && (
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => onToggleFollow(user.id)}
                          className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.3em] transition-all border-2 shadow-lg active:scale-95 ${
                            isFollowing 
                              ? 'border-black/10 text-gray-400 bg-white hover:border-red-500 hover:text-red-500' 
                              : 'border-black bg-black text-white hover:opacity-80'
                          }`}
                        >
                          {isFollowing ? t('unfollow') : t('follow_soul')}
                        </button>
                        {onNavigateToChat && (
                          <button
                            onClick={() => {
                              if (!canViewSerial) {
                                setContactCustomName(user.name || '');
                                setInputSerialCode('');
                                setSerialError('');
                                setAutoNavigateChatOnSave(true);
                                setIsContactModalOpen(true);
                              } else {
                                onNavigateToChat(user.id);
                              }
                            }}
                            className={`px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border-2 shadow-lg active:scale-95 flex items-center space-x-1.5 ${
                              canViewSerial 
                                ? 'border-black bg-neutral-900 text-white hover:bg-black' 
                                : 'border-neutral-800 bg-neutral-800 text-amber-300 hover:bg-black'
                            }`}
                            title={canViewSerial ? "Kirim Pesan Langsung" : "Butuh Nomor Seri untuk Memulai Obrolan"}
                          >
                            <i className={`fas ${canViewSerial ? 'fa-comment-dots' : 'fa-lock'} text-xs`}></i>
                            <span>{canViewSerial ? 'Pesan' : 'Chat'}</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setContactCustomName(savedContact?.customName || user.name || '');
                            setInputSerialCode('');
                            setSerialError('');
                            setAutoNavigateChatOnSave(false);
                            setIsContactModalOpen(true);
                          }}
                          className={`px-4 py-3 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border-2 shadow-lg active:scale-95 flex items-center space-x-1.5 ${
                            savedContact
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border-black bg-white text-black hover:bg-neutral-100'
                          }`}
                          title={savedContact ? 'Ganti Nama Kontak' : 'Simpan Kontak'}
                        >
                          <i className={`fas ${savedContact ? 'fa-user-pen text-emerald-600' : 'fa-user-plus text-black'} text-xs`}></i>
                          <span>{savedContact ? 'Ganti Nama' : '+ Kontak'}</span>
                        </button>
                      </div>
                    )}
                    
                    {isAdminViewing && (
                      <>
                        <button 
                          onClick={() => onToggleAdmin && onToggleAdmin(user.id, Boolean(user.isAdmin))}
                          className={`w-10 h-10 flex items-center justify-center border-2 rounded-full transition-all shadow-md active:scale-90 ${
                            isTargetAdmin 
                              ? 'border-yellow-500 bg-yellow-400 text-black hover:bg-yellow-500' 
                              : 'border-yellow-500 text-yellow-600 hover:bg-yellow-400 hover:text-black'
                          }`}
                          title={isTargetAdmin ? 'Cabut Admin Vimos' : 'Jadikan Admin Vimos'}
                        >
                          <i className="fas fa-crown text-sm"></i>
                        </button>
                        <button 
                          onClick={handleSetRole}
                          className="w-10 h-10 flex items-center justify-center border-2 border-blue-600 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-md active:scale-90"
                          title={t('assign_role')}
                        >
                          <i className="fas fa-id-badge text-sm"></i>
                        </button>
                        <button 
                          onClick={() => onBanUser && onBanUser(user.id)}
                          className={`w-10 h-10 flex items-center justify-center border-2 rounded-full transition-all shadow-md active:scale-90 ${isBanned ? 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white' : 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white'}`}
                          title={isBanned ? t('restore_user') : t('ban_user')}
                        >
                          <i className={`fas ${isBanned ? 'fa-user-check' : 'fa-user-slash'} text-sm`}></i>
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-3 gap-4 border-y-2 py-8 mb-10 rounded-2xl transition-colors ${isBanned ? 'border-red-600 bg-red-100/30' : 'border-black bg-gray-50/30'}`}>
        <div className="text-center">
          <p className={`text-2xl font-black ${isBanned ? 'text-red-600' : ''}`}>{totalCaptures}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('captures')}</p>
        </div>
        <button onClick={() => setModalType('followers')} className={`text-center group border-x ${isBanned ? 'border-red-200' : 'border-black/5'}`}>
          <p className={`text-2xl font-black group-hover:scale-110 transition-transform ${isBanned ? 'text-red-600' : ''}`}>{(user.followers || []).length}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('followers')}</p>
        </button>
        <button onClick={() => setModalType('following')} className="text-center group">
          <p className={`text-2xl font-black group-hover:scale-110 transition-transform ${isBanned ? 'text-red-600' : ''}`}>{(user.following || []).length}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t('following')}</p>
        </button>
      </div>

      <div className="space-y-6">
        <div className={`flex items-center justify-between border-b-2 pb-3 ${isBanned ? 'border-red-600' : 'border-black'}`}>
          <h3 className={`font-black uppercase tracking-[0.2em] text-xs ${isBanned ? 'text-red-600' : ''}`}>Visual Echoes</h3>
          {isMe && !isBanned && (
            <label className="cursor-pointer group flex items-center space-x-2 bg-black text-white px-3 py-1 rounded-full hover:bg-black/80 transition-colors">
              <i className="fas fa-plus text-[10px]"></i>
              <span className="text-[10px] font-black uppercase tracking-widest">Add</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleCaptureUpload} />
            </label>
          )}
        </div>
        
        {totalCaptures === 0 ? (
          <div className="py-20 text-center flex flex-col items-center opacity-20">
            <i className={`fas fa-camera text-4xl mb-4 ${isBanned ? 'text-red-600' : ''}`}></i>
            <p className="italic text-sm uppercase font-bold tracking-widest">{t('no_captures') || 'Belum ada postingan visual'}</p>
          </div>
        ) : (
          <div className={`grid grid-cols-3 gap-3 ${isBanned ? 'opacity-30' : ''}`}>
            {userPosts.map((post) => (
              <div 
                key={post.id} 
                onClick={() => handlePostItemClick(post.id)}
                className={`aspect-square bg-gray-50 border rounded-2xl overflow-hidden hover:scale-[1.03] hover:z-10 transition-all cursor-pointer shadow-sm group relative ${isBanned ? 'border-red-200' : 'border-black/5'}`}
              >
                {post.photoURL ? (
                  <img src={post.photoURL} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" alt="Post Capture" />
                ) : post.videoURL ? (
                  <video src={post.videoURL} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                ) : (
                  <div className="w-full h-full p-2.5 bg-neutral-900 text-white flex flex-col justify-between select-none">
                    <p className="text-[9px] font-bold line-clamp-3 leading-snug opacity-90">{post.text || 'Orbit Post'}</p>
                    <div className="flex items-center justify-between text-[8px] opacity-60">
                      <i className="fas fa-quote-left text-[8px]"></i>
                      {post.musicURL && <i className="fas fa-music text-[8px]"></i>}
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute top-2 right-2 text-white opacity-0 group-hover:opacity-100 drop-shadow-md">
                   {post.videoURL ? <i className="fas fa-video text-xs"></i> : post.photoURL ? <i className="fas fa-image text-xs"></i> : <i className="fas fa-comment-dots text-xs"></i>}
                </div>
              </div>
            ))}
            {(user.recentCaptures || []).map((url, i) => (
              <div 
                key={`legacy_${i}`} 
                onClick={() => setSelectedCaptureUrl(url)}
                className={`aspect-square bg-gray-50 border rounded-2xl overflow-hidden hover:scale-[1.03] hover:z-10 transition-all cursor-pointer shadow-sm group relative ${isBanned ? 'border-red-200' : 'border-black/5'}`}
              >
                <img src={url} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" alt={`Capture ${i}`} />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold px-2 py-0.5 bg-black/60 backdrop-blur-xs rounded-full">
                    {t('captures') || 'Capture'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalType && (
        <UserListModal 
          title={modalType === 'followers' ? (t('souls_following') || 'Souls Following') : (t('souls_followed') || 'Souls Followed')}
          users={modalType === 'followers' ? followersList : followingList}
          currentUser={currentUser}
          onClose={() => setModalType(null)}
          onToggleFollow={onToggleFollow}
          onUserClick={(uid) => {
            setModalType(null);
            onUserClick(uid);
          }}
        />
      )}

      {/* Selected Capture Fullscreen Lightbox */}
      {selectedCaptureUrl && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="absolute inset-0" onClick={() => setSelectedCaptureUrl(null)}></div>
          <div className="relative max-w-md w-full bg-neutral-950 rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl p-4 flex flex-col items-center">
            <button 
              onClick={() => setSelectedCaptureUrl(null)}
              className="absolute top-4 right-4 z-50 w-9 h-9 flex items-center justify-center bg-white/20 hover:bg-white text-white hover:text-black rounded-full transition-all"
            >
              <i className="fas fa-times text-sm"></i>
            </button>
            <div className="w-full aspect-square rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 my-2 flex items-center justify-center">
              <img src={selectedCaptureUrl} alt="Visual Capture" className="w-full h-full object-contain" />
            </div>
            {isMe && onDeleteCapture && (
              <button
                onClick={() => {
                  onDeleteCapture(selectedCaptureUrl);
                  setSelectedCaptureUrl(null);
                }}
                className="mt-2 px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5"
              >
                <i className="fas fa-trash-alt text-[10px]"></i>
                <span>Hapus Tangkapan</span>
              </button>
            )}
          </div>
        </div>
      )}

      {selectedPostId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setSelectedPostId(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setSelectedPostId(null)}
              className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="overflow-y-auto hide-scrollbar">
              {posts.find(p => p.id === selectedPostId) && (
                <PostCard 
                  post={posts.find(p => p.id === selectedPostId)!}
                  onLike={onLike!}
                  onDislike={onDislike!}
                  onComment={onComment!}
                  onUserClick={(uid) => {
                    setSelectedPostId(null);
                    onUserClick(uid);
                  }}
                  currentUser={currentUser}
                  onFollow={onToggleFollow}
                  onTakeDownPost={onTakeDownPost}
                  onDeletePost={onDeletePost}
                  users={users}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="absolute inset-0" onClick={() => setIsSettingsOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-10">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-gray-100 text-black rounded-full hover:bg-black hover:text-white transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
            
            <h3 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center">
              <i className="fas fa-cog mr-2"></i>
              {t('settings')}
            </h3>

            <div className="space-y-5">
              {/* VIMOS Official Brand Badge */}
              <div className="bg-black text-white p-4 rounded-2xl flex items-center justify-between shadow-md">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-black text-sm shadow-xs">
                    V
                  </div>
                  <div>
                    <h4 className="text-sm font-black tracking-tight uppercase">VIMOS</h4>
                    <p className="text-[10px] text-neutral-400 font-medium">Media Sosial &amp; Chat</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold bg-neutral-800 text-yellow-400 px-2 py-1 rounded-lg border border-neutral-700">
                  Official
                </span>
              </div>

              <div className="border-t border-gray-100 pt-4 flex flex-col space-y-2">
                <button
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onLogout();
                  }}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-2xl font-black uppercase tracking-wider text-xs transition-colors flex items-center justify-center space-x-2"
                >
                  <i className="fas fa-sign-out-alt"></i>
                  <span>{t('logout')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* WHATSAPP-STYLE CONTACT MODAL & SERIAL UNLOCK */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in text-left">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border-2 border-black animate-scale-up">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-100">
              <div className="flex items-center space-x-2.5">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs text-white ${
                  !canViewSerial ? 'bg-amber-500' : 'bg-emerald-500'
                }`}>
                  <i className={`fas ${!canViewSerial ? 'fa-key' : 'fa-address-book'} text-sm`}></i>
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-tight text-neutral-900">
                    {savedContact 
                      ? 'Ganti Nama Kontak' 
                      : autoNavigateChatOnSave 
                        ? 'Buka Obrolan' 
                        : 'Simpan ke Kontak'}
                  </h4>
                  <p className="text-[10px] text-neutral-400 font-bold">
                    @{user.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsContactModalOpen(false);
                  setSerialError('');
                  setInputSerialCode('');
                }}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center text-xs"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              {/* If user does not have this person's serial code, they must enter it to unlock! */}
              {!canViewSerial && (
                <div className="space-y-1.5 p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-900">
                      Nomor Seri Akun (Wajib)
                    </label>
                    <span className="text-[9px] font-black text-amber-800 bg-amber-200/80 px-1.5 py-0.2 rounded">
                      🔒 Terkunci
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={inputSerialCode}
                    onChange={(e) => {
                      setInputSerialCode(e.target.value.toUpperCase());
                      setSerialError('');
                    }}
                    placeholder="Contoh: ORB-123456"
                    className="w-full p-2.5 bg-white border-2 border-amber-300 focus:border-black rounded-xl text-xs font-mono font-black tracking-wider text-black focus:outline-none transition-all uppercase placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400"
                  />
                  <p className="text-[10px] text-amber-800/80 font-medium leading-relaxed">
                    Anda tidak bisa mengobrol tanpa nomor seri pemilik akun. Minta nomor seri kepada <strong>@{user.name}</strong> untuk melanjutkan.
                  </p>
                  {serialError && (
                    <div className="p-2 bg-red-100 border border-red-300 rounded-xl text-red-700 text-[11px] font-black flex items-center space-x-1.5 animate-shake">
                      <i className="fas fa-triangle-exclamation shrink-0"></i>
                      <span>{serialError}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-600 ml-1 block mb-1.5">
                  Nama Panggilan Kontak (Hanya Anda yang Melihat)
                </label>
                <input
                  type="text"
                  required
                  autoFocus={canViewSerial}
                  value={contactCustomName}
                  onChange={(e) => setContactCustomName(e.target.value)}
                  placeholder="Misal: Kak Budi, Teman Kampus"
                  className="w-full p-3 bg-neutral-50 border-2 border-neutral-200 focus:border-black rounded-xl text-sm font-bold text-neutral-900 focus:outline-none transition-all"
                />
                <p className="text-[10px] text-neutral-500 font-medium mt-1.5 ml-1">
                  Mirip seperti WhatsApp, nama ini akan menggantikan username publik di pesan &amp; kontak Anda.
                </p>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                {savedContact && (
                  <button
                    type="button"
                    onClick={handleDeleteContact}
                    className="p-3 border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                    title="Hapus dari Kontak"
                  >
                    <i className="fas fa-trash-can"></i>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsContactModalOpen(false);
                    setSerialError('');
                    setInputSerialCode('');
                  }}
                  className="flex-1 py-3 border-2 border-neutral-200 hover:border-black rounded-xl text-xs font-black uppercase tracking-wider text-neutral-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={contactSaving || !contactCustomName.trim() || (!canViewSerial && !inputSerialCode.trim())}
                  className="flex-1 py-3 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <i className={`fas ${!canViewSerial ? 'fa-key' : 'fa-check'} text-xs`}></i>
                  <span>
                    {contactSaving 
                      ? 'Memverifikasi...' 
                      : (!canViewSerial && autoNavigateChatOnSave)
                        ? 'Buka Obrolan'
                        : 'Simpan Kontak'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(Profile);
