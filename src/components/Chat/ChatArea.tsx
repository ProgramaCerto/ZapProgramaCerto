import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Send,
  Camera,
  Image as ImageIcon,
  X,
  Phone,
  Video,
  Download,
  UserPlus,
  Check,
  User,
  Loader2,
} from 'lucide-react';
import { Chat, Message, User as UserType } from '../../types/chat';
import { storage } from '../../services/storage';
import { CameraCaptureModal } from './CameraCaptureModal';
import { uploadPhotoToSupabase } from '../../services/storageUpload';

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
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Unsaved Contact state
  const [isContactSaved, setIsContactSaved] = useState<boolean>(chat.isSaved !== false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveNameInput, setSaveNameInput] = useState<string>(
    chat.contact.name && chat.contact.name !== chat.contact.handle ? chat.contact.name : ''
  );
  const [isSaving, setIsSaving] = useState(false);

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
    window.scrollTo(0, 0);
    isInitialLoadRef.current = true;
    prevMessagesCountRef.current = 0;
    loadMessages();

    const unsubscribe = storage.subscribe(() => {
      loadMessages();
    });

    return () => {
      unsubscribe();
    };
  }, [chat.id]);

  // Scroll logic: strictly scrolls the messages container so the header and footer remain fixed
  const scrollToBottom = (smooth = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (smooth) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isInitialLoadRef.current) {
      scrollToBottom(false);
      isInitialLoadRef.current = false;
      prevMessagesCountRef.current = messages.length;
      return;
    }

    if (messages.length > prevMessagesCountRef.current) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
      if (isNearBottom) {
        scrollToBottom(true);
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
      scrollToBottom(true);
    }, 50);
  };

  // Live Camera Photo Captured
  const handleCameraPhotoCaptured = async (photoBase64: string) => {
    setIsUploadingPhoto(true);
    try {
      // Envia a foto para o Banco de Fotos (Supabase Storage) para ter URL pública permanente
      const permanentUrl = await uploadPhotoToSupabase(photoBase64, currentUser.id);

      await storage.sendMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        senderHandle: currentUser.handle,
        recipientId: chat.contact.id,
        type: 'image',
        mediaUrl: permanentUrl,
        photosAttached: permanentUrl,
        text: '📷 Foto',
      });

      setTimeout(() => {
        scrollToBottom(true);
      }, 50);
    } catch (err) {
      console.error('Erro ao enviar foto da câmera:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Gallery Photo Selected
  const handleGalleryPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      // Envia a foto para o Banco de Fotos (Supabase Storage) para ter URL pública permanente
      const permanentUrl = await uploadPhotoToSupabase(file, currentUser.id);

      await storage.sendMessage({
        chatId: chat.id,
        senderId: currentUser.id,
        senderHandle: currentUser.handle,
        recipientId: chat.contact.id,
        type: 'image',
        mediaUrl: permanentUrl,
        photosAttached: permanentUrl,
        text: '📷 Foto',
      });

      setTimeout(() => {
        scrollToBottom(true);
      }, 50);
    } catch (err) {
      console.error('Falha ao processar e enviar foto da galeria:', err);
    } finally {
      setIsUploadingPhoto(false);
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
    }
  };

  const formatMsgTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-[#F4F7FB] relative overflow-hidden select-text">
      {/* Chat Top Header - FIXO no topo, nunca se desloca */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0 shadow-xs">
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
      </header>

      {/* UNSAVED CONTACT BANNER (Exatamente como solicitado pelo usuário) */}
      {!isContactSaved && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 z-20 shadow-xs">
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

      {/* Messages Scroll View (Área exclusiva com rolagem interna independente, mantendo cabeçalho e rodapé fixos) */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3.5"
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

      {/* Input Footer (FIXO na base, idêntico ao WhatsApp) */}
      <footer className="sticky bottom-0 z-30 p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Status de envio de foto para o Banco de Fotos */}
        {isUploadingPhoto && (
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl mb-2.5 animate-in fade-in duration-150">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
            <span>Enviando foto para o banco de fotos do Supabase...</span>
          </div>
        )}

        {/* Standard Input Bar (Camera + Gallery + Text) */}
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
            disabled={isUploadingPhoto}
            className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Camera className="w-5 h-5" />
          </button>

          {/* Ícone de adicionar foto da galeria */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            title="Adicionar foto da galeria"
            aria-label="Adicionar foto da galeria"
            disabled={isUploadingPhoto}
            className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => {
                window.scrollTo(0, 0);
                setTimeout(() => scrollToBottom(true), 120);
              }}
              placeholder="Digite uma mensagem..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
          </div>

          {/* Send button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isUploadingPhoto}
            title="Enviar mensagem"
            className={`p-2.5 rounded-xl shadow-xs transition-transform active:scale-95 shrink-0 ${
              inputText.trim().length > 0 && !isUploadingPhoto
                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white cursor-pointer'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </footer>

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
