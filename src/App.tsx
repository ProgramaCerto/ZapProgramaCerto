import React, { useState, useEffect, useRef, useCallback } from 'react';
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

type RouteType =
  | { type: 'home' }
  | { type: 'login' }
  | { type: 'register' }
  | { type: 'contacts' }
  | { type: 'settings' }
  | { type: 'new-contact' }
  | { type: 'chat'; handle: string };

// Helper de navegação com pushState/replaceState
function navigateToUrl(path: string, replace = false) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === path) return;
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
}

// Helper para ler e normalizar a rota atual do navegador
function parseCurrentRoute(): RouteType {
  if (typeof window === 'undefined') return { type: 'home' };
  const rawPath = window.location.pathname;

  if (rawPath === '/cadastrar-se') {
    return { type: 'register' };
  }
  if (rawPath === '/login') {
    return { type: 'login' };
  }
  if (rawPath === '/contatos' || rawPath === '/ver-contatos') {
    return { type: 'contacts' };
  }
  if (rawPath === '/configuracoes') {
    return { type: 'settings' };
  }
  if (rawPath === '/novo-contato') {
    return { type: 'new-contact' };
  }
  if (rawPath.startsWith('/conversa/')) {
    let rawHandle = rawPath.replace(/^\/conversa\//, '').trim();
    try {
      rawHandle = decodeURIComponent(rawHandle);
    } catch {
      // safe fallback
    }
    if (rawHandle) {
      if (!rawHandle.startsWith('@')) {
        rawHandle = `@${rawHandle}`;
      }
      return { type: 'chat', handle: rawHandle };
    }
  }
  return { type: 'home' };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [prefilledHandle, setPrefilledHandle] = useState('');

  // Sidebar in-panel view
  const [sidebarView, setSidebarView] = useState<SidebarView>('chats');

  // Chat State
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  // Contact Info modal (ao clicar no nome do contato dentro da conversa)
  const [inspectingContact, setInspectingContact] = useState<User | null>(null);

  // Armazena handle pendente para abrir conversa diretamente após login
  const pendingChatHandleRef = useRef<string | null>(null);

  // Continuous sync of chats
  const refreshChats = useCallback(() => {
    const user = currentUser || storage.getCurrentUser();
    if (!user) return;
    const userChats = storage.getUserChats(user.id);
    setChats(userChats);
  }, [currentUser]);

  // Função para abrir conversa por @handle (sem porcentagens ou codificações estranhas)
  const openChatByHandle = useCallback(async (targetHandle: string, userToUse?: User) => {
    const activeUser = userToUse || currentUser || storage.getCurrentUser();
    if (!activeUser) {
      pendingChatHandleRef.current = targetHandle;
      return;
    }

    const cleanHandle = targetHandle.trim().toLowerCase();
    const currentChats = storage.getUserChats(activeUser.id);

    // 1. Procura se já existe chat aberto com esse handle
    const existing = currentChats.find(
      (c) => c.contact.handle.toLowerCase() === cleanHandle
    );

    if (existing) {
      setSelectedChatId(existing.id);
      storage.markMessagesAsRead(existing.id, activeUser.id);
      const displayHandle = existing.contact.handle.startsWith('@') ? existing.contact.handle : `@${existing.contact.handle}`;
      navigateToUrl(`/conversa/${displayHandle}`);
      return;
    }

    // 2. Se não existir na lista rápida, pesquisa no banco de dados Supabase
    try {
      const found = await storage.searchUserByHandle(cleanHandle);
      if (found) {
        const chatId = getConversationId(activeUser.id, found.id);
        const newChat: Chat = {
          id: chatId,
          participants: [activeUser.id, found.id],
          contact: { ...found },
          unreadCount: 0,
          isSaved: true,
          updatedAt: new Date().toISOString(),
        };
        setSelectedChatId(chatId);
        const displayHandle = found.handle.startsWith('@') ? found.handle : `@${found.handle}`;
        navigateToUrl(`/conversa/${displayHandle}`);
        refreshChats();
      }
    } catch (err) {
      console.warn('Erro ao abrir conversa por handle:', err);
    }
  }, [currentUser, refreshChats]);

  // Load authenticated user on mount and request native Chrome notifications permission
  useEffect(() => {
    initServiceWorker().catch(() => {});
    requestNotificationPermission().catch(() => {});

    // Lê a rota inicial da URL
    const initialRoute = parseCurrentRoute();

    const applyUser = (user: User) => {
      setCurrentUser(user);
      const userChats = storage.getUserChats(user.id);
      setChats(userChats);

      if (initialRoute.type === 'chat' && initialRoute.handle) {
        openChatByHandle(initialRoute.handle, user);
      } else if (initialRoute.type === 'contacts') {
        setSidebarView('contacts');
      } else if (initialRoute.type === 'settings') {
        setSidebarView('settings');
      } else if (initialRoute.type === 'new-contact') {
        setSidebarView('new-contact');
      } else if (initialRoute.type === 'login' || initialRoute.type === 'register') {
        navigateToUrl('/', true);
      }
    };

    const user = storage.getCurrentUser();
    if (user) {
      applyUser(user);
    } else {
      // Se não há usuário na memória imediata, tenta restaurar sessão salva
      if (initialRoute.type === 'register') {
        setAuthView('register');
      } else if (initialRoute.type === 'chat' && initialRoute.handle) {
        pendingChatHandleRef.current = initialRoute.handle;
        setAuthView('login');
      } else {
        setAuthView('login');
        if (window.location.pathname === '/') {
          navigateToUrl('/login', true);
        }
      }

      storage.restoreSession().then((restored) => {
        if (restored) {
          applyUser(restored);
        }
      });
    }
  }, [openChatByHandle]);

  // Sincronização contínua com banco de dados
  useEffect(() => {
    if (!currentUser) return;

    refreshChats();
    const unsubscribe = storage.subscribe(() => {
      refreshChats();
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, refreshChats]);

  // Sincroniza a navegação com o botão Voltar / Avançar do navegador (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const current = parseCurrentRoute();
      if (!currentUser) {
        if (current.type === 'register') {
          setAuthView('register');
        } else {
          setAuthView('login');
        }
      } else {
        if (current.type === 'chat' && current.handle) {
          openChatByHandle(current.handle);
        } else if (current.type === 'contacts') {
          setSelectedChatId(null);
          setSidebarView('contacts');
        } else if (current.type === 'settings') {
          setSelectedChatId(null);
          setSidebarView('settings');
        } else if (current.type === 'new-contact') {
          setSelectedChatId(null);
          setSidebarView('new-contact');
        } else if (current.type === 'home') {
          setSelectedChatId(null);
          setSidebarView('chats');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentUser, openChatByHandle]);

  // Auth Handlers
  const handleLoginSuccess = (user: User) => {
    requestNotificationPermission().catch(() => {});
    setCurrentUser(user);
    const userChats = storage.getUserChats(user.id);
    setChats(userChats);
    setSidebarView('chats');
    setSelectedChatId(null);

    // Se havia uma conversa pendente na URL (ex: acessou /conversa/@lucas antes do login), abre ela
    if (pendingChatHandleRef.current) {
      const handleToOpen = pendingChatHandleRef.current;
      pendingChatHandleRef.current = null;
      openChatByHandle(handleToOpen, user);
      return;
    }

    // Autorizou a página -> vai diretamente para a página inicial (/)
    navigateToUrl('/');
  };

  const handleGoToRegister = () => {
    navigateToUrl('/cadastrar-se');
    setAuthView('register');
  };

  const handleGoToLogin = (handle?: string) => {
    if (handle) {
      setPrefilledHandle(handle);
    }
    navigateToUrl('/login');
    setAuthView('login');
  };

  const handleLogout = () => {
    storage.setCurrentUser(null);
    setCurrentUser(null);
    setSelectedChatId(null);
    setAuthView('login');
    setSidebarView('chats');
    navigateToUrl('/login');
  };

  // Painéis do Menu e Navegação de URL
  const handleOpenSettings = () => {
    setSelectedChatId(null);
    setSidebarView('settings');
    navigateToUrl('/configuracoes');
  };

  const handleOpenContacts = () => {
    setSelectedChatId(null);
    setSidebarView('contacts');
    navigateToUrl('/contatos');
  };

  const handleOpenNewContact = () => {
    setSelectedChatId(null);
    setSidebarView('new-contact');
    navigateToUrl('/novo-contato');
  };

  const handleBackToChats = () => {
    setSidebarView('chats');
    setSelectedChatId(null);
    navigateToUrl('/');
  };

  // Chat Handlers
  const handleSelectChat = (chat: Chat) => {
    setSelectedChatId(chat.id);
    storage.markMessagesAsRead(chat.id, currentUser!.id);
    const cleanHandle = chat.contact.handle.startsWith('@') ? chat.contact.handle : `@${chat.contact.handle}`;
    // Limpo na barra de endereços: /conversa/@pessoa (sem %40)
    navigateToUrl(`/conversa/${cleanHandle}`);
    refreshChats();
  };

  const handleContactAdded = (chat: Chat) => {
    refreshChats();
    handleSelectChat(chat);
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
        {/* Left Side: WhatsApp Web style in-panel views */}
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
              onOpenAddContact={handleOpenNewContact}
              onOpenContactsList={handleOpenContacts}
              onOpenSettings={handleOpenSettings}
              onLogout={handleLogout}
              isContinuousSyncing={true}
            />
          )}

          {sidebarView === 'contacts' && (
            <ContactsListPanel
              currentUser={currentUser}
              onBack={handleBackToChats}
              onSelectContact={handleSelectContactFromList}
              onOpenAddContact={handleOpenNewContact}
            />
          )}

          {sidebarView === 'new-contact' && (
            <NewContactPanel
              currentUser={currentUser}
              onBack={handleBackToChats}
              onContactAdded={handleContactAdded}
            />
          )}

          {sidebarView === 'settings' && (
            <SettingsPanel
              currentUser={currentUser}
              onBack={handleBackToChats}
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
              onBack={() => {
                setSelectedChatId(null);
                navigateToUrl('/');
              }}
              onOpenContactInfo={(contact) => setInspectingContact(contact)}
            />
          ) : (
            /* Desktop Empty State (Página Inicial) */
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
                    onClick={handleOpenNewContact}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-sm rounded-xl shadow-sm transition inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Adicionar Novo Contato</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenContacts}
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

      {/* Contact Details Drawer/Modal (ao clicar no nome do cabeçalho da conversa) */}
      <ContactInfoModal
        contact={inspectingContact}
        onClose={() => setInspectingContact(null)}
      />
    </div>
  );
}
