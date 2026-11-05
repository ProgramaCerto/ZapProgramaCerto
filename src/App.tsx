import React, { useState, useEffect } from 'react';
import { MessageSquare, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { storage, getConversationId } from './services/storage';
import { User, Chat } from './types/chat';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ChatList } from './components/Chat/ChatList';
import { ChatArea } from './components/Chat/ChatArea';
import { NewContactPanel } from './components/Sidebar/NewContactPanel';
import { SettingsPanel } from './components/Sidebar/SettingsPanel';
import { ContactsListPanel } from './components/Sidebar/ContactsListPanel';
import { ContactInfoModal } from './components/Modals/ContactInfoModal';
import { requestNotificationPermission, initServiceWorker } from './utils/notifications';

type SidebarView = 'chats' | 'settings' | 'new-contact' | 'contacts';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [prefilledHandle, setPrefilledHandle] = useState('');

  // Sidebar in-panel view (replaces modals with WhatsApp Web style in-panel slide!)
  const [sidebarView, setSidebarView] = useState<SidebarView>('chats');

  // Chat State
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Contact Info modal (only when clicking contact name inside chat header)
  const [inspectingContact, setInspectingContact] = useState<User | null>(null);

  // Load authenticated user on mount and request native Chrome notifications permission
  useEffect(() => {
    initServiceWorker().catch(() => {});
    requestNotificationPermission().catch(() => {});

    const user = storage.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    } else {
      storage.restoreSession().then((u) => {
        if (u) setCurrentUser(u);
      });
    }
  }, []);

  // Continuous sync of chats
  const refreshChats = () => {
    if (!currentUser) return;
    const userChats = storage.getUserChats(currentUser.id);
    setChats(userChats);
  };

  useEffect(() => {
    if (!currentUser) return;

    refreshChats();
    const unsubscribe = storage.subscribe(() => {
      refreshChats();
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  // Auth Handlers
  const handleLoginSuccess = (user: User) => {
    requestNotificationPermission().catch(() => {});
    setCurrentUser(user);
    const userChats = storage.getUserChats(user.id);
    setChats(userChats);
    if (userChats.length > 0 && window.innerWidth >= 768) {
      setSelectedChatId(userChats[0].id);
    }
  };

  const handleGoToRegister = () => {
    setAuthView('register');
  };

  const handleGoToLogin = (handle?: string) => {
    if (handle) {
      setPrefilledHandle(handle);
    }
    setAuthView('login');
  };

  const handleLogout = () => {
    storage.setCurrentUser(null);
    setCurrentUser(null);
    setSelectedChatId(null);
    setAuthView('login');
    setSidebarView('chats');
  };

  // Chat Handlers
  const handleSelectChat = (chat: Chat) => {
    setSelectedChatId(chat.id);
    storage.markMessagesAsRead(chat.id, currentUser!.id);
    refreshChats();
  };

  const handleContactAdded = (chat: Chat) => {
    refreshChats();
    setSelectedChatId(chat.id);
    setSidebarView('chats');
  };

  const handleSelectContactFromList = (contact: User) => {
    if (!currentUser) return;
    const chatId = getConversationId(currentUser.id, contact.id);
    const existing = chats.find((c) => c.id === chatId);
    const targetChat: Chat = existing || {
      id: chatId,
      participants: [currentUser.id, contact.id],
      contact: {
        ...contact,
      },
      unreadCount: 0,
      isSaved: true,
      updatedAt: new Date().toISOString(),
    };
    handleSelectChat(targetChat);
    setSidebarView('chats');
  };

  // If user is not authenticated
  if (!currentUser) {
    if (authView === 'register') {
      return <Register onGoToLogin={handleGoToLogin} />;
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onGoToRegister={handleGoToRegister}
        initialHandle={prefilledHandle}
      />
    );
  }

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="fixed inset-0 flex h-full h-[100dvh] w-full bg-slate-100 overflow-hidden font-sans select-none">
      <div className="flex w-full h-full bg-white shadow-2xl overflow-hidden relative">
        {/* Left Side: WhatsApp Web style in-panel views (No modal overlays!) */}
        <div
          className={`w-full md:w-80 lg:w-96 h-full min-h-0 flex-col shrink-0 border-r border-slate-200 overflow-hidden ${
            selectedChatId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {sidebarView === 'chats' && (
            <ChatList
              currentUser={currentUser}
              chats={chats}
              selectedChatId={selectedChatId}
              onSelectChat={handleSelectChat}
              onOpenAddContact={() => setSidebarView('new-contact')}
              onOpenContactsList={() => setSidebarView('contacts')}
              onOpenSettings={() => setSidebarView('settings')}
              onLogout={handleLogout}
              isContinuousSyncing={true}
            />
          )}

          {sidebarView === 'contacts' && (
            <ContactsListPanel
              currentUser={currentUser}
              onBack={() => setSidebarView('chats')}
              onSelectContact={handleSelectContactFromList}
              onOpenAddContact={() => setSidebarView('new-contact')}
            />
          )}

          {sidebarView === 'new-contact' && (
            <NewContactPanel
              currentUser={currentUser}
              onBack={() => setSidebarView('chats')}
              onContactAdded={handleContactAdded}
            />
          )}

          {sidebarView === 'settings' && (
            <SettingsPanel
              currentUser={currentUser}
              onBack={() => setSidebarView('chats')}
              onUpdateUser={(updated) => setCurrentUser(updated)}
              onLogout={handleLogout}
            />
          )}
        </div>

        {/* Right Side: Conversation Area or Desktop Empty State */}
        <div
          className={`flex-1 h-full min-h-0 flex flex-col bg-[#F4F7FB] overflow-hidden relative ${
            !selectedChatId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedChat ? (
            <ChatArea
              key={selectedChat.id}
              chat={selectedChat}
              currentUser={currentUser}
              onBack={() => setSelectedChatId(null)}
              onOpenContactInfo={(contact) => setInspectingContact(contact)}
            />
          ) : (
            /* Desktop Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/70 select-none">
              <div className="max-w-md space-y-4">
                <div className="w-20 h-20 rounded-3xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
                  <MessageSquare className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                    ZapProgramaCerto
                  </h2>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                    Envie e receba mensagens de texto e fotos salvas com segurança em tempo real.
                  </p>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSidebarView('new-contact')}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-sm rounded-xl shadow-sm transition inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Adicionar Novo Contato</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarView('contacts')}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-700 font-medium text-sm rounded-xl transition inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Meus Contatos</span>
                  </button>
                </div>

                <div className="pt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Mensagens criptografadas de ponta a ponta</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contact Details Drawer/Modal (when clicked in chat header) */}
      <ContactInfoModal
        contact={inspectingContact}
        onClose={() => setInspectingContact(null)}
      />
    </div>
  );
}
