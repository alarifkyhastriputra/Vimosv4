import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, Group } from '../types.ts';
import { db } from '../firebase.ts';
import { ref, onValue, push, serverTimestamp, set, update, remove, get } from 'firebase/database';
import { ActiveCall } from './CallingOverlay.tsx';
import { useLanguage } from '../LanguageContext.tsx';
import HengkurAIChat from './HengkurAIChat.tsx';
import { compressImage } from '../services/imageCompressor.ts';

interface ChatProps {
  users: User[];
  currentUser: User | null;
  onUserClick: (userId: string) => void;
  activeCalls?: ActiveCall[];
  onStartCall?: (type: 'private' | 'collective', mediaType: 'audio' | 'video', targetId: string, name?: string) => void;
  onJoinCall?: (callId: string) => void;
  onFollow?: (userId: string) => void;
  targetUserId?: string | null;
  targetGroupId?: string | null;
  initialChatMessage?: string | null;
  onClearInitialChat?: () => void;
  permissionStatus?: NotificationPermission | 'unsupported';
  onRequestPermission?: () => void;
}

const Chat: React.FC<ChatProps> = ({ 
  users, 
  currentUser, 
  onUserClick, 
  activeCalls = [], 
  onStartCall, 
  onJoinCall,
  onFollow,
  targetUserId,
  targetGroupId,
  initialChatMessage,
  onClearInitialChat,
  permissionStatus,
  onRequestPermission
}) => {
  const { t } = useLanguage();
  const [selectedRecipient, setSelectedRecipient] = useState<{ type: 'user' | 'group', data: User | Group } | null>(null);
  const [msg, setMsg] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isViewingGroupSettings, setIsViewingGroupSettings] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'direct' | 'shop' | 'groups' | 'anonymous' | 'hengkur_ai'>('direct');
  const [botName, setBotName] = useState<string>('vimos.ai');
  const [botAvatar, setBotAvatar] = useState<string>('');

  // Sync AI Bot Name and Avatar from Firebase RTDB
  useEffect(() => {
    const configRef = ref(db, 'appConfig');
    const unsub = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        if (val) {
          if (typeof val.aiBotName === 'string' && val.aiBotName.trim()) {
            setBotName(val.aiBotName.trim());
          } else {
            setBotName('vimos.ai');
          }
          if (typeof val.aiBotAvatar === 'string') {
            setBotAvatar(val.aiBotAvatar.trim());
          } else {
            setBotAvatar('');
          }
          return;
        }
      }
      setBotName('vimos.ai');
      setBotAvatar('');
    });
    return () => unsub();
  }, []);
  const [shopSearchQuery, setShopSearchQuery] = useState('');
  const [directSearchQuery, setDirectSearchQuery] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);

  // Custom Confirmation Modal Pop-Up State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
  } | null>(null);

  // Direct & Shop Chat Threads state
  interface DirectChatThread {
    chatId: string;
    otherUser: User;
    lastMessage: string;
    lastMessageSenderId: string;
    timestamp: number;
    unreadCount: number;
    isShop?: boolean;
  }
  const [directChatThreads, setDirectChatThreads] = useState<DirectChatThread[]>([]);

  interface ShopChatThread {
    chatId: string;
    otherUser: User;
    lastMessage: string;
    lastMessageSenderId: string;
    timestamp: number;
  }
  const [shopChatThreads, setShopChatThreads] = useState<ShopChatThread[]>([]);

  // Anonymous Chat States
  const [isSearchingAnon, setIsSearchingAnon] = useState(false);
  const [activeAnonRoomId, setActiveAnonRoomId] = useState<string | null>(null);
  const [activeAnonRoom, setActiveAnonRoom] = useState<any | null>(null);
  const [anonMessages, setAnonMessages] = useState<{ id: string; senderId: string; text: string; timestamp: number }[]>([]);
  const [anonInputMsg, setAnonInputMsg] = useState('');

  // Media Attachment States for Photos & Videos in Chat
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: 'image' | 'video';
    name?: string;
    size?: string;
  } | null>(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState<{
    url: string;
    type: 'image' | 'video';
    caption?: string;
    senderName?: string;
    timestamp?: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const anonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize chat textarea when message changes or is cleared
  useEffect(() => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
      chatTextareaRef.current.style.height = `${Math.min(chatTextareaRef.current.scrollHeight, 120)}px`;
    }
  }, [msg]);

  useEffect(() => {
    if (anonTextareaRef.current) {
      anonTextareaRef.current.style.height = 'auto';
      anonTextareaRef.current.style.height = `${Math.min(anonTextareaRef.current.scrollHeight, 100)}px`;
    }
  }, [anonInputMsg]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, forcedType?: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = forcedType === 'video' || file.type.startsWith('video/');
    const isImage = forcedType === 'image' || file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      setConfirmModal({
        isOpen: true,
        title: 'Format File Tidak Didukung',
        message: 'Hanya file gambar (JPG, PNG, WEBP, GIF) dan video (MP4, WEBM, MOV) yang dapat dikirim ke obrolan.',
        confirmText: 'Mengerti',
        onConfirm: () => setConfirmModal(null)
      });
      if (e.target) e.target.value = '';
      return;
    }

    const sizeInMB = file.size / (1024 * 1024);
    if (isVideo && sizeInMB > 30) {
      setConfirmModal({
        isOpen: true,
        title: 'Ukuran Video Terlalu Besar',
        message: `Ukuran video adalah ${sizeInMB.toFixed(1)} MB. Maksimum ukuran video yang disarankan adalah 30 MB agar pengiriman cepat dan lancar.`,
        confirmText: 'Pilih Video Lain',
        onConfirm: () => setConfirmModal(null)
      });
      if (e.target) e.target.value = '';
      return;
    }

    const formattedSize = sizeInMB >= 1 ? `${sizeInMB.toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`;

    setIsProcessingMedia(true);
    try {
      if (isImage) {
        // High quality smooth image compression for quick transmission and crisp viewing
        const optimized = await compressImage(file, 1280, 1280, 0.85);
        setSelectedMedia({
          url: optimized,
          type: 'image',
          name: file.name,
          size: formattedSize
        });
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedMedia({
            url: reader.result as string,
            type: 'video',
            name: file.name,
            size: formattedSize
          });
          setIsProcessingMedia(false);
        };
        reader.onerror = () => {
          setIsProcessingMedia(false);
        };
        reader.readAsDataURL(file);
        return;
      }
    } catch (err) {
      console.error('Error processing chat media:', err);
    } finally {
      setIsProcessingMedia(false);
      if (e.target) e.target.value = '';
    }
  };

  const getChatId = (uid1: string, uid2: string) => {
    return [uid1, uid2].sort().join('_');
  };

  // Helper to detect mobile/touch devices where Enter creates a new line and sending is done via Send button
  const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const hasTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 768;
    const isMobileUA = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    return (hasTouch && isSmallScreen) || isMobileUA;
  };

  // Helper to format timestamps gracefully
  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const diffSec = Math.floor(diff / 1000);
    if (diffSec < 60) return 'Baru saja';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}j`;
    const date = new Date(timestamp);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  // Logic to identify MUTUAL FOLLOWERS (Saling Follow Balik)
  const isMutual = (uid: string) => {
    if (!currentUser) return false;
    const following = currentUser.following || [];
    const followers = currentUser.followers || [];
    return following.includes(uid) && followers.includes(uid);
  };

  const mutualFollowers = users.filter(u => u.id !== currentUser?.id && isMutual(u.id));

  // Target User Auto-Selection for Direct Chat / Jual Beli
  useEffect(() => {
    if (targetUserId) {
      const foundUser = users.find(u => u.id === targetUserId);
      if (foundUser) {
        setSelectedRecipient({ type: 'user', data: foundUser });
        if (initialChatMessage) {
          setMsg(initialChatMessage);
          if (initialChatMessage.includes('Halo, saya tertarik untuk membeli')) {
            setActiveTab('shop');
          } else {
            setActiveTab('direct');
          }
        }
        if (onClearInitialChat) {
          onClearInitialChat();
        }
      } else {
        // If user not in loaded users list, fetch directly from Firebase
        get(ref(db, `users/${targetUserId}`)).then((snapshot) => {
          const uVal = snapshot.val();
          if (uVal) {
            const fetchedUser: User = {
              id: targetUserId,
              name: uVal.name || 'Orbit Member',
              email: uVal.email || '',
              totalLikes: uVal.totalLikes || 0,
              photoURL: uVal.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${targetUserId}&backgroundColor=000000`,
              bio: uVal.bio || '',
              followers: uVal.followers ? Object.keys(uVal.followers) : [],
              following: uVal.following ? Object.keys(uVal.following) : [],
              role: uVal.role,
              roleColor: uVal.roleColor,
              isAdmin: uVal.isAdmin
            };
            setSelectedRecipient({ type: 'user', data: fetchedUser });
            if (initialChatMessage) {
              setMsg(initialChatMessage);
              if (initialChatMessage.includes('Halo, saya tertarik untuk membeli')) {
                setActiveTab('shop');
              } else {
                setActiveTab('direct');
              }
            }
            if (onClearInitialChat) {
              onClearInitialChat();
            }
          }
        }).catch((err) => console.warn('Failed to load target user:', err));
      }
    }
  }, [targetUserId, users, initialChatMessage]);

  // Target Group Auto-Selection
  useEffect(() => {
    if (targetGroupId && groups.length > 0) {
      const targetGroup = groups.find(g => g.id === targetGroupId);
      if (targetGroup) {
        setSelectedRecipient({ type: 'group', data: targetGroup });
        setActiveTab('groups');
        if (onClearInitialChat) {
          onClearInitialChat();
        }
      }
    }
  }, [targetGroupId, groups]);

  // Default Collective groups to seed if none exist
  const DEFAULT_COMMUNITY_COLLECTIVES: Group[] = [
    {
      id: 'group_orbit_official',
      name: 'Orbit Official Lounge',
      bio: 'Komunitas & ruang obrolan resmi pengguna Vimos Orbit.',
      creatorId: 'u1',
      participants: ['u1', 'u2', 'u3'],
      admins: ['u1'],
      photoURL: 'https://picsum.photos/200/200?grayscale&random=20',
      timestamp: Date.now() - 86400000
    },
    {
      id: 'group_monochrome_arts',
      name: 'Monochrome Creatives',
      bio: 'Kolektif kreator, fotografi monokrom, dan seni visual.',
      creatorId: 'u2',
      participants: ['u1', 'u2'],
      admins: ['u2'],
      photoURL: 'https://picsum.photos/200/200?grayscale&random=21',
      timestamp: Date.now() - 172800000
    }
  ];

  // Sync groups in real-time
  useEffect(() => {
    if (!currentUser) return;
    const groupsRef = ref(db, 'groups');
    const unsubscribe = onValue(groupsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Object.keys(data).length > 0) {
        const allGroups = Object.entries(data)
          .map(([id, val]: [string, any]) => {
            const rawParticipants = val.participants;
            let participantsList: string[] = [];
            if (Array.isArray(rawParticipants)) {
              participantsList = rawParticipants.map(String).filter(Boolean);
            } else if (rawParticipants && typeof rawParticipants === 'object') {
              participantsList = Object.keys(rawParticipants);
            }

            const rawAdmins = val.admins;
            let adminsList: string[] = [];
            if (Array.isArray(rawAdmins)) {
              adminsList = rawAdmins.map(String).filter(Boolean);
            } else if (rawAdmins && typeof rawAdmins === 'object') {
              adminsList = Object.keys(rawAdmins);
            }

            // Always ensure creator is present in participants and admins list
            if (val.creatorId) {
              if (!participantsList.includes(val.creatorId)) {
                participantsList.push(val.creatorId);
              }
              if (!adminsList.includes(val.creatorId)) {
                adminsList.push(val.creatorId);
              }
            }

            return { 
              id, 
              ...val, 
              name: val.name || 'Collective Group',
              bio: val.bio || 'Orbit Collective space.',
              creatorId: val.creatorId || '',
              participants: participantsList,
              admins: adminsList,
              timestamp: val.timestamp || Date.now()
            };
          });
        setGroups(allGroups);
        
        if (selectedRecipient?.type === 'group') {
          const updated = allGroups.find(g => g.id === (selectedRecipient.data as Group).id);
          if (updated) setSelectedRecipient({ type: 'group', data: updated });
        }
      } else {
        // Seed default groups to Firebase so they are immediately available to all users
        DEFAULT_COMMUNITY_COLLECTIVES.forEach(g => {
          set(ref(db, `groups/${g.id}`), {
            name: g.name,
            bio: g.bio,
            creatorId: g.creatorId,
            participants: g.participants.reduce((acc, uid) => ({ ...acc, [uid]: true }), {}),
            admins: g.admins.reduce((acc, uid) => ({ ...acc, [uid]: true }), {}),
            photoURL: g.photoURL,
            timestamp: g.timestamp
          }).catch(() => {});
        });
        setGroups(DEFAULT_COMMUNITY_COLLECTIVES);
      }
    });
    return () => unsubscribe();
  }, [currentUser, selectedRecipient?.type]);

  // Helper to sanitize Firebase path keys and check deletion status
  const getSafeKey = (id: string) => (id ? id.replace(/[.#$\[\]]/g, '_') : '');

  const isMsgDeletedForUser = (deletedForObj: any, uid?: string) => {
    if (!deletedForObj || !uid) return false;
    const safeId = getSafeKey(uid);
    return Boolean(deletedForObj[uid] || deletedForObj[safeId]);
  };

  // Sync ALL active Direct & Shop Chat Threads from Firebase RTDB
  useEffect(() => {
    if (!currentUser) return;

    const chatsRef = ref(db, 'chats');
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const directList: DirectChatThread[] = [];
        const shopList: ShopChatThread[] = [];
        const safeMyId = getSafeKey(currentUser.id);

        Object.entries(data).forEach(([chatId, chatVal]: [string, any]) => {
          if (!chatId.includes(currentUser.id)) return;

          const parts = chatId.split('_');
          if (parts.length !== 2) return;
          const otherUserId = parts.find(id => id !== currentUser.id);
          if (!otherUserId) return;

          // Find user from loaded list or construct reliable fallback from chat participant meta
          const foundUser = users.find(u => u.id === otherUserId);
          const otherUser: User = foundUser || {
            id: otherUserId,
            name: (chatVal?.participants && chatVal.participants[otherUserId]?.name) || 'Orbit Member',
            email: '',
            totalLikes: 0,
            photoURL: (chatVal?.participants && chatVal.participants[otherUserId]?.photoURL) || `https://api.dicebear.com/7.x/initials/svg?seed=${otherUserId}&backgroundColor=000000`,
            bio: '',
            followers: [],
            following: []
          };

          const messagesObj = chatVal?.messages;
          if (!messagesObj) return;

          const msgList = Object.entries(messagesObj)
            .map(([mId, mVal]: [string, any]) => {
              let ts = 0;
              if (typeof mVal.timestamp === 'number') {
                ts = mVal.timestamp;
              } else if (typeof mVal.timestamp === 'string') {
                ts = Number(mVal.timestamp) || 0;
              } else {
                ts = Date.now();
              }
              return {
                id: mId,
                ...mVal,
                timestamp: ts
              };
            })
            .filter((m: any) => !isMsgDeletedForUser(m.deletedFor, currentUser.id))
            .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

          if (msgList.length === 0) return;

          const lastMsg = msgList[msgList.length - 1];
          const mediaSummary = (lastMsg.photoURL || lastMsg.mediaType === 'image')
            ? '📷 Foto' 
            : ((lastMsg.videoURL || lastMsg.mediaType === 'video') ? '🎥 Video' : '');
          const lastMessageText = lastMsg.text || mediaSummary || 'Pesan';

          // Calculate unread count for current user
          const unreadCount = msgList.filter((m: any) => 
            m.senderId === otherUserId && 
            !m.read && 
            (!m.readBy || !m.readBy[safeMyId])
          ).length;

          // Check if thread is a shop chat (explicit flag OR contains purchase/item inquiry text)
          const isShopThread = chatVal?.isShopChat === true || msgList.some((m: any) => 
            m.isShop === true ||
            (m.text && (
              m.text.includes('tertarik untuk membeli') || 
              m.text.includes('membeli produk') || 
              m.text.includes('dari toko Anda') ||
              m.text.includes('Harga:')
            ))
          );

          if (isShopThread) {
            shopList.push({
              chatId,
              otherUser,
              lastMessage: lastMessageText,
              lastMessageSenderId: lastMsg.senderId || '',
              timestamp: lastMsg.timestamp || 0
            });
          }

          // Direct list stores all user conversations
          directList.push({
            chatId,
            otherUser,
            lastMessage: lastMessageText,
            lastMessageSenderId: lastMsg.senderId || '',
            timestamp: lastMsg.timestamp || 0,
            unreadCount,
            isShop: isShopThread
          });
        });

        directList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        shopList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        setDirectChatThreads(directList);
        setShopChatThreads(shopList);
      } else {
        setDirectChatThreads([]);
        setShopChatThreads([]);
      }
    });

    return () => unsubscribe();
  }, [currentUser, users]);

  // Sync messages for selectedRecipient (direct / group)
  useEffect(() => {
    if (!currentUser || !selectedRecipient) return;

    let chatPath = '';
    if (selectedRecipient.type === 'user') {
      const chatId = getChatId(currentUser.id, (selectedRecipient.data as User).id);
      chatPath = `chats/${chatId}/messages`;
    } else {
      chatPath = `groups/${(selectedRecipient.data as Group).id}/messages`;
    }

    const chatRef = ref(db, chatPath);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([id, val]: [string, any]) => {
            let ts = 0;
            if (typeof val.timestamp === 'number') {
              ts = val.timestamp;
            } else if (typeof val.timestamp === 'string') {
              ts = Number(val.timestamp) || 0;
            } else {
              ts = Date.now();
            }
            return {
              id,
              ...val,
              timestamp: ts
            };
          })
          .filter((m: any) => !isMsgDeletedForUser(m.deletedFor, currentUser.id))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setMessages(list);

        // Auto mark incoming unread messages as read when user is actively in this chat
        const safeUserId = getSafeKey(currentUser.id);
        if (selectedRecipient.type === 'user') {
          const otherUserId = (selectedRecipient.data as User).id;
          const otherUserSafeId = getSafeKey(otherUserId);
          const unreadMsgs = list.filter((m: any) => m.senderId === otherUserId && (!m.read || !m.readBy || !m.readBy[safeUserId]));
          if (unreadMsgs.length > 0) {
            const chatId = getChatId(currentUser.id, otherUserId);
            const updates: Record<string, any> = {};
            unreadMsgs.forEach((m: any) => {
              updates[`chats/${chatId}/messages/${m.id}/read`] = true;
              updates[`chats/${chatId}/messages/${m.id}/readAt`] = Date.now();
              updates[`chats/${chatId}/messages/${m.id}/readBy/${safeUserId}`] = true;
            });
            update(ref(db), updates).catch(err => console.error('Failed to mark read:', err));
          }
        } else if (selectedRecipient.type === 'group') {
          const groupId = (selectedRecipient.data as Group).id;
          const unreadGroupMsgs = list.filter((m: any) => m.senderId !== currentUser.id && (!m.readBy || !m.readBy[safeUserId]));
          if (unreadGroupMsgs.length > 0) {
            const updates: Record<string, any> = {};
            unreadGroupMsgs.forEach((m: any) => {
              updates[`groups/${groupId}/messages/${m.id}/readBy/${safeUserId}`] = true;
            });
            update(ref(db), updates).catch(err => console.error('Failed to mark group read:', err));
          }
        }
      } else {
        setMessages([]);
      }
    });

    return () => unsubscribe();
  }, [selectedRecipient, currentUser]);

  // Message Deletion Handlers
  const handleDeleteMessageForMe = async (msgId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!currentUser || !selectedRecipient) return;

    setActiveMenuMsgId(null);
    setMessages(prev => prev.filter(m => m.id !== msgId));

    try {
      let msgPath = '';
      if (selectedRecipient.type === 'user') {
        const chatId = getChatId(currentUser.id, (selectedRecipient.data as User).id);
        msgPath = `chats/${chatId}/messages/${msgId}`;
      } else {
        msgPath = `groups/${(selectedRecipient.data as Group).id}/messages/${msgId}`;
      }
      
      const safeUserId = getSafeKey(currentUser.id);
      await set(ref(db, `${msgPath}/deletedFor/${safeUserId}`), true);
    } catch (err) {
      console.error('Failed to delete message for me:', err);
    }
  };

  const handleDeleteMessageForEveryone = (msgId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!currentUser || !selectedRecipient) return;
    setActiveMenuMsgId(null);

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Pesan untuk Semua?',
      message: 'Apakah Anda yakin ingin menghapus pesan ini secara permanen untuk semua orang?',
      confirmText: 'Ya, Hapus untuk Semua',
      onConfirm: async () => {
        setConfirmModal(null);
        setMessages(prev => prev.filter(m => m.id !== msgId));
        try {
          let msgPath = '';
          if (selectedRecipient.type === 'user') {
            const chatId = getChatId(currentUser.id, (selectedRecipient.data as User).id);
            msgPath = `chats/${chatId}/messages/${msgId}`;
          } else {
            msgPath = `groups/${(selectedRecipient.data as Group).id}/messages/${msgId}`;
          }
          await remove(ref(db, msgPath));
        } catch (err) {
          console.error('Failed to delete message for everyone:', err);
        }
      }
    });
  };

  const handleClearChatForMe = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!currentUser || !selectedRecipient) return;

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Obrolan Ini?',
      message: 'Apakah Anda yakin ingin menghapus seluruh obrolan ini dari tampilan Anda?',
      confirmText: 'Ya, Hapus Obrolan',
      onConfirm: async () => {
        setConfirmModal(null);
        setMessages([]);
        try {
          let chatPath = '';
          if (selectedRecipient.type === 'user') {
            const chatId = getChatId(currentUser.id, (selectedRecipient.data as User).id);
            chatPath = `chats/${chatId}/messages`;
          } else {
            chatPath = `groups/${(selectedRecipient.data as Group).id}/messages`;
          }

          const snapshot = await get(ref(db, chatPath));
          const data = snapshot.val();
          if (data) {
            const safeUserId = getSafeKey(currentUser.id);
            const updates: Record<string, any> = {};
            Object.keys(data).forEach((mId) => {
              updates[`${chatPath}/${mId}/deletedFor/${safeUserId}`] = true;
            });
            await update(ref(db), updates);
          }
        } catch (err) {
          console.error('Failed to clear chat:', err);
        }
      }
    });
  };

  const handleDeleteShopChatThread = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!currentUser) return;

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Obrolan Toko?',
      message: 'Apakah Anda yakin ingin menghapus obrolan toko ini dari daftar Anda?',
      confirmText: 'Ya, Hapus Obrolan Toko',
      onConfirm: async () => {
        setConfirmModal(null);
        setShopChatThreads(prev => prev.filter(t => t.chatId !== chatId));
        try {
          const chatMessagesRef = ref(db, `chats/${chatId}/messages`);
          const snapshot = await get(chatMessagesRef);
          const data = snapshot.val();
          if (data) {
            const safeUserId = getSafeKey(currentUser.id);
            const updates: Record<string, any> = {};
            Object.keys(data).forEach((mId) => {
              updates[`chats/${chatId}/messages/${mId}/deletedFor/${safeUserId}`] = true;
            });
            await update(ref(db), updates);
          }
        } catch (err) {
          console.error('Failed to delete shop chat thread:', err);
        }
      }
    });
  };

  const handleClearDirectUserChat = (targetUserId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!currentUser) return;

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Riwayat Obrolan?',
      message: 'Apakah Anda yakin ingin menghapus seluruh riwayat obrolan dengan pengguna ini?',
      confirmText: 'Ya, Hapus Riwayat',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const chatId = getChatId(currentUser.id, targetUserId);
          const chatPath = `chats/${chatId}/messages`;
          const snapshot = await get(ref(db, chatPath));
          const data = snapshot.val();
          if (data) {
            const safeUserId = getSafeKey(currentUser.id);
            const updates: Record<string, any> = {};
            Object.keys(data).forEach((mId) => {
              updates[`${chatPath}/${mId}/deletedFor/${safeUserId}`] = true;
            });
            await update(ref(db), updates);
          }
          if (selectedRecipient?.type === 'user' && (selectedRecipient.data as User).id === targetUserId) {
            setMessages([]);
          }
        } catch (err) {
          console.error('Failed to clear direct user chat:', err);
        }
      }
    });
  };

  const handleDeleteAnonMessageForMe = async (msgId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!currentUser || !activeAnonRoomId) return;

    setAnonMessages(prev => prev.filter(m => m.id !== msgId));

    try {
      const safeUserId = getSafeKey(currentUser.id);
      await set(ref(db, `anonymous_rooms/${activeAnonRoomId}/messages/${msgId}/deletedFor/${safeUserId}`), true);
    } catch (err) {
      console.error('Failed to delete anon message:', err);
    }
  };

  // Sync Anonymous Rooms & Matches
  useEffect(() => {
    if (!currentUser) return;

    const roomsRef = ref(db, 'anonymous_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const foundEntry = Object.entries(data).find(([id, roomVal]: [string, any]) => {
          return (
            roomVal &&
            roomVal.status === 'active' &&
            roomVal.participants &&
            roomVal.participants[currentUser.id] === true
          );
        });

        if (foundEntry) {
          const [roomId, roomVal] = foundEntry;
          setActiveAnonRoomId(roomId);
          setActiveAnonRoom({ id: roomId, ...(roomVal as Record<string, any>) });
          setIsSearchingAnon(false);
          remove(ref(db, `anonymous_queue/${currentUser.id}`));
        } else {
          setActiveAnonRoomId(null);
          setActiveAnonRoom(null);
        }
      } else {
        setActiveAnonRoomId(null);
        setActiveAnonRoom(null);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Sync Anonymous Messages
  useEffect(() => {
    if (!activeAnonRoomId) {
      setAnonMessages([]);
      return;
    }

    const messagesRef = ref(db, `anonymous_rooms/${activeAnonRoomId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data)
          .map(([id, val]: [string, any]) => ({
            id,
            ...val
          }))
          .filter((m: any) => !m.deletedFor || !m.deletedFor[currentUser?.id || ''])
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setAnonMessages(msgList);
      } else {
        setAnonMessages([]);
      }
    });

    return () => unsubscribe();
  }, [activeAnonRoomId]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!msg.trim() && !selectedMedia) || !currentUser || !selectedRecipient) return;

    const trimmedMsg = msg.trim();
    const mediaToSend = selectedMedia;
    const lastSummary = trimmedMsg || (mediaToSend?.type === 'image' ? '📷 Foto' : (mediaToSend?.type === 'video' ? '🎥 Video' : 'Pesan'));

    const nowTs = Date.now();
    let chatPath = '';
    if (selectedRecipient.type === 'user') {
      const otherUser = selectedRecipient.data as User;
      const chatId = getChatId(currentUser.id, otherUser.id);
      chatPath = `chats/${chatId}/messages`;

      const chatMetaUpdates: Record<string, any> = {
        lastMessage: lastSummary,
        lastUpdated: nowTs,
        [`participants/${currentUser.id}`]: {
          name: currentUser.name || 'Orbit Member',
          photoURL: currentUser.photoURL || ''
        },
        [`participants/${otherUser.id}`]: {
          name: otherUser.name || 'Orbit Member',
          photoURL: otherUser.photoURL || ''
        }
      };

      if (activeTab === 'shop' || (otherUser as any).isShop) {
        chatMetaUpdates.isShopChat = true;
      }

      update(ref(db, `chats/${chatId}`), chatMetaUpdates).catch(err => console.warn('Failed to update chat meta:', err));
    } else {
      const group = selectedRecipient.data as Group;
      chatPath = `groups/${group.id}/messages`;
      update(ref(db, `groups/${group.id}`), {
        lastMessage: lastSummary,
        lastTimestamp: nowTs
      }).catch(err => console.warn('Failed to update group meta:', err));
    }

    const safeUserId = getSafeKey(currentUser.id);
    const messagePayload: any = {
      senderId: currentUser.id,
      text: trimmedMsg,
      timestamp: nowTs,
      read: false,
      readBy: {
        [safeUserId]: true
      },
      ...(activeTab === 'shop' ? { isShop: true } : {})
    };

    if (mediaToSend) {
      if (mediaToSend.type === 'image') {
        messagePayload.photoURL = mediaToSend.url;
        messagePayload.mediaType = 'image';
        messagePayload.mediaURL = mediaToSend.url;
      } else if (mediaToSend.type === 'video') {
        messagePayload.videoURL = mediaToSend.url;
        messagePayload.mediaType = 'video';
        messagePayload.mediaURL = mediaToSend.url;
      }
      if (mediaToSend.name) messagePayload.fileName = mediaToSend.name;
      if (mediaToSend.size) messagePayload.fileSize = mediaToSend.size;
    }

    // Optimistic append to UI
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setMessages(prev => [...prev, { id: tempId, ...messagePayload }]);

    const chatRef = ref(db, chatPath);
    push(chatRef, messagePayload).catch(err => console.error('Failed to send message:', err));
    
    setMsg('');
    setSelectedMedia(null);

    // Scroll to bottom immediately
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleCreateGroup = () => {
    if (!currentUser || !groupName.trim()) return;
    
    const groupsRef = ref(db, 'groups');
    const newGroupRef = push(groupsRef);
    const newGroupId = newGroupRef.key;
    
    const participants: Record<string, boolean> = { [currentUser.id]: true };
    const admins: Record<string, boolean> = { [currentUser.id]: true };
    selectedForGroup.forEach(id => {
      if (id) {
        participants[id] = true;
      }
    });

    const createdGroupObj: Group = {
      id: newGroupId || Date.now().toString(),
      name: groupName.trim(),
      bio: 'New collective space.',
      creatorId: currentUser.id,
      participants: Object.keys(participants),
      admins: Object.keys(admins),
      timestamp: Date.now()
    };

    set(newGroupRef, {
      name: groupName.trim(),
      bio: 'New collective space.',
      creatorId: currentUser.id,
      participants,
      admins,
      timestamp: serverTimestamp()
    });

    setGroupName('');
    setSelectedForGroup([]);
    setGroupMemberSearch('');
    setIsCreatingGroup(false);
    setSelectedRecipient({ type: 'group', data: createdGroupObj });
    setActiveTab('groups');
  };

  const updateGroupInfo = (groupId: string, data: any) => {
    update(ref(db, `groups/${groupId}`), data);
  };

  const handleAddMember = (groupId: string, userId: string) => {
    set(ref(db, `groups/${groupId}/participants/${userId}`), true);
  };

  const handleToggleGroupAdmin = (groupId: string, userId: string, isCurrentlyAdmin: boolean) => {
    const memberObj = users.find(u => u.id === userId);
    const actionText = isCurrentlyAdmin ? 'Cabut Admin' : 'Jadikan Admin';
    setConfirmModal({
      isOpen: true,
      title: `${actionText} Grup?`,
      message: isCurrentlyAdmin 
        ? `Apakah Anda yakin ingin mencabut hak admin ${memberObj?.name || 'anggota ini'} dari grup?`
        : `Apakah Anda yakin ingin mengangkat ${memberObj?.name || 'anggota ini'} menjadi Admin Grup?`,
      confirmText: actionText,
      onConfirm: async () => {
        setConfirmModal(null);
        if (isCurrentlyAdmin) {
          await set(ref(db, `groups/${groupId}/admins/${userId}`), null);
        } else {
          await set(ref(db, `groups/${groupId}/admins/${userId}`), true);
        }
      }
    });
  };

  const handleRemoveMember = (groupId: string, userId: string) => {
    const memberObj = users.find(u => u.id === userId);
    setConfirmModal({
      isOpen: true,
      title: 'Keluarkan Anggota?',
      message: `Apakah Anda yakin ingin mengeluarkan ${memberObj?.name || 'pengguna ini'} dari grup?`,
      confirmText: 'Keluarkan',
      onConfirm: async () => {
        setConfirmModal(null);
        await set(ref(db, `groups/${groupId}/participants/${userId}`), null);
        await set(ref(db, `groups/${groupId}/admins/${userId}`), null);
      }
    });
  };

  const handleLeaveGroup = (groupId: string) => {
    if (!currentUser) return;
    setConfirmModal({
      isOpen: true,
      title: 'Keluar dari Grup?',
      message: 'Apakah Anda yakin ingin keluar dari obrolan grup ini?',
      confirmText: 'Keluar Grup',
      onConfirm: async () => {
        setConfirmModal(null);
        await set(ref(db, `groups/${groupId}/participants/${currentUser.id}`), null);
        await set(ref(db, `groups/${groupId}/admins/${currentUser.id}`), null);
        setSelectedRecipient(null);
        setIsViewingGroupSettings(false);
      }
    });
  };

  const handleGroupPhotoChange = (groupId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateGroupInfo(groupId, { photoURL: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleParticipantSelection = (uid: string) => {
    setSelectedForGroup(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // Anonymous Handlers
  const handleFindAnonMatch = async () => {
    if (!currentUser) return;
    setIsSearchingAnon(true);

    try {
      const queueRef = ref(db, 'anonymous_queue');
      const snapshot = await get(queueRef);
      const queueData = snapshot.val();

      let matchedUserId: string | null = null;
      if (queueData) {
        const candidateKeys = Object.keys(queueData).filter((uid) => uid !== currentUser.id);
        if (candidateKeys.length > 0) {
          matchedUserId = candidateKeys[0];
        }
      }

      if (matchedUserId) {
        const newRoomRef = push(ref(db, 'anonymous_rooms'));
        const newRoomId = newRoomRef.key;
        if (newRoomId) {
          await set(newRoomRef, {
            id: newRoomId,
            status: 'active',
            createdAt: Date.now(),
            participants: {
              [currentUser.id]: true,
              [matchedUserId]: true
            },
            revealed: {
              [currentUser.id]: false,
              [matchedUserId]: false
            }
          });

          await remove(ref(db, `anonymous_queue/${matchedUserId}`));
          await remove(ref(db, `anonymous_queue/${currentUser.id}`));

          setActiveAnonRoomId(newRoomId);
          setIsSearchingAnon(false);
        }
      } else {
        await set(ref(db, `anonymous_queue/${currentUser.id}`), {
          uid: currentUser.id,
          joinedAt: Date.now()
        });
      }
    } catch (err) {
      console.error("Error finding match:", err);
      setIsSearchingAnon(false);
    }
  };

  const handleCancelSearch = async () => {
    if (!currentUser) return;
    setIsSearchingAnon(false);
    await remove(ref(db, `anonymous_queue/${currentUser.id}`));
  };

  const handleSendAnonMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anonInputMsg.trim() || !activeAnonRoomId || !currentUser) return;

    const messagesRef = ref(db, `anonymous_rooms/${activeAnonRoomId}/messages`);
    await push(messagesRef, {
      senderId: currentUser.id,
      text: anonInputMsg.trim(),
      timestamp: Date.now()
    });

    setAnonInputMsg('');
  };

  const handleLeaveAnonRoom = async () => {
    if (!activeAnonRoomId) return;
    await update(ref(db, `anonymous_rooms/${activeAnonRoomId}`), {
      status: 'ended'
    });
    setActiveAnonRoomId(null);
    setActiveAnonRoom(null);
  };

  const handleNextMatch = async () => {
    await handleLeaveAnonRoom();
    await handleFindAnonMatch();
  };

  const handleFollowAndReveal = async (partnerId: string) => {
    if (!currentUser || !activeAnonRoomId) return;

    if (onFollow) {
      onFollow(partnerId);
    }

    await update(ref(db, `anonymous_rooms/${activeAnonRoomId}/revealed`), {
      [currentUser.id]: true
    });
  };

  // Helper to render custom confirmation modal for all view states
  const renderConfirmModal = () => {
    if (!confirmModal || !confirmModal.isOpen) return null;
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 text-center space-y-4 animate-scale-up">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner">
            <i className="fas fa-trash-can"></i>
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-gray-900">{confirmModal.title}</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{confirmModal.message}</p>
          </div>
          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => setConfirmModal(null)}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-2xl transition-colors"
            >
              Batal
            </button>
            <button
              onClick={() => {
                confirmModal.onConfirm();
              }}
              className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all active:scale-95"
            >
              {confirmModal.confirmText || 'Hapus'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // If currently inside an active Anonymous Room
  if (activeAnonRoomId && activeAnonRoom) {
    const partnerUid = Object.keys(activeAnonRoom.participants || {}).find(id => id !== currentUser?.id);
    const partnerUser = partnerUid ? users.find(u => u.id === partnerUid) : null;

    const isSelfRevealed = activeAnonRoom.revealed?.[currentUser?.id || ''] === true;
    const isPartnerSelfRevealed = partnerUid ? activeAnonRoom.revealed?.[partnerUid] === true : false;
    const isFollowingPartner = currentUser?.following?.includes(partnerUid || '');

    const isPartnerRevealed = isSelfRevealed || isPartnerSelfRevealed || isFollowingPartner;

    const maskedAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${partnerUid || 'anon'}`;
    const displayName = isPartnerRevealed
      ? (partnerUser?.name || 'Partner')
      : `Pengguna Anonim #${partnerUid ? partnerUid.substring(0, 4).toUpperCase() : '????'}`;
    const displayPhoto = isPartnerRevealed
      ? (partnerUser?.photoURL || maskedAvatar)
      : maskedAvatar;

    return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-zinc-950 text-white animate-fade-in rounded-3xl overflow-hidden border-2 border-red-900/40 shadow-2xl">
        {/* Top Header */}
        <div className="p-4 bg-zinc-900 border-b border-white/10 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleLeaveAnonRoom}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title="Keluar Chat"
            >
              <i className="fas fa-arrow-left text-sm"></i>
            </button>
            <div 
              className={`relative ${isPartnerRevealed ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (isPartnerRevealed && partnerUid) {
                  onUserClick(partnerUid);
                }
              }}
            >
              <img
                src={displayPhoto}
                alt={displayName}
                className="w-11 h-11 rounded-full border-2 border-red-600 object-cover shadow-lg"
              />
              {!isPartnerRevealed && (
                <div className="absolute -bottom-1 -right-1 bg-red-600 text-white rounded-full p-1 text-[8px]">
                  <i className="fas fa-user-ninja"></i>
                </div>
              )}
            </div>
            <div>
              <h3 
                className={`font-black text-sm uppercase tracking-tight ${isPartnerRevealed ? 'hover:underline cursor-pointer text-white' : 'text-red-400'}`}
                onClick={() => {
                  if (isPartnerRevealed && partnerUid) {
                    onUserClick(partnerUid);
                  }
                }}
              >
                {displayName}
              </h3>
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                {isPartnerRevealed ? '🔓 Profil Terungkap' : '🕵️ Identitas Disembunyikan'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isPartnerRevealed && partnerUid && (
              <button
                onClick={() => handleFollowAndReveal(partnerUid)}
                className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-lg flex items-center space-x-1.5 animate-pulse active:scale-95 transition-all"
              >
                <i className="fas fa-user-plus text-[9px]"></i>
                <span>Follow & Ungkap</span>
              </button>
            )}
            <button
              onClick={handleNextMatch}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-full border border-white/10 transition-all flex items-center space-x-1"
              title="Cari Partner Lain"
            >
              <i className="fas fa-rotate"></i>
              <span className="hidden sm:inline">Cari Lain</span>
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/90 scroll-smooth">
          <div className="text-center py-3 px-4 bg-zinc-900/80 border border-white/10 rounded-2xl text-[11px] font-bold text-zinc-400 max-w-sm mx-auto space-y-1 shadow-inner">
            <p className="text-red-400 uppercase font-black tracking-wider">🔒 Obrolan Anonim Aktif</p>
            <p>Saling berkirim pesan secara bebas! Tekan <span className="text-white font-black">Follow & Ungkap</span> jika Anda ingin saling melihat foto dan nama profil asli.</p>
          </div>

          {anonMessages.map((m) => {
            const isMe = m.senderId === currentUser?.id;
            return (
              <div key={m.id} className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start animate-fade-in'}`}>
                <span className="text-[8px] font-black uppercase tracking-widest mb-1 px-1 text-zinc-500">
                  {isMe ? 'Anda' : displayName}
                </span>
                <div className="flex items-center space-x-1.5 max-w-[85%]">
                  {isMe && (
                    <button
                      onClick={(e) => handleDeleteAnonMessageForMe(m.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-1 text-[11px]"
                      title="Hapus untuk Saya"
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  )}
                  <div className={`p-4 rounded-3xl text-sm font-medium shadow-md whitespace-pre-wrap break-words leading-relaxed ${
                    isMe 
                      ? 'bg-red-600 text-white rounded-br-none' 
                      : 'bg-zinc-800 border border-white/10 text-white rounded-bl-none'
                  }`}>
                    {m.text}
                  </div>
                  {!isMe && (
                    <button
                      onClick={(e) => handleDeleteAnonMessageForMe(m.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-1 text-[11px]"
                      title="Hapus untuk Saya"
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Input */}
        <form onSubmit={handleSendAnonMessage} className="p-3 bg-zinc-900 border-t border-white/10 flex items-center space-x-2">
          <div className="flex-1 min-w-0 flex items-center bg-zinc-800 border border-white/10 rounded-2xl px-4 py-1.5 focus-within:border-red-500 transition-all">
            <textarea
              ref={anonTextareaRef}
              rows={1}
              value={anonInputMsg}
              onChange={(e) => setAnonInputMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (isMobileDevice()) {
                    // On mobile/HP: Enter creates a new line, send via send button
                    return;
                  }
                  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    handleSendAnonMessage(e);
                  }
                }
              }}
              placeholder={isMobileDevice() ? "Tulis pesan rahasia anonim..." : "Tulis pesan rahasia anonim... (Shift+Enter baris baru)"}
              className="w-full bg-transparent text-white text-xs focus:outline-none resize-none leading-relaxed max-h-24 placeholder:text-zinc-500 py-1"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!anonInputMsg.trim()}
            className="w-11 h-11 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-30 active:scale-95 shrink-0"
            title="Kirim Pesan Anonim"
          >
            <i className="fas fa-paper-plane text-xs"></i>
          </button>
        </form>
      </div>
    );
  }

  const handleOpenCollectiveGroup = (g: Group) => {
    if (!currentUser) return;
    const participantsList = Array.isArray(g.participants) ? [...g.participants] : [];
    if (!participantsList.includes(currentUser.id)) {
      participantsList.push(currentUser.id);
      set(ref(db, `groups/${g.id}/participants/${currentUser.id}`), true).catch(() => {});
    }
    const updatedGroup: Group = {
      ...g,
      participants: participantsList,
      admins: Array.isArray(g.admins) ? g.admins : []
    };
    setSelectedRecipient({ type: 'group', data: updatedGroup });
  };

  if (isCreatingGroup) {
    const candidateUsers = users.filter(u => {
      if (u.id === currentUser?.id) return false;
      if (!groupMemberSearch.trim()) return true;
      const q = groupMemberSearch.toLowerCase();
      return (u.name && u.name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
    });

    return (
      <div className="p-4 flex flex-col h-full bg-white animate-fade-in">
        <div className="flex items-center mb-5">
          <button 
            onClick={() => { setIsCreatingGroup(false); setSelectedForGroup([]); setGroupMemberSearch(''); }} 
            className="mr-3 text-black w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tighter">New Collective</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Buat Komunitas & Grup Obrolan</p>
          </div>
        </div>

        <div className="space-y-3.5 mb-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-60">Nama Collective</label>
            <input 
              type="text" 
              placeholder="Contoh: Orbit Creatives, Diskusi Musik..." 
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full mt-1 p-3.5 border-2 border-black rounded-2xl font-bold focus:outline-none focus:ring-2 focus:ring-black transition-all text-sm"
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between ml-1 mb-1">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-60">
                Pilih Anggota ({selectedForGroup.length} Terpilih)
              </label>
              {selectedForGroup.length > 0 && (
                <button 
                  onClick={() => setSelectedForGroup([])}
                  className="text-[9px] font-bold text-red-500 hover:text-red-700"
                >
                  Reset Pilihan
                </button>
              )}
            </div>
            <div className="relative">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input 
                type="text" 
                placeholder="Cari anggota Orbit..." 
                value={groupMemberSearch}
                onChange={e => setGroupMemberSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-black/10 rounded-xl text-xs font-medium focus:outline-none focus:border-black transition-all"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1">
          {candidateUsers.length === 0 ? (
            <div className="text-center py-10 text-gray-400 italic text-xs px-6">
              Tidak ada anggota yang cocok dengan pencarian.
            </div>
          ) : (
            candidateUsers.map(u => {
              const isSelected = selectedForGroup.includes(u.id);
              const isMutualFriend = isMutual(u.id);
              return (
                <div 
                  key={u.id} 
                  onClick={() => toggleParticipantSelection(u.id)}
                  className={`flex items-center p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                    isSelected ? 'border-black bg-black text-white shadow-xs' : 'border-black/5 bg-gray-50 hover:bg-gray-100/80'
                  }`}
                >
                  <img src={u.photoURL} className="w-10 h-10 rounded-full mr-3 border border-black/10 object-cover shrink-0" alt={u.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <p className="font-bold text-xs uppercase truncate">{u.name}</p>
                      {isMutualFriend && (
                        <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-yellow-100 text-yellow-800'}`}>
                          Mutual
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                      {u.bio || `@${u.id.substring(0, 8)}`}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ml-2 ${
                    isSelected ? 'border-white bg-white text-black' : 'border-black/20 bg-white'
                  }`}>
                    {isSelected && <i className="fas fa-check text-[9px]"></i>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button 
          onClick={handleCreateGroup}
          disabled={!groupName.trim()}
          className="w-full bg-black text-white py-3.5 rounded-2xl font-black uppercase tracking-widest disabled:opacity-25 hover:bg-neutral-800 transition-all shadow-md active:scale-95 text-xs flex items-center justify-center space-x-2"
        >
          <i className="fas fa-users-viewfinder"></i>
          <span>Assemble Collective</span>
        </button>
        {renderConfirmModal()}
      </div>
    );
  }

  if (isViewingGroupSettings && selectedRecipient?.type === 'group') {
    const group = selectedRecipient.data as Group;
    const groupAdmins = Array.isArray(group?.admins) ? group.admins : [];
    const groupParticipants = Array.isArray(group?.participants) ? group.participants : [];
    const isAdmin = currentUser && (groupAdmins.includes(currentUser.id) || group.creatorId === currentUser.id || Boolean(currentUser.isAdmin));
    const mutualNonMembers = mutualFollowers.filter(u => !groupParticipants.includes(u.id));

    return (
      <div className="p-4 flex flex-col h-full bg-white overflow-y-auto pb-20 animate-fade-in relative">
        <div className="flex items-center mb-8">
          <button onClick={() => setIsViewingGroupSettings(false)} className="mr-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <i className="fas fa-arrow-left"></i>
          </button>
          <h2 className="text-xl font-black uppercase tracking-tighter">Collective Management</h2>
        </div>

        <div className="flex flex-col items-center mb-10">
          <div className="relative group mb-6">
            {group.photoURL ? (
              <img src={group.photoURL} className="w-32 h-32 rounded-full border-4 border-black object-cover shadow-xl" alt={group.name} />
            ) : (
              <div className="w-32 h-32 rounded-full bg-black text-white flex items-center justify-center text-4xl font-black border-4 border-black shadow-xl">
                {(group.name || 'G').substring(0, 1).toUpperCase()}
              </div>
            )}
            {isAdmin && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm">
                <i className="fas fa-camera text-white text-2xl"></i>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleGroupPhotoChange(group.id, e)} />
              </label>
            )}
          </div>

          {isAdmin ? (
            <div className="w-full space-y-6 px-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ml-1">Group Name</label>
                <input 
                  type="text" 
                  defaultValue={group.name} 
                  onBlur={(e) => updateGroupInfo(group.id, { name: e.target.value })}
                  className="w-full p-4 border-2 border-black rounded-2xl font-bold uppercase text-center focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>
          ) : (
            <h3 className="text-2xl font-black uppercase tracking-tight">{group.name}</h3>
          )}
        </div>

        <div className="mb-8">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-4 px-2">Members ({groupParticipants.length})</h4>
          <div className="space-y-2">
            {groupParticipants.map(pid => {
              const u = users.find(user => user.id === pid) || {
                id: pid,
                name: pid === currentUser?.id ? currentUser.name : `Orbit Member (${pid.substring(0, 5)})`,
                photoURL: pid === currentUser?.id ? currentUser.photoURL : `https://api.dicebear.com/7.x/initials/svg?seed=${pid}&backgroundColor=000000`,
                email: '',
                bio: '',
                followers: [],
                following: [],
                totalLikes: 0
              };
              const isUserAdmin = groupAdmins.includes(u.id);

              return (
                <div key={u.id} className="flex items-center p-3 bg-gray-50 rounded-2xl border border-transparent hover:border-black transition-all">
                  <img src={u.photoURL} className="w-10 h-10 rounded-full mr-3 border border-black/10 object-cover" alt={u.name} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs uppercase truncate">{u.name}</p>
                    {isUserAdmin && <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Admin</span>}
                  </div>
                  {isAdmin && u.id !== currentUser?.id && (
                    <div className="flex items-center space-x-1.5">
                      <button 
                        onClick={() => handleToggleGroupAdmin(group.id, u.id, isUserAdmin)} 
                        className={`px-2.5 py-1.5 flex items-center space-x-1 text-[9px] font-black uppercase tracking-wider rounded-xl border transition-all ${
                          isUserAdmin
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-white text-neutral-800 border-black/20 hover:border-black hover:bg-black hover:text-white'
                        }`}
                        title={isUserAdmin ? 'Cabut Status Admin Grup' : 'Jadikan Admin Grup'}
                      >
                        <i className={`fas ${isUserAdmin ? 'fa-shield-halved text-emerald-600' : 'fa-crown text-amber-500'} text-[10px]`}></i>
                        <span>{isUserAdmin ? 'Cabut Admin' : 'Jadikan Admin'}</span>
                      </button>
                      {!isUserAdmin && (
                        <button 
                          onClick={() => handleRemoveMember(group.id, u.id)} 
                          className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 bg-white border border-red-500/20 rounded-full transition-all"
                          title="Keluarkan Anggota"
                        >
                          <i className="fas fa-user-xmark text-xs"></i>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="mb-10">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-4 px-2">Add Mutual Orbit Members</h4>
            {mutualNonMembers.length === 0 ? (
              <p className="text-center text-[10px] text-gray-400 uppercase font-bold py-4">No more mutual orbit members to add.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {mutualNonMembers.map(u => (
                  <div key={u.id} className="flex items-center p-3 bg-gray-50 rounded-2xl border border-transparent hover:border-black transition-all">
                    <img src={u.photoURL} className="w-9 h-9 rounded-full mr-3 border border-black/10" alt={u.name} />
                    <p className="flex-1 text-xs font-bold uppercase">{u.name}</p>
                    <button 
                      onClick={() => handleAddMember(group.id, u.id)} 
                      className="w-8 h-8 flex items-center justify-center border-2 border-black rounded-full hover:bg-black hover:text-white transition-all active:scale-90"
                    >
                      <i className="fas fa-plus text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button 
          onClick={() => handleLeaveGroup(group.id)}
          className="w-full py-4 border-2 border-red-500 text-red-500 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all shadow-md active:scale-95 mb-10"
        >
          Leave Collective
        </button>
        {renderConfirmModal()}
      </div>
    );
  }

  if (!selectedRecipient) {
    return (
      <div className="p-4 h-full flex flex-col animate-fade-in relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-3xl font-black uppercase tracking-tighter">Echoes</h2>
          <button 
            onClick={() => setIsCreatingGroup(true)}
            className="w-11 h-11 flex items-center justify-center border-2 border-black rounded-full hover:bg-black hover:text-white transition-all shadow-md active:scale-90"
            title="Create Collective"
          >
            <i className="fas fa-users-viewfinder text-base"></i>
          </button>
        </div>

        {/* NOTIFICATION PERMISSION BANNER */}
        {permissionStatus === 'default' && onRequestPermission && (
          <div className="mb-5 p-3.5 bg-gradient-to-r from-black via-gray-900 to-black text-white rounded-2xl shadow-lg border border-white/10 flex items-center justify-between space-x-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-yellow-400 text-sm flex-shrink-0 animate-bounce">
                <i className="fas fa-bell"></i>
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-xs text-white truncate">Aktifkan Notifikasi Pop-Up</p>
                <p className="text-[10px] text-gray-300 leading-tight">Dapatkan bunyi chime & pop-up saat pesan baru masuk.</p>
              </div>
            </div>
            <button
              onClick={onRequestPermission}
              className="px-3.5 py-2 bg-white text-black text-[10px] font-black rounded-xl hover:bg-gray-200 transition-all flex-shrink-0 active:scale-95 shadow-md"
            >
              Aktifkan
            </button>
          </div>
        )}
        {permissionStatus === 'granted' && (
          <div className="mb-4 px-3.5 py-2 bg-green-50 border border-green-200 text-green-700 text-[10px] font-extrabold rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <i className="fas fa-circle-check text-green-600 text-xs"></i>
              <span>Notifikasi Chat & Pop-Up Browser Aktif</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
          </div>
        )}

        {/* 5 Tabs: AI Bot, Direct, Obrolan Toko, Collectives, Anonymous Match */}
        <div className="flex border-b-2 border-black/5 mb-6 overflow-x-auto scrollbar-none">
          <button 
            onClick={() => setActiveTab('hengkur_ai')}
            className={`flex-1 min-w-[110px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 flex items-center justify-center space-x-1.5 ${
              activeTab === 'hengkur_ai' ? 'border-emerald-500 text-emerald-600 font-extrabold' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {botAvatar ? (
              <img src={botAvatar} alt={botName} className="w-4 h-4 rounded-full object-cover ring-1 ring-emerald-400" />
            ) : (
              <i className="fas fa-robot text-emerald-500 text-xs animate-pulse"></i>
            )}
            <span className="truncate max-w-[90px]">{botName}</span>
            <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-1.5 py-0.5 rounded-full">AI</span>
          </button>

          <button 
            onClick={() => setActiveTab('direct')}
            className={`flex-1 min-w-[70px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 ${
              activeTab === 'direct' ? 'border-black text-black' : 'border-transparent text-gray-400'
            }`}
          >
            Direct
          </button>

          <button 
            onClick={() => setActiveTab('shop')}
            className={`flex-1 min-w-[110px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 flex items-center justify-center space-x-1.5 ${
              activeTab === 'shop' ? 'border-yellow-500 text-yellow-600 font-extrabold' : 'border-transparent text-gray-400'
            }`}
          >
            <i className="fas fa-store text-yellow-500 text-xs"></i>
            <span>Obrolan Toko</span>
          </button>

          <button 
            onClick={() => setActiveTab('groups')}
            className={`flex-1 min-w-[85px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 ${
              activeTab === 'groups' ? 'border-black text-black' : 'border-transparent text-gray-400'
            }`}
          >
            Collectives
          </button>

          <button 
            onClick={() => setActiveTab('anonymous')}
            className={`flex-1 min-w-[90px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 flex items-center justify-center space-x-1 ${
              activeTab === 'anonymous' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400'
            }`}
          >
            <i className="fas fa-user-ninja text-xs"></i>
            <span>{t('anon_match')}</span>
          </button>
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {activeTab === 'hengkur_ai' && (
            <div className="h-full min-h-[460px] flex flex-col -mx-2 sm:mx-0">
              <HengkurAIChat 
                currentUser={currentUser} 
                onBotNameChange={(name) => setBotName(name)}
                onBotAvatarChange={(avatar) => setBotAvatar(avatar)}
              />
            </div>
          )}

          {activeTab === 'direct' && (
            <div className="space-y-4">
              {/* Search Bar for Direct Messages & Contacts */}
              <div className="relative">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Cari percakapan atau nama pengguna..."
                  value={directSearchQuery}
                  onChange={(e) => setDirectSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-black/10 rounded-2xl text-xs focus:outline-none focus:border-black transition-all"
                />
                {directSearchQuery && (
                  <button
                    onClick={() => setDirectSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-xs"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>

              {/* Pinned AI Bot Assistant Card */}
              <div 
                onClick={() => setActiveTab('hengkur_ai')}
                className="flex items-center border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white rounded-2xl hover:border-emerald-500 transition-all p-3.5 shadow-xs cursor-pointer group hover:scale-[1.01]"
              >
                <div className="relative mr-3.5 shrink-0">
                  {botAvatar ? (
                    <img 
                      src={botAvatar} 
                      alt={botName}
                      className="w-12 h-12 rounded-2xl object-cover shadow-md ring-2 ring-emerald-400/60"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shadow-md ring-2 ring-emerald-400/50">
                      <i className="fas fa-robot text-lg text-emerald-400"></i>
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <p className="font-black text-sm uppercase text-neutral-900 truncate">{botName}</p>
                    <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md flex items-center space-x-1 shrink-0">
                      <i className="fas fa-sparkles text-[7px] text-yellow-300"></i>
                      <span>ASISTEN AI</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 font-bold truncate mt-0.5">Tanya ide caption, musik, konten viral, coding, atau ngobrol...</p>
                </div>
                <div className="flex items-center space-x-1 pl-2 shrink-0">
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-2 py-1 rounded-xl hidden sm:inline">Buka AI</span>
                  <i className="fas fa-chevron-right text-neutral-400 group-hover:text-black group-hover:translate-x-0.5 transition-all text-xs"></i>
                </div>
              </div>

              {/* FILTERED OR ACTIVE CONVERSATIONS */}
              {(() => {
                const query = directSearchQuery.toLowerCase().trim();
                const filteredThreads = directChatThreads.filter(t => 
                  t.otherUser.name.toLowerCase().includes(query) ||
                  t.lastMessage.toLowerCase().includes(query)
                );

                const existingChatUserIds = new Set(directChatThreads.map(t => t.otherUser.id));
                const searchedOtherUsers = query 
                  ? users.filter(u => u.id !== currentUser?.id && !existingChatUserIds.has(u.id) && (
                      u.name.toLowerCase().includes(query) ||
                      (u.bio && u.bio.toLowerCase().includes(query))
                    ))
                  : [];

                return (
                  <div className="space-y-4">
                    {/* Active Conversations Header & List */}
                    {filteredThreads.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                            {query ? 'Percakapan Ditemukan' : 'Pesan Masuk & Obrolan'}
                          </p>
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                            {filteredThreads.length}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {filteredThreads.map(thread => {
                            const isMeLastSender = thread.lastMessageSenderId === currentUser?.id;
                            const hasUnread = thread.unreadCount > 0;

                            return (
                              <div
                                key={thread.chatId}
                                onClick={() => setSelectedRecipient({ type: 'user', data: thread.otherUser })}
                                className={`flex items-center p-3.5 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] ${
                                  hasUnread 
                                    ? 'bg-blue-50/70 border-blue-300 shadow-sm' 
                                    : 'bg-white border-black/5 hover:border-black shadow-xs'
                                }`}
                              >
                                {/* User Avatar */}
                                <div className="relative mr-3 shrink-0">
                                  <img
                                    src={thread.otherUser.photoURL}
                                    alt={thread.otherUser.name}
                                    className="w-12 h-12 rounded-full object-cover border border-black/10 bg-gray-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUserClick(thread.otherUser.id);
                                    }}
                                  />
                                  {isMutual(thread.otherUser.id) && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" title="Saling Follow" />
                                  )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <div className="flex items-center space-x-1.5 truncate">
                                      <p className={`text-sm truncate ${hasUnread ? 'font-black text-black' : 'font-bold text-gray-900'}`}>
                                        {thread.otherUser.name}
                                      </p>
                                      {thread.otherUser.role && (
                                        <span 
                                          className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md text-white shrink-0"
                                          style={{ backgroundColor: thread.otherUser.roleColor || '#000000' }}
                                        >
                                          {thread.otherUser.role}
                                        </span>
                                      )}
                                      {thread.isShop && (
                                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 shrink-0">
                                          Toko
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-[10px] shrink-0 ml-2 ${hasUnread ? 'font-black text-blue-600' : 'text-gray-400 font-medium'}`}>
                                      {formatTimeAgo(thread.timestamp)}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <p className={`text-xs truncate pr-2 ${hasUnread ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                      {isMeLastSender && <span className="text-gray-400 font-medium">Anda: </span>}
                                      {thread.lastMessage}
                                    </p>
                                    {hasUnread && (
                                      <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-full shrink-0 shadow-xs animate-pulse">
                                        {thread.unreadCount}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Clear Chat button */}
                                <button
                                  onClick={(e) => handleClearDirectUserChat(thread.otherUser.id, e)}
                                  className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-full text-xs transition-colors ml-2 shrink-0"
                                  title="Hapus riwayat obrolan"
                                >
                                  <i className="fas fa-trash-can"></i>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* If search returns no threads & no new users */}
                    {query && filteredThreads.length === 0 && searchedOtherUsers.length === 0 && (
                      <div className="text-center py-12 text-gray-400 text-xs italic bg-white rounded-2xl border border-dashed border-gray-200 p-6">
                        Tidak ada percakapan atau pengguna yang cocok dengan "{directSearchQuery}".
                      </div>
                    )}

                    {/* Searched New Users to Start a Chat */}
                    {searchedOtherUsers.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">
                          Mulai Obrolan Baru
                        </p>
                        <div className="space-y-2">
                          {searchedOtherUsers.slice(0, 10).map(u => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-3 rounded-2xl bg-white border border-black/5 hover:border-black transition-all shadow-xs"
                            >
                              <div 
                                className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
                                onClick={() => setSelectedRecipient({ type: 'user', data: u })}
                              >
                                <img
                                  src={u.photoURL}
                                  alt={u.name}
                                  className="w-10 h-10 rounded-full object-cover border border-black/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUserClick(u.id);
                                  }}
                                />
                                <div className="truncate">
                                  <p className="font-bold text-xs uppercase truncate">{u.name}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{u.bio || 'Orbit Member'}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => setSelectedRecipient({ type: 'user', data: u })}
                                className="px-3 py-1.5 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-wider hover:opacity-80 active:scale-95 transition-all ml-2"
                              >
                                Chat
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mutual Contacts & Suggested Orbit Members when NOT searching */}
                    {!query && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                            Kontak & Teman Orbit
                          </p>
                          <span className="text-[10px] text-gray-400 font-semibold">
                            {mutualFollowers.length > 0 ? `${mutualFollowers.length} Saling Follow` : 'Semua Member'}
                          </span>
                        </div>

                        {users.filter(u => u.id !== currentUser?.id).length === 0 ? (
                          <div className="text-center py-8 text-gray-400 italic text-xs">
                            Belum ada kontak lain yang terdaftar.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(mutualFollowers.length > 0 ? mutualFollowers : users.filter(u => u.id !== currentUser?.id)).slice(0, 8).map(u => {
                              const isM = isMutual(u.id);
                              return (
                                <div 
                                  key={u.id} 
                                  onClick={() => setSelectedRecipient({ type: 'user', data: u })}
                                  className="flex items-center justify-between p-3 rounded-2xl bg-white border border-black/5 hover:border-black transition-all cursor-pointer shadow-xs group"
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                    <div className="relative shrink-0">
                                      <img 
                                        src={u.photoURL} 
                                        className="w-10 h-10 rounded-full border border-black/10 bg-gray-100 object-cover" 
                                        alt={u.name} 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUserClick(u.id);
                                        }}
                                      />
                                      {isM && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-bold text-xs uppercase truncate group-hover:text-black">{u.name}</p>
                                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider truncate">
                                        {isM ? 'Saling Follow' : (u.role || 'Orbit Member')}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedRecipient({ type: 'user', data: u });
                                    }}
                                    className="p-2 bg-gray-100 hover:bg-black hover:text-white text-gray-700 rounded-full text-xs transition-all shrink-0 ml-1.5"
                                    title="Mulai Kirim Pesan"
                                  >
                                    <i className="fas fa-paper-plane text-[10px]"></i>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'shop' && (
            <div className="space-y-4">
              {/* Banner Info Obrolan Toko */}
              <div className="bg-gradient-to-r from-amber-50 via-yellow-100 to-amber-100 border border-yellow-300 rounded-3xl p-4 shadow-sm flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-yellow-400 text-black flex items-center justify-center text-xl shrink-0 shadow-md">
                  <i className="fas fa-comments-dollar"></i>
                </div>
                <div>
                  <h3 className="font-black text-xs uppercase text-gray-900">Obrolan Toko & Jual Beli</h3>
                  <p className="text-[11px] text-gray-600 font-medium leading-tight mt-0.5">
                    Tanya jawab seputar barang, penawaran harga, & kesepakatan transaksi langsung dengan penjual atau pembeli!
                  </p>
                </div>
              </div>

              {/* Search Seller / Buyer */}
              <div className="relative">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Cari penjual atau pembeli di Vimos..."
                  value={shopSearchQuery}
                  onChange={(e) => setShopSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-2xl text-xs font-bold focus:outline-none focus:border-black shadow-sm"
                />
              </div>

              {/* List of Active Shop Chats */}
              <div className="space-y-2">
                {shopChatThreads.filter(thread => (
                  !shopSearchQuery || 
                  thread.otherUser.name.toLowerCase().includes(shopSearchQuery.toLowerCase()) || 
                  thread.lastMessage.toLowerCase().includes(shopSearchQuery.toLowerCase())
                )).length === 0 ? (
                  <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center space-y-3 my-4">
                    <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mx-auto shadow-sm">
                      <i className="fas fa-store-slash"></i>
                    </div>
                    <h3 className="font-extrabold text-sm text-gray-900 uppercase">Belum Ada Obrolan Toko</h3>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                      Obrolan jual beli dengan penjual atau pembeli akan otomatis muncul di sini begitu Anda menanyakan atau membeli produk dari Toko Vimos.
                    </p>
                  </div>
                ) : (
                  shopChatThreads
                    .filter(thread => (
                      !shopSearchQuery || 
                      thread.otherUser.name.toLowerCase().includes(shopSearchQuery.toLowerCase()) || 
                      thread.lastMessage.toLowerCase().includes(shopSearchQuery.toLowerCase())
                    ))
                    .map(thread => (
                      <div 
                        key={thread.chatId} 
                        className="flex items-center border border-gray-200 rounded-2xl hover:border-black transition-all group p-3.5 bg-white shadow-sm cursor-pointer"
                        onClick={() => setSelectedRecipient({ type: 'user', data: thread.otherUser })}
                      >
                        <img 
                          src={thread.otherUser.photoURL} 
                          className="w-12 h-12 rounded-full mr-3.5 border border-black/10 bg-gray-100 object-cover shadow-sm shrink-0" 
                          alt={thread.otherUser.name} 
                          onClick={(e) => {
                            e.stopPropagation();
                            onUserClick(thread.otherUser.id);
                          }}
                        />
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 truncate">
                              <p className="font-extrabold text-xs uppercase text-gray-900 truncate">{thread.otherUser.name}</p>
                              <span className="bg-yellow-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full shrink-0">
                                <i className="fas fa-store text-[8px] mr-1"></i>Toko / Jual Beli
                              </span>
                            </div>
                            {thread.timestamp > 0 && (
                              <span className="text-[9px] text-gray-400 font-medium ml-2 shrink-0">
                                {new Date(thread.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-600 font-medium truncate mt-1">
                            {thread.lastMessageSenderId === currentUser?.id ? 'Anda: ' : ''}{thread.lastMessage}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecipient({ type: 'user', data: thread.otherUser });
                          }}
                          className="bg-black hover:bg-gray-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-sm ml-2 shrink-0 transition-all active:scale-95 flex items-center space-x-1"
                        >
                          <i className="fas fa-comment-dots text-[10px]"></i>
                          <span>Chat</span>
                        </button>
                        <button
                          onClick={(e) => handleDeleteShopChatThread(thread.chatId, e)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full text-xs transition-colors ml-1"
                          title="Hapus obrolan toko ini"
                        >
                          <i className="fas fa-trash-can"></i>
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-black">Collectives</p>
                  <p className="text-[10px] text-gray-400 font-medium">Grup dan komunitas obrolan Orbit</p>
                </div>
                <button
                  onClick={() => setIsCreatingGroup(true)}
                  className="bg-black hover:bg-neutral-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-full shadow-xs transition-all active:scale-95 flex items-center space-x-1.5"
                >
                  <i className="fas fa-plus text-[9px]"></i>
                  <span>Buat Collective</span>
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-4 bg-gray-50 border border-dashed border-gray-200 rounded-3xl text-center">
                  <div className="w-14 h-14 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-3 shadow-2xs">
                    <i className="fas fa-users-viewfinder text-xl text-neutral-400"></i>
                  </div>
                  <p className="font-bold text-sm text-neutral-800 mb-1">Belum Ada Collective</p>
                  <p className="text-xs text-gray-400 mb-4 max-w-xs leading-relaxed">
                    Buat ruang obrolan grup baru untuk berdiskusi bersama teman dan komunitas Anda.
                  </p>
                  <button
                    onClick={() => setIsCreatingGroup(true)}
                    className="bg-black text-white text-xs font-black uppercase px-5 py-2.5 rounded-full hover:bg-neutral-800 transition-all shadow-sm flex items-center space-x-2 active:scale-95"
                  >
                    <i className="fas fa-plus text-[10px]"></i>
                    <span>Buat Collective Baru</span>
                  </button>
                </div>
              ) : (
                groups.map(g => (
                  <div key={g.id} className="flex items-center border border-black/5 rounded-2xl hover:border-black transition-all group p-4 bg-white shadow-xs">
                    {g.photoURL ? (
                      <img src={g.photoURL} className="w-12 h-12 rounded-full mr-4 border border-black/10 object-cover shadow-2xs" alt={g.name} />
                    ) : (
                      <div className="w-12 h-12 rounded-full mr-4 bg-black text-white flex items-center justify-center text-lg font-black border border-black/10">
                        {(g.name || 'G').substring(0, 1).toUpperCase()}
                      </div>
                    )}
                    <button 
                      onClick={() => handleOpenCollectiveGroup(g)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center space-x-1.5">
                        <p className="font-bold text-sm uppercase truncate">{g.name}</p>
                        {currentUser && g.admins?.includes(currentUser.id) && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                        {(g.participants?.length || 1)} Orbit Members
                      </p>
                    </button>
                    <button 
                      onClick={() => handleOpenCollectiveGroup(g)}
                      className="p-2 text-gray-300 group-hover:text-black transition-colors"
                    >
                      <i className="fas fa-chevron-right text-xs"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'anonymous' && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-6 my-auto">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-red-600 via-zinc-900 to-black p-1 shadow-2xl flex items-center justify-center">
                  <div className="w-full h-full bg-zinc-950 rounded-full flex items-center justify-center text-4xl text-red-500 border border-red-500/30">
                    <i className={`fas ${isSearchingAnon ? 'fa-spinner fa-spin' : 'fa-user-ninja'}`}></i>
                  </div>
                </div>
                {isSearchingAnon && (
                  <span className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping"></span>
                )}
              </div>

              <div className="space-y-2 max-w-sm">
                <h3 className="text-xl font-black uppercase tracking-tight text-black">
                  Obrolan Anonim Acak
                </h3>
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  Cari teman bicara secara acak tanpa nampak foto maupun nama asli Anda. Jika Anda dan lawan bicara sama-sama tertarik, tekan tombol <span className="font-black text-red-600">Follow</span> untuk mengungkap profil masing-masing!
                </p>
              </div>

              {isSearchingAnon ? (
                <div className="space-y-4 w-full max-w-xs">
                  <div className="p-3 bg-red-50 border border-red-300 rounded-2xl text-xs font-black uppercase tracking-wider text-red-600 animate-pulse">
                    🔍 {t('anon_searching')}
                  </div>
                  <button
                    onClick={handleCancelSearch}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-black p-3.5 rounded-2xl font-black uppercase text-xs tracking-wider border border-black/10 transition-all active:scale-95"
                  >
                    {t('anon_cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleFindAnonMatch}
                  className="w-full max-w-xs bg-red-600 hover:bg-red-700 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:shadow-2xl transition-all active:scale-95 flex items-center justify-center space-x-2"
                >
                  <i className="fas fa-dice text-base"></i>
                  <span>{t('anon_find')}</span>
                </button>
              )}
            </div>
          )}
        </div>
        {renderConfirmModal()}
      </div>
    );
  }

  const headerTitle = (selectedRecipient.type === 'user' 
    ? (selectedRecipient.data as User)?.name 
    : (selectedRecipient.data as Group)?.name) || 'Orbit Member';

  const headerPhoto = selectedRecipient.type === 'user' 
    ? (selectedRecipient.data as User)?.photoURL 
    : (selectedRecipient.data as Group)?.photoURL;

  const activeGroupCall = selectedRecipient.type === 'group'
    ? activeCalls.find(c => 
        c.type === 'collective' && 
        c.status !== 'ended' && 
        c.groupId === selectedRecipient.data.id
      )
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-fade-in">
      <div className="p-4 border-b border-black/5 flex items-center space-x-3 bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <button onClick={() => setSelectedRecipient(null)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <i className="fas fa-arrow-left"></i>
        </button>
        {headerPhoto ? (
          <img 
            src={headerPhoto} 
            className="w-10 h-10 rounded-full bg-gray-100 cursor-pointer object-cover border border-black/10 shadow-sm" 
            alt={headerTitle} 
            onClick={() => selectedRecipient.type === 'user' ? onUserClick((selectedRecipient.data as User).id) : setIsViewingGroupSettings(true)}
          />
        ) : (
          <div 
            className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center text-sm font-black cursor-pointer shadow-sm"
            onClick={() => setIsViewingGroupSettings(true)}
          >
            {(headerTitle || 'O').substring(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 
            className="font-black text-sm uppercase tracking-tighter truncate cursor-pointer hover:underline"
            onClick={() => selectedRecipient.type === 'user' ? onUserClick((selectedRecipient.data as User).id) : setIsViewingGroupSettings(true)}
          >
            {headerTitle}
          </h3>
          {selectedRecipient.type === 'group' && (
            <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Collective Frequency</p>
          )}
        </div>
        {selectedRecipient.type === 'user' ? (
          <div className="flex items-center space-x-1">
            {onStartCall && (
              <>
                <button
                  onClick={() => onStartCall('private', 'audio', (selectedRecipient.data as User).id)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-zinc-600 hover:text-black transition-colors"
                  title={t('start_voice_call')}
                >
                  <i className="fas fa-phone"></i>
                </button>
                <button
                  onClick={() => onStartCall('private', 'video', (selectedRecipient.data as User).id)}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-zinc-600 hover:text-black transition-colors"
                  title={t('start_video_call')}
                >
                  <i className="fas fa-video"></i>
                </button>
              </>
            )}
            <button
              onClick={handleClearChatForMe}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors ml-1"
              title="Hapus Obrolan untuk Saya"
            >
              <i className="fas fa-trash-can"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            {activeGroupCall ? (
              <button 
                onClick={() => onJoinCall && onJoinCall(activeGroupCall.id)}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 animate-pulse shadow-md"
              >
                <i className="fas fa-phone"></i>
                <span>{t('join_call')}</span>
              </button>
            ) : (
              onStartCall && (
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onStartCall('collective', 'audio', (selectedRecipient.data as Group).id, (selectedRecipient.data as Group).name)}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-zinc-600 hover:text-black transition-colors"
                    title={t('start_voice_call')}
                  >
                    <i className="fas fa-phone"></i>
                  </button>
                  <button
                    onClick={() => onStartCall('collective', 'video', (selectedRecipient.data as Group).id, (selectedRecipient.data as Group).name)}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-zinc-600 hover:text-black transition-colors"
                    title={t('start_video_call')}
                  >
                    <i className="fas fa-video"></i>
                  </button>
                </div>
              )
            )}
            <button
              onClick={handleClearChatForMe}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Hapus Obrolan untuk Saya"
            >
              <i className="fas fa-trash-can"></i>
            </button>
            <button 
              onClick={() => setIsViewingGroupSettings(true)} 
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <i className="fas fa-ellipsis-vertical"></i>
            </button>
          </div>
        )}
      </div>
      
      {/* Backdrop overlay for active message options menu */}
      {activeMenuMsgId && (
        <div 
          className="fixed inset-0 z-20 bg-transparent" 
          onClick={() => setActiveMenuMsgId(null)} 
        />
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50 scroll-smooth">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-xs italic">
            Belum ada pesan dalam obrolan ini.
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUser?.id;
            const sender = users.find(u => u.id === m.senderId);
            const isMenuOpen = activeMenuMsgId === m.id;

            return (
              <div key={m.id} className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start animate-fade-in'}`}>
                {!isMe && selectedRecipient.type === 'group' && (
                  <span className="text-[8px] font-black uppercase tracking-widest mb-1 ml-1 opacity-40">{sender?.name || 'Orbit'}</span>
                )}
                
                <div className="flex items-center space-x-2 max-w-[85%] relative">
                  {/* Action menu button for sent messages */}
                  {isMe && (
                    <div className="relative shrink-0 z-30">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuMsgId(isMenuOpen ? null : m.id);
                        }}
                        className="opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-black p-1.5 text-xs rounded-full hover:bg-gray-200"
                        title="Opsi Pesan"
                      >
                        <i className="fas fa-ellipsis-v"></i>
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 bottom-full mb-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl py-1.5 px-2 z-30 min-w-[170px] space-y-1 text-left animate-fade-in">
                          <button
                            onClick={(e) => handleDeleteMessageForMe(m.id, e)}
                            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors"
                          >
                            <i className="fas fa-trash-can text-xs"></i>
                            <span>Hapus untuk Saya</span>
                          </button>
                          <button
                            onClick={(e) => handleDeleteMessageForEveryone(m.id, e)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors"
                          >
                            <i className="fas fa-trash-arrow-up text-xs"></i>
                            <span>Hapus untuk Semua</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Bubble - Tapping opens option menu */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuMsgId(isMenuOpen ? null : m.id);
                    }}
                    className={`p-3.5 sm:p-4 rounded-3xl text-sm font-medium shadow-sm transition-all cursor-pointer hover:scale-[1.01] max-w-full ${
                      isMe ? 'bg-black text-white rounded-br-none' : 'bg-white border border-black/5 text-black rounded-bl-none'
                    }`}
                  >
                    {/* Photo Attachment in Chat Bubble */}
                    {(m.photoURL || (m.mediaType === 'image' && m.mediaURL)) && (
                      <div 
                        className="relative group/media overflow-hidden rounded-2xl mb-2 cursor-pointer max-w-sm bg-zinc-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenMedia({
                            url: m.photoURL || m.mediaURL || '',
                            type: 'image',
                            caption: m.text,
                            senderName: sender?.name || (isMe ? currentUser?.name : 'Teman'),
                            timestamp: m.timestamp
                          });
                        }}
                      >
                        <img 
                          src={m.photoURL || m.mediaURL} 
                          alt="Foto Obrolan" 
                          className="w-full max-h-72 object-cover rounded-2xl transition-transform duration-300 group-hover/media:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/media:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover/media:opacity-100">
                          <span className="bg-black/75 text-white text-[10px] font-black px-3 py-1.5 rounded-full flex items-center space-x-1.5 backdrop-blur-sm shadow-md">
                            <i className="fas fa-expand"></i>
                            <span>Buka Foto</span>
                          </span>
                        </div>
                        {m.fileSize && (
                          <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm">
                            {m.fileSize}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Video Attachment in Chat Bubble */}
                    {(m.videoURL || (m.mediaType === 'video' && m.mediaURL)) && (
                      <div 
                        className="relative rounded-2xl overflow-hidden mb-2 max-w-sm bg-black border border-white/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <video 
                          src={m.videoURL || m.mediaURL} 
                          controls 
                          playsInline 
                          preload="metadata"
                          className="w-full max-h-72 rounded-t-2xl bg-black object-contain"
                        />
                        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 text-[10px] text-zinc-300">
                          <div className="flex items-center space-x-1.5 truncate">
                            <i className="fas fa-video text-red-500"></i>
                            <span className="font-bold truncate">{m.fileName || 'Video'}</span>
                          </div>
                          <button 
                            onClick={() => setFullscreenMedia({
                              url: m.videoURL || m.mediaURL || '',
                              type: 'video',
                              caption: m.text,
                              senderName: sender?.name || (isMe ? currentUser?.name : 'Teman'),
                              timestamp: m.timestamp
                            })}
                            className="text-white hover:text-red-400 text-xs px-2 py-0.5 rounded transition-colors shrink-0 ml-2"
                            title="Tonton Layar Penuh"
                          >
                            <i className="fas fa-expand mr-1"></i>Layar Penuh
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Text Message / Caption */}
                    {m.text && (
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {m.text}
                      </p>
                    )}

                    {/* Timestamp & double check mark */}
                    <div className={`flex items-center justify-end space-x-1.5 mt-1 text-[9px] font-medium ${isMe ? 'text-zinc-400' : 'text-gray-400'}`}>
                      <span>
                        {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {isMe && (
                        (() => {
                          let isRead = false;
                          if (selectedRecipient.type === 'user') {
                            const otherUserId = (selectedRecipient.data as User).id;
                            const otherUserSafeId = getSafeKey(otherUserId);
                            isRead = Boolean(m.read === true || (m.readBy && m.readBy[otherUserSafeId]));
                          } else if (selectedRecipient.type === 'group') {
                            const safeMyId = getSafeKey(currentUser.id);
                            isRead = Boolean(m.readBy && Object.keys(m.readBy).some(k => k !== safeMyId));
                          }

                          return (
                            <span className="inline-flex items-center" title={isRead ? "Sudah dibaca (Read)" : "Terkirim (Sent)"}>
                              {isRead ? (
                                <i className="fas fa-check-double text-[9px] text-sky-400 font-bold"></i>
                              ) : (
                                <i className="fas fa-check-double text-[9px] text-zinc-400 opacity-60"></i>
                              )}
                            </span>
                          );
                        })()
                      )}
                    </div>
                  </div>

                  {/* Action menu button for received messages */}
                  {!isMe && (
                    <div className="relative shrink-0 z-30">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuMsgId(isMenuOpen ? null : m.id);
                        }}
                        className="opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-black p-1.5 text-xs rounded-full hover:bg-gray-200"
                        title="Opsi Pesan"
                      >
                        <i className="fas fa-ellipsis-v"></i>
                      </button>

                      {isMenuOpen && (
                        <div className="absolute left-0 bottom-full mb-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl py-1.5 px-2 z-30 min-w-[170px] text-left animate-fade-in">
                          <button
                            onClick={(e) => handleDeleteMessageForMe(m.id, e)}
                            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors"
                          >
                            <i className="fas fa-trash-can text-xs"></i>
                            <span>Hapus untuk Saya</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {/* Bottom anchor for auto scroll */}
        <div ref={chatBottomRef} className="h-1" />
      </div>

      {/* Media Attachment Preview Bar if Photo or Video is selected */}
      {selectedMedia && (
        <div className="px-4 py-2.5 bg-zinc-950 text-white border-t border-zinc-800 flex items-center justify-between space-x-3 animate-fade-in shadow-inner">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-black border border-white/20 shrink-0 shadow-md">
              {selectedMedia.type === 'image' ? (
                <img src={selectedMedia.url} alt="Pratinjau Foto" className="w-full h-full object-cover" />
              ) : (
                <video src={selectedMedia.url} className="w-full h-full object-cover" />
              )}
              <span className={`absolute top-0.5 right-0.5 text-[8px] font-black px-1.5 py-0.2 rounded-md uppercase text-white shadow-xs ${selectedMedia.type === 'image' ? 'bg-blue-600' : 'bg-red-600'}`}>
                {selectedMedia.type === 'image' ? 'Foto' : 'Video'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <i className={`fas ${selectedMedia.type === 'image' ? 'fa-image text-blue-400' : 'fa-video text-red-400'} text-xs`}></i>
                <p className="text-xs font-black text-white truncate max-w-[180px] sm:max-w-xs">
                  {selectedMedia.name || (selectedMedia.type === 'image' ? 'Foto Terlampir' : 'Video Terlampir')}
                </p>
              </div>
              <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                {selectedMedia.size ? `Ukuran: ${selectedMedia.size}` : 'Siap dikirim'} • Tekan tombol kirim atau tambahkan pesan
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setSelectedMedia(null)}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white flex items-center justify-center transition-all text-xs shrink-0 active:scale-90"
            title="Batalkan Lampiran"
          >
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Processing Spinner Indicator */}
      {isProcessingMedia && (
        <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-t border-blue-200 text-xs font-black flex items-center space-x-2 animate-pulse">
          <i className="fas fa-spinner fa-spin text-blue-600"></i>
          <span>Memproses foto / video berkualitas tinggi...</span>
        </div>
      )}

      {/* Input form with Photo & Video attachment tools */}
      <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-black/5 bg-white flex items-center space-x-2">
        {/* Hidden inputs for media upload */}
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*,video/*" 
          onChange={(e) => handleFileSelect(e)} 
          className="hidden" 
        />
        <input 
          type="file" 
          ref={cameraInputRef} 
          accept="image/*" 
          capture="environment" 
          onChange={(e) => handleFileSelect(e, 'image')} 
          className="hidden" 
        />

        {/* Attachment Button for Gallery / File */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gray-100 hover:bg-black hover:text-white text-gray-700 flex items-center justify-center transition-all active:scale-95 shadow-xs shrink-0"
          title="Kirim Foto atau Video"
        >
          <i className="fas fa-photo-film text-sm"></i>
        </button>

        {/* Camera Snapshot Button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gray-100 hover:bg-black hover:text-white text-gray-700 flex items-center justify-center transition-all active:scale-95 shadow-xs shrink-0"
          title="Ambil Foto dengan Kamera"
        >
          <i className="fas fa-camera text-sm"></i>
        </button>

        {/* Multiline Text Input */}
        <div className="flex-1 min-w-0 flex items-center bg-gray-50 border-2 border-black rounded-2xl sm:rounded-3xl px-4 py-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-black/10 transition-all shadow-inner">
          <textarea 
            ref={chatTextareaRef}
            rows={1}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (isMobileDevice()) {
                  // On mobile / smartphone: Enter key makes a new line in chat; sending must be done via the Send button
                  return;
                }
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }
            }}
            placeholder={
              selectedMedia 
                ? "Tambahkan keterangan / caption..." 
                : (isMobileDevice() ? "Ketik pesan..." : "Ketik pesan... (Shift+Enter untuk baris baru)")
            }
            className="w-full bg-transparent text-sm focus:outline-none resize-none leading-relaxed max-h-28 placeholder:text-gray-400 py-1"
            style={{ minHeight: '28px' }}
          />
        </div>

        {/* Send Button */}
        <button 
          type="submit" 
          disabled={!msg.trim() && !selectedMedia}
          className="w-10 h-10 sm:w-11 sm:h-11 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-20 shrink-0"
          title="Kirim Pesan"
        >
          <i className="fas fa-paper-plane text-xs sm:text-sm"></i>
        </button>
      </form>

      {/* FULLSCREEN LIGHTBOX / MEDIA VIEWER MODAL */}
      {fullscreenMedia && (
        <div 
          className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-fade-in"
          onClick={() => setFullscreenMedia(null)}
        >
          {/* Header */}
          <div className="w-full max-w-4xl flex items-center justify-between py-2 text-white z-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${fullscreenMedia.type === 'image' ? 'bg-blue-600' : 'bg-red-600'}`}>
                <i className={`fas ${fullscreenMedia.type === 'image' ? 'fa-image' : 'fa-video'} text-sm`}></i>
              </div>
              <div>
                <p className="font-extrabold text-sm text-white">{fullscreenMedia.senderName || 'Media Obrolan'}</p>
                <p className="text-[10px] text-zinc-400">
                  {fullscreenMedia.timestamp ? new Date(fullscreenMedia.timestamp).toLocaleString() : 'Vimos Media'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <a 
                href={fullscreenMedia.url} 
                download={`vimos_${fullscreenMedia.type}_${Date.now()}.${fullscreenMedia.type === 'image' ? 'jpg' : 'mp4'}`}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-md"
                onClick={(e) => e.stopPropagation()}
                title="Unduh Media"
              >
                <i className="fas fa-download text-xs"></i>
                <span className="hidden sm:inline">Unduh</span>
              </a>
              <button 
                onClick={() => setFullscreenMedia(null)}
                className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-red-600 text-white flex items-center justify-center transition-colors text-base"
                title="Tutup"
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
          </div>

          {/* Content Center */}
          <div className="flex-1 flex items-center justify-center max-w-4xl w-full my-auto overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
            {fullscreenMedia.type === 'image' ? (
              <img 
                src={fullscreenMedia.url} 
                alt="Layar Penuh" 
                className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 animate-scale-up" 
              />
            ) : (
              <video 
                src={fullscreenMedia.url} 
                controls 
                autoPlay 
                playsInline 
                className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl ring-1 ring-white/10 animate-scale-up bg-black"
              />
            )}
          </div>

          {/* Footer / Caption */}
          {fullscreenMedia.caption && (
            <div className="w-full max-w-2xl bg-zinc-900/90 text-white rounded-2xl p-4 border border-white/10 text-center text-xs font-medium z-10 animate-fade-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="whitespace-pre-wrap">{fullscreenMedia.caption}</p>
            </div>
          )}
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL POP-UP FOR CHATS */}
      {renderConfirmModal()}
    </div>
  );
};

export default Chat;
