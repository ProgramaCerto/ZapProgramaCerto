import React, { useState, useRef, useEffect } from 'react';
import {
  UserPlus,
  Users,
  MoreVertical,
  Search,
  Settings,
  LogOut,
  User as UserIcon,
  BellRing,
  Mic,
  Image as ImageIcon,
} from 'lucide-react';
import { Chat, User } from '../../types/chat';
import { getNotificationPermissionStatus, requestNotificationPermission } from '../../utils/notifications';

interface ChatListProps {
  currentUser: User;
  chats: Chat[];
  selectedChatId: string | null;
  onSelectChat: (chat: Chat) => void;
  onOpenAddContact: () => void;
  onOpenContactsList: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  isContinuousSyncing?: boolean;
}

export const ChatList: React.FC<ChatListProps> = ({
  currentUser,
  chats,
  selectedChatId,
  onSelectChat,
  onOpenAddContact,
  onOpenContactsList,
  onOpenSettings,
  onLogout,
  isContinuousSyncing = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' ? getNotificationPermissionStatus() : 'unsupported'
  );
  const menuRef = useRef<HTMLDivElement>(null);

  const handleRequestNotification = async () => {
    const perm = await requestNotificationPermission();
    setNotificationStatus(perm);
  };

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredChats = chats.filter((c) => {
    const term = searchTerm.toLowerCase();
    const nameMatch = c.contact.name.toLowerCase().includes(term);
    const handleMatch = c.contact.handle.toLowerCase().includes(term);
    const lastMsgMatch = c.lastMessage?.text?.toLowerCase().includes(term);
    return nameMatch || handleMatch || lastMsgMatch;
  });

  const formatMessageTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none animate-fade-scale">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="relative">
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-10 h-10 rounded-full object-cover border border-slate-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                <UserIcon className="w-5 h-5" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight flex items-center gap-1.5">
              <span>{currentUser.name}</span>
            </h2>
            <p className="text-xs text-blue-600 font-medium">{currentUser.handle}</p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-0.5">
          {/* Contacts List Icon button (Ícone de contatos ao lado do adicionar contato) */}
          <button
            type="button"
            onClick={onOpenContactsList}
            title="Ver meus contatos"
            aria-label="Ver meus contatos"
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 active:scale-95 rounded-xl transition cursor-pointer flex items-center justify-center"
          >
            <Users className="w-5 h-5" />
          </button>

          {/* Contact icon with plus (+) button */}
          <button
            type="button"
            onClick={onOpenAddContact}
            title="Adicionar Novo Contato"
            aria-label="Adicionar Novo Contato"
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 active:scale-95 rounded-xl transition cursor-pointer flex items-center justify-center"
          >
            <UserPlus className="w-5 h-5" />
          </button>

          {/* Three dots menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              title="Menu de opções"
              aria-label="Menu de opções"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:scale-95 rounded-xl transition cursor-pointer flex items-center justify-center"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 z-40 animate-menu-dropdown">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenContactsList();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>Ver Contatos</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAddContact();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-slate-400" />
                  <span>Novo Contato</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Configurações</span>
                </button>
                <div className="my-1 border-t border-slate-100"></div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sair da Conta</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/50">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquise uma conversa"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Native Chrome Notifications Banner (if permission not yet decided) */}
      {notificationStatus === 'default' && (
        <div className="mx-3 my-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BellRing className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-900 leading-tight truncate">
                Notificações de mensagens
              </p>
              <p className="text-[11px] text-blue-700 leading-tight mt-0.5 truncate">
                Receba alertas no celular quando responderem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestNotification}
            className="shrink-0 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-xs rounded-lg shadow-xs transition cursor-pointer"
          >
            Permitir
          </button>
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80">
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <UserPlus className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">Nenhuma conversa encontrada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Clique no ícone de contato com o maiszinho (+) acima para adicionar um amigo pelo arroba (@)!
            </p>
            <button
              type="button"
              onClick={onOpenAddContact}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Adicionar Contato</span>
            </button>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isSelected = chat.id === selectedChatId;
            const isContactTyping = chat.isTyping;
            const isContactAudio = chat.isRecordingAudio;

            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-150 active:scale-[0.98] relative ${
                  isSelected
                    ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                    : 'hover:bg-slate-50'
                }`}
              >
                {/* Avatar with online indicator */}
                <div className="relative shrink-0">
                  {chat.contact.avatar ? (
                    <img
                      src={chat.contact.avatar}
                      alt={chat.contact.name}
                      className="w-12 h-12 rounded-full object-cover border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                      <UserIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                      {chat.contact.name}
                    </h3>
                    <span className="text-[11px] text-slate-400 shrink-0 ml-2">
                      {formatMessageTime(chat.lastMessage?.timestamp || chat.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Live status or message preview */}
                    <div className="text-xs truncate text-slate-500 flex items-center gap-1.5">
                      {isContactTyping ? (
                        <span className="text-blue-600 font-medium italic flex items-center gap-1">
                          Digitando...
                        </span>
                      ) : isContactAudio ? (
                        <span className="text-blue-600 font-medium italic flex items-center gap-1">
                          <Mic className="w-3 h-3 animate-pulse" />
                          Gravando áudio...
                        </span>
                      ) : chat.lastMessage ? (
                        <>
                          {chat.lastMessage.senderId === currentUser.id && (
                            <span className="shrink-0 flex items-center mr-1">
                              {chat.lastMessage.status === 'read' ? (
                                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" title="A pessoa viu a mensagem" />
                              ) : chat.lastMessage.status === 'delivered' ? (
                                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" title="Mensagem tocou no celular da pessoa" />
                              ) : null}
                            </span>
                          )}
                          {chat.lastMessage.type === 'audio' && (
                            <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                              <Mic className="w-3 h-3 text-blue-600" />
                              Áudio {chat.lastMessage.audioDuration ? `(${Math.round(chat.lastMessage.audioDuration)}s)` : ''}
                            </span>
                          )}
                          {chat.lastMessage.type === 'image' && (
                            <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                              <ImageIcon className="w-3 h-3 text-blue-600" />
                              Foto
                            </span>
                          )}
                          {chat.lastMessage.type === 'text' && (
                            <span className="truncate">{chat.lastMessage.text}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400 italic">Conversa iniciada</span>
                      )}
                    </div>

                    {/* Unread badge */}
                    {chat.unreadCount > 0 && (
                      <span className="ml-2 w-5 h-5 bg-blue-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center shrink-0">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
