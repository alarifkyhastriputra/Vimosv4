
export interface User {
  id: string;
  name: string;
  email: string;
  bio: string;
  photoURL: string;
  followers: string[]; // array of user IDs
  following: string[]; // array of user IDs
  totalLikes: number;
  recentCaptures?: string[]; // array of image URLs
  isAdmin?: boolean;
  isBanned?: boolean;
  role?: string; // Custom role assigned by Admin King
  roleColor?: string; // Custom hex color for the role
  coins?: number; // Vimos Coins Balance
  inventory?: string[]; // Array of purchased item IDs
  equippedFrame?: string; // Equipped avatar frame ID
  equippedBadge?: string; // Equipped badge icon/title
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text?: string;
  photoURL?: string;
  videoURL?: string;
  mediaType?: 'image' | 'video';
  createdAt: number;
  expiresAt?: number;
}

export interface GlobalSound {
  id: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  sourceType: 'youtube' | 'preset' | 'upload';
  url: string; // e.g. "youtube:VIDEO_ID?start=0&end=30" or mp3 URL
  youtubeId?: string;
  startTime?: number; // in seconds
  endTime?: number; // in seconds
  duration?: number;
  useCount: number;
  addedByUserId?: string;
  addedByUserName?: string;
  createdAt: number;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  photoURL?: string;
  videoURL?: string;
  musicURL?: string;
  musicTitle?: string;
  musicAuthor?: string;
  musicThumbnail?: string;
  musicStart?: number;
  musicEnd?: number;
  timestamp: number;
  likes: string[]; // array of user IDs
  dislikes: string[];
  comments: Comment[];
  isTakenDown?: boolean;
}

export interface Announcement {
  id: string;
  text: string;
  timestamp: number;
  authorId: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  timestamp: number;
  replyToId?: string;
  replyToUserName?: string;
  replyToUserId?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  read?: boolean;
  readAt?: number;
  readBy?: Record<string, boolean>;
  photoURL?: string;
  videoURL?: string;
  mediaType?: 'image' | 'video';
  mediaURL?: string;
  fileName?: string;
  fileSize?: string;
  isShop?: boolean;
  isAi?: boolean;
  deletedFor?: Record<string, boolean>;
}

export interface UserNotification {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  type: 'follow' | 'like' | 'comment' | 'mention' | 'reply';
  postId?: string;
  postText?: string;
  commentText?: string;
  timestamp: number;
  read: boolean;
}

export type Notification = UserNotification;

export interface Group {
  id: string;
  name: string;
  bio?: string;
  photoURL?: string;
  creatorId: string;
  participants: string[]; // array of user IDs
  admins: string[]; // array of user IDs
  lastMessage?: string;
  lastTimestamp?: number;
  timestamp?: number;
}

export interface LiveStream {
  id: string;
  hostId: string;
  hostName: string;
  hostPhoto: string;
  title: string;
  streamType: 'camera' | 'screen';
  status: 'live' | 'ended';
  startedAt: number;
  endedAt?: number;
  viewerCount?: number;
  likesCount?: number;
  viewers?: Record<string, boolean>;
}

export interface LiveChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  timestamp: number;
  isHost?: boolean;
}

export interface LiveReaction {
  id: string;
  type: 'heart' | 'fire' | 'clap' | 'star';
  timestamp: number;
}

export interface UserShop {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto?: string;
  shopName: string;
  description?: string;
  bannerURL?: string;
  createdAt: number;
}

export interface ShopItem {
  id: string;
  shopId: string;
  ownerId: string;
  ownerName: string;
  name: string;
  price: number;
  description: string;
  category: string;
  imageURL?: string;
  stock: number;
  createdAt: number;
}

export interface ShopOrder {
  id: string;
  itemId: string;
  itemName: string;
  itemImage?: string;
  price: number;
  quantity: number;
  totalPrice: number;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  shopId: string;
  shopName: string;
  status: 'pending' | 'completed' | 'cancelled';
  timestamp: number;
}

export const View = {
  FEED: 'feed',
  REELS: 'reels',
  POST: 'post',
  LEADERBOARD: 'leaderboard',
  NOTIFICATIONS: 'notifications',
  CHAT: 'chat',
  PROFILE: 'profile',
  ADMIN: 'admin',
  LIVESTREAM: 'livestream',
  SHOP: 'shop'
} as const;

export type View = typeof View[keyof typeof View];
