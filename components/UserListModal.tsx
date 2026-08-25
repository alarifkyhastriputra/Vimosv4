
import React from 'react';
import { User } from '../types.ts';

interface UserListModalProps {
  title: string;
  users: User[];
  currentUser: User;
  onClose: () => void;
  onToggleFollow: (id: string) => void;
  onUserClick: (userId: string) => void;
}

export default function UserListModal({ 
  title, 
  users, 
  currentUser, 
  onClose, 
  onToggleFollow, 
  onUserClick 
}: UserListModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border-2 border-black flex flex-col max-h-[70vh]">
        <div className="p-5 border-b-2 border-black flex items-center justify-between bg-white sticky top-0 z-10">
          <h3 className="font-black uppercase tracking-[0.2em] text-sm">{title}</h3>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center border-2 border-black rounded-full hover:bg-black hover:text-white transition-all active:scale-90">
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {users.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center space-y-3 opacity-30">
              <i className="fas fa-users-slash text-3xl"></i>
              <p className="text-[10px] uppercase font-bold tracking-widest">No souls detected</p>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((u) => {
                const isFollowing = (currentUser.following || []).includes(u.id);
                const isMe = u.id === currentUser.id;
                
                return (
                  <div key={u.id} className="flex items-center p-3 hover:bg-gray-50 rounded-2xl transition-all group">
                    <img 
                      src={u.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}&backgroundColor=000000`} 
                      alt={u.name} 
                      className="w-12 h-12 rounded-full object-cover mr-4 border border-black/10 bg-gray-100 cursor-pointer group-hover:border-black transition-all" 
                      onClick={() => onUserClick(u.id)}
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onUserClick(u.id)}>
                      <p className="font-black text-sm uppercase tracking-tighter truncate">{u.name}</p>
                      <p className="text-[9px] text-gray-400 truncate uppercase font-bold tracking-widest">
                        {(u.followers || []).length} Followers
                      </p>
                    </div>
                    {!isMe && (
                      <button 
                        onClick={() => onToggleFollow(u.id)}
                        className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border-2 ${
                          isFollowing 
                            ? 'bg-white text-gray-400 border-gray-100 hover:border-red-500 hover:text-red-500' 
                            : 'bg-black text-white border-black hover:opacity-80'
                        }`}
                      >
                        {isFollowing ? 'Unfollow' : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
