
import React from 'react';
import { UserNotification, User } from '../types.ts';

interface NotificationsProps {
  notifications: UserNotification[];
  currentUser: User;
  onFollow: (userId: string) => void;
  onUserClick: (userId: string) => void;
  onPostClick?: (postId: string) => void;
  onClearAll: () => void;
  users: User[];
}

export default function Notifications({ 
  notifications, 
  currentUser, 
  onFollow, 
  onUserClick, 
  onPostClick,
  onClearAll,
  users
}: NotificationsProps) {
  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Baru saja';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m lalu`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}j lalu`;
    return `${Math.floor(seconds / 86400)}h lalu`;
  };

  const getActionText = (notif: UserNotification) => {
    switch (notif.type) {
      case 'follow': return 'mulai mengikuti Anda.';
      case 'like': return 'menyukai postingan Anda.';
      case 'comment': return 'mengomentari postingan Anda.';
      case 'reply': return 'membalas komentar Anda.';
      case 'mention': return 'menandai Anda dalam komentar:';
      default: return 'berinteraksi dengan Anda.';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'follow': return <i className="fas fa-user-plus text-black"></i>;
      case 'like': return <i className="fas fa-heart text-red-500"></i>;
      case 'comment': return <i className="fas fa-comment text-blue-500"></i>;
      case 'reply': return <i className="fas fa-reply text-indigo-500"></i>;
      case 'mention': return <i className="fas fa-at text-emerald-500"></i>;
      default: return <i className="fas fa-bell text-gray-400"></i>;
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Echoes</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Recent activity in your orbit</p>
        </div>
        {notifications.some(n => !n.read) && (
          <button 
            onClick={onClearAll}
            className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-3 py-1.5 rounded-full hover:opacity-80 transition-all active:scale-95"
          >
            Clear All
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <i className="fas fa-bell-slash text-5xl mb-4"></i>
          <p className="font-black uppercase tracking-widest text-xs">Total silence...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((notif) => {
            const isFollowingBack = (currentUser.following || []).includes(notif.senderId);
            const senderUser = users.find(u => u.id === notif.senderId);
            const hasPost = Boolean(notif.postId);

            return (
              <div 
                key={notif.id} 
                onClick={() => {
                  if (notif.postId && onPostClick) {
                    onPostClick(notif.postId);
                  }
                }}
                className={`flex items-center p-4 rounded-2xl border transition-all shadow-xs group ${
                  notif.read ? 'bg-white border-black/5 hover:border-black/20' : 'bg-neutral-50/80 border-black/30 animate-pulse-subtle'
                } ${hasPost ? 'cursor-pointer hover:bg-neutral-50/90 active:scale-[0.99]' : ''}`}
              >
                <div className="relative shrink-0">
                  <img 
                    src={notif.senderPhoto} 
                    alt={notif.senderName} 
                    className="w-12 h-12 rounded-full border border-black/10 cursor-pointer object-cover"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUserClick(notif.senderId);
                    }}
                  />
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full w-5 h-5 flex items-center justify-center border border-black/10 shadow-sm text-[8px]">
                    {getIcon(notif.type)}
                  </div>
                </div>

                <div className="flex-1 min-w-0 ml-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium leading-snug">
                      <span 
                        className="font-black uppercase tracking-tighter cursor-pointer hover:underline text-neutral-900" 
                        onClick={(e) => {
                          e.stopPropagation();
                          onUserClick(notif.senderId);
                        }}
                      >
                        {notif.senderName}
                      </span>
                      {senderUser?.role && (
                         <span className="bg-black text-white text-[6px] font-black px-1 py-0.5 rounded uppercase tracking-tighter ml-1">
                           {senderUser.role}
                         </span>
                      )}
                      <span className="text-gray-600 ml-1">
                        {getActionText(notif)}
                      </span>
                    </p>
                  </div>

                  {/* Preview comment text or post text if available */}
                  {notif.commentText && (
                    <p className="text-xs text-neutral-800 font-semibold bg-black/5 px-2.5 py-1 rounded-lg mt-1 inline-block max-w-full truncate border border-black/5">
                      "{notif.commentText}"
                    </p>
                  )}

                  {notif.postText && !notif.commentText && (
                    <p className="text-xs text-neutral-500 italic mt-0.5 truncate">
                      "{notif.postText}"
                    </p>
                  )}

                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                      {timeAgo(notif.timestamp)}
                    </span>
                    {hasPost && (
                      <span className="text-[9px] font-bold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded-full flex items-center space-x-1 group-hover:bg-black group-hover:text-white transition-colors">
                        <i className="fas fa-arrow-right text-[7px]"></i>
                        <span>Buka Postingan</span>
                      </span>
                    )}
                  </div>
                </div>
                
                {notif.type === 'follow' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onFollow(notif.senderId);
                    }}
                    className={`ml-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border-2 shrink-0 ${
                      isFollowingBack 
                        ? 'border-gray-100 text-gray-300 pointer-events-none' 
                        : 'border-black bg-black text-white hover:opacity-80 active:scale-90 shadow-sm'
                    }`}
                  >
                    {isFollowingBack ? 'Followed' : 'Follow Back'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
