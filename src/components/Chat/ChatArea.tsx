import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Send,
  Mic,
  Camera,
  Image as ImageIcon,
  Trash2,
  X,
  Phone,
  Video,
  Download,
  UserPlus,
  Check,
  User,
} from 'lucide-react';
import { Chat, Message, User as UserType } from '../../types/chat';
import { storage } from '../../services/storage';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { CameraCaptureModal } from './CameraCaptureModal';
import { formatDuration, generateSyntheticAudioBlob } from '../../utils/audio';
import { compressImage } from '../../utils/image';

interface ChatAreaProps {
  chat: Chat;
  currentUser: UserType;
  onBack: () => void;
  onOpenContactInfo?: (contact: UserType) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  chat,
  currentUser,
  onBack,
  onOpenContactInfo,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Unsaved Contact state
  const [isContactSaved, setIsContactSaved] = useState<boolean>(chat.isSaved !== false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveNameInput, setSaveNameInput] = useState<string>(
    chat.contact.name && chat.contact.name !== chat.contact.handle ? chat.contact.name : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMessagesCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  // Keep isContactSaved updated when chat prop changes
  useEffect(() => {
    setIsContactSaved(chat.isSaved !== false);
    setSaveNameInput(
      chat.contact.name && chat.contact.name !== chat.contact.handle ? chat.contact.name : ''
    );
  }, [chat.id, chat.isSaved, chat.contact.name]);

  // Load and subscribe to messages
  const loadMessages = () => {
    const list = storage.getChatMessages(chat.id);
    setMessages(list);
    storage.markMessagesAsRead(chat.id, currentUser.id);
  };

  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesCountRef.current = 0;
    loadMessages();

    const unsubscribe = storage.subscribe(() => {
      loadMessages();
    });

    return () => {
      unsubscribe();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [chat.id]);

  // Scroll logic: only scrolls when new messages appear or on initial load
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isInitialLoadRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      isInitialLoadRef.current = false;
      prevMessagesCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessagesCountRef.current) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      prevMessagesCountRef.current = messages.length;
    }
  }, [messages]);

  // Handle Save Unsaved Contact
  const handleConfirmSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = saveNameInput.trim() || chat.contact.handle || 'Contato';
    setIsSaving(true);

    await storage.saveContact(currentUser.id, chat.contact.id, finalName);
    chat.isSaved = true;
    chat.contact.name = finalName;
    setIsContactSaved(true);
    setIsSaveModalOpen(false);
    setIsSaving(false);
  };

  // Send Text Message
  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    await storage.sendMessage({
      chatId: chat.id,
      senderId: currentUser.id,
      senderHandle: currentUser.handle,
      recipientId: chat.contact.id,
      type: 'text',
      text: textToSend,
    });

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  // Live Camera Photo Captured
  const handleCameraPhotoCaptured = async (photoBase64: string) => {
    let finalPhoto = photoBase64;
    try {
      finalPhoto = await compressImage(photoBase64, 1024, 1024, 0.72);
    } catch {
      // Use original if compression fails
    }

    await storage.sendMessage({
      chatId: chat.id,
      senderId: currentUser.id,
      senderHandle: currentUser.handle,
      recipientId: chat.contact.id,
      type: 'image',
      mediaUrl: finalPhoto,
      photosAttached: finalPhoto,
      text: '📷 Foto',
    });

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  // Gallery Photo Selected
  const handleGalleryPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, 1024, 1024, 0.72);
      await storage.sendMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        senderHandle: currentUser.handle,
        recipientId: chat.contact.id,
        type: 'image',
        mediaUrl: compressedBase64,
        photosAttached: compressedBase64,
        text: '📷 Foto',
      });

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err) {
      console.error('Falha ao processar imagem da galeria', err);
    } finally {
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  // Start Audio Recording
  const startRecording = async () => {
    audioChunksRef.current = [];
    setRecordingSeconds(0);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);

        recordingTimerRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } else {
        startSimulatedRecording();
      }
    } catch {
      startSimulatedRecording();
    }
  };

  const startSimulatedRecording = () => {
    setIsRecording(true);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  // Cancel Audio Recording
  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  // Send Audio Recording
  const finishAndSendRecording = async () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const finalDuration = Math.max(recordingSeconds, 1);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await storage.sendMessage({
            chatId: chat.id,
            senderId: currentUser.id,
            senderHandle: currentUser.handle,
            recipientId: chat.contact.id,
            type: 'audio',
            mediaUrl: base64Audio,
            audioDuration: finalDuration,
          });
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorderRef.current.stop();
    } else {
      const { blob } = await generateSyntheticAudioBlob(finalDuration);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        await storage.sendMessage({
          chatId: chat.id,
          senderId: currentUser.id,
          senderHandle: currentUser.handle,
          recipientId: chat.contact.id,
          type: 'audio',
          mediaUrl: base64Audio,
          audioDuration: finalDuration,
        });
      };
      reader.readAsDataURL(blob);
    }

    setIsRecording(false);
    setRecordingSeconds(0);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const formatMsgTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-[#F4F7FB] relative overflow-hidden select-text">
      {/* Chat Top Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 z-10 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          {/* Back button for mobile view */}
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            aria-label="Voltar para lista de conversas"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div
            onClick={() => onOpenContactInfo && onOpenContactInfo(chat.contact)}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative">
              {chat.contact.avatar ? (
                <img
                  src={chat.contact.avatar}
                  alt={chat.contact.name}
                  className="w-10 h-10 rounded-full object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                  <User className="w-5 h-5" />
                </div>
              )}
              {chat.contact.online && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full"></span>
              )}
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition leading-tight">
                {chat.contact.name}
              </h2>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="text-blue-600 font-medium">{chat.contact.handle}</span>
                <span className="text-slate-300">·</span>
                {chat.contact.online ? (
                  <span className="text-slate-500">online</span>
                ) : (
                  <span className="text-slate-400">offline</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 text-slate-500">
          <button
            type="button"
            onClick={() => alert(`Iniciando chamada de áudio com ${chat.contact.name}...`)}
            title="Chamada de voz"
            className="p-2 hover:bg-slate-100 hover:text-blue-600 rounded-xl transition cursor-pointer"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => alert(`Iniciando chamada de vídeo com ${chat.contact.name}...`)}
            title="Chamada de vídeo"
            className="p-2 hover:bg-slate-100 hover:text-blue-600 rounded-xl transition cursor-pointer"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* UNSAVED CONTACT BANNER (Exatamente como solicitado pelo usuário) */}
      {!isContactSaved && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 z-10 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-blue-900">
            <UserPlus className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Este contato não está salvo na sua agenda ({chat.contact.handle || chat.contact.name}).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsSaveModalOpen(true)}
            className="w-full sm:w-auto px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Salvar Contato</span>
          </button>
        </div>
      )}

      {/* Messages Scroll View (With fixed non-jumping scroll!) */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5"
      >
        {/* Intro banner */}
        <div className="text-center my-4">
          <div className="inline-block bg-white/90 border border-slate-200/80 px-3.5 py-1.5 rounded-full text-xs text-slate-500 shadow-xs">
            Conversa com <strong className="text-slate-700">{chat.contact.name}</strong> ({chat.contact.handle})
          </div>
        </div>

        {messages.map((msg) => {
          const isOutgoing = msg.senderId === currentUser.id;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'} group`}
            >
              <div
                className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-xs transition-all ${
                  isOutgoing
                    ? 'bg-blue-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-xs'
                }`}
              >
                {/* 1. Text Message */}
                {msg.type === 'text' && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.text}
                  </p>
                )}

                {/* 2. Photo / Image Message */}
                {(msg.type === 'image' || !!msg.photosAttached) && (msg.mediaUrl || msg.photosAttached) && (
                  <div className="space-y-1.5">
                    <div
                      onClick={() => setFullscreenImage(msg.mediaUrl || msg.photosAttached || null)}
                      className="rounded-xl overflow-hidden cursor-pointer max-h-72 bg-slate-100 border border-black/5 hover:opacity-95 transition"
                    >
                      <img
                        src={msg.mediaUrl || msg.photosAttached}
                        alt="Foto enviada"
                        className="w-full h-auto object-cover max-h-72 rounded-xl"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {msg.text && msg.text !== '📷 Foto' && (
                      <p className="text-sm pt-1 leading-snug">{msg.text}</p>
                    )}
                  </div>
                )}

                {/* 3. Audio Message (Voice Note) */}
                {msg.type === 'audio' && msg.mediaUrl && (
                  <AudioMessagePlayer
                    mediaUrl={msg.mediaUrl}
                    duration={msg.audioDuration}
                    isOutgoing={isOutgoing}
                    avatar={isOutgoing ? currentUser.avatar : chat.contact.avatar}
                  />
                )}

                {/* Timestamp & Bolinha Status Indicator (Exactly as specified) */}
                <div
                  className={`flex items-center justify-end gap-1.5 text-[10px] mt-1 font-medium select-none ${
                    isOutgoing ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  <span>{formatMsgTime(msg.timestamp)}</span>

                  {/* BOLINHA STATUS LOGIC:
                      1. msg.status === 'sending': Nenhuma bolinha aparece (ainda não chegou no celular da pessoa)
                      2. msg.status === 'delivered': A bolinha aparece, só que NÃO está azul (tocou no celular da pessoa)
                      3. msg.status === 'read': A bolinha fica azul (a pessoa viu a mensagem)
                  */}
                  {isOutgoing && (
                    <div className="flex items-center justify-center pl-0.5">
                      {msg.status === 'sending' ? (
                        null
                      ) : msg.status === 'delivered' ? (
                        <span
                          title="Mensagem tocou no celular da pessoa"
                          className="w-2 h-2 rounded-full bg-white/70 border border-white/90 shrink-0 inline-block"
                        />
                      ) : (
                        <span
                          title="A pessoa viu a mensagem"
                          className="w-2 h-2 rounded-full bg-cyan-300 ring-1 ring-white/90 shadow-xs shrink-0 inline-block"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input / Audio Recording Footer (White and Blue palette) */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 z-10 shrink-0">
        {isRecording ? (
          /* Audio Recording Active Bar */
          <div className="flex items-center justify-between gap-3 bg-blue-50/70 border border-blue-200 rounded-2xl px-4 py-2.5 animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Gravando áudio</span>
                <span className="text-xs font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-100">
                  {formatDuration(recordingSeconds)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                title="Cancelar gravação"
                className="p-2 text-rose-600 hover:bg-rose-100/70 rounded-xl transition cursor-pointer"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={finishAndSendRecording}
                className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Áudio</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Input Bar (Camera for taking photo now + Gallery for picking from device!) */
          <form onSubmit={handleSendText} className="flex items-center gap-2">
            {/* Hidden input for gallery image selection */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleGalleryPhotoSelect}
              className="hidden"
            />

            {/* Ícone de tirar foto agora */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              title="Tirar foto agora"
              aria-label="Tirar foto agora"
              className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer shrink-0"
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Ícone de adicionar foto da galeria */}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              title="Adicionar foto da galeria"
              aria-label="Adicionar foto da galeria"
              className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer shrink-0"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Text input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Digite uma mensagem..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
              />
            </div>

            {/* Send or Microphone button */}
            {inputText.trim().length > 0 ? (
              <button
                type="submit"
                title="Enviar mensagem"
                className="p-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                title="Gravar áudio"
                className="p-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer shrink-0 flex items-center justify-center"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Modal para Salvar Contato com Nome */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Salvar Contato</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSaveContact} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Arroba da Pessoa
                </label>
                <input
                  type="text"
                  value={chat.contact.handle}
                  disabled
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nome para Salvar
                </label>
                <input
                  type="text"
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  placeholder="Ex: Carlos Amigo"
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar Contato'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Camera Modal for snapping photos */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapturePhoto={handleCameraPhotoCaptured}
      />

      {/* Fullscreen Photo Lightbox Modal */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <a
                href={fullscreenImage}
                download="zapprogramacerto-imagem.jpg"
                className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition cursor-pointer"
                title="Baixar imagem"
              >
                <Download className="w-5 h-5" />
              </a>
              <button
                type="button"
                onClick={() => setFullscreenImage(null)}
                className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={fullscreenImage}
              alt="Visualização de foto"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
