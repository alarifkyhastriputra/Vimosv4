
import React, { useState } from 'react';
import { User, Post } from '../types';
import { useLanguage } from '../LanguageContext';

interface LeaderboardProps {
  users: User[];
  posts: Post[];
  onUserClick: (uid: string) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ users, posts, onUserClick }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'creators' | 'posts'>('creators');

  // Calculate Top Creators based on Likes + Followers
  const rankedCreators = users
    .filter((u) => !u.isBanned)
    .map((u) => {
      const userPosts = posts.filter((p) => p.userId === u.id);
      const totalLikes = userPosts.reduce((acc, p) => acc + (p.likes?.length || 0), 0);
      const followersCount = (u.followers || []).length;
      const creatorScore = totalLikes * 3 + followersCount * 5 + userPosts.length * 2;

      return {
        ...u,
        totalLikes,
        postsCount: userPosts.length,
        followersCount,
        creatorScore
      };
    })
    .sort((a, b) => b.creatorScore - a.creatorScore);

  // Calculate Most Popular Posts
  const rankedPosts = [...posts]
    .filter((p) => !p.isTakenDown)
    .sort((a, b) => ((b.likes?.length || 0) + (b.comments?.length || 0) * 2) - ((a.likes?.length || 0) + (a.comments?.length || 0) * 2))
    .slice(0, 30);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto pb-24">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter mb-1.5">VIMOS ELITE</h2>
        <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-[0.2em]">
          Papan Peringkat Kreator & Karya Terbaik
        </p>

        {/* Tab Switcher */}
        <div className="mt-5 flex bg-neutral-100 p-1 rounded-2xl border border-neutral-200/80 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('creators')}
            className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'creators'
                ? 'bg-black text-white shadow-sm'
                : 'text-neutral-500 hover:text-black'
            }`}
          >
            <i className="fas fa-crown text-xs"></i>
            <span>Top Kreator</span>
          </button>

          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'posts'
                ? 'bg-black text-white shadow-sm'
                : 'text-neutral-500 hover:text-black'
            }`}
          >
            <i className="fas fa-fire text-xs"></i>
            <span>Postingan Populer</span>
          </button>
        </div>
      </div>

      {/* 1. TOP CREATORS */}
      {activeTab === 'creators' && (
        <div className="space-y-3 animate-fade-in">
          {rankedCreators.map((user, index) => {
            const fallbackPhoto = `https://api.dicebear.com/7.x/initials/svg?seed=${
              user.name || 'Unknown'
            }&backgroundColor=000000&fontFamily=Inter&fontWeight=700`;

            return (
              <div
                key={`creator-${user.id}-${index}`}
                className="flex items-center p-3.5 sm:p-4 border border-neutral-200/90 rounded-2xl bg-white hover:border-black transition-all group cursor-pointer shadow-2xs"
                onClick={() => onUserClick(user.id)}
              >
                {/* Rank Trophy / Badge */}
                <div className="w-8 font-black italic text-base sm:text-lg flex items-center justify-center shrink-0">
                  {index === 0 ? (
                    <span className="text-yellow-500 text-lg">👑 1</span>
                  ) : index === 1 ? (
                    <span className="text-slate-400 text-base">🥈 2</span>
                  ) : index === 2 ? (
                    <span className="text-amber-700 text-base">🥉 3</span>
                  ) : (
                    <span className="opacity-30 text-xs font-black">{index + 1}</span>
                  )}
                </div>

                {/* Avatar */}
                <img
                  src={user.photoURL || fallbackPhoto}
                  className="w-10 h-10 rounded-full mr-3 border border-neutral-200 bg-neutral-100 object-cover shrink-0"
                  alt={user.name}
                  loading="lazy"
                />

                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs sm:text-sm uppercase truncate">{user.name || 'Anonymous'}</h4>
                  <div className="flex items-center space-x-2 text-[10px] text-neutral-500 mt-0.5">
                    <span>{user.followersCount} Pengikut</span>
                    <span>•</span>
                    <span>❤️ {user.totalLikes} Suka</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-black text-base text-neutral-900">{user.creatorScore}</p>
                  <p className="text-[8px] text-neutral-400 font-black uppercase tracking-wider">Skor Elite</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. POPULAR POSTS */}
      {activeTab === 'posts' && (
        <div className="space-y-3 animate-fade-in">
          {rankedPosts.map((post, index) => {
            const author = users.find((u) => u.id === post.userId);
            const fallbackPhoto = `https://api.dicebear.com/7.x/initials/svg?seed=${
              post.userName || 'Unknown'
            }&backgroundColor=000000&fontFamily=Inter&fontWeight=700`;

            return (
              <div
                key={`post-${post.id}-${index}`}
                className="flex items-center p-3.5 sm:p-4 border border-neutral-200/90 rounded-2xl bg-white hover:border-black transition-all group cursor-pointer shadow-2xs"
                onClick={() => onUserClick(post.userId)}
              >
                <span className="w-8 font-black italic text-sm text-neutral-400 flex items-center justify-center shrink-0">
                  #{index + 1}
                </span>

                <img
                  src={post.userPhoto || author?.photoURL || fallbackPhoto}
                  className="w-9 h-9 rounded-full mr-3 border border-neutral-200 object-cover shrink-0"
                  alt={post.userName}
                  loading="lazy"
                />

                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="font-bold text-xs truncate uppercase">{post.userName || 'Anonymous'}</h4>
                  <p className="text-[11px] text-neutral-600 truncate mt-0.5 font-medium">
                    {post.text || '(Foto / Video Karya)'}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-black text-sm text-neutral-900">❤️ {post.likes?.length || 0}</p>
                  <p className="text-[9px] text-neutral-400 font-bold">💬 {post.comments?.length || 0}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;

