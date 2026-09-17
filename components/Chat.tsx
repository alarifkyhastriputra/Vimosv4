import React, { useState, useEffect, useRef } from 'react';
import { User, ChatMessage, Group, SavedContact } from '../types.ts';
import { db } from '../firebase.ts';
import { ref, onValue, push, serverTimestamp, set, update, remove, get } from 'firebase/database';
import { ActiveCall } from './CallingOverlay.tsx';
import { useLanguage } from '../LanguageContext.tsx';
import { compressImage } from '../services/imageCompressor.ts';
import { isSharedGroupMember, canViewUserSerial } from '../utils/userPrivacy.ts';

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
  const [activeTab, setActiveTab] = useState<'direct' | 'contacts' | 'shop' | 'groups'>('direct');

  const [shopSearchQuery, setShopSearchQuery] = useState('');
  const [directSearchQuery, setDirectSearchQuery] = useState('');
  const [contactsSearchQuery, setContactsSearchQuery] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);

  // WhatsApp-Style Contacts System State
  const [savedContacts, setSavedContacts] = useState<Record<string, SavedContact>>({});
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [addContactSerial, setAddContactSerial] = useState('');
  const [addContactCustomName, setAddContactCustomName] = useState('');
  const [searchedContactUser, setSearchedContactUser] = useState<User | null>(null);
  const [addContactError, setAddContactError] = useState('');
  const [addContactSuccess, setAddContactSuccess] = useState('');
  const [addContactLoading, setAddContactLoading] = useState(false);

  // Edit Contact Name Modal State
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<{ contactUserId: string; currentCustomName: string; user?: User } | null>(null);
  const [editContactNewName, setEditContactNewName] = useState('');
  const [editContactLoading, setEditContactLoading] = useState(false);

  // Serial Code Unlock Modal (When attempting to chat with a user whose serial code is unknown)
  const [unlockUserModal, setUnlockUserModal] = useState<User | null>(null);
  const [unlockSerialInput, setUnlockSerialInput] = useState('');
  const [unlockCustomName, setUnlockCustomName] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

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

  // Auto-resize chat textarea when message changes or is cleared
  useEffect(() => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
      chatTextareaRef.current.style.height = `${Math.min(chatTextareaRef.current.scrollHeight, 120)}px`;
    }
  }, [msg]);

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

  // Real-time listener for current user's saved contacts (WhatsApp-like Contacts)
  useEffect(() => {
    if (!currentUser?.id) return;
    const contactsRef = ref(db, `users/${currentUser.id}/savedContacts`);
    const unsubscribe = onValue(contactsRef, (snapshot) => {
      const data = snapshot.val();
      if (data && typeof data === 'object') {
        setSavedContacts(data);
      } else {
        setSavedContacts({});
      }
    });
    return () => unsubscribe();
  }, [currentUser?.id]);

  // Helper to resolve contact name or fallback to user.name
  const getContactDisplayName = (targetUser?: User | null, fallbackId?: string) => {
    const uid = targetUser?.id || fallbackId;
    if (uid && savedContacts[uid]?.customName) {
      return savedContacts[uid].customName;
    }
    if (targetUser?.name) return targetUser.name;
    return 'Pengguna Vimos';
  };

  const isUserSavedInContacts = (userId?: string) => {
    if (!userId) return false;
    return Boolean(savedContacts[userId]);
  };

  // Search User by Serial Code for Add Contact
  const handleSearchSerial = async (serialQuery: string) => {
    const raw = serialQuery.trim().toUpperCase();
    if (!raw) {
      setAddContactError('Silakan masukkan Nomor Seri pengguna');
      setSearchedContactUser(null);
      return;
    }

    setAddContactLoading(true);
    setAddContactError('');
    setAddContactSuccess('');

    // Check if it's user's own serial
    const mySerial = (currentUser?.serialCode || ('ORB-' + currentUser?.id?.substring(0, 6))).toUpperCase();
    const myShort = currentUser?.id ? currentUser.id.substring(0, 6).toUpperCase() : '';
    if (raw === mySerial || (myShort && raw.includes(myShort))) {
      setAddContactError('Ini adalah Nomor Seri akun Anda sendiri! Masukkan nomor seri orang lain untuk menambah kontak.');
      setSearchedContactUser(null);
      setAddContactLoading(false);
      return;
    }

    const cleanQuery = raw.replace(/[^A-Z0-9]/g, '');

    // 1. Check local loaded users
    let found = users.find(u => {
      const uSerial = (u.serialCode || ('ORB-' + u.id.substring(0, 6))).toUpperCase();
      const uClean = uSerial.replace(/[^A-Z0-9]/g, '');
      const uidShort = u.id.substring(0, 6).toUpperCase();
      return uSerial === raw || uClean === cleanQuery || (cleanQuery.length >= 5 && uClean.includes(cleanQuery)) || uidShort === cleanQuery;
    });

    // 2. If not found, fetch all users from Firebase Realtime Database
    if (!found) {
      try {
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
          const val = usersSnap.val();
          for (const [uid, uData] of Object.entries<any>(val)) {
            const uSerial = (uData.serialCode || ('ORB-' + uid.substring(0, 6))).toUpperCase();
            const uClean = uSerial.replace(/[^A-Z0-9]/g, '');
            const uidShort = uid.substring(0, 6).toUpperCase();
            if (uSerial === raw || uClean === cleanQuery || (cleanQuery.length >= 5 && uClean.includes(cleanQuery)) || uidShort === cleanQuery) {
              found = {
                id: uid,
                name: uData.name || 'Orbit Member',
                email: uData.email || '',
                totalLikes: uData.totalLikes || 0,
                photoURL: uData.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${uid}&backgroundColor=000000`,
                bio: uData.bio || '',
                serialCode: uData.serialCode || uSerial,
                isVerified: Boolean(uData.isVerified || uData.authProvider === 'google'),
                role: uData.role,
                roleColor: uData.roleColor,
                followers: uData.followers ? Object.keys(uData.followers) : [],
                following: uData.following ? Object.keys(uData.following) : []
              };
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Error querying user by serial:', err);
      }
    }

    if (found) {
      if (found.id === currentUser?.id) {
        setAddContactError('Ini adalah Nomor Seri akun Anda sendiri.');
        setSearchedContactUser(null);
      } else {
        setSearchedContactUser(found);
        const existing = savedContacts[found.id];
        setAddContactCustomName(existing ? existing.customName : found.name);
      }
    } else {
      setAddContactError(`Pengguna dengan nomor seri "${raw}" tidak ditemukan. Pastikan nomor seri sudah benar.`);
      setSearchedContactUser(null);
    }
    setAddContactLoading(false);
  };

  // Save Contact Handler
  const handleSaveContact = async () => {
    if (!currentUser?.id || !searchedContactUser) return;
    const finalCustomName = addContactCustomName.trim() || searchedContactUser.name || 'Kontak Vimos';
    const targetId = searchedContactUser.id;
    const serial = searchedContactUser.serialCode || ('ORB-' + targetId.substring(0, 6).toUpperCase());

    setAddContactLoading(true);
    setAddContactError('');
    try {
      const contactData: SavedContact = {
        id: targetId,
        contactUserId: targetId,
        customName: finalCustomName,
        serialCode: serial,
        createdAt: savedContacts[targetId]?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await set(ref(db, `users/${currentUser.id}/savedContacts/${targetId}`), contactData);
      setAddContactSuccess(`Kontak "${finalCustomName}" berhasil disimpan!`);
      setSavedContacts(prev => ({
        ...prev,
        [targetId]: contactData
      }));
    } catch (err: any) {
      setAddContactError('Gagal menyimpan kontak: ' + (err?.message || 'Silakan coba lagi'));
    } finally {
      setAddContactLoading(false);
    }
  };

  // Open Edit Contact Modal
  const handleOpenEditContact = (targetUserId: string, currentCustomName: string, targetUser?: User) => {
    setEditingContact({
      contactUserId: targetUserId,
      currentCustomName,
      user: targetUser || users.find(u => u.id === targetUserId)
    });
    setEditContactNewName(currentCustomName);
    setIsEditContactOpen(true);
  };

  // Save Updated Contact Name
  const handleUpdateContactName = async () => {
    if (!currentUser?.id || !editingContact) return;
    const trimmed = editContactNewName.trim();
    if (!trimmed) {
      alert('Nama kontak tidak boleh kosong');
      return;
    }

    setEditContactLoading(true);
    try {
      await update(ref(db, `users/${currentUser.id}/savedContacts/${editingContact.contactUserId}`), {
        customName: trimmed,
        updatedAt: Date.now()
      });

      setSavedContacts(prev => ({
        ...prev,
        [editingContact.contactUserId]: {
          ...prev[editingContact.contactUserId],
          customName: trimmed,
          updatedAt: Date.now()
        }
      }));

      setIsEditContactOpen(false);
      setEditingContact(null);
    } catch (err: any) {
      alert('Gagal mengubah nama kontak: ' + (err?.message || 'Coba lagi'));
    } finally {
      setEditContactLoading(false);
    }
  };

  // Delete Contact
  const handleDeleteContact = (contactUserId: string, contactName: string) => {
    if (!currentUser?.id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Kontak?',
      message: `Apakah Anda yakin ingin menghapus "${contactName}" dari buku kontak Anda? Riwayat percakapan tidak akan terhapus.`,
      confirmText: 'Hapus Kontak',
      onConfirm: async () => {
        try {
          await remove(ref(db, `users/${currentUser.id}/savedContacts/${contactUserId}`));
          setSavedContacts(prev => {
            const next = { ...prev };
            delete next[contactUserId];
            return next;
          });
        } catch (err) {
          console.error('Error deleting contact:', err);
        }
        setConfirmModal(null);
      }
    });
  };

  // Serial Code Unlock Handlers (Require knowing the user's serial code before chatting)
  const handlePromptUnlock = (targetUser: User) => {
    setUnlockUserModal(targetUser);
    setUnlockSerialInput('');
    setUnlockCustomName(savedContacts[targetUser.id]?.customName || targetUser.name || '');
    setUnlockError('');
    setUnlockLoading(false);
  };

  const handleSubmitUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockUserModal || !currentUser?.id) return;
    const targetUser = unlockUserModal;
    const targetSerial = (targetUser.serialCode || ('ORB-' + targetUser.id.substring(0, 6).toUpperCase())).toUpperCase();
    const cleanTarget = targetSerial.replace(/[^A-Z0-9]/g, '');
    const cleanInput = unlockSerialInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawInput = unlockSerialInput.trim().toUpperCase();

    if (!cleanInput) {
      setUnlockError('Nomor seri wajib diisi.');
      return;
    }

    if (cleanInput !== cleanTarget && rawInput !== targetSerial) {
      setUnlockError(`Nomor seri "${rawInput}" salah! Anda tidak dapat mengobrol tanpa nomor seri yang sesuai.`);
      return;
    }

    setUnlockLoading(true);
    setUnlockError('');
    
    const finalCustomName = unlockCustomName.trim() || targetUser.name || 'Kontak Vimos';
    const contactData: SavedContact = {
      id: targetUser.id,
      contactUserId: targetUser.id,
      customName: finalCustomName,
      serialCode: targetSerial,
      createdAt: savedContacts[targetUser.id]?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    // Optimistic update
    set(ref(db, `users/${currentUser.id}/savedContacts/${targetUser.id}`), contactData)
      .catch(err => console.error('Gagal menyimpan kontak:', err));

    setSavedContacts(prev => ({
      ...prev,
      [targetUser.id]: contactData
    }));
    setSelectedRecipient({ type: 'user', data: targetUser });
    setUnlockUserModal(null);
    setUnlockSerialInput('');
    setUnlockCustomName('');
    setUnlockLoading(false);
  };

  // Quick Add To Contacts (from chat header or direct chat list)
  const handleQuickAddContact = (targetUser: User) => {
    const hasSerial = Boolean(savedContacts[targetUser.id]) || isSharedGroupMember(currentUser?.id, targetUser.id, groups);
    if (hasSerial) {
      const serial = targetUser.serialCode || ('ORB-' + targetUser.id.substring(0, 6).toUpperCase());
      setAddContactSerial(serial);
      setSearchedContactUser(targetUser);
      setAddContactCustomName(savedContacts[targetUser.id]?.customName || targetUser.name || 'Kontak Baru');
      setAddContactError('');
      setAddContactSuccess('');
      setIsAddContactOpen(true);
    } else {
      handlePromptUnlock(targetUser);
    }
  };

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

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
    }
  }, [messages.length, selectedRecipient]);

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
      const isSaved = Boolean(savedContacts[otherUser.id]);
      const isSharedGroup = isSharedGroupMember(currentUser.id, otherUser.id, groups);
      if (!isSaved && !isSharedGroup) {
        handlePromptUnlock(otherUser);
        return;
      }
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
      chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
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

  // Render WhatsApp-Style Add Contact & Rename Contact Modals
  const renderContactModals = () => {
    return (
      <>
        {/* ADD CONTACT MODAL (Using Serial Code) */}
        {isAddContactOpen && (
          <div 
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
            onClick={() => {
              if (!addContactLoading) setIsAddContactOpen(false);
            }}
          >
            <div 
              className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-black/10 animate-scale-up space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-base font-bold shadow-xs">
                    <i className="fas fa-user-plus"></i>
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-gray-900">Tambah Kontak Baru</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Pakai Nomor Seri orang lain (ala nomor WA)</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddContactOpen(false)}
                  disabled={addContactLoading}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-400 hover:text-black flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Step 1: Input Serial Code */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700">
                  Nomor Seri Pengguna <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <i className="fas fa-id-badge absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input
                      type="text"
                      placeholder="Misal: ORB-123456 atau VMS-..."
                      value={addContactSerial}
                      onChange={(e) => {
                        setAddContactSerial(e.target.value.toUpperCase());
                        setAddContactError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchSerial(addContactSerial);
                        }
                      }}
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider focus:outline-none focus:border-emerald-600 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchSerial(addContactSerial)}
                    disabled={addContactLoading || !addContactSerial.trim()}
                    className="px-4 py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white rounded-2xl text-xs font-black transition-all active:scale-95 shadow-xs shrink-0 flex items-center space-x-1.5 cursor-pointer"
                  >
                    {addContactLoading ? (
                      <i className="fas fa-spinner fa-spin text-xs"></i>
                    ) : (
                      <>
                        <i className="fas fa-search text-xs"></i>
                        <span>Cari</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">
                  Minta teman Anda memberikan Nomor Seri yang tertera di menu profil atau bagian atas tab Direct Chat mereka.
                </p>
              </div>

              {/* Error Message */}
              {addContactError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-medium flex items-center space-x-2 animate-shake">
                  <i className="fas fa-circle-exclamation shrink-0 text-sm"></i>
                  <span>{addContactError}</span>
                </div>
              )}

              {/* Step 2: User Found Preview & Custom Contact Name Input */}
              {searchedContactUser && (
                <div className="space-y-4 pt-1 animate-fade-in">
                  {/* Profile Preview Card */}
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl flex items-center space-x-3">
                    <img
                      src={searchedContactUser.photoURL}
                      alt={searchedContactUser.name}
                      className="w-12 h-12 rounded-full object-cover border border-emerald-300 bg-white shrink-0 shadow-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <p className="font-mono font-black text-xs text-black tracking-wider">
                          {searchedContactUser.serialCode || ('ORB-' + searchedContactUser.id.substring(0, 6).toUpperCase())}
                        </p>
                        {searchedContactUser.isVerified && (
                          <span className="text-blue-500 text-xs" title="Akun Terverifikasi">
                            <i className="fas fa-circle-check"></i>
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-gray-900 truncate">@{searchedContactUser.name}</p>
                      {searchedContactUser.bio && (
                        <p className="text-[10px] text-gray-500 truncate italic">"{searchedContactUser.bio}"</p>
                      )}
                    </div>
                  </div>

                  {/* Custom Contact Name Input */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700">
                      Beri Nama Kontak (Bebas sesuai keinginan Anda) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <i className="fas fa-pen-fancy absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                      <input
                        type="text"
                        placeholder="Contoh: Ibu, Andi Futsal, Budi Tetangga, dll..."
                        value={addContactCustomName}
                        onChange={(e) => setAddContactCustomName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-300 rounded-2xl text-xs font-bold focus:outline-none focus:border-emerald-600 transition-all shadow-xs"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400">
                      Nama ini hanya akan terlihat oleh Anda, persis seperti menyimpan kontak di WhatsApp. Anda bisa mengubahnya kapan saja.
                    </p>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {addContactSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center justify-between animate-fade-in">
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-circle-check text-emerald-600 text-sm"></i>
                    <span>{addContactSuccess}</span>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddContactOpen(false)}
                  disabled={addContactLoading}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  Tutup
                </button>
                {searchedContactUser && !addContactSuccess && (
                  <button
                    type="button"
                    onClick={handleSaveContact}
                    disabled={addContactLoading || !addContactCustomName.trim()}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 text-white text-xs font-black rounded-2xl transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    {addContactLoading ? (
                      <i className="fas fa-spinner fa-spin text-xs"></i>
                    ) : (
                      <>
                        <i className="fas fa-check text-xs"></i>
                        <span>Simpan Kontak</span>
                      </>
                    )}
                  </button>
                )}
                {addContactSuccess && searchedContactUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddContactOpen(false);
                      setSelectedRecipient({ type: 'user', data: searchedContactUser });
                    }}
                    className="flex-1 py-2.5 bg-black hover:bg-neutral-800 text-white text-xs font-black rounded-2xl transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <i className="fas fa-comment text-yellow-400 text-xs"></i>
                    <span>Mulai Chat Sekarang</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* EDIT CONTACT NAME MODAL */}
        {isEditContactOpen && editingContact && (
          <div 
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
            onClick={() => {
              if (!editContactLoading) setIsEditContactOpen(false);
            }}
          >
            <div 
              className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-black/10 animate-scale-up space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 text-black flex items-center justify-center text-base font-bold shadow-xs">
                    <i className="fas fa-pen-to-square"></i>
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-gray-900">Ganti Nama Kontak</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Ubah nama panggilan untuk kontak ini</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditContactOpen(false)}
                  disabled={editContactLoading}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-400 hover:text-black flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* User Target Info */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl flex items-center space-x-3">
                <img
                  src={editingContact.user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${editingContact.contactUserId}&backgroundColor=000000`}
                  alt={editingContact.currentCustomName}
                  className="w-11 h-11 rounded-full object-cover border border-black/10 bg-white shrink-0"
                />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-mono font-bold text-gray-500">
                    {editingContact.user?.serialCode || ('ORB-' + editingContact.contactUserId.substring(0, 6).toUpperCase())}
                  </p>
                  <p className="text-gray-900 font-extrabold truncate">
                    Akun: @{editingContact.user?.name || 'Orbit Member'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    Nama saat ini: <span className="font-bold text-gray-700">"{editingContact.currentCustomName}"</span>
                  </p>
                </div>
              </div>

              {/* Input New Name */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700">
                  Nama Kontak Baru <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <i className="fas fa-pen absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                  <input
                    type="text"
                    placeholder="Masukkan nama kontak baru..."
                    value={editContactNewName}
                    onChange={(e) => setEditContactNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleUpdateContactName();
                      }
                    }}
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-300 rounded-2xl text-xs font-bold focus:outline-none focus:border-emerald-600 transition-all shadow-xs"
                  />
                </div>
                <p className="text-[10px] text-gray-400">
                  Nama ini hanya terlihat di buku kontak dan obrolan Anda pribadi.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsEditContactOpen(false)}
                  disabled={editContactLoading}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleUpdateContactName}
                  disabled={editContactLoading || !editContactNewName.trim() || editContactNewName.trim() === editingContact.currentCustomName}
                  className="flex-1 py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-black rounded-2xl transition-all shadow-md flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer"
                >
                  {editContactLoading ? (
                    <i className="fas fa-spinner fa-spin text-xs"></i>
                  ) : (
                    <>
                      <i className="fas fa-check text-xs text-yellow-400"></i>
                      <span>Simpan Nama Baru</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* UNLOCK USER WITH SERIAL CODE MODAL */}
        {unlockUserModal && (
          <div 
            className="fixed inset-0 z-[125] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
            onClick={() => {
              if (!unlockLoading) {
                setUnlockUserModal(null);
                setUnlockError('');
                setUnlockSerialInput('');
              }
            }}
          >
            <div 
              className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border-2 border-black animate-scale-up space-y-4 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-base font-bold shadow-xs">
                    <i className="fas fa-key"></i>
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-gray-900">Buka Obrolan</h3>
                    <p className="text-[11px] text-gray-500 font-medium">Verifikasi nomor seri untuk mulai chat</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUnlockUserModal(null);
                    setUnlockError('');
                    setUnlockSerialInput('');
                  }}
                  disabled={unlockLoading}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-400 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Target User Info */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-2xl flex items-center space-x-3">
                <img
                  src={unlockUserModal.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${unlockUserModal.id}&backgroundColor=000000`}
                  alt={unlockUserModal.name}
                  className="w-11 h-11 rounded-full object-cover border border-black/10 bg-white shrink-0"
                />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-black text-gray-900 truncate">@{unlockUserModal.name}</span>
                    {unlockUserModal.isVerified && (
                      <span className="text-blue-500 text-xs shrink-0"><i className="fas fa-circle-check"></i></span>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500 line-clamp-1 mt-0.5">
                    {unlockUserModal.bio || 'Pengguna Vimos'}
                  </p>
                  <div className="mt-1 flex items-center space-x-1 text-[9px] font-bold text-amber-800 bg-amber-100/70 border border-amber-300 px-1.5 py-0.5 rounded w-fit">
                    <i className="fas fa-lock text-[8px]"></i>
                    <span>Nomor Seri Diperlukan</span>
                  </div>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmitUnlock} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700">
                    Nomor Seri Pemilik Akun <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <i className="fas fa-id-badge absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="Misal: ORB-123456"
                      value={unlockSerialInput}
                      onChange={(e) => {
                        setUnlockSerialInput(e.target.value.toUpperCase());
                        setUnlockError('');
                      }}
                      className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-neutral-300 focus:border-black rounded-2xl text-xs font-mono font-bold uppercase tracking-wider focus:outline-none transition-all placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-400"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Anda tidak bisa chat pengguna yang nomor serinya belum Anda miliki. Minta nomor seri kepada <strong>@{unlockUserModal.name}</strong> untuk membuka obrolan.
                  </p>
                </div>

                {/* Custom Contact Name */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700">
                    Simpan Sebagai Kontak (Nama Panggilan)
                  </label>
                  <div className="relative">
                    <i className="fas fa-user-pen absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input
                      type="text"
                      placeholder="Contoh: Teman Kerja, Saudara..."
                      value={unlockCustomName}
                      onChange={(e) => setUnlockCustomName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-neutral-300 focus:border-black rounded-2xl text-xs font-bold focus:outline-none transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Nama ini akan disimpan di daftar kontak Anda agar Anda selalu bisa saling chat kapan saja.
                  </p>
                </div>

                {/* Error message */}
                {unlockError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs font-bold flex items-center space-x-2 animate-shake">
                    <i className="fas fa-circle-exclamation shrink-0 text-sm"></i>
                    <span>{unlockError}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockUserModal(null);
                      setUnlockError('');
                      setUnlockSerialInput('');
                    }}
                    disabled={unlockLoading}
                    className="flex-1 py-2.5 border-2 border-neutral-200 hover:border-black text-gray-700 text-xs font-black rounded-2xl transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={unlockLoading || !unlockSerialInput.trim()}
                    className="flex-1 py-2.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-black rounded-2xl transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    {unlockLoading ? (
                      <i className="fas fa-spinner fa-spin text-xs"></i>
                    ) : (
                      <>
                        <i className="fas fa-key text-amber-400 text-xs"></i>
                        <span>Verifikasi &amp; Buka Chat</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  };

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

        {/* 4 Tabs: Direct, Kontak (WhatsApp style), Obrolan Toko, Collectives */}
        <div className="flex border-b-2 border-black/5 mb-6 overflow-x-auto scrollbar-none">
          <button 
            onClick={() => setActiveTab('direct')}
            className={`flex-1 min-w-[70px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 ${
              activeTab === 'direct' ? 'border-black text-black' : 'border-transparent text-gray-400'
            }`}
          >
            Direct
          </button>

          <button 
            onClick={() => setActiveTab('contacts')}
            className={`flex-1 min-w-[90px] py-3 text-[10px] font-black uppercase tracking-[0.1em] transition-all border-b-2 flex items-center justify-center space-x-1.5 ${
              activeTab === 'contacts' ? 'border-emerald-600 text-emerald-700 font-extrabold' : 'border-transparent text-gray-400'
            }`}
          >
            <i className="fas fa-address-book text-xs"></i>
            <span>Kontak ({Object.keys(savedContacts).length})</span>
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
        </div>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">

          {activeTab === 'direct' && (
            <div className="space-y-4">
              {/* User's Own Serial Code Card */}
              <div className="p-3.5 bg-neutral-900 text-white rounded-2xl flex items-center justify-between shadow-xs border border-neutral-800">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-mono text-xs font-bold text-yellow-400">
                    <i className="fas fa-id-badge text-base"></i>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Nomor Seri Anda (Bagikan seperti no. WA)</p>
                    <div className="flex items-center space-x-1.5">
                      <p className="font-mono font-black text-sm tracking-wider text-white">
                        {currentUser?.serialCode || ('ORB-' + (currentUser?.id?.substring(0, 6).toUpperCase() || '000000'))}
                      </p>
                      {currentUser?.isVerified && (
                        <span className="text-blue-400 text-xs" title="Akun Terverifikasi">
                          <i className="fas fa-circle-check"></i>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    const code = currentUser?.serialCode || ('ORB-' + (currentUser?.id?.substring(0, 6).toUpperCase() || '000000'));
                    navigator.clipboard?.writeText(code);
                    alert(`Nomor Seri Anda (${code}) berhasil disalin! Bagikan ke teman agar mereka bisa menyimpan kontak Anda.`);
                  }}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-[10px] font-black uppercase tracking-wider text-white transition-all flex items-center space-x-1.5 cursor-pointer"
                  title="Salin Nomor Seri"
                >
                  <i className="fas fa-copy text-xs"></i>
                  <span>Salin</span>
                </button>
              </div>

              {/* Quick Actions: Tambah Kontak & Akses Buku Kontak */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddContactSerial('');
                    setAddContactCustomName('');
                    setSearchedContactUser(null);
                    setAddContactError('');
                    setAddContactSuccess('');
                    setIsAddContactOpen(true);
                  }}
                  className="py-2.5 px-3 bg-black text-white hover:bg-neutral-800 active:scale-95 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-xs cursor-pointer"
                >
                  <i className="fas fa-user-plus text-xs text-yellow-400"></i>
                  <span>+ Tambah Kontak</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('contacts')}
                  className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-black active:scale-95 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <i className="fas fa-address-book text-xs text-emerald-600"></i>
                  <span>Buku Kontak ({Object.keys(savedContacts).length})</span>
                </button>
              </div>

              {/* Search Bar for Direct Messages & Contacts by Serial Code or Name */}
              <div className="relative">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Cari nama kontak, nomor seri (ORB-...), atau pesan..."
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

              {/* FILTERED OR ACTIVE CONVERSATIONS */}
              {(() => {
                const query = directSearchQuery.toLowerCase().trim();
                const filteredThreads = directChatThreads.filter(t => {
                  const serial = (t.otherUser.serialCode || ('orb-' + t.otherUser.id.substring(0, 6))).toLowerCase();
                  const name = (t.otherUser.name || '').toLowerCase();
                  const savedName = (savedContacts[t.otherUser.id]?.customName || '').toLowerCase();
                  return serial.includes(query) || name.includes(query) || savedName.includes(query) || t.lastMessage.toLowerCase().includes(query);
                });

                const existingChatUserIds = new Set(directChatThreads.map(t => t.otherUser.id));
                const searchedOtherUsers = query 
                  ? users.filter(u => u.id !== currentUser?.id && !existingChatUserIds.has(u.id) && (
                      (u.serialCode && u.serialCode.toLowerCase().includes(query)) ||
                      (u.name && u.name.toLowerCase().includes(query)) ||
                      (savedContacts[u.id]?.customName && savedContacts[u.id].customName.toLowerCase().includes(query)) ||
                      ('orb-' + u.id.toLowerCase()).includes(query) ||
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
                            const serialCode = thread.otherUser.serialCode || ('ORB-' + thread.otherUser.id.substring(0, 6).toUpperCase());
                            const isSavedContact = Boolean(savedContacts[thread.otherUser.id]);
                            const isSharedGroup = isSharedGroupMember(currentUser?.id, thread.otherUser.id, groups);
                            const canSeeSerial = isSavedContact || isSharedGroup;
                            const contactDisplayName = savedContacts[thread.otherUser.id]?.customName || thread.otherUser.name;

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
                                      {/* WhatsApp Style Contact Display */}
                                      <p className="font-extrabold text-sm text-black truncate flex items-center space-x-1">
                                        <span>{contactDisplayName}</span>
                                        {isSavedContact && (
                                          <span className="text-emerald-600 text-[10px]" title="Kontak Tersimpan">
                                            <i className="fas fa-address-book"></i>
                                          </span>
                                        )}
                                      </p>
                                      {thread.otherUser.isVerified && (
                                        <span className="text-blue-500 text-xs shrink-0" title="Akun Terverifikasi">
                                          <i className="fas fa-circle-check"></i>
                                        </span>
                                      )}
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

                                  {/* Subtitle with Serial Code & Username */}
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center space-x-1 text-[10px] text-gray-400 font-medium truncate">
                                      {canSeeSerial ? (
                                        <>
                                          <span className="font-mono font-bold text-gray-500">{serialCode}</span>
                                          <span>•</span>
                                          <span className="truncate">@{thread.otherUser.name}</span>
                                        </>
                                      ) : (
                                        <span className="truncate font-semibold text-gray-500">@{thread.otherUser.name}</span>
                                      )}
                                    </div>
                                    {!isSavedContact && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickAddContact(thread.otherUser);
                                        }}
                                        className="text-[9px] font-black px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full transition-all flex items-center space-x-1 shrink-0 ml-2"
                                        title="Simpan ke Kontak"
                                      >
                                        <i className="fas fa-user-plus text-[8px]"></i>
                                        <span>+ Simpan</span>
                                      </button>
                                    )}
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

                                {/* Action Buttons: Edit Name if contact, Clear Chat */}
                                <div className="flex items-center space-x-1 ml-2 shrink-0">
                                  {isSavedContact && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditContact(thread.otherUser.id, contactDisplayName, thread.otherUser);
                                      }}
                                      className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-full text-xs transition-colors"
                                      title="Ganti Nama Kontak"
                                    >
                                      <i className="fas fa-pen text-[10px]"></i>
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => handleClearDirectUserChat(thread.otherUser.id, e)}
                                    className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-full text-xs transition-colors"
                                    title="Hapus riwayat obrolan"
                                  >
                                    <i className="fas fa-trash-can text-[10px]"></i>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* If search returns no threads & no new users */}
                    {query && filteredThreads.length === 0 && searchedOtherUsers.length === 0 && (
                      <div className="text-center py-12 text-gray-400 text-xs italic bg-white rounded-2xl border border-dashed border-gray-200 p-6">
                        Tidak ada percakapan atau pengguna dengan kode seri / nama "{directSearchQuery}".
                      </div>
                    )}

                    {/* Searched New Users to Start a Chat */}
                    {searchedOtherUsers.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">
                          Mulai Obrolan Baru Berdasarkan Kode Seri
                        </p>
                        <div className="space-y-2">
                          {searchedOtherUsers.slice(0, 10).map(u => {
                            const uSerial = u.serialCode || ('ORB-' + u.id.substring(0, 6).toUpperCase());
                            const canSeeSerial = Boolean(savedContacts[u.id]) || isSharedGroupMember(currentUser?.id, u.id, groups);
                            return (
                              <div
                                key={u.id}
                                className="flex items-center justify-between p-3 rounded-2xl bg-white border border-black/5 hover:border-black transition-all shadow-xs"
                              >
                                <div 
                                  className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
                                  onClick={() => {
                                    if (!canSeeSerial) {
                                      handlePromptUnlock(u);
                                    } else {
                                      setSelectedRecipient({ type: 'user', data: u });
                                    }
                                  }}
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
                                    <div className="flex items-center space-x-1.5">
                                      {canSeeSerial ? (
                                        <p className="font-mono font-black text-xs tracking-wider text-black truncate">{uSerial}</p>
                                      ) : (
                                        <p className="font-black text-xs text-black truncate">{u.name}</p>
                                      )}
                                      {u.isVerified && (
                                        <span className="text-blue-500 text-[10px]" title="Terverifikasi">
                                          <i className="fas fa-circle-check"></i>
                                        </span>
                                      )}
                                      {!canSeeSerial && (
                                        <span className="text-[8px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-1.5 py-0.2 rounded shrink-0 flex items-center space-x-0.5">
                                          <i className="fas fa-lock text-[7px]"></i>
                                          <span>Butuh Seri</span>
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-gray-400 truncate">@{u.name} • {u.bio || 'Orbit Member'}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!canSeeSerial) {
                                      handlePromptUnlock(u);
                                    } else {
                                      setSelectedRecipient({ type: 'user', data: u });
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all ml-2 flex items-center space-x-1 ${
                                    canSeeSerial 
                                      ? 'bg-black text-white hover:opacity-80' 
                                      : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                                  }`}
                                  title={canSeeSerial ? "Buka Obrolan" : "Masukkan Nomor Seri untuk Mengobrol"}
                                >
                                  <i className={`fas ${canSeeSerial ? 'fa-comment' : 'fa-key text-[9px]'}`}></i>
                                  <span>{canSeeSerial ? 'Chat' : 'Buka'}</span>
                                </button>
                              </div>
                            );
                          })}
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
                              const uSerial = u.serialCode || ('ORB-' + u.id.substring(0, 6).toUpperCase());
                              const canSeeSerial = Boolean(savedContacts[u.id]) || isSharedGroupMember(currentUser?.id, u.id, groups);
                              return (
                                <div 
                                  key={u.id} 
                                  onClick={() => {
                                    if (!canSeeSerial) {
                                      handlePromptUnlock(u);
                                    } else {
                                      setSelectedRecipient({ type: 'user', data: u });
                                    }
                                  }}
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
                                      <div className="flex items-center space-x-1">
                                        {canSeeSerial ? (
                                          <p className="font-mono font-black text-xs tracking-wider truncate text-black">{uSerial}</p>
                                        ) : (
                                          <p className="font-black text-xs tracking-tight truncate text-black">{u.name}</p>
                                        )}
                                        {u.isVerified && (
                                          <span className="text-blue-500 text-[9px]">
                                            <i className="fas fa-circle-check"></i>
                                          </span>
                                        )}
                                        {!canSeeSerial && (
                                          <span className="text-[8px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-1.5 py-0.2 rounded shrink-0 flex items-center space-x-0.5">
                                            <i className="fas fa-lock text-[7px]"></i>
                                            <span>Butuh Seri</span>
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider truncate">
                                        @{u.name} • {isM ? 'Saling Follow' : (u.role || 'Orbit Member')}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!canSeeSerial) {
                                        handlePromptUnlock(u);
                                      } else {
                                        setSelectedRecipient({ type: 'user', data: u });
                                      }
                                    }}
                                    className={`p-2 rounded-full text-xs transition-all shrink-0 ml-1.5 flex items-center justify-center ${
                                      canSeeSerial
                                        ? 'bg-gray-100 hover:bg-black hover:text-white text-gray-700'
                                        : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
                                    }`}
                                    title={canSeeSerial ? "Mulai Kirim Pesan" : "Masukkan Nomor Seri untuk Membuka Obrolan"}
                                  >
                                    <i className={`fas ${canSeeSerial ? 'fa-paper-plane text-[10px]' : 'fa-key text-[10px]'}`}></i>
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

          {activeTab === 'contacts' && (
            <div className="space-y-4 animate-fade-in">
              {/* WhatsApp-Style Contacts Header Banner */}
              <div className="bg-gradient-to-br from-emerald-900 via-neutral-900 to-black text-white rounded-3xl p-4 sm:p-5 shadow-sm border border-emerald-800/40 relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 text-emerald-500/10 text-8xl pointer-events-none">
                  <i className="fas fa-address-book"></i>
                </div>
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xl shrink-0 shadow-xs">
                      <i className="fas fa-address-book"></i>
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-black text-sm uppercase tracking-wide text-white">Buku Kontak Vimos</h3>
                        <span className="px-2 py-0.5 bg-emerald-500 text-black text-[9px] font-black rounded-full uppercase tracking-widest">
                          {Object.keys(savedContacts).length} Kontak
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 font-medium leading-relaxed mt-0.5 max-w-md">
                        Sistem kontak seperti WhatsApp. Tambahkan pengguna menggunakan Nomor Seri mereka dan beri nama sesuka Anda!
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAddContactSerial('');
                      setAddContactCustomName('');
                      setSearchedContactUser(null);
                      setAddContactError('');
                      setAddContactSuccess('');
                      setIsAddContactOpen(true);
                    }}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-2xl active:scale-95 transition-all shadow-md flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                  >
                    <i className="fas fa-user-plus text-xs"></i>
                    <span>+ Tambah Kontak Baru</span>
                  </button>
                </div>
              </div>

              {/* Contacts Search Bar */}
              <div className="relative">
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Cari nama kontak, nomor seri, atau username..."
                  value={contactsSearchQuery}
                  onChange={(e) => setContactsSearchQuery(e.target.value)}
                  className="w-full bg-white border border-black/10 pl-9 pr-8 py-2.5 rounded-2xl text-xs font-medium focus:outline-none focus:border-emerald-600 transition-all shadow-xs"
                />
                {contactsSearchQuery && (
                  <button
                    onClick={() => setContactsSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-xs"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>

              {/* Contacts List */}
              {(() => {
                const query = contactsSearchQuery.toLowerCase().trim();
                const allContacts = (Object.values(savedContacts) as SavedContact[]).sort((a, b) => 
                  a.customName.localeCompare(b.customName, 'id', { sensitivity: 'base' })
                );

                const filteredContacts = allContacts.filter(c => {
                  const resolvedUser = users.find(u => u.id === c.contactUserId);
                  const serial = (c.serialCode || (resolvedUser?.serialCode) || ('orb-' + c.contactUserId.substring(0, 6))).toLowerCase();
                  const customName = c.customName.toLowerCase();
                  const originalName = (resolvedUser?.name || '').toLowerCase();
                  return customName.includes(query) || serial.includes(query) || originalName.includes(query);
                });

                if (allContacts.length === 0) {
                  return (
                    <div className="text-center py-12 px-4 bg-white rounded-3xl border border-dashed border-gray-200 shadow-xs space-y-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
                        <i className="fas fa-address-book"></i>
                      </div>
                      <div className="max-w-sm mx-auto space-y-1">
                        <h4 className="font-black text-sm text-gray-900">Belum Ada Kontak Tersimpan</h4>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          Anda dapat menambahkan teman menggunakan <strong>Nomor Seri</strong> mereka (seperti nomor HP di WhatsApp) dan bebas memberi nama kontak kustom.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAddContactSerial('');
                          setAddContactCustomName('');
                          setSearchedContactUser(null);
                          setAddContactError('');
                          setAddContactSuccess('');
                          setIsAddContactOpen(true);
                        }}
                        className="px-5 py-2.5 bg-black hover:bg-neutral-800 text-white text-xs font-black uppercase tracking-wider rounded-2xl active:scale-95 transition-all shadow-md inline-flex items-center space-x-2"
                      >
                        <i className="fas fa-user-plus text-yellow-400 text-xs"></i>
                        <span>Tambah Kontak Pertama</span>
                      </button>
                    </div>
                  );
                }

                if (filteredContacts.length === 0 && query) {
                  return (
                    <div className="text-center py-10 px-4 bg-white rounded-2xl border border-gray-200 text-xs text-gray-500">
                      Tidak ada kontak dengan nama atau nomor seri "<strong className="text-black">{contactsSearchQuery}</strong>".
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        {query ? 'Hasil Pencarian Kontak' : `Semua Kontak (${filteredContacts.length})`}
                      </p>
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        Urut A-Z
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {filteredContacts.map(contact => {
                        const targetUser = users.find(u => u.id === contact.contactUserId);
                        const fallbackSerial = contact.serialCode || (targetUser?.serialCode) || ('ORB-' + contact.contactUserId.substring(0, 6).toUpperCase());
                        const userPhoto = targetUser?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${contact.contactUserId}&backgroundColor=000000`;
                        const originalName = targetUser?.name || 'Orbit Member';

                        const resolvedUserObject: User = targetUser || {
                          id: contact.contactUserId,
                          name: originalName,
                          email: '',
                          totalLikes: 0,
                          photoURL: userPhoto,
                          bio: '',
                          serialCode: fallbackSerial,
                          followers: [],
                          following: []
                        };

                        return (
                          <div
                            key={contact.contactUserId}
                            className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-black/5 hover:border-emerald-500 hover:shadow-sm transition-all group"
                          >
                            <div 
                              className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
                              onClick={() => setSelectedRecipient({ type: 'user', data: resolvedUserObject })}
                            >
                              <div className="relative shrink-0">
                                <img
                                  src={userPhoto}
                                  alt={contact.customName}
                                  className="w-12 h-12 rounded-full object-cover border border-black/10 bg-gray-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUserClick(contact.contactUserId);
                                  }}
                                />
                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center text-[7px] text-white">
                                  <i className="fas fa-check"></i>
                                </span>
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-2">
                                  <h4 className="font-black text-sm text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                                    {contact.customName}
                                  </h4>
                                  {targetUser?.isVerified && (
                                    <span className="text-blue-500 text-xs shrink-0" title="Akun Terverifikasi">
                                      <i className="fas fa-circle-check"></i>
                                    </span>
                                  )}
                                  <span className="text-[9px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold shrink-0">
                                    Kontak
                                  </span>
                                </div>

                                <div className="flex items-center space-x-1.5 text-[11px] text-gray-400 font-medium truncate mt-0.5">
                                  <span className="font-mono font-bold text-gray-700 text-xs">{fallbackSerial}</span>
                                  <span>•</span>
                                  <span className="truncate">@{originalName}</span>
                                </div>

                                {targetUser?.bio && (
                                  <p className="text-[10px] text-gray-400 italic truncate mt-0.5">
                                    "{targetUser.bio}"
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Contact Action Buttons */}
                            <div className="flex items-center space-x-1 ml-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedRecipient({ type: 'user', data: resolvedUserObject })}
                                className="px-3 py-2 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-black transition-all active:scale-95 flex items-center space-x-1.5 shadow-xs"
                                title="Kirim Pesan"
                              >
                                <i className="fas fa-comment text-xs text-yellow-400"></i>
                                <span className="hidden sm:inline">Chat</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEditContact(contact.contactUserId, contact.customName, targetUser)}
                                className="p-2.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl text-xs transition-colors"
                                title="Ganti Nama Kontak"
                              >
                                <i className="fas fa-pen"></i>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteContact(contact.contactUserId, contact.customName)}
                                className="p-2.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs transition-colors"
                                title="Hapus dari Kontak"
                              >
                                <i className="fas fa-trash-can"></i>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
        </div>
        {renderConfirmModal()}
        {renderContactModals()}
      </div>
    );
  }


  const recipientUser = selectedRecipient.type === 'user' ? (selectedRecipient.data as User) : null;
  const recipientSerial = recipientUser?.serialCode || (recipientUser ? 'ORB-' + recipientUser.id.substring(0, 6).toUpperCase() : '');
  const isRecipientSharedGroup = recipientUser ? isSharedGroupMember(currentUser?.id, recipientUser.id, groups) : false;

  const headerTitle = (selectedRecipient.type === 'user' 
    ? (recipientUser?.name || 'Orbit Member') 
    : (selectedRecipient.data as Group)?.name) || 'Orbit Member';

  const headerPhoto = selectedRecipient.type === 'user' 
    ? recipientUser?.photoURL 
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
            onClick={() => selectedRecipient.type === 'user' ? onUserClick(recipientUser!.id) : setIsViewingGroupSettings(true)}
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
          {selectedRecipient.type === 'user' && recipientUser ? (
            <div>
              {savedContacts[recipientUser.id] ? (
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 
                      className="font-extrabold text-sm tracking-tight truncate cursor-pointer hover:underline text-black flex items-center space-x-1.5"
                      onClick={() => onUserClick(recipientUser.id)}
                    >
                      <span>{savedContacts[recipientUser.id].customName}</span>
                      <span className="text-emerald-600 text-[10px]" title="Kontak Tersimpan">
                        <i className="fas fa-address-book"></i>
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleOpenEditContact(recipientUser.id, savedContacts[recipientUser.id].customName, recipientUser)}
                      className="text-gray-400 hover:text-black p-1 text-xs transition-colors rounded-md"
                      title="Ganti Nama Kontak"
                    >
                      <i className="fas fa-pen text-[10px]"></i>
                    </button>
                    {recipientUser.isVerified && (
                      <span className="text-blue-500 text-xs shrink-0" title="Akun Terverifikasi">
                        <i className="fas fa-circle-check"></i>
                      </span>
                    )}
                    {recipientUser.role && (
                      <span 
                        className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md text-white shrink-0"
                        style={{ backgroundColor: recipientUser.roleColor || '#000000' }}
                      >
                        {recipientUser.role}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 font-semibold truncate">
                    <span className="font-mono text-gray-700">{recipientSerial}</span> • @{recipientUser.name}
                  </p>
                </div>
              ) : isRecipientSharedGroup ? (
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 
                      className="font-mono font-black text-sm tracking-wider truncate cursor-pointer hover:underline text-black"
                      onClick={() => onUserClick(recipientUser.id)}
                    >
                      {recipientSerial}
                    </h3>
                    <span className="text-[8px] bg-neutral-100 text-neutral-700 border border-neutral-300 font-black px-1.5 py-0.5 rounded-md shrink-0">
                      Satu Grup
                    </span>
                    {recipientUser.isVerified && (
                      <span className="text-blue-500 text-xs shrink-0" title="Akun Terverifikasi">
                        <i className="fas fa-circle-check"></i>
                      </span>
                    )}
                    {recipientUser.role && (
                      <span 
                        className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md text-white shrink-0"
                        style={{ backgroundColor: recipientUser.roleColor || '#000000' }}
                      >
                        {recipientUser.role}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleQuickAddContact(recipientUser)}
                      className="px-2.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full text-[9px] font-black tracking-wider transition-all flex items-center space-x-1"
                      title="Simpan ke Kontak"
                    >
                      <i className="fas fa-user-plus text-[8px]"></i>
                      <span>+ Kontak</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold truncate">@{recipientUser.name}</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 
                      className="font-extrabold text-sm tracking-tight truncate cursor-pointer hover:underline text-black"
                      onClick={() => onUserClick(recipientUser.id)}
                    >
                      {recipientUser.name}
                    </h3>
                    {recipientUser.isVerified && (
                      <span className="text-blue-500 text-xs shrink-0" title="Akun Terverifikasi">
                        <i className="fas fa-circle-check"></i>
                      </span>
                    )}
                    {recipientUser.role && (
                      <span 
                        className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md text-white shrink-0"
                        style={{ backgroundColor: recipientUser.roleColor || '#000000' }}
                      >
                        {recipientUser.role}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleQuickAddContact(recipientUser)}
                      className="px-2.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full text-[9px] font-black tracking-wider transition-all flex items-center space-x-1"
                      title="Simpan ke Kontak"
                    >
                      <i className="fas fa-user-plus text-[8px]"></i>
                      <span>+ Kontak</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold truncate">
                    @{recipientUser.name} • <span className="text-gray-400 font-normal italic">Kontak Belum Disimpan</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3 
                className="font-black text-sm uppercase tracking-tighter truncate cursor-pointer hover:underline"
                onClick={() => setIsViewingGroupSettings(true)}
              >
                {headerTitle}
              </h3>
              {selectedRecipient.type === 'group' && (
                <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Collective Frequency</p>
              )}
            </div>
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
        {/* WhatsApp-Style Notice Banner for Unsaved Direct Contact */}
        {selectedRecipient.type === 'user' && recipientUser && !savedContacts[recipientUser.id] && (
          <div className="mx-auto max-w-md p-3.5 bg-emerald-50/90 border border-emerald-300/80 rounded-2xl shadow-xs flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <i className="fas fa-address-book text-xs"></i>
              </div>
              <div className="min-w-0">
                <p className="font-black text-xs text-emerald-950 truncate">Nomor Seri Ini Belum Disimpan</p>
                <p className="text-[10px] text-emerald-800 font-medium truncate">Simpan ke kontak Anda untuk memberi nama panggilan seperti di WA.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleQuickAddContact(recipientUser)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-[10px] font-black shrink-0 transition-all shadow-xs cursor-pointer"
            >
              + Simpan Kontak
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-xs italic">
            Belum ada pesan dalam obrolan ini.
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUser?.id;
            const sender = users.find(u => u.id === m.senderId);
            const isMenuOpen = activeMenuMsgId === m.id;
            const isSenderInContacts = Boolean(savedContacts[m.senderId]);
            const senderContactName = savedContacts[m.senderId]?.customName;

            return (
              <div key={m.id} className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start animate-fade-in'}`}>
                {!isMe && selectedRecipient.type === 'group' && (
                  <span className="text-[9px] font-mono font-black uppercase tracking-wider mb-1 ml-1 text-gray-500 flex items-center space-x-1">
                    {isSenderInContacts ? (
                      <span className="text-emerald-700 font-extrabold flex items-center space-x-1">
                        <span>{senderContactName}</span>
                        <i className="fas fa-address-book text-[8px]"></i>
                      </span>
                    ) : (
                      <span>{sender?.serialCode || ('ORB-' + (sender?.id?.substring(0, 6).toUpperCase() || 'MEMBER'))}</span>
                    )}
                    {sender?.isVerified && <i className="fas fa-circle-check text-blue-500 text-[8px]"></i>}
                  </span>
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
      {/* WHATSAPP-STYLE CONTACT MODALS */}
      {renderContactModals()}
    </div>
  );
};

export default Chat;
