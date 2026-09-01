
import React, { useState } from 'react';
import { User, Post } from '../types.ts';
import UserListModal from './UserListModal.tsx';
import PostCard from './PostCard.tsx';
import { useLanguage } from '../LanguageContext.tsx';
import { SHOP_ITEMS } from './Shop.tsx';
import { compressImage } from '../services/imageCompressor.ts';

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
            <h2 
              className={`text-3xl font-black uppercase tracking-tighter mb-2 flex items-center justify-center space-x-1 ${isBanned ? 'text-red-600' : ''}`}
              style={user.roleColor ? { color: user.roleColor } : undefined}
            >
              <span>{displayName}</span>
              {user.equippedBadge && <span className="text-xl ml-1">{user.equippedBadge}</span>}
            </h2>
            
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
                            onClick={() => onNavigateToChat(user.id)}
                            className="px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border-2 border-black bg-neutral-900 text-white hover:bg-black shadow-lg active:scale-95 flex items-center space-x-1.5"
                            title="Kirim Pesan Langsung"
                          >
                            <i className="fas fa-comment-dots text-xs"></i>
                            <span>Pesan</span>
                          </button>
                        )}
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

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {t('language')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLanguage('id')}
                    className={`p-3 rounded-2xl border-2 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${
                      language === 'id' 
                        ? 'border-black bg-black text-white shadow-md' 
                        : 'border-gray-200 hover:border-black text-gray-600'
                    }`}
                  >
                    <span>🇮🇩</span>
                    <span>{t('indonesian')}</span>
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={`p-3 rounded-2xl border-2 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${
                      language === 'en' 
                        ? 'border-black bg-black text-white shadow-md' 
                        : 'border-gray-200 hover:border-black text-gray-600'
                    }`}
                  >
                    <span>🇺🇸</span>
                    <span>{t('english')}</span>
                  </button>
                  <button
                    onClick={() => setLanguage('ja')}
                    className={`p-3 rounded-2xl border-2 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${
                      language === 'ja' 
                        ? 'border-black bg-black text-white shadow-md' 
                        : 'border-gray-200 hover:border-black text-gray-600'
                    }`}
                  >
                    <span>🇯🇵</span>
                    <span>{t('japanese')}</span>
                  </button>
                  <button
                    onClick={() => setLanguage('zh')}
                    className={`p-3 rounded-2xl border-2 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 ${
                      language === 'zh' 
                        ? 'border-black bg-black text-white shadow-md' 
                        : 'border-gray-200 hover:border-black text-gray-600'
                    }`}
                  >
                    <span>🇨🇳</span>
                    <span>{t('chinese')}</span>
                  </button>
                </div>
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
    </div>
  );
}

export default React.memo(Profile);
