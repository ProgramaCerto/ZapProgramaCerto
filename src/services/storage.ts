import { User, Chat, Message } from '../types/chat';
import { soundEffects } from '../utils/audio';
import { getSupabaseClient } from './supabase';
import { uploadPhotoToSupabase } from './storageUpload';

const STORAGE_KEYS = {
  USERS: 'zapprogramacerto_users_db',
  CURRENT_USER: 'zapprogramacerto_session_user',
  SAVED_CREDENTIALS: 'zapprogramacerto_saved_credentials',
  SAVED_CONTACTS: 'zapprogramacerto_saved_contacts',
  CHATS: 'zapprogramacerto_chats_db',
  MESSAGES: 'zapprogramacerto_messages_db',
  PREFILLED_HANDLE: 'zapprogramacerto_prefilled_handle',
};

export function getConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `chat_${sorted[0]}_${sorted[1]}`;
}

export interface SavedContact {
  id?: string;
  usuario_id: string;
  contato_id: string;
  nome_salvo: string;
}

class StorageService {
  private listeners: (() => void)[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  public isContinuousSyncActive = true;

  constructor() {
    this.initDatabase();
    this.startContinuousPolling();
    this.initSupabaseRealtime();
  }

  private initDatabase() {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CHATS)) {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SAVED_CONTACTS)) {
      localStorage.setItem(STORAGE_KEYS.SAVED_CONTACTS, JSON.stringify([]));
    }

    // Clean up any remaining legacy bot contacts or messages
    try {
      const msgs = this.getStoredMessages().filter(
        (m) => !m.senderId.includes('bot') && m.senderHandle !== '@suporte'
      );
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));

      const users = this.getUsers().filter((u) => u.handle !== '@suporte' && u.id !== 'user_suporte');
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch {
      // Safe
    }
  }

  // Realtime subscription via Supabase Channel
  private initSupabaseRealtime() {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      client
        .channel('zapprogramacerto-realtime-live')
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
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'contatos' },
          () => {
            this.syncRemoteContacts();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription error:', e);
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

      const chatId = getConversationId(row.remetente_id, row.destinatario_id);

      const mappedMsg: Message = {
        id: row.id,
        chatId,
        senderId: row.remetente_id,
        senderHandle: '',
        recipientId: row.destinatario_id,
        type: row.tipo || (row.fotos_anexadas ? 'image' : row.audio_url ? 'audio' : 'text'),
        text: row.texto || '',
        mediaUrl: row.fotos_anexadas || row.audio_url || '',
        photosAttached: row.fotos_anexadas,
        audioDuration: row.audio_duracao ? Number(row.audio_duracao) : 0,
        status: mappedStatus,
        timestamp: row.criado_em || new Date().toISOString(),
      };

      const currentUser = this.getCurrentUser();

      if (existingIndex >= 0) {
        messages[existingIndex] = { ...messages[existingIndex], ...mappedMsg };
      } else {
        messages.push(mappedMsg);
        if (currentUser && mappedMsg.recipientId === currentUser.id) {
          soundEffects.playReceiveSound();
          // Update status to delivered in Supabase
          if (row.status !== 'lida') {
            const client = getSupabaseClient();
            if (client) {
              Promise.resolve(
                client.from('mensagens').update({ status: 'nao_lida' }).eq('id', row.id)
              ).catch(() => {});
            }
          }
        }
      }

      this.saveMessages(messages);
      this.ensureUserCached(row.remetente_id);
      this.notifyListeners();
    }
  }

  // Polling loop for background synchronization
  private startContinuousPolling() {
    if (typeof window === 'undefined') return;
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.syncInterval = setInterval(() => {
      if (this.isContinuousSyncActive) {
        this.syncWithSupabase();
        this.notifyListeners();
      }
    }, 1200);
  }

  private async syncWithSupabase() {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const currentUser = this.getCurrentUser();
      if (!currentUser) return;

      // Sync users & contacts first
      await this.syncRemoteUsers();
      await this.syncRemoteContacts();

      // Sync latest messages for current user
      const { data: remoteMsgs, error } = await client
        .from('mensagens')
        .select('*')
        .or(`remetente_id.eq.${currentUser.id},destinatario_id.eq.${currentUser.id}`)
        .order('criado_em', { ascending: true })
        .limit(150);

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

          const chatId = getConversationId(rm.remetente_id, rm.destinatario_id);

          if (idx === -1) {
            localMessages.push({
              id: rm.id,
              chatId,
              senderId: rm.remetente_id,
              senderHandle: '',
              recipientId: rm.destinatario_id,
              type: rm.tipo || (rm.fotos_anexadas ? 'image' : rm.audio_url ? 'audio' : 'text'),
              text: rm.texto || '',
              mediaUrl: rm.fotos_anexadas || rm.audio_url || '',
              photosAttached: rm.fotos_anexadas,
              audioDuration: rm.audio_duracao ? Number(rm.audio_duracao) : 0,
              status: mappedStatus,
              timestamp: rm.criado_em || new Date().toISOString(),
            });
            changed = true;

            // Make sure the contact user profile is cached locally
            this.ensureUserCached(rm.remetente_id === currentUser.id ? rm.destinatario_id : rm.remetente_id);

            if (rm.destinatario_id === currentUser.id) {
              soundEffects.playReceiveSound();
            }
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
      const { data, error } = await client.from('usuarios').select('*').limit(200);
      if (!error && data) {
        const local = this.getUsers();
        let changed = false;

        for (const u of data) {
          const idx = local.findIndex((l) => l.id === u.id);
          const mappedUser: User = {
            id: u.id,
            name: u.nome,
            handle: u.arroba,
            password: u.senha,
            avatar: u.avatar_url || '',
            bio: u.bio || 'Disponível no ZapProgramaCerto',
            online: u.online,
            createdAt: u.criado_em || new Date().toISOString(),
          };

          if (idx === -1) {
            local.push(mappedUser);
            changed = true;
          } else if (
            local[idx].name !== mappedUser.name ||
            local[idx].avatar !== mappedUser.avatar ||
            local[idx].bio !== mappedUser.bio
          ) {
            local[idx] = { ...local[idx], ...mappedUser };
            changed = true;
          }
        }

        if (changed) {
          this.saveUsers(local);
        }
      }
    } catch {
      // Safe
    }
  }

  private async syncRemoteContacts() {
    const client = getSupabaseClient();
    if (!client) return;
    const currentUser = this.getCurrentUser();
    if (!currentUser) return;

    try {
      const { data, error } = await client
        .from('contatos')
        .select('*')
        .eq('usuario_id', currentUser.id);

      if (!error && data) {
        localStorage.setItem(STORAGE_KEYS.SAVED_CONTACTS, JSON.stringify(data));
      }
    } catch {
      // Safe
    }
  }

  private async ensureUserCached(userId: string) {
    const users = this.getUsers();
    if (users.find((u) => u.id === userId)) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data, error } = await client.from('usuarios').select('*').eq('id', userId).maybeSingle();
      if (!error && data) {
        const mappedUser: User = {
          id: data.id,
          name: data.nome,
          handle: data.arroba,
          password: data.senha,
          avatar: data.avatar_url || '',
          bio: data.bio || 'Disponível no ZapProgramaCerto',
          online: data.online,
          createdAt: data.criado_em || new Date().toISOString(),
        };
        const current = this.getUsers();
        current.push(mappedUser);
        this.saveUsers(current);
      }
    } catch {
      // Safe
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

  // --- Users & Session Persistence ---
  public getUsers(): User[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public saveUsers(users: User[]) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    this.notifyListeners();
  }

  public getCurrentUser(): User | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public setCurrentUser(user: User | null) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      if (user.password) {
        localStorage.setItem(
          STORAGE_KEYS.SAVED_CREDENTIALS,
          JSON.stringify({
            handle: user.handle,
            password: user.password,
          })
        );
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.SAVED_CREDENTIALS);
    }
    this.notifyListeners();
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

  // --- Register & Login ---
  public async register(
    name: string,
    rawHandle: string,
    password: string,
    customAvatar?: string
  ): Promise<{ success: boolean; message?: string; user?: User }> {
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

    const client = getSupabaseClient();
    if (client) {
      try {
        const { data: existing } = await client
          .from('usuarios')
          .select('id')
          .ilike('arroba', cleanHandle)
          .maybeSingle();

        if (existing) {
          return { success: false, message: 'Este usuário já está cadastrado. Escolha outro.' };
        }
      } catch {
        // Safe
      }
    }

    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      handle: cleanHandle,
      password,
      avatar: customAvatar || '',
      bio: 'Disponível no ZapProgramaCerto',
      online: true,
      createdAt: new Date().toISOString(),
    };

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
        console.warn('Supabase register error, using generated id', e);
      }
    }

    const users = this.getUsers();
    users.push(newUser);
    this.saveUsers(users);

    this.setPrefilledHandle(cleanHandle);
    return { success: true, user: newUser };
  }

  public async login(
    rawHandle: string,
    password: string
  ): Promise<{ success: boolean; message?: string; user?: User }> {
    let cleanHandle = rawHandle.trim();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }
    cleanHandle = cleanHandle.toLowerCase();

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
            avatar: data.avatar_url || '',
            bio: data.bio || 'Disponível no ZapProgramaCerto',
            online: true,
            createdAt: data.criado_em || new Date().toISOString(),
          };

          this.setCurrentUser(remoteUser);
          this.clearPrefilledHandle();

          const users = this.getUsers();
          const localIdx = users.findIndex((u) => u.id === remoteUser.id);
          if (localIdx >= 0) users[localIdx] = remoteUser;
          else users.push(remoteUser);
          this.saveUsers(users);

          return { success: true, user: remoteUser };
        }
      } catch (e) {
        console.warn('Supabase login check fallback', e);
      }
    }

    // Local fallback
    const users = this.getUsers();
    const user = users.find((u) => u.handle.toLowerCase() === cleanHandle);

    if (!user) {
      return { success: false, message: 'Usuário não encontrado com este arroba (@).' };
    }
    if (user.password !== password) {
      return { success: false, message: 'Senha incorreta. Verifique e tente novamente.' };
    }

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

    const client = getSupabaseClient();
    if (client) {
      Promise.resolve(client.from('usuarios').update({ senha: newPass }).eq('id', userId)).catch(() => {});
    }

    return { success: true, message: 'Senha alterada com sucesso!' };
  }

  public updateProfile(
    userId: string,
    updates: { name?: string; bio?: string; avatar?: string }
  ): { success: boolean; user?: User } {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return { success: false };

    if (updates.name) users[index].name = updates.name.trim();
    if (updates.bio !== undefined) users[index].bio = updates.bio.trim();
    if (updates.avatar !== undefined) users[index].avatar = updates.avatar;

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
            avatar_url: updated.avatar,
          })
          .eq('id', userId)
      ).catch(() => {});
    }

    return { success: true, user: updated };
  }

  // --- Saved Contacts Management ---
  public getSavedContacts(): SavedContact[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SAVED_CONTACTS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public async saveContact(
    usuarioId: string,
    contatoId: string,
    nomeSalvo: string
  ): Promise<{ success: boolean; message?: string }> {
    const contacts = this.getSavedContacts();
    const idx = contacts.findIndex(
      (c) => c.usuario_id === usuarioId && c.contato_id === contatoId
    );

    if (idx >= 0) {
      contacts[idx].nome_salvo = nomeSalvo.trim();
    } else {
      contacts.push({
        usuario_id: usuarioId,
        contato_id: contatoId,
        nome_salvo: nomeSalvo.trim(),
      });
    }

    localStorage.setItem(STORAGE_KEYS.SAVED_CONTACTS, JSON.stringify(contacts));

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('contatos').upsert(
          {
            usuario_id: usuarioId,
            contato_id: contatoId,
            nome_salvo: nomeSalvo.trim(),
          },
          { onConflict: 'usuario_id,contato_id' }
        );
      } catch (e) {
        console.warn('Error saving contact to Supabase:', e);
      }
    }

    this.notifyListeners();
    return { success: true, message: 'Contato salvo com sucesso!' };
  }

  // Search User by Handle in Supabase
  public async searchUserByHandle(rawHandle: string): Promise<User | null> {
    let cleanHandle = rawHandle.trim().toLowerCase();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('usuarios')
          .select('*')
          .ilike('arroba', cleanHandle)
          .maybeSingle();

        if (!error && data) {
          const user: User = {
            id: data.id,
            name: data.nome,
            handle: data.arroba,
            avatar: data.avatar_url || '',
            bio: data.bio || '',
            online: data.online,
            createdAt: data.criado_em || new Date().toISOString(),
          };
          const users = this.getUsers();
          const idx = users.findIndex((u) => u.id === user.id);
          if (idx >= 0) users[idx] = user;
          else users.push(user);
          this.saveUsers(users);

          return user;
        }
      } catch {
        // Safe
      }
    }

    const users = this.getUsers();
    return users.find((u) => u.handle.toLowerCase() === cleanHandle) || null;
  }

  // Add Contact action from user
  public async addContact(
    currentUserId: string,
    rawHandle: string,
    nomeSalvo: string
  ): Promise<{ success: boolean; message?: string; chat?: Chat }> {
    let cleanHandle = rawHandle.trim().toLowerCase();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`;
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser) return { success: false, message: 'Você precisa estar logado.' };

    if (currentUser.handle.toLowerCase() === cleanHandle) {
      return { success: false, message: 'Você não pode adicionar seu próprio usuário.' };
    }

    const targetUser = await this.searchUserByHandle(cleanHandle);
    if (!targetUser) {
      return {
        success: false,
        message: `Nenhum usuário foi encontrado com o arroba ${cleanHandle}. Verifique e tente novamente.`,
      };
    }

    // Save contact relation
    await this.saveContact(currentUserId, targetUser.id, nomeSalvo.trim() || targetUser.name);

    const chatId = getConversationId(currentUserId, targetUser.id);
    const newChat: Chat = {
      id: chatId,
      participants: [currentUserId, targetUser.id],
      contact: { ...targetUser, name: nomeSalvo.trim() || targetUser.name },
      isSaved: true,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    };

    this.notifyListeners();
    return { success: true, message: 'Contato adicionado!', chat: newChat };
  }

  // --- Realtime Chats & Messages between humans ---
  public getStoredMessages(): Message[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public saveMessages(messages: Message[]) {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    this.notifyListeners();
  }

  public getChatMessages(chatId: string): Message[] {
    const messages = this.getStoredMessages();
    return messages.filter((m) => m.chatId === chatId);
  }

  /**
   * Builds the real list of conversations dynamically from messages and saved contacts
   */
  public getUserChats(userId: string): Chat[] {
    const messages = this.getStoredMessages();
    const allUsers = this.getUsers();
    const savedContacts = this.getSavedContacts();

    // Map of partnerId -> Chat
    const chatMap = new Map<string, Chat>();

    // 1. Process all contacts saved by current user
    for (const sc of savedContacts) {
      if (sc.usuario_id === userId) {
        const partner = allUsers.find((u) => u.id === sc.contato_id) || {
          id: sc.contato_id,
          name: sc.nome_salvo,
          handle: '',
          avatar: '',
          createdAt: new Date().toISOString(),
        };

        const chatId = getConversationId(userId, sc.contato_id);
        chatMap.set(sc.contato_id, {
          id: chatId,
          participants: [userId, sc.contato_id],
          contact: { ...partner, name: sc.nome_salvo },
          isSaved: true,
          unreadCount: 0,
          updatedAt: new Date(0).toISOString(),
        });
      }
    }

    // 2. Process all messages to/from current user
    for (const msg of messages) {
      const isSender = msg.senderId === userId;
      const partnerId = isSender ? msg.recipientId : msg.senderId;

      if (!partnerId || partnerId === userId) continue;

      const chatId = getConversationId(userId, partnerId);
      const isSaved = savedContacts.some(
        (sc) => sc.usuario_id === userId && sc.contato_id === partnerId
      );
      const savedRelation = savedContacts.find(
        (sc) => sc.usuario_id === userId && sc.contato_id === partnerId
      );

      const partnerUser = allUsers.find((u) => u.id === partnerId) || {
        id: partnerId,
        name: partnerId,
        handle: '',
        avatar: '',
        createdAt: new Date().toISOString(),
      };

      const displayName = isSaved && savedRelation
        ? savedRelation.nome_salvo
        : partnerUser.handle || partnerUser.name || 'Contato';

      const existingChat = chatMap.get(partnerId);

      const unreadIncrement =
        msg.recipientId === userId && msg.status !== 'read' ? 1 : 0;

      if (!existingChat) {
        chatMap.set(partnerId, {
          id: chatId,
          participants: [userId, partnerId],
          contact: { ...partnerUser, name: displayName },
          isSaved,
          lastMessage: msg,
          unreadCount: unreadIncrement,
          updatedAt: msg.timestamp,
        });
      } else {
        const isNewer =
          new Date(msg.timestamp).getTime() >
          new Date(existingChat.updatedAt).getTime();

        existingChat.isSaved = isSaved;
        if (isSaved && savedRelation) {
          existingChat.contact.name = savedRelation.nome_salvo;
        }

        if (isNewer || !existingChat.lastMessage) {
          existingChat.lastMessage = msg;
          existingChat.updatedAt = msg.timestamp;
        }
        if (msg.recipientId === userId && msg.status !== 'read') {
          existingChat.unreadCount = (existingChat.unreadCount || 0) + 1;
        }
      }
    }

    return Array.from(chatMap.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public markMessagesAsRead(chatId: string, currentUserId: string) {
    const messages = this.getStoredMessages();
    let updated = false;
    const readMsgIds: string[] = [];

    for (const msg of messages) {
      if (
        msg.chatId === chatId &&
        msg.senderId !== currentUserId &&
        msg.status !== 'read'
      ) {
        msg.status = 'read';
        readMsgIds.push(msg.id);
        updated = true;
      }
    }

    if (updated) {
      this.saveMessages(messages);

      const client = getSupabaseClient();
      if (client && readMsgIds.length > 0) {
        Promise.resolve(
          client.from('mensagens').update({ status: 'lida' }).in('id', readMsgIds)
        ).catch(() => {});
      }
    }
  }

  /**
   * Real message sender: sends message to Supabase and saves locally.
   * ZERO AI / BOT RESPONDERS!
   */
  public async sendMessage(params: {
    chatId: string;
    senderId: string;
    senderHandle: string;
    recipientId?: string;
    type: 'text' | 'image' | 'audio';
    text?: string;
    mediaUrl?: string;
    photosAttached?: string;
    audioDuration?: number;
  }): Promise<Message> {
    const resolvedRecipientId =
      params.recipientId ||
      params.chatId.replace('chat_', '').split('_').find((id) => id !== params.senderId);

    const stableChatId = resolvedRecipientId
      ? getConversationId(params.senderId, resolvedRecipientId)
      : params.chatId;

    let mediaUrlToStore = params.mediaUrl;
    let photosAttachedToStore = params.photosAttached;

    // Se for foto, envia para o Banco de Fotos (Supabase Storage) para ter URL pública permanente
    if (params.type === 'image') {
      const candidate = params.mediaUrl || params.photosAttached;
      if (candidate && (candidate.startsWith('data:') || candidate.startsWith('blob:'))) {
        try {
          const publicUrl = await uploadPhotoToSupabase(candidate, params.senderId);
          if (publicUrl) {
            mediaUrlToStore = publicUrl;
            photosAttachedToStore = publicUrl;
          }
        } catch (uploadErr) {
          console.warn('Erro ao armazenar foto no banco de fotos (Supabase Storage):', uploadErr);
        }
      }
    }

    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      chatId: stableChatId,
      senderId: params.senderId,
      senderHandle: params.senderHandle,
      recipientId: resolvedRecipientId,
      type: params.type,
      text: params.text,
      mediaUrl: mediaUrlToStore,
      photosAttached:
        photosAttachedToStore ||
        (params.type === 'image' && mediaUrlToStore ? mediaUrlToStore : undefined),
      audioDuration: params.audioDuration,
      timestamp: new Date().toISOString(),
      status: 'sending',
    };

    const messages = this.getStoredMessages();
    messages.push(newMessage);
    this.saveMessages(messages);

    soundEffects.playSendSound();

    // Insert into real Supabase database!
    const client = getSupabaseClient();
    if (client && resolvedRecipientId) {
      try {
        const { data, error } = await client
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
          .select()
          .maybeSingle();

        if (error) {
          console.error('Erro ao inserir mensagem no Supabase:', error);
        }

        if (!error && data?.id) {
          newMessage.id = data.id;
          newMessage.status = 'delivered';
          this.saveMessages(this.getStoredMessages().map((m) => (m.id === newMessage.id ? newMessage : m)));
        } else {
          // Fallback delivered status
          setTimeout(() => {
            this.updateLocalStatus(newMessage.id, 'delivered');
          }, 400);
        }
      } catch (err) {
        console.warn('Supabase insert error, keeping local message:', err);
        setTimeout(() => {
          this.updateLocalStatus(newMessage.id, 'delivered');
        }, 400);
      }
    } else {
      setTimeout(() => {
        this.updateLocalStatus(newMessage.id, 'delivered');
      }, 400);
    }

    return newMessage;
  }

  private updateLocalStatus(messageId: string, status: 'delivered' | 'read') {
    const messages = this.getStoredMessages();
    const msg = messages.find((m) => m.id === messageId);
    if (msg && msg.status !== 'read') {
      msg.status = status;
      this.saveMessages(messages);
    }
  }

  public deleteMessage(messageId: string) {
    const messages = this.getStoredMessages().filter((m) => m.id !== messageId);
    this.saveMessages(messages);

    const client = getSupabaseClient();
    if (client) {
      Promise.resolve(client.from('mensagens').delete().eq('id', messageId)).catch(() => {});
    }
  }
}

export const storage = new StorageService();
