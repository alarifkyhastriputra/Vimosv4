import React, { useState } from 'react';
import { User, LiveStream } from '../types.ts';
import { useLanguage } from '../LanguageContext.tsx';

interface LiveHubProps {
  activeStreams: LiveStream[];
  users: User[];
  currentUser: User;
  onGoLiveClick: () => void;
  onStreamClick: (streamId: string) => void;
  onUserClick: (userId: string) => void;
  onFollow?: (userId: string) => void;
}

export const LiveHub: React.FC<LiveHubProps> = ({
  activeStreams = [],
  users = [],
  currentUser,
  onGoLiveClick,
  onStreamClick,
  onUserClick,
  onFollow
}) => {
  const { t } = useLanguage();
  const [filterType, setFilterType] = useState<'all' | 'camera' | 'screen'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStreams = activeStreams.filter((stream) => {
    const matchesType = filterType === 'all' || stream.streamType === filterType;
    const matchesSearch =
      stream.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.hostName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const cameraStreamsCount = activeStreams.filter(s => s.streamType === 'camera').length;
  const screenStreamsCount = activeStreams.filter(s => s.streamType === 'screen').length;

  return (
    <div className="p-4 space-y-6 max-w-xl mx-auto pb-24 animate-fade-in">
      {/* Hero Banner Section */}
      <div className="relative rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-red-950 p-6 border-2 border-red-600/60 shadow-2xl overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2 bg-red-600/20 border border-red-500/40 px-3 py-1 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
              <span className="text-[10px] font-black uppercase tracking-wider text-red-400">
                Vimos Live Studio Hub
              </span>
            </div>
            <div className="bg-zinc-800/80 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold text-zinc-300">
              <i className="fas fa-satellite-dish text-red-500 mr-1.5"></i>
              <span>{activeStreams.length} {t('active_streamers')}</span>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              <span>{t('live_stream_title')}</span>
              <i className="fas fa-tower-broadcast text-red-500 text-xl"></i>
            </h1>
            <p className="text-xs text-zinc-300 font-medium mt-1 leading-relaxed">
              {t('live_stream_desc')}
            </p>
          </div>

          <div className="pt-1 flex items-center space-x-3">
            <button
              onClick={onGoLiveClick}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs px-5 py-3.5 rounded-2xl shadow-xl hover:shadow-2xl transition-all active:scale-95 flex items-center justify-center space-x-2 border border-red-400/30"
            >
              <i className="fas fa-video text-sm"></i>
              <span>+ {t('go_live')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 hide-scrollbar">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border ${
              filterType === 'all'
                ? 'bg-black text-white border-black shadow-md'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            {t('all')} ({activeStreams.length})
          </button>
          <button
            onClick={() => setFilterType('camera')}
            className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border flex items-center space-x-1.5 ${
              filterType === 'camera'
                ? 'bg-red-600 text-white border-red-600 shadow-md'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <i className="fas fa-camera text-xs"></i>
            <span>{t('camera')} ({cameraStreamsCount})</span>
          </button>
          <button
            onClick={() => setFilterType('screen')}
            className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border flex items-center space-x-1.5 ${
              filterType === 'screen'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <i className="fas fa-desktop text-xs"></i>
            <span>{t('screen')} ({screenStreamsCount})</span>
          </button>
        </div>

        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
            <i className="fas fa-search"></i>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_stream_placeholder')}
            className="w-full bg-gray-50 border-2 border-black/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none focus:border-black transition-all"
          />
        </div>
      </div>

      {/* Main Stream Cards Listing */}
      {filteredStreams.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
              <span>{t('live_now')}</span>
            </h2>
            <span className="text-[10px] font-bold text-gray-400 uppercase">
              {filteredStreams.length} {t('results')}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredStreams.map((stream) => {
              const viewerCount = stream.viewers ? Object.keys(stream.viewers).length : 1;
              const hostUser = users.find((u) => u.id === stream.hostId);
              const isFollowingHost = currentUser.following?.includes(stream.hostId);

              return (
                <div
                  key={stream.id}
                  className="group relative bg-zinc-950 text-white border-2 border-red-600/80 rounded-3xl overflow-hidden shadow-xl hover:border-red-500 transition-all hover:scale-[1.01]"
                >
                  {/* Stream Visual Preview */}
                  <div
                    onClick={() => onStreamClick(stream.id)}
                    className="relative h-52 sm:h-60 bg-gradient-to-tr from-zinc-950 via-zinc-900 to-red-950/90 flex items-center justify-center overflow-hidden cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all"></div>

                    {/* Host Photo Blur Backdrop */}
                    <img
                      src={
                        stream.hostPhoto ||
                        `https://api.dicebear.com/7.x/initials/svg?seed=${stream.hostName}`
                      }
                      alt={stream.hostName}
                      className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Center Watch Button */}
                    <div className="relative z-20 flex flex-col items-center space-y-2 text-center p-4">
                      <div className="w-16 h-16 rounded-full bg-red-600/90 border-2 border-white text-white flex items-center justify-center text-2xl shadow-2xl group-hover:scale-110 transition-transform">
                        <i className="fas fa-play ml-1 animate-pulse"></i>
                      </div>
                      <span className="bg-red-600 text-white text-[10px] font-black uppercase px-4 py-1.5 rounded-full shadow-lg tracking-widest border border-white/20">
                        {t('watch_live')}
                      </span>
                    </div>

                    {/* Top Left Badges */}
                    <div className="absolute top-3 left-3 z-20 flex items-center space-x-2">
                      <div className="bg-red-600 text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-full flex items-center space-x-1.5 shadow-md animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        <span>LIVE</span>
                      </div>
                      <div className="bg-black/70 backdrop-blur-md text-white text-[9px] font-bold px-2.5 py-1 rounded-full border border-white/10 flex items-center space-x-1">
                        <i
                          className={`fas ${
                            stream.streamType === 'screen'
                              ? 'fa-desktop text-blue-400'
                              : 'fa-video text-rose-400'
                          }`}
                        ></i>
                        <span>
                          {stream.streamType === 'screen' ? t('screen') : t('camera')}
                        </span>
                      </div>
                    </div>

                    {/* Top Right Viewer Badge */}
                    <div className="absolute top-3 right-3 z-20 bg-black/80 backdrop-blur-md text-white text-[9px] font-black px-3 py-1 rounded-full border border-white/10 flex items-center space-x-1.5 shadow-lg">
                      <i className="fas fa-eye text-red-500 animate-pulse"></i>
                      <span>{viewerCount} {t('viewers')}</span>
                    </div>
                  </div>

                  {/* Bottom Host & Actions Bar */}
                  <div className="p-4 bg-zinc-900/95 border-t border-white/10 flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                      <img
                        src={
                          stream.hostPhoto ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${stream.hostName}`
                        }
                        alt={stream.hostName}
                        onClick={() => onUserClick(stream.hostId)}
                        className="w-11 h-11 rounded-full border-2 border-red-500 object-cover cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-black text-sm uppercase text-white truncate">
                          {stream.title}
                        </h4>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <p
                            onClick={() => onUserClick(stream.hostId)}
                            className="text-[10px] text-zinc-400 font-bold uppercase truncate hover:underline cursor-pointer"
                          >
                            Host: {stream.hostName}
                          </p>
                          {stream.hostId !== currentUser.id && onFollow && (
                            <button
                              onClick={() => onFollow(stream.hostId)}
                              className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border transition-all ${
                                isFollowingHost
                                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                  : 'bg-red-600 text-white border-red-500 hover:bg-red-500'
                              }`}
                            >
                              {isFollowingHost ? 'Following' : '+ Follow'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onStreamClick(stream.id)}
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 flex-shrink-0"
                    >
                      {t('watch')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty State when no live streams */
        <div className="bg-zinc-900 border-2 border-zinc-800 rounded-3xl p-8 text-center space-y-5 text-white shadow-xl my-4">
          <div className="w-20 h-20 rounded-full bg-red-600/10 border-2 border-red-600/30 text-red-500 flex items-center justify-center mx-auto text-3xl shadow-inner">
            <i className="fas fa-tower-broadcast animate-pulse"></i>
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <h3 className="text-lg font-black uppercase tracking-tight text-white">
              {t('no_live_yet')}
            </h3>
            <p className="text-xs text-zinc-400 font-medium leading-relaxed">
              {t('no_live_desc')}
            </p>
          </div>

          <button
            onClick={onGoLiveClick}
            className="bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs px-6 py-3.5 rounded-2xl shadow-xl transition-all active:scale-95 border border-red-400/30 inline-flex items-center space-x-2"
          >
            <i className="fas fa-video"></i>
            <span>+ {t('start_live_now')}</span>
          </button>
        </div>
      )}

      {/* Recommended Streamers / Top Hosts */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
          <i className="fas fa-crown text-amber-500"></i>
          <span>{t('community_streamers')}</span>
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {users.slice(0, 4).map((u) => {
            const isFollowing = currentUser.following?.includes(u.id);
            return (
              <div
                key={`host-${u.id}`}
                className="bg-white border border-black/10 rounded-2xl p-3 flex flex-col items-center text-center space-y-2 shadow-sm hover:border-black transition-all"
              >
                <img
                  src={
                    u.photoURL ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}`
                  }
                  alt={u.name}
                  onClick={() => onUserClick(u.id)}
                  className="w-12 h-12 rounded-full border border-black/10 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                />
                <div className="w-full">
                  <p
                    onClick={() => onUserClick(u.id)}
                    className="font-black text-xs uppercase truncate cursor-pointer hover:underline"
                  >
                    {u.name}
                  </p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                    {u.followers?.length || 0} {t('followers')}
                  </p>
                </div>

                {u.id !== currentUser.id && onFollow && (
                  <button
                    onClick={() => onFollow(u.id)}
                    className={`w-full text-[9px] font-black uppercase py-1.5 rounded-xl transition-all border ${
                      isFollowing
                        ? 'bg-gray-100 text-gray-600 border-gray-300'
                        : 'bg-black text-white border-black hover:bg-zinc-800'
                    }`}
                  >
                    {isFollowing ? 'Following' : '+ Follow'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
