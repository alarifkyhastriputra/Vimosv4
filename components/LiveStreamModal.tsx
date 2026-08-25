import React, { useState, useEffect, useRef } from 'react';
import { User, LiveStream, LiveChatMessage, LiveReaction } from '../types.ts';
import { useLanguage } from '../LanguageContext.tsx';
import { db } from '../firebase.ts';
import { ref, onValue, set, push, update, remove, onDisconnect } from 'firebase/database';

interface LiveStreamModalProps {
  currentUser: User;
  users: User[];
  activeStreamId: string | null;
  initialMode?: 'create' | 'watch' | 'browse';
  onClose: () => void;
  onFollow?: (userId: string) => void;
}

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export const LiveStreamModal: React.FC<LiveStreamModalProps> = ({
  currentUser,
  users,
  activeStreamId,
  initialMode = 'browse',
  onClose,
  onFollow
}) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'browse' | 'create' | 'watch'>(
    activeStreamId ? 'watch' : initialMode
  );

  const [streamId, setStreamId] = useState<string | null>(activeStreamId);
  const [activeStreams, setActiveStreams] = useState<LiveStream[]>(() => {
    try {
      const stored = localStorage.getItem('vimos_active_streams');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [liveStream, setLiveStream] = useState<LiveStream | null>(() => {
    if (activeStreamId) {
      try {
        const stored = localStorage.getItem('vimos_active_streams');
        const list = stored ? JSON.parse(stored) : [];
        return list.find((s: LiveStream) => s.id === activeStreamId) || null;
      } catch { return null; }
    }
    return null;
  });

  // Setup form states
  const [streamTitle, setStreamTitle] = useState('');
  const [streamType, setStreamType] = useState<'camera' | 'screen'>('camera');
  const [isStarting, setIsStarting] = useState(false);

  // Broadcaster & Viewer States
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [viewerCount, setViewerCount] = useState(1);
  const [likesCount, setLikesCount] = useState(0);
  const [showLiveLeaderboard, setShowLiveLeaderboard] = useState(false);
  const [isPureVideoOnly, setIsPureVideoOnly] = useState(false);

  // Chat & Reactions
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [reactions, setReactions] = useState<{ id: string; type: string; left: number }[]>([]);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const viewerPeerConnection = useRef<RTCPeerConnection | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const isHost = liveStream ? liveStream.hostId === currentUser.id : false;

  // Listen to list of all active live streams for 'browse' mode or top bar
  useEffect(() => {
    const streamsRef = ref(db, 'livestreams');
    const unsubscribe = onValue(streamsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: LiveStream[] = Object.entries(data)
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .filter((item) => item.status === 'live');
        setActiveStreams(list);
      } else {
        setActiveStreams([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to specific active stream data when watching or hosting
  useEffect(() => {
    if (!streamId) return;

    const streamRef = ref(db, `livestreams/${streamId}`);
    const unsubscribe = onValue(streamRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLiveStream({ id: streamId, ...data });
        setViewerCount(data.viewers ? Object.keys(data.viewers).length : 1);
        setLikesCount(data.likesCount || 0);

        if (data.status === 'ended') {
          // Stream ended by host
          setTimeout(() => {
            handleClose();
          }, 2000);
        }
      } else {
        setLiveStream(null);
      }
    });

    // Chat messages listener
    const chatRef = ref(db, `livestreams/${streamId}/chat`);
    const unsubscribeChat = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgs = Object.entries(data).map(([cid, val]: [string, any]) => ({
          id: cid,
          ...val
        }));
        setChatMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setChatMessages([]);
      }
    });

    // Reactions listener
    const reactionsRef = ref(db, `livestreams/${streamId}/reactions`);
    const unsubscribeReactions = onValue(reactionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const latest = Object.entries(data).slice(-10);
        setReactions((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newItems: { id: string; type: string; left: number }[] = [];
          latest.forEach(([rid, val]: [string, any]) => {
            if (!existingIds.has(rid)) {
              const leftPos = Math.floor(Math.random() * 60) + 20; // 20% to 80%
              newItems.push({ id: rid, type: val.type, left: leftPos });
              setTimeout(() => {
                setReactions((current) => current.filter((r) => r.id !== rid));
              }, 2500);
            }
          });
          return newItems.length > 0 ? [...prev, ...newItems] : prev;
        });
      }
    });

    return () => {
      unsubscribe();
      unsubscribeChat();
      unsubscribeReactions();
    };
  }, [streamId]);

  // Auto scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Bind remote stream to remoteVideoRef as soon as video element is available
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((err) => {
        console.warn("Remote video playback error:", err);
      });
    }
  }, [remoteStream, mode]);

  // Bind local stream to localVideoRef as soon as video element is available
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch((err) => {
        console.warn("Local video playback error:", err);
      });
    }
  }, [localStream, mode]);

  // Helper: check if getDisplayMedia is supported on current browser/device
  const isScreenShareSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices !== 'undefined' && typeof navigator.mediaDevices.getDisplayMedia === 'function';

  // Helper: safely request screen capture stream with fallback to video-only if audio fails
  const getSafeScreenStream = async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      throw new Error("Screen share (getDisplayMedia) is not supported on this device or browser.");
    }
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err: any) {
      if (err?.name === 'NotSupportedError' || err?.name === 'TypeError' || err?.message?.includes('audio')) {
        return await navigator.mediaDevices.getDisplayMedia({ video: true });
      }
      throw err;
    }
  };

  // Helper: create animated canvas stream fallback if camera and screen share fail or are blocked
  const createFallbackCanvasStream = (title: string, hostName: string): MediaStream => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    let angle = 0;
    const draw = () => {
      if (!ctx) return;
      angle += 0.02;

      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#09090b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      const cx = 640 + Math.cos(angle) * 100;
      const cy = 360 + Math.sin(angle) * 50;
      const radial = ctx.createRadialGradient(cx, cy, 10, cx, cy, 300);
      radial.addColorStop(0, 'rgba(220, 38, 38, 0.4)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(cx, cy, 300, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title || 'VIMOS LIVE', 640, 330);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`HOST: ${(hostName || 'VIMOS').toUpperCase()}`, 640, 390);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '16px sans-serif';
      ctx.fillText('• LIVE STREAM BROADCAST •', 640, 430);

      requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : new MediaStream();

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        const gain = audioCtx.createGain();
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(dst);
        osc.start();
        dst.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
      }
    } catch (e) {
      console.warn("Could not attach fallback audio:", e);
    }

    return canvasStream;
  };

  // Handle START LIVE STREAM (as HOST)
  const handleStartStream = async () => {
    if (!streamTitle.trim()) return;
    setIsStarting(true);

    try {
      let stream: MediaStream | null = null;
      let actualStreamType = streamType;

      if (streamType === 'screen') {
        if (isScreenShareSupported) {
          try {
            const screenStream = await getSafeScreenStream();
            try {
              if (navigator.mediaDevices?.getUserMedia) {
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micStream.getAudioTracks().forEach((track) => screenStream.addTrack(track));
              }
            } catch (e) {
              console.warn("Microphone not added to screen share:", e);
            }
            stream = screenStream;
          } catch (screenErr: any) {
            console.warn("Screen share failed or cancelled, falling back to camera:", screenErr);
            actualStreamType = 'camera';
          }
        } else {
          console.warn("getDisplayMedia not supported, falling back to camera.");
          actualStreamType = 'camera';
        }
      }

      // Try Camera if not acquired or if screen share fell back
      if (!stream) {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: true
            });
          } catch (camErr) {
            console.warn("Camera with audio failed, trying video only:", camErr);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (camVideoOnlyErr) {
              console.warn("Camera failed, using animated canvas stream:", camVideoOnlyErr);
            }
          }
        }
      }

      // Ultimate fallback: animated studio stream
      if (!stream) {
        stream = createFallbackCanvasStream(streamTitle, currentUser.name);
      }

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (stream.getVideoTracks().length > 0) {
        stream.getVideoTracks()[0].onended = () => {
          handleEndStream();
        };
      }

      // Create new livestream entry in Firebase
      const newStreamRef = push(ref(db, 'livestreams'));
      const newStreamId = newStreamRef.key;

      if (!newStreamId) throw new Error("Could not create stream key");

      const accountDisplayName = (currentUser.name && currentUser.name !== 'Anonymous Shadow' && currentUser.name !== 'Anonymous Orbit' && currentUser.name !== 'Anonymous')
        ? currentUser.name
        : (currentUser.email ? currentUser.email.split('@')[0] : 'Akun Saya');

      const streamData = {
        hostId: currentUser.id,
        hostName: accountDisplayName,
        hostPhoto: currentUser.photoURL,
        title: streamTitle.trim(),
        streamType: actualStreamType,
        status: 'live',
        startedAt: Date.now(),
        likesCount: 0,
        viewers: {
          [currentUser.id]: true
        }
      };

      await set(newStreamRef, streamData);

      onDisconnect(ref(db, `livestreams/${newStreamId}/status`)).set('ended');

      setStreamId(newStreamId);
      setStreamType(actualStreamType);
      setMode('watch');
    } catch (err: any) {
      console.error("Error starting live stream:", err);
      alert("Gagal memulai siaran live. " + (err?.message || ""));
    } finally {
      setIsStarting(false);
    }
  };

  // Switch between Camera and Screen Share during Live Stream
  const handleSwitchStreamSource = async (targetType: 'camera' | 'screen') => {
    if (!streamId || !isHost) return;

    try {
      let newStream: MediaStream | null = null;
      if (targetType === 'screen') {
        if (isScreenShareSupported) {
          try {
            newStream = await getSafeScreenStream();
            try {
              if (navigator.mediaDevices?.getUserMedia) {
                const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
                mic.getAudioTracks().forEach((track) => newStream!.addTrack(track));
              }
            } catch (e) {}
          } catch (e) {
            alert("Berbagi layar tidak dapat diaktifkan atau dibatalkan.");
            return;
          }
        } else {
          alert("Berbagi layar (getDisplayMedia) tidak didukung oleh browser/perangkat Anda.");
          return;
        }
      } else {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          } catch (e) {
            newStream = createFallbackCanvasStream(liveStream?.title || 'Vimos Live', currentUser.name);
          }
        } else {
          newStream = createFallbackCanvasStream(liveStream?.title || 'Vimos Live', currentUser.name);
        }
      }

      if (!newStream) return;

      const oldVideoTrack = localStream?.getVideoTracks()[0];
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (oldVideoTrack) oldVideoTrack.stop();

      if (localStream) {
        if (oldVideoTrack) localStream.removeTrack(oldVideoTrack);
        if (newVideoTrack) localStream.addTrack(newVideoTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      (Object.values(peerConnections.current) as RTCPeerConnection[]).forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');
        if (videoSender && newVideoTrack) {
          videoSender.replaceTrack(newVideoTrack);
        }
      });

      await update(ref(db, `livestreams/${streamId}`), {
        streamType: targetType
      });

      setStreamType(targetType);
      setLocalStream(newStream);
    } catch (err) {
      console.error("Error switching stream source:", err);
    }
  };

  // HOST WEBRTC SIGNALING: Listen for joining viewers
  useEffect(() => {
    if (!streamId || !isHost || !localStream) return;

    const viewersRef = ref(db, `livestreams/${streamId}/viewers`);

    const unsubscribeViewers = onValue(viewersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      Object.keys(data).forEach(async (viewerId) => {
        if (viewerId === currentUser.id) return; // Skip self

        // If peer connection not initialized for this viewer, create it
        if (!peerConnections.current[viewerId]) {
          const pc = new RTCPeerConnection(iceServers);
          peerConnections.current[viewerId] = pc;

          // Add tracks
          localStream.getTracks().forEach((track) => {
            pc.addTrack(track, localStream);
          });

          // Handle local ICE candidates
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              const candidateRef = push(
                ref(db, `livestreams/${streamId}/signals/${viewerId}/hostCandidates`)
              );
              set(candidateRef, event.candidate.toJSON());
            }
          };

          // Create Offer
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await set(ref(db, `livestreams/${streamId}/signals/${viewerId}/offer`), {
              type: offer.type,
              sdp: offer.sdp
            });
          } catch (e) {
            console.error(`Error creating offer for viewer ${viewerId}:`, e);
          }

          // Listen for Answer from Viewer
          const answerRef = ref(db, `livestreams/${streamId}/signals/${viewerId}/answer`);
          onValue(answerRef, (answerSnap) => {
            const answer = answerSnap.val();
            if (answer && pc.signalingState !== 'stable') {
              pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
            }
          });

          // Listen for Viewer ICE candidates
          const viewerCandidatesRef = ref(
            db,
            `livestreams/${streamId}/signals/${viewerId}/viewerCandidates`
          );
          onValue(viewerCandidatesRef, (candidatesSnap) => {
            const candidates = candidatesSnap.val();
            if (candidates) {
              Object.values(candidates).forEach((cData: any) => {
                pc.addIceCandidate(new RTCIceCandidate(cData)).catch(() => {});
              });
            }
          });
        }
      });
    });

    return () => {
      unsubscribeViewers();
    };
  }, [streamId, isHost, localStream, currentUser.id]);

  // VIEWER WEBRTC SIGNALING: Connect to Host
  useEffect(() => {
    if (!streamId || isHost) return;

    // Register presence in viewers node
    const viewerPresenceRef = ref(db, `livestreams/${streamId}/viewers/${currentUser.id}`);
    set(viewerPresenceRef, true);
    onDisconnect(viewerPresenceRef).remove();

    // Instant zero-delay stream video for instant loading
    const instantFallback = createFallbackCanvasStream(
      liveStream?.title || 'VIMOS LIVE',
      liveStream?.hostName || 'HOST'
    );
    setRemoteStream(instantFallback);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = instantFallback;
      remoteVideoRef.current.play().catch(() => {});
    }

    const pc = new RTCPeerConnection(iceServers);
    viewerPeerConnection.current = pc;

    // Receive incoming host stream
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateRef = push(
          ref(db, `livestreams/${streamId}/signals/${currentUser.id}/viewerCandidates`)
        );
        set(candidateRef, event.candidate.toJSON());
      }
    };

    // Listen for Offer from Host
    const offerRef = ref(db, `livestreams/${streamId}/signals/${currentUser.id}/offer`);
    const unsubscribeOffer = onValue(offerRef, async (snapshot) => {
      const offer = snapshot.val();
      if (offer && pc.signalingState !== 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await set(ref(db, `livestreams/${streamId}/signals/${currentUser.id}/answer`), {
            type: answer.type,
            sdp: answer.sdp
          });
        } catch (e) {
          console.error("Error creating answer for host offer:", e);
        }
      }
    });

    // Listen for Host ICE candidates
    const hostCandidatesRef = ref(
      db,
      `livestreams/${streamId}/signals/${currentUser.id}/hostCandidates`
    );
    const unsubscribeCandidates = onValue(hostCandidatesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        Object.values(data).forEach((cData: any) => {
          pc.addIceCandidate(new RTCIceCandidate(cData)).catch(() => {});
        });
      }
    });

    return () => {
      unsubscribeOffer();
      unsubscribeCandidates();
      remove(viewerPresenceRef);
      pc.close();
      viewerPeerConnection.current = null;
    };
  }, [streamId, isHost, currentUser.id]);

  // Toggle Mute mic
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
    }
    setIsMuted(!isMuted);
  };

  // Toggle Video / Camera Off
  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
    }
    setIsCameraOff(!isCameraOff);
  };

  // Send Chat Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageText.trim() || !streamId) return;

    const accountDisplayName = (currentUser.name && currentUser.name !== 'Anonymous Shadow' && currentUser.name !== 'Anonymous Orbit' && currentUser.name !== 'Anonymous')
      ? currentUser.name
      : (currentUser.email ? currentUser.email.split('@')[0] : 'Akun Saya');

    const chatRef = push(ref(db, `livestreams/${streamId}/chat`));
    await set(chatRef, {
      userId: currentUser.id,
      userName: accountDisplayName,
      userPhoto: currentUser.photoURL,
      text: messageText.trim(),
      timestamp: Date.now(),
      isHost: isHost
    });

    setMessageText('');
  };

  // Send Reaction (Heart, Fire, Clap, Star)
  const handleSendReaction = async (type: 'heart' | 'fire' | 'clap' | 'star') => {
    if (!streamId) return;

    const reactionRef = push(ref(db, `livestreams/${streamId}/reactions`));
    await set(reactionRef, {
      type,
      timestamp: Date.now()
    });

    // Increment stream likes count
    update(ref(db, `livestreams/${streamId}`), {
      likesCount: (likesCount || 0) + 1
    });
  };

  // END LIVE STREAM (as HOST)
  const handleEndStream = async () => {
    if (streamId && isHost) {
      await update(ref(db, `livestreams/${streamId}`), {
        status: 'ended',
        endedAt: Date.now()
      });
    }

    cleanupMedia();
    onClose();
  };

  // Close / Exit Modal
  const handleClose = () => {
    cleanupMedia();
    onClose();
  };

  const cleanupMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    (Object.values(peerConnections.current) as RTCPeerConnection[]).forEach((pc) => pc.close());
    peerConnections.current = {};
    if (viewerPeerConnection.current) {
      viewerPeerConnection.current.close();
      viewerPeerConnection.current = null;
    }
  };

  const hostUser = users.find((u) => u.id === liveStream?.hostId);
  const isFollowingHost = hostUser?.followers?.includes(currentUser.id);

  return (
    <div className="fixed inset-0 z-[999] bg-black/95 text-white flex flex-col justify-between animate-fade-in select-none">
      
      {/* 1. BROWSE ACTIVE STREAMS MODE */}
      {mode === 'browse' && (
        <div className="flex-1 flex flex-col p-6 max-w-xl mx-auto w-full overflow-y-auto">
          {/* Top Bar */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
              <h2 className="text-xl font-black uppercase tracking-wider">{t('active_live_streams')}</h2>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all"
            >
              <i className="fas fa-xmark text-lg"></i>
            </button>
          </div>

          {/* Go Live Button CTA */}
          <button
            onClick={() => setMode('create')}
            className="w-full bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center space-x-3 shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-98 transition-all mb-8"
          >
            <i className="fas fa-tower-broadcast text-lg animate-pulse"></i>
            <span>{t('go_live')} (Video / Layar)</span>
          </button>

          {/* Active Live List */}
          {activeStreams.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-zinc-500 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center text-3xl border border-white/5">
                <i className="fas fa-video-slash"></i>
              </div>
              <p className="font-bold text-sm">{t('no_live_streams')}</p>
              <p className="text-xs text-zinc-600 max-w-xs">
                Jadilah orang pertama yang melakukan siaran live streaming kamera atau layar!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activeStreams.map((stream, idx) => (
                <div
                  key={`stream-${stream.id}-${idx}`}
                  onClick={() => {
                    setStreamId(stream.id);
                    setMode('watch');
                  }}
                  className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-red-500/50 hover:bg-zinc-800/80 transition-all group shadow-xl"
                >
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-red-500 to-rose-500 animate-spin opacity-75"></div>
                      <img
                        src={
                          stream.hostPhoto ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${stream.hostName}`
                        }
                        className="w-12 h-12 rounded-full object-cover relative z-10 border-2 border-black"
                        alt={stream.hostName}
                      />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full border border-black z-20">
                        LIVE
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-black text-sm group-hover:text-red-400 transition-colors">
                        {stream.title}
                      </h3>
                      <div className="flex items-center space-x-2 text-xs text-zinc-400 font-medium">
                        <span>{stream.hostName}</span>
                        <span>•</span>
                        <span className="flex items-center text-red-400 font-bold">
                          <i className={`fas ${stream.streamType === 'screen' ? 'fa-desktop' : 'fa-video'} mr-1 text-[10px]`}></i>
                          {stream.streamType === 'screen' ? 'Layar' : 'Kamera'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-full text-red-400 text-xs font-bold">
                    <i className="fas fa-eye text-[10px]"></i>
                    <span>{stream.viewers ? Object.keys(stream.viewers).length : 1}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. CREATE LIVE STREAM SETUP MODE */}
      {mode === 'create' && (
        <div className="flex-1 flex flex-col p-6 max-w-xl mx-auto w-full justify-center">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl relative">
            <button
              onClick={() => setMode('browse')}
              className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all"
            >
              <i className="fas fa-xmark text-sm"></i>
            </button>

            <div className="space-y-2 text-center">
              <span className="bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-red-500/20">
                Studio Broadcaster
              </span>
              <h2 className="text-2xl font-black uppercase tracking-tight">Mulai Live Streaming</h2>
              <p className="text-xs text-zinc-400">
                Pilih jenis siaran Anda dan bagikan secara langsung kepada followers Vimos.
              </p>
            </div>

            {/* Input Title */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Judul Siaran Live
              </label>
              <input
                type="text"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder={t('stream_title_placeholder')}
                className="w-full bg-black/60 border border-white/10 rounded-xl p-3.5 text-sm focus:outline-none focus:border-red-500 text-white font-medium"
              />
            </div>

            {/* Choose Type: Video Camera vs Screen Share */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Pilih Tipe Siaran
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStreamType('camera')}
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center space-y-2 transition-all ${
                    streamType === 'camera'
                      ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-500/10'
                      : 'bg-black/40 border-white/10 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <i className="fas fa-video text-2xl mb-1"></i>
                  <span className="text-xs font-black uppercase">Live Kamera</span>
                  <span className="text-[9px] text-zinc-500">Wajah & Suara Mikrofon</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStreamType('screen')}
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center space-y-2 transition-all ${
                    streamType === 'screen'
                      ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-500/10'
                      : 'bg-black/40 border-white/10 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <i className="fas fa-desktop text-2xl mb-1"></i>
                  <span className="text-xs font-black uppercase">Live Layar</span>
                  <span className="text-[9px] text-zinc-500 text-center">
                    {isScreenShareSupported ? 'Share Screen / Game / App' : 'Share Screen (Auto Fallback Camera)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Launch Button */}
            <button
              onClick={handleStartStream}
              disabled={isStarting || !streamTitle.trim()}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black uppercase tracking-widest text-sm p-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              {isStarting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Mempersiapkan Media...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-play"></i>
                  <span>{t('start_stream')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. WATCH / HOST ACTIVE LIVE STREAM VIEW */}
      {mode === 'watch' && (
        <div className="relative w-full h-full flex flex-col justify-between overflow-hidden">
          
          {/* Main Video Stream Container */}
          <div className="absolute inset-0 w-full h-full bg-zinc-950 flex items-center justify-center">
            {isHost ? (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-contain ${streamType === 'camera' ? 'scale-x-[-1]' : ''} ${
                    localStream && !isCameraOff ? 'block' : 'hidden'
                  }`}
                />
                {(!localStream || isCameraOff) && (
                  <div className="flex flex-col items-center justify-center space-y-3 text-zinc-500">
                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-2xl">
                      <i className={`fas ${streamType === 'screen' ? 'fa-desktop' : 'fa-video-slash'}`}></i>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {isCameraOff ? 'Kamera Dimatikan' : 'Siaran Layar Aktif'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-contain ${remoteStream ? 'block' : 'hidden'}`}
                />
                {!remoteStream && (
                  <div className="flex flex-col items-center justify-center space-y-4 text-center px-6">
                    <div className="w-20 h-20 rounded-full border-4 border-red-500/30 p-1 bg-zinc-900 relative">
                      <div className="absolute -inset-2 rounded-full bg-red-500/20 animate-ping"></div>
                      <img
                        src={
                          liveStream?.hostPhoto ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${liveStream?.hostName || 'host'}`
                        }
                        className="w-full h-full rounded-full object-cover"
                        alt={liveStream?.hostName}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="font-black text-lg">{liveStream?.title || 'Live Stream'}</p>
                      <p className="text-xs text-red-400 font-bold uppercase tracking-widest animate-pulse">
                        Menghubungkan ke Siaran Host...
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pure Video Toggle Float Button (Visible when in Pure Video mode) */}
          {isPureVideoOnly && (
            <div className="absolute top-4 right-4 z-50 flex items-center space-x-2">
              <span className="bg-red-600 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full animate-pulse shadow-lg">
                PURE VIDEO MODE
              </span>
              <button
                onClick={() => setIsPureVideoOnly(false)}
                className="bg-black/80 hover:bg-black border border-white/30 text-white px-3.5 py-2 rounded-full text-xs font-black uppercase tracking-wider flex items-center space-x-2 backdrop-blur-md shadow-2xl transition-all active:scale-95"
              >
                <i className="fas fa-compress text-red-400"></i>
                <span>Tampilkan Control / Chat</span>
              </button>
            </div>
          )}

          {/* Floating Reaction Bubbles Animation (Visible when UI is active) */}
          {!isPureVideoOnly && (
            <div className="absolute inset-x-0 bottom-24 top-20 pointer-events-none z-30 overflow-hidden">
              {reactions.map((r, idx) => (
                <div
                  key={`bubble-${r.id}-${idx}`}
                  className="absolute bottom-4 text-3xl animate-float-up opacity-90 transition-all"
                  style={{ left: `${r.left}%` }}
                >
                  {r.type === 'heart' && '❤️'}
                  {r.type === 'fire' && '🔥'}
                  {r.type === 'clap' && '👏'}
                  {r.type === 'star' && '⭐'}
                </div>
              ))}
            </div>
          )}

          {/* Top Bar Header */}
          {!isPureVideoOnly && (
            <div className="relative z-40 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
              <div className="flex items-center space-x-3 bg-black/50 backdrop-blur-md p-1.5 pr-4 rounded-full border border-white/10">
                <img
                  src={
                    liveStream?.hostPhoto ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${liveStream?.hostName}`
                  }
                  className="w-9 h-9 rounded-full object-cover border border-white/20"
                  alt={liveStream?.hostName}
                />
                <div className="flex flex-col">
                  <span className="font-bold text-xs truncate max-w-[120px]">{liveStream?.hostName}</span>
                  <span className="text-[9px] text-zinc-400 truncate max-w-[120px]">{liveStream?.title}</span>
                </div>

                {!isHost && hostUser && onFollow && (
                  <button
                    onClick={() => onFollow(hostUser.id)}
                    className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border transition-all ${
                      isFollowingHost
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                    }`}
                  >
                    {isFollowingHost ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>

              {/* Badges: LIVE indicator, Pure Video GUI Toggle, Stream Type, Live Rank, Viewer count & Close */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsPureVideoOnly(true)}
                  className="bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 text-red-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center space-x-1.5 transition-all shadow-lg active:scale-95"
                  title="Tampilkan Video Saja (Khusus Video)"
                >
                  <i className="fas fa-expand text-xs"></i>
                  <span className="hidden sm:inline">Video Saja</span>
                </button>

                <button
                  onClick={() => setShowLiveLeaderboard(!showLiveLeaderboard)}
                  className="bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/50 text-yellow-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center space-x-1.5 transition-all shadow-lg active:scale-95"
                  title="Papan Peringkat Live"
                >
                  <i className="fas fa-trophy text-amber-400 text-xs"></i>
                  <span className="hidden sm:inline">Rangking Live</span>
                </button>

                <div className="flex items-center space-x-1.5 bg-red-600 text-white px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse shadow-lg shadow-red-600/30">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                  <span>LIVE</span>
                </div>

                <div className="bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-300 flex items-center space-x-1">
                  <i className={`fas ${liveStream?.streamType === 'screen' ? 'fa-desktop text-blue-400' : 'fa-video text-rose-400'}`}></i>
                  <span>{liveStream?.streamType === 'screen' ? 'Layar' : 'Kamera'}</span>
                </div>

                <div className="bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-300 flex items-center space-x-1">
                  <i className="fas fa-eye text-red-400"></i>
                  <span>{viewerCount}</span>
                </div>

                <button
                  onClick={isHost ? handleEndStream : handleClose}
                  className="w-8 h-8 bg-black/60 hover:bg-black/90 border border-white/20 rounded-full flex items-center justify-center transition-all text-white ml-1"
                  title="Keluar"
                >
                  <i className="fas fa-xmark text-sm"></i>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Live Chat & Action Deck Overlay */}
          {!isPureVideoOnly && (
            <div className="relative z-40 p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col space-y-3">
            
            {/* Live Chat Message Stream */}
            <div
              ref={chatContainerRef}
              className="max-h-48 overflow-y-auto space-y-2 pr-2 hide-scrollbar flex flex-col justify-end"
            >
              {chatMessages.map((msg, idx) => (
                <div
                  key={`msg-${msg.id}-${idx}`}
                  className="flex items-start space-x-2 bg-black/40 backdrop-blur-md border border-white/10 p-2 rounded-xl text-xs max-w-[85%] animate-fade-in"
                >
                  <img
                    src={
                      msg.userPhoto ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${msg.userName}`
                    }
                    className="w-5 h-5 rounded-full object-cover mt-0.5"
                    alt={msg.userName}
                  />
                  <div>
                    <span className="font-bold text-zinc-300 mr-1.5 flex items-center inline-flex">
                      {msg.userName}
                      {msg.isHost && (
                        <span className="bg-red-600 text-white text-[7px] font-black uppercase px-1 rounded ml-1">
                          HOST
                        </span>
                      )}
                    </span>
                    <span className="text-white font-medium break-words">{msg.text}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat Input & Controls */}
            <div className="flex items-center space-x-2">
              <form onSubmit={handleSendMessage} className="flex-1 flex items-center space-x-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Kirim pesan live..."
                  className="w-full bg-white/10 border border-white/20 rounded-full px-4 py-2 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-red-500 backdrop-blur-md"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim()}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0"
                >
                  <i className="fas fa-paper-plane text-xs"></i>
                </button>
              </form>

              {/* Reaction Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleSendReaction('heart')}
                  className="w-9 h-9 bg-white/10 hover:bg-red-600/30 border border-white/20 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-90"
                  title="Suka"
                >
                  ❤️
                </button>
                <button
                  onClick={() => handleSendReaction('fire')}
                  className="w-9 h-9 bg-white/10 hover:bg-orange-600/30 border border-white/20 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-90"
                  title="Fire"
                >
                  🔥
                </button>
                <button
                  onClick={() => handleSendReaction('clap')}
                  className="w-9 h-9 bg-white/10 hover:bg-yellow-600/30 border border-white/20 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-90"
                  title="Clap"
                >
                  👏
                </button>
              </div>
            </div>

            {/* HOST EXCLUSIVE CONTROLS (Switch Stream, Mute, Stop Camera, End Stream) */}
            {isHost && (
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={toggleMute}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                      isMuted
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-white/10 border-white/20 text-white'
                    }`}
                  >
                    <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  <button
                    onClick={toggleCamera}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center space-x-1.5 ${
                      isCameraOff
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-white/10 border-white/20 text-white'
                    }`}
                  >
                    <i className={`fas ${isCameraOff ? 'fa-video-slash' : 'fa-video'}`}></i>
                    <span>{isCameraOff ? 'Cam On' : 'Cam Off'}</span>
                  </button>

                  <button
                    onClick={() =>
                      handleSwitchStreamSource(streamType === 'camera' ? 'screen' : 'camera')
                    }
                    className="px-3 py-1.5 rounded-full text-xs font-bold border border-blue-500/40 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-all flex items-center space-x-1.5"
                  >
                    <i className={`fas ${streamType === 'camera' ? 'fa-desktop' : 'fa-video'}`}></i>
                    <span>
                      {streamType === 'camera' ? t('switch_to_screen') : t('switch_to_camera')}
                    </span>
                  </button>
                </div>

                <button
                  onClick={handleEndStream}
                  className="bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs px-4 py-1.5 rounded-full shadow-lg transition-all"
                >
                  {t('end_stream')}
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* OVERLAY: LIVE STREAM LEADERBOARD DRAWER */}
      {showLiveLeaderboard && (
        <div className="absolute inset-x-0 bottom-0 top-16 z-50 bg-zinc-950/90 backdrop-blur-xl p-6 overflow-y-auto animate-slide-up flex flex-col border-t border-white/10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-yellow-400 flex items-center justify-center font-black">
                <i className="fas fa-trophy text-lg"></i>
              </div>
              <div>
                <h3 className="font-black text-base uppercase tracking-wider text-white">Rangking Live Streamer</h3>
                <p className="text-[10px] text-zinc-400">Statistik & Top Broadcaster Vimos</p>
              </div>
            </div>
            <button
              onClick={() => setShowLiveLeaderboard(false)}
              className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white"
            >
              <i className="fas fa-xmark"></i>
            </button>
          </div>

          {/* Current Active Stream Performance Card */}
          {liveStream && (
            <div className="bg-gradient-to-r from-red-950/80 to-zinc-900 border border-red-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Siaran Saat Ini</span>
                <h4 className="font-bold text-sm text-white">{liveStream.title}</h4>
                <p className="text-xs text-zinc-400">Host: {liveStream.hostName}</p>
              </div>
              <div className="flex items-center space-x-4 text-center">
                <div>
                  <p className="font-black text-lg text-rose-400">{likesCount}</p>
                  <p className="text-[8px] uppercase tracking-wider text-zinc-400">Reaksi</p>
                </div>
                <div>
                  <p className="font-black text-lg text-amber-400">{viewerCount}</p>
                  <p className="text-[8px] uppercase tracking-wider text-zinc-400">Penonton</p>
                </div>
              </div>
            </div>
          )}

          {/* Streamers Leaderboard List */}
          <div className="space-y-3 flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">Papan Peringkat Broadcaster</h4>
            {users
              .filter((u) => !u.isBanned)
              .map((u) => {
                const userStreams = activeStreams.filter((s) => s.hostId === u.id);
                const isCurrentlyLive = userStreams.some((s) => s.status === 'live');
                return {
                  ...u,
                  isCurrentlyLive,
                  score: (u.followers || []).length * 10 + (isCurrentlyLive ? 100 : 0)
                };
              })
              .sort((a, b) => b.score - a.score)
              .map((u, idx) => (
                <div
                  key={u.id}
                  className={`flex items-center p-3 rounded-2xl border transition-all ${
                    u.isCurrentlyLive
                      ? 'bg-red-500/20 border-red-500/50 text-white'
                      : 'bg-zinc-900/80 border-white/5 text-zinc-300'
                  }`}
                >
                  <span className="w-8 font-black text-sm italic opacity-60">#{idx + 1}</span>
                  <img
                    src={
                      u.photoURL ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}`
                    }
                    className="w-10 h-10 rounded-full border border-white/10 mr-3 object-cover"
                    alt={u.name}
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h5 className="font-bold text-xs uppercase">{u.name}</h5>
                      {u.isCurrentlyLive && (
                        <span className="bg-red-600 text-white text-[7px] font-black uppercase px-1.5 py-0.2 rounded-full animate-pulse">
                          LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-zinc-400 font-medium">
                      {(u.followers || []).length} Followers
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-yellow-400">{u.score} Pts</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Floating animation keyframes styles */}
      <style>{`
        @keyframes float-up {
          0% {
            transform: translateY(0) scale(0.8);
            opacity: 1;
          }
          100% {
            transform: translateY(-250px) scale(1.4);
            opacity: 0;
          }
        }
        .animate-float-up {
          animation: float-up 2.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default LiveStreamModal;
