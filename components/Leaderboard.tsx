
import React, { useState, useEffect } from 'react';
import { User, Post, LiveStream } from '../types';
import { useLanguage } from '../LanguageContext';
import { db } from '../firebase';
import { ref, onValue, query, limitToLast } from 'firebase/database';

interface LeaderboardProps {
  users: User[];
  posts: Post[];
  onUserClick: (uid: string) => void;
  onStreamClick?: (streamId: string) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ users, posts, onUserClick, onStreamClick }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'live' | 'post'>('live');
  const [allLiveStreams, setAllLiveStreams] = useState<LiveStream[]>(() => {
    try {
      const stored = localStorage.getItem('vimos_all_livestreams');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Fetch all live streams (both active & ended) to calculate streamer rankings
  useEffect(() => {
    const streamsQuery = query(ref(db, 'livestreams'), limitToLast(100));
    const unsubscribe = onValue(streamsQuery, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: LiveStream[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val
        }));
        setAllLiveStreams(list);
        try { localStorage.setItem('vimos_all_livestreams', JSON.stringify(list)); } catch {}
      } else {
        setAllLiveStreams([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Calculate Live Streamer Leaderboard
  const rankedStreamers = users
    .filter((u) => !u.isBanned)
    .map((u) => {
      const userStreams = allLiveStreams.filter((s) => s.hostId === u.id);
      const totalLikes = userStreams.reduce((acc, s) => acc + (s.likesCount || 0), 0);
      const totalViewersPeak = userStreams.reduce(
        (acc, s) => acc + (s.viewers ? Object.keys(s.viewers).length : 0),
        0
      );
      const isCurrentlyLive = userStreams.some((s) => s.status === 'live');
      const activeStream = userStreams.find((s) => s.status === 'live');

      return {
        ...u,
        totalLikes,
        totalViewersPeak,
        streamCount: userStreams.length,
        isCurrentlyLive,
        activeStreamId: activeStream?.id,
        // Composite Live Score formula: Likes x 10 + Viewers x 5 + StreamCount x 20
        liveScore: totalLikes * 10 + totalViewersPeak * 5 + userStreams.length * 20
      };
    })
    .sort((a, b) => b.liveScore - a.liveScore);

  // Calculate Post Leaderboard
  const rankedPostUsers = users
    .filter((u) => !u.isBanned)
    .map((u) => {
      const userLikes = posts
        .filter((p) => p.userId === u.id)
        .reduce((acc, p) => acc + (p.likes?.length || 0), 0);
      return { ...u, score: userLikes };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">VIMOS ELITE</h2>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em]">
          Papan Peringkat Official Vimos
        </p>

        {/* Tab Switcher: Live Ranking vs Post Ranking */}
        <div className="mt-6 flex bg-black/5 p-1 rounded-2xl border border-black/10 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('live')}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'live'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            <i className="fas fa-tower-broadcast text-xs animate-pulse"></i>
            <span>{t('live_leaderboard')}</span>
          </button>

          <button
            onClick={() => setActiveTab('post')}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 ${
              activeTab === 'post'
                ? 'bg-black text-white shadow-md'
                : 'text-gray-500 hover:text-black'
            }`}
          >
            <i className="fas fa-heart text-xs"></i>
            <span>{t('post_leaderboard')}</span>
          </button>
        </div>
      </div>

      {/* 1. LIVE STREAMERS RANKING */}
      {activeTab === 'live' && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between text-red-900">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-black">
                <i className="fas fa-trophy text-lg"></i>
              </div>
              <div>
                <h3 className="font-black text-sm uppercase">King Streamer Leaderboard</h3>
                <p className="text-[10px] text-red-700 font-medium">
                  Berdasarkan Reaksi, Penonton, & Frekuensi Live Streaming
                </p>
              </div>
            </div>
          </div>

          {rankedStreamers.map((user, index) => {
            const fallbackPhoto = `https://api.dicebear.com/7.x/initials/svg?seed=${
              user.name || 'Unknown'
            }&backgroundColor=000000&fontFamily=Inter&fontWeight=700`;

            return (
              <div
                key={`streamer-${user.id}-${index}`}
                className={`flex items-center p-4 border rounded-2xl transition-all group relative overflow-hidden ${
                  user.isCurrentlyLive
                    ? 'border-red-500 bg-red-50/50 hover:bg-red-100/60 shadow-lg'
                    : 'border-black/10 bg-white hover:bg-black hover:text-white'
                }`}
              >
                {/* Rank Crown for Top 3 */}
                <div className="w-8 font-black italic text-lg flex items-center justify-center">
                  {index === 0 ? (
                    <span className="text-yellow-500 text-xl">👑 1</span>
                  ) : index === 1 ? (
                    <span className="text-slate-400 text-lg">🥈 2</span>
                  ) : index === 2 ? (
                    <span className="text-amber-700 text-lg">🥉 3</span>
                  ) : (
                    <span className="opacity-30 group-hover:opacity-60">{index + 1}</span>
                  )}
                </div>

                {/* User Avatar with Live Ring if Active */}
                <div
                  className="relative cursor-pointer mr-4"
                  onClick={() => {
                    if (user.isCurrentlyLive && user.activeStreamId && onStreamClick) {
                      onStreamClick(user.activeStreamId);
                    } else {
                      onUserClick(user.id);
                    }
                  }}
                >
                  {user.isCurrentlyLive && (
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-red-600 to-amber-500 animate-spin"></div>
                  )}
                  <img
                    src={user.photoURL || fallbackPhoto}
                    className="w-12 h-12 rounded-full border border-black/10 bg-gray-100 object-cover relative z-10"
                    alt={user.name}
                  />
                  {user.isCurrentlyLive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[7px] font-black uppercase px-1.5 py-0.2 rounded-full border border-white z-20 shadow-md animate-pulse">
                      LIVE
                    </span>
                  )}
                </div>

                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => onUserClick(user.id)}
                >
                  <div className="flex items-center space-x-2">
                    <h4 className="font-black text-sm uppercase">{user.name || 'Anonymous'}</h4>
                    {user.isCurrentlyLive && (
                      <span className="text-[9px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                        Sedang Live
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-[10px] text-gray-500 group-hover:text-gray-300 mt-0.5">
                    <span>❤️ {user.totalLikes} Live Reaksi</span>
                    <span>•</span>
                    <span>🎥 {user.streamCount} Siaran</span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-black text-lg text-red-600 group-hover:text-red-400">
                    {user.liveScore}
                  </p>
                  <p className="text-[8px] opacity-60 font-black uppercase tracking-wider">
                    Poin Live
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. POST LIKES RANKING */}
      {activeTab === 'post' && (
        <div className="space-y-3 animate-fade-in">
          {rankedPostUsers.map((user, index) => {
            const fallbackPhoto = `https://api.dicebear.com/7.x/initials/svg?seed=${
              user.name || 'Unknown'
            }&backgroundColor=000000&fontFamily=Inter&fontWeight=700`;

            return (
              <div
                key={`postuser-${user.id}-${index}`}
                className="flex items-center p-4 border border-black/10 rounded-2xl bg-white hover:bg-black hover:text-white transition-all group cursor-pointer"
                onClick={() => onUserClick(user.id)}
              >
                <span className="w-8 font-black italic text-lg opacity-20 group-hover:opacity-50">
                  {index + 1}
                </span>
                <img
                  src={user.photoURL || fallbackPhoto}
                  className="w-10 h-10 rounded-full mr-4 border border-black/10 bg-gray-100 object-cover"
                  alt={user.name}
                />
                <div className="flex-1">
                  <h4 className="font-bold text-sm uppercase">{user.name || 'Anonymous'}</h4>
                  <p className="text-[10px] opacity-60 font-medium uppercase">
                    {(user.followers || []).length} Followers
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-lg">{user.score}</p>
                  <p className="text-[8px] opacity-60 font-bold uppercase">Likes</p>
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

