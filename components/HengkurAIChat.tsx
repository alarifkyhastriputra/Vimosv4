import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types.ts';
import { db } from '../firebase.ts';
import { ref, onValue, set } from 'firebase/database';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

interface HengkurAIChatProps {
  currentUser: User | null;
  onBack?: () => void;
  onBotNameChange?: (name: string) => void;
  onBotAvatarChange?: (avatar: string) => void;
}

const DEFAULT_BOT_NAME = 'vimos.ai';
const DEFAULT_BOT_BIO = 'Asisten Cerdas Resmi Vimos • Online 24/7';

export const AI_AVATAR_PRESETS = [
  {
    name: 'Cyber Core',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: 'Neon Matrix',
    url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: 'Emerald Tech',
    url: 'https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: '3D Android',
    url: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: 'Cosmic AI',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: 'Holo Persona',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  },
];

const HengkurAIChat: React.FC<HengkurAIChatProps> = ({ 
  currentUser, 
  onBack, 
  onBotNameChange,
  onBotAvatarChange 
}) => {
  const [botName, setBotName] = useState<string>(DEFAULT_BOT_NAME);
  const [botAvatar, setBotAvatar] = useState<string>('');
  const [botBio, setBotBio] = useState<string>(DEFAULT_BOT_BIO);

  // Admin Edit Profile States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [editAvatarInput, setEditAvatarInput] = useState('');
  const [editBioInput, setEditBioInput] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync bot name, avatar, and bio from Firebase RTDB in real-time
  useEffect(() => {
    const configRef = ref(db, 'appConfig');
    const unsubscribe = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        if (val) {
          const loadedName = (typeof val.aiBotName === 'string' && val.aiBotName.trim()) ? val.aiBotName.trim() : DEFAULT_BOT_NAME;
          const loadedAvatar = (typeof val.aiBotAvatar === 'string' && val.aiBotAvatar.trim()) ? val.aiBotAvatar.trim() : '';
          const loadedBio = (typeof val.aiBotBio === 'string' && val.aiBotBio.trim()) ? val.aiBotBio.trim() : DEFAULT_BOT_BIO;

          setBotName(loadedName);
          setBotAvatar(loadedAvatar);
          setBotBio(loadedBio);

          if (onBotNameChange) onBotNameChange(loadedName);
          if (onBotAvatarChange) onBotAvatarChange(loadedAvatar);
          return;
        }
      }
      setBotName(DEFAULT_BOT_NAME);
      setBotAvatar('');
      setBotBio(DEFAULT_BOT_BIO);
      if (onBotNameChange) onBotNameChange(DEFAULT_BOT_NAME);
      if (onBotAvatarChange) onBotAvatarChange('');
    });

    return () => unsubscribe();
  }, [onBotNameChange, onBotAvatarChange]);

  const storageKey = `vimos_ai_history_${currentUser?.id || 'guest'}`;

  const getWelcomeMessage = (name: string): Message => ({
    id: `welcome_${Date.now()}`,
    sender: 'ai',
    text: `Halo ${currentUser?.name ? currentUser.name : 'teman'}! 👋\n\nSaya **${name}**, asisten cerdas resmi di **Vimos** yang siap membantu kamu 24/7. \n\nKamu bisa tanya apapun ke saya: membuat caption viral, ide konten Reels & Live, rekomendasi musik, coding, naskah cerita, atau sekadar ngobrol seru. Silakan ketik pesan atau pilih topik di bawah ini! 🚀`,
    timestamp: Date.now(),
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return [getWelcomeMessage(DEFAULT_BOT_NAME)];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const openAdminEditModal = () => {
    setEditNameInput(botName);
    setEditAvatarInput(botAvatar);
    setEditBioInput(botBio);
    setIsEditingProfile(true);
    setIsMenuOpen(false);
  };

  // Image Upload Handler (downscales to compact data URL)
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar yang valid (JPG, PNG, WebP).');
      return;
    }

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setEditAvatarInput(compressedDataUrl);
        }
        setIsUploadingAvatar(false);
      };
      img.onerror = () => {
        setIsUploadingAvatar(false);
        alert('Gagal memproses gambar. Coba gambar lain.');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser?.isAdmin) return;

    const trimmedName = editNameInput.trim() || DEFAULT_BOT_NAME;
    const trimmedAvatar = editAvatarInput.trim();
    const trimmedBio = editBioInput.trim() || DEFAULT_BOT_BIO;

    setIsSavingProfile(true);
    try {
      await set(ref(db, 'appConfig/aiBotName'), trimmedName);
      await set(ref(db, 'appConfig/aiBotAvatar'), trimmedAvatar);
      await set(ref(db, 'appConfig/aiBotBio'), trimmedBio);

      setBotName(trimmedName);
      setBotAvatar(trimmedAvatar);
      setBotBio(trimmedBio);
      setIsEditingProfile(false);
    } catch (err) {
      console.error('Failed to update AI profile:', err);
      alert('Gagal menyimpan profil AI. Silakan coba lagi.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Build history for context
      const historyPayload = newMessages.slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: historyPayload,
          userName: currentUser?.name || 'User',
          botName: botName,
        }),
      });

      if (!res.ok) {
        throw new Error('Gagal menghubungi AI Server');
      }

      const data = await res.json();
      const aiReply = data.reply || 'Maaf, saya tidak dapat memproses jawaban saat ini.';

      const aiMessage: Message = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: aiReply,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      console.error(`Error sending message to ${botName}:`, err);
      const errorMessage: Message = {
        id: `err_${Date.now()}`,
        sender: 'ai',
        text: `Waduh, koneksi ke ${botName} sempat terputus sebentar. Silakan coba kirim ulang ya!`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const executeClearChat = () => {
    const resetMsg: Message[] = [
      {
        id: `welcome_${Date.now()}`,
        sender: 'ai',
        text: `Riwayat obrolan telah dibersihkan ✨\n\nHalo ${currentUser?.name || 'teman'}! Apa yang ingin kamu diskusikan dengan **${botName}** sekarang?`,
        timestamp: Date.now(),
      },
    ];
    setMessages(resetMsg);
    try {
      localStorage.setItem(storageKey, JSON.stringify(resetMsg));
    } catch {}
    setShowClearConfirmModal(false);
    setIsMenuOpen(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const copyAllChat = () => {
    const fullText = messages
      .map((m) => `[${m.sender === 'user' ? (currentUser?.name || 'User') : botName}]: ${m.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopyAllSuccess(true);
    setIsMenuOpen(false);
    setTimeout(() => setCopyAllSuccess(false), 2500);
  };

  const INITIAL_SUGGESTIONS = [
    { icon: '✨', label: 'Buatkan caption viral Vimos', prompt: 'Buatkan 3 pilihan caption estetik, keren, dan viral untuk postingan foto/video saya di Vimos!' },
    { icon: '🎬', label: 'Ide konten Reels & Live', prompt: 'Berikan 5 ide konten Reels atau Live streaming yang menarik dan bisa menarik banyak penonton di Vimos.' },
    { icon: '🎵', label: 'Rekomendasi musik & sound', prompt: 'Rekomendasikan beberapa lagu atau sound musik yang cocok untuk video pendek dengan suasana santai dan aesthetic.' },
    { icon: '💡', label: 'Tips tambah followers Vimos', prompt: 'Bagaimana tips terbaik untuk membangun personal branding dan menambah pengikut aktif di Vimos?' },
    { icon: '💬', label: `Ngobrol santai ${botName}`, prompt: `Halo ${botName}! Ceritain dong fakta menarik tentang teknologi atau dunia yang jarang orang tahu.` },
  ];

  // Helper formatting for bold, lists, and simple code snippets
  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split('\n');
    return lines.map((line, idx) => {
      // Bold rendering **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="font-black text-black">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start space-x-2 my-1 pl-1">
            <span className="text-black font-bold text-xs mt-1">•</span>
            <span className="flex-1">{renderedParts.slice(1)}</span>
          </div>
        );
      }

      if (/^\d+\.\s/.test(line)) {
        return (
          <div key={idx} className="my-1 pl-1 font-medium">
            {renderedParts}
          </div>
        );
      }

      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="my-1 leading-relaxed">
          {renderedParts}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-white relative animate-fade-in">
      {/* Top AI Header */}
      <div className="px-4 py-3 border-b border-black/10 bg-white/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-100 transition-colors text-black shrink-0"
              title="Kembali"
            >
              <i className="fas fa-arrow-left text-sm"></i>
            </button>
          )}

          {/* AI Avatar with Admin Quick Edit Badge */}
          <div 
            onClick={() => {
              if (currentUser?.isAdmin) openAdminEditModal();
            }}
            className={`relative shrink-0 ${currentUser?.isAdmin ? 'cursor-pointer group' : ''}`}
            title={currentUser?.isAdmin ? 'Klik untuk ganti Foto & Profil AI (Admin)' : botName}
          >
            {botAvatar ? (
              <img
                src={botAvatar}
                alt={botName}
                className="w-10 h-10 rounded-2xl object-cover shadow-md ring-2 ring-emerald-400/60 transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shadow-md ring-2 ring-neutral-200 transition-transform group-hover:scale-105">
                <i className="fas fa-robot text-lg text-emerald-400 animate-pulse"></i>
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
            
            {currentUser?.isAdmin && (
              <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <i className="fas fa-camera text-white text-xs"></i>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h2 className="text-sm font-black uppercase tracking-tight text-neutral-900 flex items-center space-x-1 truncate">
                <span className="truncate">{botName}</span>
                {currentUser?.isAdmin && (
                  <button
                    onClick={openAdminEditModal}
                    className="ml-1 text-[11px] text-neutral-400 hover:text-black p-0.5 transition-colors shrink-0"
                    title="Ganti Profil & Foto AI (Khusus Admin)"
                  >
                    <i className="fas fa-pen-to-square"></i>
                  </button>
                )}
              </h2>
              <span className="bg-black text-white text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center space-x-1 shrink-0">
                <i className="fas fa-sparkles text-[8px] text-yellow-300"></i>
                <span>OFFICIAL</span>
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 font-bold flex items-center space-x-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="truncate">{botBio}</span>
            </p>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center space-x-1 relative shrink-0" ref={menuRef}>
          {/* Quick Clear Chat Button */}
          <button
            onClick={() => setShowClearConfirmModal(true)}
            className="px-2.5 py-1.5 text-neutral-600 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border border-transparent hover:border-red-200"
            title="Clear Chat / Bersihkan Percakapan"
          >
            <i className="fas fa-trash-can text-xs text-red-500"></i>
            <span className="text-[11px] font-bold hidden sm:inline">Clear Chat</span>
          </button>

          {/* More Actions Dropdown Menu Button */}
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-neutral-100 text-neutral-700 transition-colors"
            title="Menu Opsi Chat"
          >
            <i className="fas fa-ellipsis-vertical text-sm"></i>
          </button>

          {/* Menu Dropdown Popup */}
          {isMenuOpen && (
            <div className="absolute right-0 top-10 w-60 bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-2 z-50 animate-scale-up space-y-1">
              <button
                onClick={() => {
                  setShowClearConfirmModal(true);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
              >
                <i className="fas fa-trash-can text-sm w-4"></i>
                <span>Bersihkan Riwayat Chat</span>
              </button>

              <button
                onClick={copyAllChat}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold text-neutral-800 hover:bg-neutral-100 rounded-xl transition-colors text-left"
              >
                <i className="fas fa-copy text-sm w-4 text-neutral-500"></i>
                <span>Salin Seluruh Chat</span>
              </button>

              {currentUser?.isAdmin && (
                <>
                  <div className="my-1 border-t border-neutral-100"></div>
                  <button
                    onClick={openAdminEditModal}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-black text-neutral-900 bg-neutral-100 hover:bg-black hover:text-white rounded-xl transition-all text-left"
                  >
                    <i className="fas fa-user-gear text-sm w-4 text-emerald-500"></i>
                    <span>Ganti Profil & Foto AI (Admin)</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Copy All Toast Notification */}
      {copyAllSuccess && (
        <div className="bg-neutral-900 text-white text-xs font-bold px-4 py-2 text-center transition-all animate-fade-in flex items-center justify-center space-x-2">
          <i className="fas fa-check-circle text-emerald-400"></i>
          <span>Seluruh percakapan berhasil disalin ke clipboard!</span>
        </div>
      )}

      {/* Chat Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/50">
        {/* Suggestion Chips Banner */}
        {messages.length <= 2 && (
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2 px-1">
              💡 Topik Cepat & Pertanyaan Populer
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {INITIAL_SUGGESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(item.prompt)}
                  className="text-left p-2.5 bg-white hover:bg-neutral-100/80 border border-black/10 rounded-2xl transition-all group flex items-start space-x-2.5 shadow-xs hover:border-black/30 active:scale-98"
                >
                  <span className="text-base shrink-0">{item.icon}</span>
                  <div className="min-w-0">
                    <p className="font-black text-xs text-neutral-900 group-hover:text-black">{item.label}</p>
                    <p className="text-[10px] text-neutral-500 truncate mt-0.5">{item.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group animate-fade-in`}
            >
              <div className="flex items-end space-x-2 max-w-[90%] sm:max-w-[80%]">
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl overflow-hidden shrink-0 mb-1 shadow-xs ring-1 ring-neutral-300 flex items-center justify-center bg-black text-white">
                    {botAvatar ? (
                      <img src={botAvatar} alt={botName} className="w-full h-full object-cover" />
                    ) : (
                      <i className="fas fa-robot text-xs text-emerald-400"></i>
                    )}
                  </div>
                )}

                <div
                  className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm font-normal shadow-xs transition-all relative ${
                    isUser
                      ? 'bg-neutral-900 text-white rounded-br-xs'
                      : 'bg-white border border-neutral-200 text-neutral-900 rounded-bl-xs'
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed font-medium">{m.text}</p>
                  ) : (
                    <div className="text-neutral-800 space-y-1">
                      {renderFormattedText(m.text)}
                    </div>
                  )}

                  {/* Message Action Bar for AI */}
                  {!isUser && (
                    <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
                      <span className="font-bold">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => copyToClipboard(m.text, m.id)}
                          className="hover:text-black font-bold flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-neutral-100 transition-colors"
                          title="Salin Pesan"
                        >
                          <i className={`fas ${copiedMsgId === m.id ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                          <span>{copiedMsgId === m.id ? 'Tersalin' : 'Salin'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isUser && currentUser?.photoURL && (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="w-7 h-7 rounded-full object-cover shrink-0 mb-1 border border-neutral-200"
                  />
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center space-x-2 animate-fade-in">
            <div className="w-7 h-7 rounded-xl overflow-hidden shrink-0 shadow-xs flex items-center justify-center bg-black text-white">
              {botAvatar ? (
                <img src={botAvatar} alt={botName} className="w-full h-full object-cover animate-pulse" />
              ) : (
                <i className="fas fa-robot text-xs text-emerald-400 animate-spin"></i>
              )}
            </div>
            <div className="bg-white border border-neutral-200 px-4 py-3 rounded-2xl rounded-bl-xs shadow-xs flex items-center space-x-2">
              <div className="flex space-x-1">
                <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-neutral-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 bg-neutral-900 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
              <span className="text-xs font-bold text-neutral-500">{botName} sedang mengetik...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Prompt suggestions pills along bottom */}
      <div className="px-3 py-1.5 bg-neutral-100/80 border-t border-neutral-200 flex items-center space-x-2 overflow-x-auto scrollbar-none">
        <span className="text-[9px] font-black uppercase text-neutral-500 shrink-0">Coba:</span>
        <button
          onClick={() => handleSendMessage('Buatkan caption singkat yang aesthetic buat foto sunset')}
          className="bg-white hover:bg-neutral-200 text-neutral-800 border border-neutral-300 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
        >
          🌅 Caption Sunset
        </button>
        <button
          onClick={() => handleSendMessage('Rekomendasikan 3 ide postingan yang bisa trending di Vimos')}
          className="bg-white hover:bg-neutral-200 text-neutral-800 border border-neutral-300 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
        >
          🚀 Ide Postingan Viral
        </button>
        <button
          onClick={() => handleSendMessage('Bikinin puisi singkat tentang malam dan rindu')}
          className="bg-white hover:bg-neutral-200 text-neutral-800 border border-neutral-300 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
        >
          ✍️ Puisi Malam
        </button>
        <button
          onClick={() => handleSendMessage('Tebak-tebakan lucu dong buat seru-seruan!')}
          className="bg-white hover:bg-neutral-200 text-neutral-800 border border-neutral-300 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
        >
          😂 Tebak-tebakan
        </button>
      </div>

      {/* Input Message Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 bg-white border-t border-neutral-200 flex items-center space-x-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Tanya apapun ke ${botName}...`}
          className="flex-1 bg-neutral-100 border border-neutral-300 focus:border-black focus:bg-white text-neutral-900 rounded-2xl px-4 py-3 text-xs sm:text-sm font-medium focus:outline-none transition-all placeholder:text-neutral-400 shadow-inner"
        />

        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="h-11 px-4 bg-black hover:bg-neutral-800 text-white rounded-2xl flex items-center justify-center space-x-1.5 transition-all shadow-md disabled:opacity-30 disabled:hover:bg-black active:scale-95 shrink-0"
          title={`Kirim ke ${botName}`}
        >
          <span className="text-xs font-black uppercase tracking-wider hidden sm:inline">Kirim</span>
          <i className="fas fa-paper-plane text-xs"></i>
        </button>
      </form>

      {/* Clear Chat Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border-3 border-black w-full max-w-sm rounded-3xl p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <i className="fas fa-trash-can text-lg"></i>
              </div>
              <div>
                <h3 className="font-black text-base uppercase text-neutral-900">Bersihkan Chat?</h3>
                <p className="text-xs text-neutral-500 font-medium">Semua riwayat percakapan dengan {botName} akan dihapus.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 bg-neutral-50 p-3 rounded-2xl border border-neutral-200">
              Tindakan ini akan mengosongkan percakapan di perangkat ini dan mengatur ulang sesi chat dengan {botName}.
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs uppercase hover:bg-neutral-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeClearChat}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase shadow-md transition-colors"
              >
                Ya, Bersihkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Edit AI Profile Modal */}
      {isEditingProfile && currentUser?.isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border-3 border-black w-full max-w-md rounded-3xl p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <i className="fas fa-robot text-lg"></i>
                </div>
                <div>
                  <h3 className="font-black text-base uppercase text-neutral-900">Ubah Profil AI</h3>
                  <p className="text-[11px] text-neutral-500 font-bold">Pengaturan Khusus Admin Vimos</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="w-8 h-8 rounded-full hover:bg-neutral-100 text-neutral-500 flex items-center justify-center text-sm"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Preview & Controls */}
              <div className="p-4 bg-neutral-50 border-2 border-neutral-200 rounded-2xl space-y-3">
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-700 block">
                  Foto Profil / Avatar AI
                </label>

                <div className="flex items-center space-x-4">
                  <div className="relative">
                    {editAvatarInput ? (
                      <img
                        src={editAvatarInput}
                        alt="Preview"
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-black shadow-sm"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-black text-white flex items-center justify-center border-2 border-black shadow-sm">
                        <i className="fas fa-robot text-2xl text-emerald-400"></i>
                      </div>
                    )}
                    {editAvatarInput && (
                      <button
                        type="button"
                        onClick={() => setEditAvatarInput('')}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-700 shadow-sm"
                        title="Hapus foto / Gunakan ikon default"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="w-full py-2 px-3 bg-white border-2 border-black hover:bg-neutral-100 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all active:scale-98 shadow-xs"
                    >
                      <i className={`fas ${isUploadingAvatar ? 'fa-spinner fa-spin' : 'fa-arrow-up-from-bracket'}`}></i>
                      <span>{isUploadingAvatar ? 'Memproses...' : 'Upload dari Perangkat'}</span>
                    </button>
                    <p className="text-[9px] text-neutral-400 font-bold">
                      Format didukung: PNG, JPG, WebP. Otomatis dioptimasi.
                    </p>
                  </div>
                </div>

                {/* Preset Avatars */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-2">
                    Pilih Dari Preset Avatar Keren:
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {AI_AVATAR_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditAvatarInput(preset.url)}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all group hover:scale-105 ${
                          editAvatarInput === preset.url ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-neutral-300'
                        }`}
                        title={preset.name}
                      >
                        <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white font-bold transition-opacity">
                          Pilih
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Or Custom URL */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-wider text-neutral-500 block mb-1">
                    Atau Masukkan URL Gambar:
                  </label>
                  <input
                    type="url"
                    value={editAvatarInput}
                    onChange={(e) => setEditAvatarInput(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              {/* Bot Name Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-700 block">
                  Nama Bot AI
                </label>
                <input
                  type="text"
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  placeholder="Contoh: vimos.ai"
                  className="w-full bg-neutral-50 border-2 border-black rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:bg-white"
                  required
                />
              </div>

              {/* Bot Bio / Tagline Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-700 block">
                  Bio / Status Tagline
                </label>
                <input
                  type="text"
                  value={editBioInput}
                  onChange={(e) => setEditBioInput(e.target.value)}
                  placeholder="Contoh: Asisten Cerdas Resmi Vimos • Online 24/7"
                  className="w-full bg-neutral-50 border-2 border-black rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:bg-white"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex space-x-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="flex-1 py-2.5 border-2 border-black rounded-xl font-black text-xs uppercase hover:bg-neutral-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile || !editNameInput.trim()}
                  className="flex-1 py-2.5 bg-black hover:bg-neutral-800 text-white rounded-xl font-black text-xs uppercase shadow-md transition-all disabled:opacity-40 flex items-center justify-center space-x-1.5"
                >
                  <i className={`fas ${isSavingProfile ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                  <span>{isSavingProfile ? 'Menyimpan...' : 'Simpan Profil'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HengkurAIChat;
