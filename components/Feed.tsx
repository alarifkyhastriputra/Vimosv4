
import React from 'react';
import { Post, User, Announcement, Story, LiveStream } from '../types.ts';
import PostCard from './PostCard.tsx';
import Stories from './Stories.tsx';
import { useLanguage } from '../LanguageContext.tsx';

interface FeedProps {
  posts: Post[];
  stories?: Story[];
  onAddStory?: (text: string, photoURL?: string, videoURL?: string, mediaType?: 'image' | 'video') => void;
  onDeleteStory?: (storyId: string) => void;
  announcements?: Announcement[];
  onLike: (postId: string) => void;
  onDislike: (postId: string) => void;
  onComment: (postId: string, text: string, replyTo?: { commentId?: string; userName?: string; userId?: string }) => void;
  onUserClick: (userId: string) => void;
  currentUser: User;
  onFollow: (userId: string) => void;
  onTakeDownPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  users: User[];
  isLoading?: boolean;
  isSyncing?: boolean;
  onRefresh?: () => void;
  activeStreams?: LiveStream[];
  onStreamClick?: (streamId: string) => void;
  onGoLiveClick?: () => void;
  onCreatePostClick?: () => void;
}

const PostCardSkeleton: React.FC = () => {
  return (
    <div className="border border-black/5 rounded-3xl p-5 bg-white space-y-4 shadow-sm relative overflow-hidden">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-neutral-100 animate-pulse"></div>
        <div className="flex-1 space-y-2 py-1">
          <div className="h-3.5 bg-neutral-100 rounded-lg w-1/3 animate-pulse"></div>
          <div className="h-2.5 bg-neutral-100 rounded-lg w-1/4 animate-pulse"></div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3.5 bg-neutral-100 rounded-lg animate-pulse"></div>
        <div className="h-3.5 bg-neutral-100 rounded-lg w-5/6 animate-pulse"></div>
      </div>
      <div className="h-44 bg-neutral-50 rounded-2xl w-full flex flex-col items-center justify-center border border-neutral-100/60">
        <div className="w-9 h-9 border-3 border-neutral-200 border-t-black rounded-full animate-spin"></div>
        <span className="text-[11px] font-bold text-neutral-400 mt-2.5">Memuat Konten...</span>
      </div>
      <div className="flex justify-between items-center pt-2">
        <div className="h-7 bg-neutral-100 rounded-full w-16 animate-pulse"></div>
        <div className="h-7 bg-neutral-100 rounded-full w-16 animate-pulse"></div>
        <div className="h-7 bg-neutral-100 rounded-full w-16 animate-pulse"></div>
      </div>
    </div>
  );
};

const StoriesSkeleton: React.FC = () => {
  return (
    <div className="flex space-x-4 overflow-x-auto pb-4 px-4 hide-scrollbar">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col items-center space-y-2 flex-shrink-0">
          <div className="w-14 h-14 rounded-full bg-neutral-100 border-2 border-neutral-200 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-neutral-300 border-t-black rounded-full animate-spin"></div>
          </div>
          <div className="h-2.5 bg-neutral-100 rounded w-10 animate-pulse"></div>
        </div>
      ))}
    </div>
  );
};

const SpinningFeedLoader: React.FC<{ message?: string; subMessage?: string }> = ({ 
  message = 'Memuat Postingan Web...', 
  subMessage = 'Menyinkronkan postingan terbaru Orbit' 
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 bg-white border border-black/5 rounded-3xl shadow-sm text-center animate-fade-in">
      <div className="relative mb-3.5 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-neutral-100 border-t-black animate-spin"></div>
        <i className="fas fa-satellite text-neutral-800 text-xs absolute animate-pulse"></i>
      </div>
      <p className="text-sm font-black text-neutral-900 tracking-tight">{message}</p>
      <p className="text-xs text-neutral-400 mt-1">{subMessage}</p>
    </div>
  );
};

const Feed: React.FC<FeedProps> = ({ 
  posts, 
  stories = [], 
  onAddStory, 
  onDeleteStory,
  announcements = [], 
  onLike, 
  onDislike, 
  onComment, 
  onUserClick, 
  currentUser, 
  onFollow, 
  onTakeDownPost, 
  onDeletePost, 
  users, 
  isLoading = false,
  isSyncing = false,
  onRefresh,
  activeStreams = [],
  onStreamClick,
  onGoLiveClick,
  onCreatePostClick
}) => {
  const { t } = useLanguage();

  return (
    <div className="p-4 flex flex-col space-y-6 max-w-2xl mx-auto">
      {/* Stories Section */}
      {onAddStory && (
        <Stories 
          stories={stories} 
          currentUser={currentUser} 
          onAddStory={onAddStory} 
          onDeleteStory={onDeleteStory}
          users={users}
          activeStreams={activeStreams}
          onStreamClick={onStreamClick}
          onGoLiveClick={onGoLiveClick}
        />
      )}

      {/* King's Proclamation Section */}
      {announcements.length > 0 && (
        <div className="space-y-3 mb-1">
          {announcements.map((ann) => (
            <div 
              key={ann.id} 
              className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 shadow-sm relative overflow-hidden group animate-fade-in"
            >
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <i className="fas fa-crown text-3xl text-white"></i>
              </div>
              <div className="flex items-center space-x-2 mb-2">
                <span className="bg-yellow-400 text-black text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center shadow-xs">
                  <i className="fas fa-crown text-[6px] mr-1"></i>
                  King's Broadcast
                </span>
                <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
                  {new Date(ann.timestamp).toLocaleDateString()}
                </span>
              </div>
              <p className="text-white text-sm font-semibold leading-relaxed">
                {ann.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {isSyncing && posts.length > 0 && (
        <div className="flex items-center justify-center space-x-2 py-2 px-4 bg-neutral-100 border border-neutral-200 rounded-full text-xs font-semibold text-neutral-600 animate-fade-in w-fit mx-auto shadow-2xs">
          <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-black rounded-full animate-spin"></div>
          <span>Menyinkronkan postingan terbaru...</span>
        </div>
      )}

      {(isLoading || isSyncing) && posts.length === 0 ? (
        <div className="space-y-4">
          <SpinningFeedLoader 
            message="Memuat Postingan Web..." 
            subMessage="Menyinkronkan postingan terbaru Orbit" 
          />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center bg-white border border-black/5 rounded-3xl shadow-sm animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center mb-3 shadow-xs">
            <i className="fas fa-ghost text-2xl text-neutral-400"></i>
          </div>
          <p className="font-bold text-sm text-neutral-800 mb-1">{t('nothing_here')}</p>
          <p className="text-xs text-neutral-400 mb-5 max-w-xs leading-relaxed">Jadilah yang pertama membagikan foto, video atau cerita ke Orbit!</p>
          
          <div className="flex flex-wrap items-center justify-center gap-3">
            {onCreatePostClick && (
              <button 
                onClick={onCreatePostClick}
                className="bg-black text-white text-xs font-bold px-5 py-2.5 rounded-full hover:bg-neutral-800 transition-all shadow-xs flex items-center space-x-1.5 active:scale-95"
              >
                <i className="fas fa-plus text-[10px]"></i>
                <span>{t('create_post')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard 
            key={post.id} 
            post={post} 
            onLike={onLike} 
            onDislike={onDislike}
            onComment={onComment}
            onUserClick={onUserClick}
            currentUser={currentUser}
            onFollow={onFollow}
            onTakeDownPost={onTakeDownPost}
            onDeletePost={onDeletePost}
            users={users}
          />
        ))
      )}
    </div>
  );
};

export default React.memo(Feed);
