import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types.ts';
import { useLanguage } from '../LanguageContext.tsx';
import { db } from '../firebase.ts';
import { ref, onValue, set, push, update } from 'firebase/database';

export interface ActiveCall {
  id: string;
  type: 'private' | 'collective';
  mediaType: 'audio' | 'video';
  callerId: string;
  callerName: string;
  callerPhoto: string;
  receiverId?: string;
  groupId?: string;
  groupName?: string;
  status: 'calling' | 'ringing' | 'connected' | 'ended';
  timestamp: number;
  activeParticipants?: Record<string, boolean>;
}

interface CallingOverlayProps {
  activeCall: ActiveCall;
  currentUser: User;
  users: User[];
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
}

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const CallingOverlay: React.FC<CallingOverlayProps> = ({
  activeCall,
  currentUser,
  users,
  onAccept,
  onDecline,
  onEnd
}) => {
  const { t } = useLanguage();
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteState, setRemoteState] = useState<{ isMuted: boolean; isCameraOff: boolean } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);

  const isCaller = activeCall.callerId === currentUser.id;
  const isJoined = activeCall.activeParticipants?.[currentUser.id] === true;

  // Duration timer when connected
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeCall.status === 'connected') {
      timer = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(timer);
  }, [activeCall.status]);

  // Request Camera & Audio based on mediaType & status
  useEffect(() => {
    let streamInstance: MediaStream | null = null;
    const constraints = {
      audio: true,
      video: activeCall.mediaType === 'video'
    };

    if (activeCall.status === 'connected' || (isCaller && activeCall.status !== 'ended')) {
      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
          streamInstance = stream;
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn("Could not access camera/microphone:", err);
        });
    }

    return () => {
      if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeCall.status, activeCall.mediaType, isCaller]);

  // Sync state (muted / cameraOff) to Firebase for UI indicators
  useEffect(() => {
    if (activeCall.status === 'connected') {
      const stateRef = ref(db, `calls/${activeCall.id}/participantsState/${currentUser.id}`);
      set(stateRef, {
        isMuted,
        isCameraOff
      });
    }
  }, [isMuted, isCameraOff, activeCall.status, activeCall.id, currentUser.id]);

  // Read remote participant's state (mute / cameraOff)
  useEffect(() => {
    if (activeCall.status === 'connected') {
      const targetId = isCaller ? activeCall.receiverId : activeCall.callerId;
      if (targetId) {
        const remoteStateRef = ref(db, `calls/${activeCall.id}/participantsState/${targetId}`);
        const unsubscribe = onValue(remoteStateRef, (snapshot) => {
          setRemoteState(snapshot.val());
        });
        return () => unsubscribe();
      }
    }
  }, [activeCall.status, isCaller, activeCall.id, activeCall.receiverId, activeCall.callerId]);

  // WebRTC Signal & Peer Connection Establishment
  useEffect(() => {
    if (activeCall.status !== 'connected' || !localStream) return;

    const pc = new RTCPeerConnection(iceServers);
    peerConnection.current = pc;

    // Add local tracks to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Handle incoming track
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    // Gather ICE candidates and push them to database
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidatePath = `calls/${activeCall.id}/signal/${isCaller ? 'callerCandidates' : 'receiverCandidates'}`;
        const newCandidateRef = push(ref(db, candidatePath));
        set(newCandidateRef, event.candidate.toJSON());
      }
    };

    // Signaling references
    const offerRef = ref(db, `calls/${activeCall.id}/signal/offer`);
    const answerRef = ref(db, `calls/${activeCall.id}/signal/answer`);
    const callerCandidatesRef = ref(db, `calls/${activeCall.id}/signal/callerCandidates`);
    const receiverCandidatesRef = ref(db, `calls/${activeCall.id}/signal/receiverCandidates`);

    let unsubscribeOffer: () => void = () => {};
    let unsubscribeAnswer: () => void = () => {};
    let unsubscribeCandidates: () => void = () => {};

    if (isCaller) {
      // 1. Create and send offer
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          set(offerRef, {
            type: pc.localDescription?.type,
            sdp: pc.localDescription?.sdp
          });
        })
        .catch((err) => console.error("Error creating offer", err));

      // 2. Listen for answer
      unsubscribeAnswer = onValue(answerRef, (snapshot) => {
        const answer = snapshot.val();
        if (answer && pc.signalingState !== 'stable') {
          pc.setRemoteDescription(new RTCSessionDescription(answer))
            .catch((err) => console.error("Error setting remote description for answer", err));
        }
      });

      // 3. Listen for receiver candidates
      unsubscribeCandidates = onValue(receiverCandidatesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          Object.values(data).forEach((candidateData: any) => {
            pc.addIceCandidate(new RTCIceCandidate(candidateData))
              .catch((err) => console.warn("Error adding ICE candidate", err));
          });
        }
      });
    } else {
      // Receiver side
      // 1. Listen for offer and create answer
      unsubscribeOffer = onValue(offerRef, (snapshot) => {
        const offer = snapshot.val();
        if (offer && pc.signalingState !== 'have-local-offer') {
          pc.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => pc.createAnswer())
            .then((answer) => pc.setLocalDescription(answer))
            .then(() => {
              set(answerRef, {
                type: pc.localDescription?.type,
                sdp: pc.localDescription?.sdp
              });
            })
            .catch((err) => console.error("Error setting offer or creating answer", err));
        }
      });

      // 2. Listen for caller candidates
      unsubscribeCandidates = onValue(callerCandidatesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          Object.values(data).forEach((candidateData: any) => {
            pc.addIceCandidate(new RTCIceCandidate(candidateData))
              .catch((err) => console.warn("Error adding ICE candidate", err));
          });
        }
      });
    }

    return () => {
      unsubscribeOffer();
      unsubscribeAnswer();
      unsubscribeCandidates();
      pc.close();
      peerConnection.current = null;
      setRemoteStream(null);
    };
  }, [activeCall.status, localStream, isCaller, activeCall.id]);

  // Format calling duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Toggle audio track
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
    }
    setIsMuted(!isMuted);
  };

  // Toggle video track
  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
    }
    setIsCameraOff(!isCameraOff);
  };

  // Find target participant info (for private call)
  const targetUser = users.find(u => 
    activeCall.type === 'private' && (isCaller ? u.id === activeCall.receiverId : u.id === activeCall.callerId)
  );

  const callTitle = (activeCall.type === 'private' 
    ? (targetUser?.name || activeCall.callerName || (isCaller ? 'Panggilan' : 'Penelepon'))
    : (activeCall.groupName || t('collective_call'))) || 'Panggilan';

  const callPhoto = activeCall.type === 'private'
    ? (targetUser?.photoURL || activeCall.callerPhoto)
    : undefined;

  // Handle incoming screen vs outgoing vs connected screen
  const showIncoming = !isCaller && !isJoined && activeCall.status !== 'connected';
  const showOutgoing = isCaller && activeCall.status !== 'connected';
  const showConnected = activeCall.status === 'connected' || isJoined;

  return (
    <div className="fixed inset-0 z-[999] bg-zinc-950 text-white flex flex-col justify-between p-6 animate-fade-in select-none">
      
      {/* Hidden / Background video/audio player to output remote stream audio */}
      {showConnected && (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="hidden" 
        />
      )}

      {/* Full-screen Background Video for Video Calls */}
      {activeCall.mediaType === 'video' && showConnected && (
        <div className="absolute inset-0 w-full h-full bg-black z-0">
          {remoteStream && !(remoteState?.isCameraOff) ? (
            <video 
              ref={(el) => {
                // Keep local video assigned to ref and update srcObject
                if (el) el.srcObject = remoteStream;
              }}
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-4 bg-zinc-900">
              <div className="w-24 h-24 rounded-full border-4 border-white/10 p-1 bg-zinc-800 relative">
                <div className="absolute -inset-2 rounded-full bg-blue-500/10 animate-ping"></div>
                {callPhoto ? (
                  <img src={callPhoto} className="w-full h-full rounded-full object-cover" alt={callTitle} />
                ) : (
                  <div className="w-full h-full rounded-full bg-blue-600 flex items-center justify-center text-3xl font-black">
                    {(callTitle || 'P').substring(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                {remoteState?.isCameraOff ? "Camera Dimatikan" : "Menghubungkan Kamera Teman..."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Floating Picture-in-Picture Local Stream for Video Calls */}
      {activeCall.mediaType === 'video' && showConnected && (
        <div className="absolute top-24 right-4 w-28 h-40 bg-zinc-900 rounded-2xl border border-white/20 shadow-2xl overflow-hidden z-20">
          {!isCameraOff && localStream ? (
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover scale-x-[-1]" 
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800">
              <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden">
                <img 
                  src={currentUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.name}`} 
                  className="w-full h-full object-cover" 
                  alt={currentUser.name} 
                />
              </div>
              <span className="text-[8px] font-bold text-zinc-500 mt-2">Camera Off</span>
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
            You
          </div>
        </div>
      )}

      {/* Top Bar Status / Header */}
      <div className="flex flex-col items-center mt-12 space-y-2 z-10">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
          {activeCall.mediaType === 'video' ? t('video_call') : t('audio_call')}
        </span>
        
        {showConnected ? (
          <span className="text-sm font-semibold tracking-wider font-mono text-emerald-400">
            {formatDuration(duration)}
          </span>
        ) : (
          <span className="text-sm font-semibold tracking-widest animate-pulse text-zinc-400 uppercase">
            {showIncoming ? t('incoming_call') : t('ringing')}
          </span>
        )}
      </div>

      {/* Main visual display area (Hidden or styled as overlay when Video call is active) */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-6">
        {!(activeCall.mediaType === 'video' && showConnected) && (
          // Voice call interface
          <div className="flex flex-col items-center space-y-6 z-10">
            
            {/* Pulse rings background */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-blue-500/10 animate-ping" style={{ animationDuration: '3s' }}></div>
              <div className="absolute -inset-8 rounded-full bg-blue-500/5 animate-ping" style={{ animationDuration: '4s' }}></div>
              
              <div className="w-32 h-32 rounded-full border-4 border-white/10 p-1 bg-zinc-900 relative z-10 shadow-2xl overflow-hidden">
                {callPhoto ? (
                  <img src={callPhoto} className="w-full h-full rounded-full object-cover" alt={callTitle} />
                ) : (
                  <div className="w-full h-full rounded-full bg-blue-600 flex items-center justify-center text-4xl font-black">
                    {(callTitle || 'P').substring(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Target caller/receiver text info */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black uppercase tracking-tight">{callTitle}</h2>
              {activeCall.type === 'collective' && (
                <p className="text-xs text-zinc-500 font-bold tracking-widest uppercase">
                  {t('collective_call')} • {Object.keys(activeCall.activeParticipants || {}).length} Active
                </p>
              )}
            </div>

            {/* Bouncing audio wave simulation (for active audio calls) */}
            {showConnected && (
              <div className="flex items-center justify-center space-x-1.5 h-8 pt-4">
                {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
                  <div 
                    key={bar} 
                    className="w-1 bg-emerald-400 rounded-full animate-bounce"
                    style={{ 
                      height: '100%', 
                      animationDelay: `${bar * 0.15}s`,
                      animationDuration: '0.8s'
                    }}
                  />
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Action controls button deck */}
      <div className="mb-12 flex justify-center items-center space-x-6 z-10">
        
        {showIncoming ? (
          // INCOMING CALL BUTTONS
          <>
            <button 
              onClick={onDecline}
              className="w-16 h-16 bg-red-600 hover:bg-red-500 hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg transition-all"
            >
              <i className="fas fa-phone-slash text-xl"></i>
            </button>
            <button 
              onClick={onAccept}
              className="w-16 h-16 bg-emerald-500 hover:bg-emerald-400 hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg transition-all"
            >
              <i className="fas fa-phone text-xl"></i>
            </button>
          </>
        ) : (
          // OUTGOING OR CONNECTED BUTTONS
          <>
            {showConnected && (
              <button 
                onClick={toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                  isMuted 
                    ? 'bg-red-500/20 border-red-500 text-red-500' 
                    : 'bg-zinc-900 border-white/10 text-white hover:bg-zinc-800'
                }`}
              >
                <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
              </button>
            )}

            <button 
              onClick={onEnd}
              className="w-16 h-16 bg-red-600 hover:bg-red-500 hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg transition-all"
              title={t('end_call')}
            >
              <i className="fas fa-phone-slash text-xl"></i>
            </button>

            {showConnected && activeCall.mediaType === 'video' && (
              <button 
                onClick={toggleCamera}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${
                  isCameraOff 
                    ? 'bg-red-500/20 border-red-500 text-red-500' 
                    : 'bg-zinc-900 border-white/10 text-white hover:bg-zinc-800'
                }`}
              >
                <i className={`fas ${isCameraOff ? 'fa-video-slash' : 'fa-video'}`}></i>
              </button>
            )}
          </>
        )}

      </div>

    </div>
  );
};

export default CallingOverlay;
