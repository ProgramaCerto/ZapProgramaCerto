import React, { useState, useRef, useEffect } from 'react';
import { UserPlus, MoreVertical, Search, Mic, Image as ImageIcon, Check, CheckCheck, Settings, LogOut, Radio } from 'lucide-react';
import { Chat, User } from '../../types/chat';

interface ChatListProps {
  currentUser: User;
  chats: Chat[];
  selectedChatId: string | null;
  onSelectChat: (chat: Chat) => void;
  onOpenAddContact: () => void;
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
  onOpenSettings,
  onLogout,
  isContinuousSyncing = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-10 h-10 rounded-full object-cover border border-slate-200"
              referrerPolicy="no-referrer"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full"></span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight flex items-center gap-1.5">
              <span>{currentUser.name}</span>
            </h2>
            <p className="text-xs text-blue-600 font-medium">{currentUser.handle}</p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {/* Continuous sync indicator */}
          <div
            title="Sincronização contínua com banco de dados ativa"
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-blue-700 bg-blue-50 mr-1"
          >
            <Radio className={`w-3 h-3 text-blue-600 ${isContinuousSyncing ? 'animate-subtle-pulse' : ''}`} />
            <span>Sincronizando</span>
          </div>

          {/* Contact icon with plus (+) button as requested: "um ícone de contato e um maiszinho do lado" */}
          <button
            type="button"
            onClick={onOpenAddContact}
            title="Adicionar Contato"
            aria-label="Adicionar Contato"
            className="relative p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer flex items-center justify-center"
          >
            <UserPlus className="w-5 h-5" />
          </button>

          {/* Three dots menu: "daí os três pontinhos, daí a gente clica em configurações" */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              title="Menu de opções"
              aria-label="Menu de opções"
              className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center justify-center"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
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
            placeholder="Pesquisar conversa ou @arroba..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
          />
        </div>
      </div>

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
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors relative ${
                  isSelected
                    ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                    : 'hover:bg-slate-50'
                }`}
              >
                {/* Avatar with online indicator */}
                <div className="relative shrink-0">
                  <img
                    src={chat.contact.avatar}
                    alt={chat.contact.name}
                    className="w-12 h-12 rounded-full object-cover border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  {chat.contact.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full"></span>
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
