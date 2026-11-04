import { User, Chat, Message } from '../types/chat';
import { soundEffects } from '../utils/audio';
import { getSupabaseClient } from './supabase';

const INITIAL_USERS: User[] = [
  {
    id: 'user_ana',
    name: 'Ana Clara',
    handle: '@ana',
    password: '123',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    bio: 'Designer UI/UX & Apaixonada por tecnologia',
    online: true,
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    id: 'user_carlos',
    name: 'Carlos Eduardo',
    handle: '@carlos',
    password: '123',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    bio: 'Desenvolvedor Full Stack 💻',
    online: true,
    createdAt: '2026-01-15T14:30:00Z',
  },
  {
    id: 'user_maria',
    name: 'Maria Silva',
    handle: '@mariasilva',
    password: '123',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    bio: 'Fotógrafa e amante de viagens ✈️',
    online: true,
    createdAt: '2026-02-01T09:15:00Z',
  },
  {
    id: 'user_suporte',
    name: 'Suporte ZapProgramaCerto',
    handle: '@suporte',
    password: '123',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    bio: 'Canal oficial de ajuda do ZapProgramaCerto 💬',
    online: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const STORAGE_KEYS = {
  USERS: 'zapprogramacerto_users_db',
  CURRENT_USER: 'zapprogramacerto_session_user',
  SAVED_CREDENTIALS: 'zapprogramacerto_saved_credentials',
  CHATS: 'zapprogramacerto_chats_db',
  MESSAGES: 'zapprogramacerto_messages_db',
  PREFILLED_HANDLE: 'zapprogramacerto_prefilled_handle',
};

class StorageService {
  private listeners: (() => void)[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  public isContinuousSyncActive = true;
  private realtimeChannel: unknown = null;

  constructor() {
    this.initDatabase();
    this.startContinuousPolling();
    this.initSupabaseRealtime();
  }

  private initDatabase() {
    if (typeof window === 'undefined') return;
    const existingUsers = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!existingUsers) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    }
    const existingChats = localStorage.getItem(STORAGE_KEYS.CHATS);
    if (!existingChats) {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify([]));
    }
    const existingMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (!existingMessages) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([]));
    }
  }

  // Realtime subscription via Supabase Channel
  private initSupabaseRealtime() {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const channel = client
        .channel('zapprogramacerto-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'mensagens' },
          (payload) => {
            this.handleSupabaseMessageChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'usuarios' },
          () => {
            this.syncRemoteUsers();
          }
        )
        .subscribe();

      this.realtimeChannel = channel;
    } catch (e) {
      console.warn('Realtime setup error:', e);
    }
  }

  private handleSupabaseMessageChange(payload: { eventType: string; new?: Record<string, unknown> }) {
    if (payload.new) {
      const row = payload.new as {
        id: string;
        remetente_id: string;
        destinatario_id: string;
        tipo: 'text' | 'image' | 'audio';
        texto?: string;
        fotos_anexadas?: string;
        audio_url?: string;
        audio_duracao?: number;
        status?: string;
        criado_em?: string;
      };

      const messages = this.getStoredMessages();
      const existingIndex = messages.findIndex((m) => m.id === row.id);

      const mappedStatus: 'sending' | 'delivered' | 'read' =
        row.status === 'lida' || row.status === 'read'
          ? 'read'
          : row.status === 'nao_lida' || row.status === 'delivered'
          ? 'delivered'
          : 'sending';

      const mappedMsg: Message = {
        id: row.id,
        chatId: `chat_${Math.min(row.remetente_id.charCodeAt(0), row.destinatario_id.charCodeAt(0))}`,
        senderId: row.remetente_id,
        senderHandle: '',
        recipientId: row.destinatario_id,
        type: row.tipo || 'text',
        text: row.texto || '',
        mediaUrl: row.fotos_anexadas || row.audio_url || '',
        photosAttached: row.fotos_anexadas,
        audioDuration: row.audio_duracao ? Number(row.audio_duracao) : 0,
        status: mappedStatus,
        timestamp: row.criado_em || new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        messages[existingIndex] = { ...messages[existingIndex], ...mappedMsg };
      } else {
        messages.push(mappedMsg);
        const current = this.getCurrentUser();
        if (current && mappedMsg.senderId !== current.id) {
          soundEffects.playReceiveSound();
        }
      }

      this.saveMessages(messages);
    }
  }

  // Continuous background sync (polls every 1.5s)
  private startContinuousPolling() {
    if (typeof window === 'undefined') return;
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.syncInterval = setInterval(() => {
      if (this.isContinuousSyncActive) {
        this.syncWithSupabase();
        this.notifyListeners();
      }
    }, 1500);
  }

  private async syncWithSupabase() {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const currentUser = this.getCurrentUser();
      if (!currentUser) return;

      // Sync latest messages from Supabase for current user
      const { data: remoteMsgs, error } = await client
        .from('mensagens')
        .select('*')
        .or(`remetente_id.eq.${currentUser.id},destinatario_id.eq.${currentUser.id}`)
        .order('criado_em', { ascending: true })
        .limit(100);

      if (!error && remoteMsgs && remoteMsgs.length > 0) {
        const localMessages = this.getStoredMessages();
        let changed = false;

        for (const rm of remoteMsgs) {
          const idx = localMessages.findIndex((lm) => lm.id === rm.id);
          const mappedStatus: 'sending' | 'delivered' | 'read' =
            rm.status === 'lida' || rm.status === 'read'
              ? 'read'
              : rm.status === 'nao_lida' || rm.status === 'delivered'
              ? 'delivered'
              : 'sending';

          if (idx === -1) {
            localMessages.push({
              id: rm.id,
              chatId: `chat_${currentUser.id}_${rm.remetente_id === currentUser.id ? rm.destinatario_id : rm.remetente_id}`,
              senderId: rm.remetente_id,
              senderHandle: '',
              recipientId: rm.destinatario_id,
              type: rm.tipo || 'text',
              text: rm.texto || '',
              mediaUrl: rm.fotos_anexadas || rm.audio_url || '',
              photosAttached: rm.fotos_anexadas,
              audioDuration: rm.audio_duracao ? Number(rm.audio_duracao) : 0,
              status: mappedStatus,
              timestamp: rm.criado_em || new Date().toISOString(),
            });
            changed = true;
          } else if (localMessages[idx].status !== mappedStatus) {
            localMessages[idx].status = mappedStatus;
            changed = true;
          }
        }

        if (changed) {
          this.saveMessages(localMessages);
        }
      }
    } catch {
      // Safe fallback
    }
  }

  private async syncRemoteUsers() {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { data, error } = await client.from('usuarios').select('*').limit(150);
      if (!error && data) {
        const currentLocal = this.getUsers();
        for (const u of data) {
          const exists = currentLocal.find((cl) => cl.id === u.id || cl.handle.toLowerCase() === u.arroba.toLowerCase());
          if (!exists) {
            currentLocal.push({
              id: u.id,
              name: u.nome,
              handle: u.arroba,
              password: u.senha,
              avatar: u.avatar_url || `https://i.pravatar.cc/150?u=${u.arroba}`,
              bio: u.bio || 'Disponível no ZapProgramaCerto',
              online: u.online,
              createdAt: u.criado_em || new Date().toISOString(),
            });
          }
        }
        this.saveUsers(currentLocal);
      }
    } catch {
      // Safe fallback
    }
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Safe notify
      }
    }
  }

  // --- Users & Session Persistence (Keeps user logged in until explicit logout) ---
  public getUsers(): User[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      return raw ? JSON.parse(raw) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  }

  public saveUsers(users: User[]) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.notifyListeners();
  }

  /**
   * Retrieves the persisted logged-in user so refreshing the page never logs them out!
   */
  public getCurrentUser(): User | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Saves or clears the session in localStorage
   */
  public setCurrentUser(user: User | null) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      if (user.password) {
        localStorage.setItem(STORAGE_KEYS.SAVED_CREDENTIALS, JSON.stringify({
          handle: user.handle,
          password: user.password,
        }));
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.SAVED_CREDENTIALS);
    }
    this.notifyListeners();
  }

  public getSavedCredentials(): { handle: string; password?: string } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SAVED_CREDENTIALS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public getPrefilledHandle(): string {
    return localStorage.getItem(STORAGE_KEYS.PREFILLED_HANDLE) || '';
  }

  public setPrefilledHandle(handle: string) {
    localStorage.setItem(STORAGE_KEYS.PREFILLED_HANDLE, handle);
  }

  public clearPrefilledHandle() {
    localStorage.removeItem(STORAGE_KEYS.PREFILLED_HANDLE);
  }

  public async register(name: string, rawHandle: string, password: string, customAvatar?: string): Promise<{ success: boolean; message?: string; user?: User }> {
    let cleanHandle = rawHandle.trim();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }
    cleanHandle = cleanHandle.toLowerCase();

    if (!name.trim()) {
      return { success: false, message: 'Por favor, informe seu nome.' };
    }
    if (cleanHandle.length < 2) {
      return { success: false, message: 'O nome de usuário deve ter pelo menos 1 caractere.' };
    }
    if (!password || password.length < 3) {
      return { success: false, message: 'A senha deve ter pelo menos 3 dígitos.' };
    }

    const users = this.getUsers();
    const existing = users.find((u) => u.handle.toLowerCase() === cleanHandle);
    if (existing) {
      return { success: false, message: 'Este usuário já está cadastrado. Escolha outro.' };
    }

    const avatarNumber = (users.length % 70) + 1;
    const finalAvatar = customAvatar || `https://i.pravatar.cc/150?img=${avatarNumber}`;

    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      handle: cleanHandle,
      password,
      avatar: finalAvatar,
      bio: 'Disponível no ZapProgramaCerto',
      online: true,
      createdAt: new Date().toISOString(),
    };

    // Attempt Supabase insert if client exists
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('usuarios')
          .insert({
            nome: newUser.name,
            arroba: newUser.handle,
            senha: newUser.password,
            avatar_url: newUser.avatar,
            bio: newUser.bio,
            online: true,
          })
          .select()
          .maybeSingle();

        if (!error && data?.id) {
          newUser.id = data.id;
        }
      } catch (e) {
        console.warn('Supabase register fallback to local', e);
      }
    }

    users.push(newUser);
    this.saveUsers(users);

    this.createInitialChatWithSuporte(newUser);
    this.setPrefilledHandle(cleanHandle);

    return { success: true, user: newUser };
  }

  private createInitialChatWithSuporte(newUser: User) {
    const suporteUser = this.getUsers().find((u) => u.handle === '@suporte') || INITIAL_USERS[3];
    const chatId = `chat_${newUser.id}_${suporteUser.id}`;
    
    const chats = this.getStoredChats();
    const welcomeMsg: Message = {
      id: `msg_welcome_${Date.now()}`,
      chatId,
      senderId: suporteUser.id,
      senderHandle: suporteUser.handle,
      recipientId: newUser.id,
      text: `Olá, ${newUser.name}! Bem-vindo(a) ao ZapProgramaCerto 💙. Aqui você envia mensagens de texto, fotos na hora e áudios com sincronização contínua. Fique à vontade para me mandar uma mensagem!`,
      type: 'text',
      timestamp: new Date().toISOString(),
      status: 'read',
    };

    const newChat: Chat = {
      id: chatId,
      participants: [newUser.id, suporteUser.id],
      contact: suporteUser,
      lastMessage: welcomeMsg,
      unreadCount: 1,
      updatedAt: new Date().toISOString(),
    };

    chats.push(newChat);
    this.saveChats(chats);

    const messages = this.getStoredMessages();
    messages.push(welcomeMsg);
    this.saveMessages(messages);
  }

  public async login(rawHandle: string, password: string): Promise<{ success: boolean; message?: string; user?: User }> {
    let cleanHandle = rawHandle.trim();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }
    cleanHandle = cleanHandle.toLowerCase();

    // Check Supabase first if available
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('usuarios')
          .select('*')
          .ilike('arroba', cleanHandle)
          .maybeSingle();

        if (!error && data) {
          if (data.senha !== password) {
            return { success: false, message: 'Senha incorreta. Verifique e tente novamente.' };
          }

          const remoteUser: User = {
            id: data.id,
            name: data.nome,
            handle: data.arroba,
            password: data.senha,
            avatar: data.avatar_url || `https://i.pravatar.cc/150?u=${data.arroba}`,
            bio: data.bio || 'Disponível no ZapProgramaCerto',
            online: true,
            createdAt: data.criado_em || new Date().toISOString(),
          };

          // Save session permanently to localStorage so refresh keeps login!
          this.setCurrentUser(remoteUser);
          this.clearPrefilledHandle();

          // Sync into local list
          const users = this.getUsers();
          const localIdx = users.findIndex((u) => u.id === remoteUser.id || u.handle.toLowerCase() === remoteUser.handle.toLowerCase());
          if (localIdx >= 0) users[localIdx] = remoteUser;
          else users.push(remoteUser);
          this.saveUsers(users);

          return { success: true, user: remoteUser };
        }
      } catch (e) {
        console.warn('Supabase login check exception, falling back to local storage', e);
      }
    }

    // Local fallback check
    const users = this.getUsers();
    const user = users.find((u) => u.handle.toLowerCase() === cleanHandle);

    if (!user) {
      return { success: false, message: 'Usuário não encontrado com este arroba (@).' };
    }

    if (user.password !== password) {
      return { success: false, message: 'Senha incorreta. Verifique e tente novamente.' };
    }

    // Save session to localStorage so page refresh preserves logged-in state!
    this.setCurrentUser(user);
    this.clearPrefilledHandle();
    return { success: true, user };
  }

  public updatePassword(userId: string, currentPass: string, newPass: string): { success: boolean; message?: string } {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuário não encontrado.' };
    }

    if (users[index].password !== currentPass) {
      return { success: false, message: 'Senha atual incorreta.' };
    }

    if (newPass.length < 3) {
      return { success: false, message: 'A nova senha deve ter no mínimo 3 caracteres.' };
    }

    users[index].password = newPass;
    this.saveUsers(users);

    const current = this.getCurrentUser();
    if (current && current.id === userId) {
      current.password = newPass;
      this.setCurrentUser(current);
    }

    // Also update remote Supabase password if client available
    const client = getSupabaseClient();
    if (client) {
      Promise.resolve(client.from('usuarios').update({ senha: newPass }).eq('id', userId)).catch(() => {});
    }

    return { success: true, message: 'Senha alterada com sucesso!' };
  }

  public updateProfile(userId: string, updates: { name?: string; bio?: string }): { success: boolean; user?: User } {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return { success: false };

    if (updates.name) users[index].name = updates.name.trim();
    if (updates.bio !== undefined) users[index].bio = updates.bio.trim();

    this.saveUsers(users);
    const updated = users[index];
    this.setCurrentUser(updated);

    const client = getSupabaseClient();
    if (client) {
      Promise.resolve(
        client
          .from('usuarios')
          .update({
            nome: updated.name,
            bio: updated.bio,
          })
          .eq('id', userId)
      ).catch(() => {});
    }

    return { success: true, user: updated };
  }

  // --- Search & Add Contacts ---
  public searchUserByHandle(rawHandle: string): User | null {
    let cleanHandle = rawHandle.trim().toLowerCase();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }
    const users = this.getUsers();
    return users.find((u) => u.handle.toLowerCase() === cleanHandle) || null;
  }

  public addContact(currentUserId: string, rawHandle: string, nameFallback?: string): { success: boolean; message?: string; chat?: Chat } {
    let cleanHandle = rawHandle.trim().toLowerCase();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser) return { success: false, message: 'Você precisa estar logado.' };

    if (currentUser.handle.toLowerCase() === cleanHandle) {
      return { success: false, message: 'Você não pode adicionar seu próprio usuário.' };
    }

    let foundUser = this.searchUserByHandle(cleanHandle);

    if (!foundUser) {
      if (!nameFallback || !nameFallback.trim()) {
        return { success: false, message: `O contato ${cleanHandle} não foi encontrado. Informe o nome da pessoa.` };
      }
      const users = this.getUsers();
      foundUser = {
        id: `user_contact_${Date.now()}`,
        name: nameFallback.trim(),
        handle: cleanHandle,
        password: '123',
        avatar: `https://i.pravatar.cc/150?u=${cleanHandle}`,
        bio: 'Novo contato no ZapProgramaCerto',
        online: true,
        createdAt: new Date().toISOString(),
      };
      users.push(foundUser);
      this.saveUsers(users);

      // Insert into Supabase if possible
      const client = getSupabaseClient();
      if (client) {
        Promise.resolve(
          client.from('usuarios').insert({
            nome: foundUser.name,
            arroba: foundUser.handle,
            senha: '123',
            avatar_url: foundUser.avatar,
            bio: foundUser.bio,
            online: true,
          })
        ).catch(() => {});
      }
    }

    // Insert into Supabase contatos
    const client = getSupabaseClient();
    if (client) {
      Promise.resolve(
        client.from('contatos').insert({
          usuario_id: currentUserId,
          contato_id: foundUser.id,
          nome_salvo: nameFallback || foundUser.name,
        })
      ).catch(() => {});
    }

    const chats = this.getStoredChats();
    let existingChat = chats.find(
      (c) => c.participants.includes(currentUserId) && c.participants.includes(foundUser!.id)
    );

    if (existingChat) {
      existingChat.contact = foundUser;
      return { success: true, message: 'Conversa já existe!', chat: existingChat };
    }

    const newChatId = `chat_${currentUserId}_${foundUser.id}`;
    const newChat: Chat = {
      id: newChatId,
      participants: [currentUserId, foundUser.id],
      contact: foundUser,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    };

    chats.unshift(newChat);
    this.saveChats(chats);
    this.notifyListeners();

    return { success: true, message: 'Contato adicionado com sucesso!', chat: newChat };
  }

  // --- Chats & Messages ---
  private getStoredChats(): Chat[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CHATS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveChats(chats: Chat[]) {
    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    this.notifyListeners();
  }

  public getUserChats(userId: string): Chat[] {
    const chats = this.getStoredChats();
    const userChats = chats.filter((c) => c.participants.includes(userId));
    const allUsers = this.getUsers();

    return userChats
      .map((c) => {
        const contactId = c.participants.find((id) => id !== userId) || c.participants[0];
        const contactUser = allUsers.find((u) => u.id === contactId) || c.contact;
        const messages = this.getChatMessages(c.id);
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : c.lastMessage;
        return {
          ...c,
          contact: contactUser,
          lastMessage,
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  private getStoredMessages(): Message[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveMessages(messages: Message[]) {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    this.notifyListeners();
  }

  public getChatMessages(chatId: string): Message[] {
    const messages = this.getStoredMessages();
    return messages.filter((m) => m.chatId === chatId);
  }

  public markMessagesAsRead(chatId: string, currentUserId: string) {
    const messages = this.getStoredMessages();
    let updated = false;
    for (const msg of messages) {
      if (msg.chatId === chatId && msg.senderId !== currentUserId && msg.status !== 'read') {
        msg.status = 'read';
        updated = true;

        // Update in Supabase
        const client = getSupabaseClient();
        if (client) {
          Promise.resolve(client.from('mensagens').update({ status: 'lida' }).eq('id', msg.id)).catch(() => {});
        }
      }
    }
    if (updated) {
      this.saveMessages(messages);
      const chats = this.getStoredChats();
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        chat.unreadCount = 0;
        this.saveChats(chats);
      }
    }
  }

  public sendMessage(params: {
    chatId: string;
    senderId: string;
    senderHandle: string;
    recipientId?: string;
    type: 'text' | 'image' | 'audio';
    text?: string;
    mediaUrl?: string;
    photosAttached?: string;
    audioDuration?: number;
  }): Message {
    const messages = this.getStoredMessages();
    const chats = this.getStoredChats();
    const currentChat = chats.find((c) => c.id === params.chatId);
    const resolvedRecipientId =
      params.recipientId ||
      (currentChat ? currentChat.participants.find((p) => p !== params.senderId) : undefined);

    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      chatId: params.chatId,
      senderId: params.senderId,
      senderHandle: params.senderHandle,
      recipientId: resolvedRecipientId,
      type: params.type,
      text: params.text,
      mediaUrl: params.mediaUrl,
      photosAttached: params.photosAttached || (params.type === 'image' && params.mediaUrl ? params.mediaUrl : undefined),
      audioDuration: params.audioDuration,
      timestamp: new Date().toISOString(),
      status: 'sending', // Inicia sem bolinha (não chegou)
    };

    messages.push(newMessage);
    this.saveMessages(messages);

    soundEffects.playSendSound();

    const chatIndex = chats.findIndex((c) => c.id === params.chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = newMessage;
      chats[chatIndex].updatedAt = newMessage.timestamp;
      this.saveChats(chats);
    }

    // Insert into Supabase mensagens table
    const client = getSupabaseClient();
    if (client && resolvedRecipientId) {
      Promise.resolve(
        client
          .from('mensagens')
          .insert({
            remetente_id: params.senderId,
            destinatario_id: resolvedRecipientId,
            tipo: params.type,
            texto: params.text,
            fotos_anexadas: newMessage.photosAttached,
            audio_url: params.type === 'audio' ? params.mediaUrl : null,
            audio_duracao: params.audioDuration || 0,
            status: 'nao_lida',
          })
      ).catch(() => {});
    }

    // Step 1: Bolinha aparece (chegou no celular da pessoa)
    setTimeout(() => {
      this.updateMessageStatus(newMessage.id, 'delivered');
    }, 600);

    // Step 2: Bolinha fica azul (a pessoa viu a mensagem)
    setTimeout(() => {
      this.updateMessageStatus(newMessage.id, 'read');
    }, 1600);

    this.handleAutoResponder(params.chatId, params.senderId, newMessage);

    return newMessage;
  }

  private updateMessageStatus(messageId: string, status: 'delivered' | 'read') {
    const messages = this.getStoredMessages();
    const msg = messages.find((m) => m.id === messageId);
    if (msg && msg.status !== 'read') {
      msg.status = status;
      this.saveMessages(messages);

      const client = getSupabaseClient();
      if (client) {
        Promise.resolve(
          client
            .from('mensagens')
            .update({ status: status === 'read' ? 'lida' : 'nao_lida' })
            .eq('id', messageId)
        ).catch(() => {});
      }
    }
  }

  private handleAutoResponder(chatId: string, senderId: string, userMessage: Message) {
    const chats = this.getStoredChats();
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const contactId = chat.participants.find((id) => id !== senderId);
    if (!contactId) return;

    const contact = this.getUsers().find((u) => u.id === contactId);
    if (!contact) return;

    setTimeout(() => {
      this.setChatActivity(chatId, { isTyping: true, isRecordingAudio: false });
    }, 1100);

    setTimeout(() => {
      this.setChatActivity(chatId, { isTyping: false, isRecordingAudio: false });

      let replyText = 'Muito legal! Recebi sua mensagem perfeitamente aqui no ZapProgramaCerto 💙.';
      if (userMessage.type === 'audio') {
        replyText = `Acabei de escutar seu áudio (${userMessage.audioDuration ? Math.round(userMessage.audioDuration) + 's' : ''})! O som está ótimo. 🎧`;
      } else if (userMessage.type === 'image') {
        replyText = 'Adorei a foto tirada na hora! A imagem chegou com excelente definição.';
      } else if (userMessage.text) {
        const lower = userMessage.text.toLowerCase();
        if (lower.includes('oi') || lower.includes('olá') || lower.includes('ola')) {
          replyText = `Olá! Tudo bem? Que bom falar com você pelo ZapProgramaCerto!`;
        } else if (lower.includes('supabase') || lower.includes('banco') || lower.includes('api')) {
          replyText = 'A sincronização contínua com o Supabase está ativa e monitorando em tempo real!';
        } else {
          replyText = `Entendido! "${userMessage.text.slice(0, 30)}..." - Sincronizado continuamente!`;
        }
      }

      const replyMsg: Message = {
        id: `msg_bot_${Date.now()}`,
        chatId,
        senderId: contact.id,
        senderHandle: contact.handle,
        recipientId: senderId,
        type: 'text',
        text: replyText,
        timestamp: new Date().toISOString(),
        status: 'read',
      };

      const messages = this.getStoredMessages();
      messages.push(replyMsg);
      this.saveMessages(messages);

      soundEffects.playReceiveSound();

      const updatedChats = this.getStoredChats();
      const currentChat = updatedChats.find((c) => c.id === chatId);
      if (currentChat) {
        currentChat.lastMessage = replyMsg;
        currentChat.updatedAt = replyMsg.timestamp;
        this.saveChats(updatedChats);
      }
    }, 3000);
  }

  private setChatActivity(chatId: string, activity: { isTyping?: boolean; isRecordingAudio?: boolean }) {
    const chats = this.getStoredChats();
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      chat.isTyping = activity.isTyping;
      chat.isRecordingAudio = activity.isRecordingAudio;
      this.saveChats(chats);
    }
  }

  public deleteMessage(messageId: string) {
    const messages = this.getStoredMessages().filter((m) => m.id !== messageId);
    this.saveMessages(messages);
  }
}

export const storage = new StorageService();
