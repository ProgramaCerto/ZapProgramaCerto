import { User, Chat, Message } from '../types/chat';
import { soundEffects } from '../utils/audio';
import { getSupabaseClient } from './supabase';
import { uploadPhotoToSupabase } from './storageUpload';
import { notifyNewMessage } from '../utils/notifications';

const SESSION_KEY = 'zapprogramacerto_session_user_id';
const PREFILLED_KEY = 'zapprogramacerto_prefilled_handle';

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

export function extractEmailAndCleanBio(rawBio?: string): { email?: string; cleanBio: string } {
  if (!rawBio) return { cleanBio: 'Disponível no ZapProgramaCerto' };
  const match = rawBio.match(/\[email:([^\]]+)\]/);
  if (match) {
    const email = match[1].trim();
    const cleanBio = rawBio.replace(/\[email:[^\]]+\]/, '').trim() || 'Disponível no ZapProgramaCerto';
    return { email, cleanBio };
  }
  return { cleanBio: rawBio };
}

export function encodeEmailInBio(bio: string, email?: string): string {
  const { cleanBio } = extractEmailAndCleanBio(bio);
  if (email && email.trim()) {
    return `${cleanBio} [email:${email.trim()}]`;
  }
  return cleanBio;
}

export function parseUserRow(u: Record<string, any>): User {
  const { email: bioEmail, cleanBio } = extractEmailAndCleanBio(u.bio);
  const rawEmail = u.email && typeof u.email === 'string' && u.email.trim() ? u.email.trim() : bioEmail;
  return {
    id: u.id,
    name: u.nome,
    handle: u.arroba,
    password: u.senha,
    email: rawEmail || undefined,
    avatar: u.avatar_url || '',
    bio: cleanBio,
    online: u.online,
    createdAt: u.criado_em || new Date().toISOString(),
  };
}

class StorageService {
  private listeners: (() => void)[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  public isContinuousSyncActive = true;

  // Estado exclusivamente em memória RAM (nada de mensagens, fotos ou contatos salvos no celular)
  private memoryUsers: User[] = [];
  private memoryContacts: SavedContact[] = [];
  private memoryMessages: Message[] = [];
  private memoryCurrentUser: User | null = null;

  constructor() {
    this.cleanDeviceStorage();
    this.startContinuousPolling();
    this.initSupabaseRealtime();
    this.restoreSession().catch(() => {});
  }

  /**
   * Limpa qualquer resquício de dados armazenados no navegador/celular
   * Garantindo que mensagens, contatos e usuários fiquem exclusivamente no banco de dados
   */
  private cleanDeviceStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem('zapprogramacerto_users_db');
      localStorage.removeItem('zapprogramacerto_chats_db');
      localStorage.removeItem('zapprogramacerto_messages_db');
      localStorage.removeItem('zapprogramacerto_saved_contacts');
      localStorage.removeItem('zapprogramacerto_saved_credentials');
      localStorage.removeItem('zapprogramacerto_session_user');
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
      let existingIndex = messages.findIndex((m) => m.id === row.id);

      // Se não encontrou por ID exato, procura por mensagem otimista com mesmo remetente, destinatário e texto
      if (existingIndex === -1) {
        existingIndex = messages.findIndex(
          (m) =>
            m.senderId === row.remetente_id &&
            m.recipientId === row.destinatario_id &&
            (m.text || '') === (row.texto || '') &&
            m.type === (row.tipo || (row.fotos_anexadas ? 'image' : row.audio_url ? 'audio' : 'text')) &&
            Math.abs(new Date(m.timestamp).getTime() - new Date(row.criado_em || Date.now()).getTime()) < 30000
        );
      }

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
        messages[existingIndex] = { ...messages[existingIndex], ...mappedMsg, id: row.id };
      } else {
        messages.push(mappedMsg);
        if (currentUser && mappedMsg.recipientId === currentUser.id) {
          soundEffects.playReceiveSound();

          // Dispara notificação nativa do Chrome
          const sender = this.getUsers().find((u) => u.id === mappedMsg.senderId);
          const savedRel = this.getSavedContacts().find(
            (sc) => sc.usuario_id === currentUser.id && sc.contato_id === mappedMsg.senderId
          );
          const senderName = savedRel?.nome_salvo || sender?.name || sender?.handle || 'ZapProgramaCerto';
          notifyNewMessage({
            senderName,
            senderHandle: sender?.handle,
            text: mappedMsg.text,
            type: mappedMsg.type,
            chatId: mappedMsg.chatId,
            avatarUrl: sender?.avatar,
          });

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

  // Polling loop for background synchronization directly with Supabase
  private startContinuousPolling() {
    if (typeof window === 'undefined') return;
    if (this.syncInterval) clearInterval(this.syncInterval);

    this.syncInterval = setInterval(() => {
      if (this.isContinuousSyncActive) {
        this.syncWithSupabase();
      }
    }, 1200);
  }

  public async syncWithSupabase() {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const currentUser = this.getCurrentUser();
      if (!currentUser) return;

      // Sync users & contacts directly from the database
      await this.syncRemoteUsers();
      await this.syncRemoteContacts();

      // Sync latest messages for current user directly from the database
      const { data: remoteMsgs, error } = await client
        .from('mensagens')
        .select('*')
        .or(`remetente_id.eq.${currentUser.id},destinatario_id.eq.${currentUser.id}`)
        .order('criado_em', { ascending: true })
        .limit(200);

      if (!error && remoteMsgs) {
        const localMessages = [...this.memoryMessages];
        let changed = false;

        for (const rm of remoteMsgs) {
          let idx = localMessages.findIndex((lm) => lm.id === rm.id);
          const mappedStatus: 'sending' | 'delivered' | 'read' =
            rm.status === 'lida' || rm.status === 'read'
              ? 'read'
              : rm.status === 'nao_lida' || rm.status === 'delivered'
              ? 'delivered'
              : 'sending';

          const chatId = getConversationId(rm.remetente_id, rm.destinatario_id);

          // Se não encontrou por ID exato, procura por mensagem otimista
          if (idx === -1) {
            idx = localMessages.findIndex(
              (lm) =>
                lm.senderId === rm.remetente_id &&
                lm.recipientId === rm.destinatario_id &&
                (lm.text || '') === (rm.texto || '') &&
                lm.type === (rm.tipo || (rm.fotos_anexadas ? 'image' : rm.audio_url ? 'audio' : 'text')) &&
                Math.abs(new Date(lm.timestamp).getTime() - new Date(rm.criado_em || Date.now()).getTime()) < 30000
            );
            if (idx >= 0) {
              localMessages[idx].id = rm.id;
              localMessages[idx].status = mappedStatus;
              changed = true;
            }
          }

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

            // Make sure the contact user profile is cached in memory
            this.ensureUserCached(rm.remetente_id === currentUser.id ? rm.destinatario_id : rm.remetente_id);

            if (rm.destinatario_id === currentUser.id) {
              soundEffects.playReceiveSound();

              // Dispara notificação nativa do Chrome
              const sender = this.getUsers().find((u) => u.id === rm.remetente_id);
              const savedRel = this.getSavedContacts().find(
                (sc) => sc.usuario_id === currentUser.id && sc.contato_id === rm.remetente_id
              );
              const senderName = savedRel?.nome_salvo || sender?.name || sender?.handle || 'ZapProgramaCerto';
              notifyNewMessage({
                senderName,
                senderHandle: sender?.handle,
                text: rm.texto || '',
                type: rm.tipo || (rm.fotos_anexadas ? 'image' : rm.audio_url ? 'audio' : 'text'),
                chatId: getConversationId(rm.remetente_id, rm.destinatario_id),
                avatarUrl: sender?.avatar,
              });
            }
          } else if (localMessages[idx].status !== mappedStatus) {
            localMessages[idx].status = mappedStatus;
            changed = true;
          }
        }

        if (changed || localMessages.length !== this.memoryMessages.length) {
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
      const { data, error } = await client.from('usuarios').select('*').limit(300);
      if (!error && data) {
        const local = [...this.memoryUsers];
        let changed = false;

        for (const u of data) {
          const idx = local.findIndex((l) => l.id === u.id);
          const mappedUser = parseUserRow(u);

          if (idx === -1) {
            local.push(mappedUser);
            changed = true;
          } else if (
            local[idx].name !== mappedUser.name ||
            local[idx].avatar !== mappedUser.avatar ||
            local[idx].bio !== mappedUser.bio ||
            local[idx].email !== mappedUser.email
          ) {
            local[idx] = { ...local[idx], ...mappedUser };
            changed = true;
          }
        }

        if (changed) {
          this.memoryUsers = local;
          this.notifyListeners();
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
        this.memoryContacts = data;
        this.notifyListeners();
      }
    } catch {
      // Safe
    }
  }

  private async ensureUserCached(userId: string) {
    if (this.memoryUsers.find((u) => u.id === userId)) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data, error } = await client.from('usuarios').select('*').eq('id', userId).maybeSingle();
      if (!error && data) {
        const mappedUser = parseUserRow(data);
        this.memoryUsers.push(mappedUser);
        this.notifyListeners();
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

  // --- Users & Session ---
  public getUsers(): User[] {
    return this.memoryUsers;
  }

  public saveUsers(users: User[]) {
    this.memoryUsers = users;
    this.notifyListeners();
  }

  public getCurrentUser(): User | null {
    return this.memoryCurrentUser;
  }

  public setCurrentUser(user: User | null) {
    this.memoryCurrentUser = user;
    if (typeof window !== 'undefined') {
      if (user) {
        sessionStorage.setItem(SESSION_KEY, user.id);
        localStorage.setItem(SESSION_KEY, user.id);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
      }
    }
    if (user) {
      this.syncWithSupabase();
    }
    this.notifyListeners();
  }

  /**
   * Restaura a sessão do usuário puxando suas informações atualizadas
   * diretamente do banco de dados Supabase
   */
  public async restoreSession(): Promise<User | null> {
    if (typeof window === 'undefined') return null;
    const userId = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!userId) return null;

    const client = getSupabaseClient();
    if (!client) return this.memoryCurrentUser;

    try {
      const { data, error } = await client.from('usuarios').select('*').eq('id', userId).maybeSingle();
      if (!error && data) {
        const user = parseUserRow(data);
        this.memoryCurrentUser = user;
        const idx = this.memoryUsers.findIndex((u) => u.id === user.id);
        if (idx >= 0) this.memoryUsers[idx] = user;
        else this.memoryUsers.push(user);

        this.syncWithSupabase();
        this.notifyListeners();
        return user;
      }
    } catch {
      // Safe
    }
    return this.memoryCurrentUser;
  }

  public getPrefilledHandle(): string {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(PREFILLED_KEY) || '';
  }

  public setPrefilledHandle(handle: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(PREFILLED_KEY, handle);
  }

  public clearPrefilledHandle() {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(PREFILLED_KEY);
  }

  // --- Register & Login no Banco de Dados ---
  public async register(
    name: string,
    rawHandle: string,
    password: string,
    customAvatar?: string,
    rawEmail?: string
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

    const cleanEmail = rawEmail?.trim() || '';

    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Banco de dados não disponível. Tente novamente mais tarde.' };
    }

    try {
      // Verifica no banco de dados se já existe
      const { data: existing } = await client
        .from('usuarios')
        .select('id')
        .ilike('arroba', cleanHandle)
        .maybeSingle();

      if (existing) {
        return { success: false, message: 'Este usuário já está cadastrado no banco de dados. Escolha outro.' };
      }

      // Tenta inserir com a coluna email primeiro; se a coluna ainda não existir no schema do Supabase, codifica em bio
      let insertResult = await client
        .from('usuarios')
        .insert({
          nome: name.trim(),
          arroba: cleanHandle,
          senha: password,
          avatar_url: customAvatar || '',
          bio: 'Disponível no ZapProgramaCerto',
          email: cleanEmail || null,
          online: true,
        })
        .select()
        .maybeSingle();

      if (insertResult.error && (insertResult.error.code === '42703' || insertResult.error.message?.includes('email'))) {
        // Fallback: codifica o email na bio até a migration SQL ser executada
        const fallbackBio = encodeEmailInBio('Disponível no ZapProgramaCerto', cleanEmail);
        insertResult = await client
          .from('usuarios')
          .insert({
            nome: name.trim(),
            arroba: cleanHandle,
            senha: password,
            avatar_url: customAvatar || '',
            bio: fallbackBio,
            online: true,
          })
          .select()
          .maybeSingle();
      }

      if (insertResult.error || !insertResult.data) {
        return { success: false, message: 'Erro ao salvar novo usuário no banco de dados.' };
      }

      const newUser = parseUserRow(insertResult.data);
      if (cleanEmail && !newUser.email) {
        newUser.email = cleanEmail;
      }

      const idx = this.memoryUsers.findIndex((u) => u.id === newUser.id);
      if (idx >= 0) this.memoryUsers[idx] = newUser;
      else this.memoryUsers.push(newUser);

      this.setPrefilledHandle(cleanHandle);
      this.notifyListeners();
      return { success: true, user: newUser };
    } catch (e) {
      console.error('Erro ao cadastrar usuário:', e);
      return { success: false, message: 'Falha de comunicação com o banco de dados.' };
    }
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
    if (!client) {
      return { success: false, message: 'Conexão com o banco de dados indisponível.' };
    }

    try {
      const { data, error } = await client
        .from('usuarios')
        .select('*')
        .ilike('arroba', cleanHandle)
        .maybeSingle();

      if (error || !data) {
        return { success: false, message: 'Usuário não encontrado no banco de dados com este arroba (@).' };
      }

      if (data.senha !== password) {
        return { success: false, message: 'Senha incorreta. Verifique e tente novamente.' };
      }

      const remoteUser = parseUserRow(data);

      this.setCurrentUser(remoteUser);
      this.clearPrefilledHandle();

      const idx = this.memoryUsers.findIndex((u) => u.id === remoteUser.id);
      if (idx >= 0) this.memoryUsers[idx] = remoteUser;
      else this.memoryUsers.push(remoteUser);

      // Sincroniza imediatamente mensagens e contatos do usuário direto do banco
      this.syncWithSupabase();
      this.notifyListeners();

      return { success: true, user: remoteUser };
    } catch (e) {
      console.error('Erro ao efetuar login:', e);
      return { success: false, message: 'Falha de conexão com o banco de dados.' };
    }
  }

  public async updatePassword(userId: string, currentPass: string, newPass: string): Promise<{ success: boolean; message?: string }> {
    if (newPass.length < 3) {
      return { success: false, message: 'A nova senha deve ter no mínimo 3 caracteres.' };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Banco de dados não disponível.' };
    }

    try {
      // Confirma senha atual no banco
      const { data: user, error: fetchErr } = await client
        .from('usuarios')
        .select('senha')
        .eq('id', userId)
        .maybeSingle();

      if (fetchErr || !user) {
        return { success: false, message: 'Usuário não encontrado no banco de dados.' };
      }

      if (user.senha !== currentPass) {
        return { success: false, message: 'Senha atual incorreta.' };
      }

      const { error: updateErr } = await client
        .from('usuarios')
        .update({ senha: newPass })
        .eq('id', userId);

      if (updateErr) {
        return { success: false, message: 'Erro ao salvar nova senha no banco de dados.' };
      }

      const localIdx = this.memoryUsers.findIndex((u) => u.id === userId);
      if (localIdx >= 0) {
        this.memoryUsers[localIdx].password = newPass;
      }
      if (this.memoryCurrentUser && this.memoryCurrentUser.id === userId) {
        this.memoryCurrentUser.password = newPass;
      }

      this.notifyListeners();
      return { success: true, message: 'Senha alterada com sucesso no banco de dados!' };
    } catch {
      return { success: false, message: 'Erro de comunicação ao atualizar senha.' };
    }
  }

  public async updateProfile(
    userId: string,
    updates: { name?: string; bio?: string; avatar?: string; email?: string }
  ): Promise<{ success: boolean; user?: User }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };

    try {
      const updatePayload: Record<string, unknown> = {};
      if (updates.name) updatePayload.nome = updates.name.trim();
      if (updates.avatar !== undefined) updatePayload.avatar_url = updates.avatar;

      let targetBio = updates.bio !== undefined ? updates.bio.trim() : (this.memoryCurrentUser?.bio || '');
      const targetEmail = updates.email !== undefined ? updates.email.trim() : this.memoryCurrentUser?.email;

      if (updates.bio !== undefined) updatePayload.bio = targetBio;
      if (updates.email !== undefined) updatePayload.email = targetEmail || null;

      let { data, error } = await client
        .from('usuarios')
        .update(updatePayload)
        .eq('id', userId)
        .select()
        .maybeSingle();

      if (error && (error.code === '42703' || error.message?.includes('email'))) {
        delete updatePayload.email;
        updatePayload.bio = encodeEmailInBio(targetBio, targetEmail);
        const retry = await client
          .from('usuarios')
          .update(updatePayload)
          .eq('id', userId)
          .select()
          .maybeSingle();
        data = retry.data;
        error = retry.error;
      }

      if (!error && data) {
        const updated = parseUserRow(data);
        if (targetEmail && !updated.email) {
          updated.email = targetEmail;
        }

        const idx = this.memoryUsers.findIndex((u) => u.id === userId);
        if (idx >= 0) this.memoryUsers[idx] = updated;
        if (this.memoryCurrentUser && this.memoryCurrentUser.id === userId) {
          this.memoryCurrentUser = updated;
        }

        this.notifyListeners();
        return { success: true, user: updated };
      }
    } catch {
      // Safe
    }
    return { success: false };
  }

  // --- Contatos exclusivamente no Banco de Dados ---
  public getSavedContacts(): SavedContact[] {
    return this.memoryContacts;
  }

  public async saveContact(
    usuarioId: string,
    contatoId: string,
    nomeSalvo: string
  ): Promise<{ success: boolean; message?: string }> {
    const cleanName = nomeSalvo.trim();
    const client = getSupabaseClient();

    if (client) {
      try {
        await client.from('contatos').upsert(
          {
            usuario_id: usuarioId,
            contato_id: contatoId,
            nome_salvo: cleanName,
          },
          { onConflict: 'usuario_id,contato_id' }
        );
      } catch (e) {
        console.warn('Erro ao salvar contato no banco de dados:', e);
      }
    }

    // Atualiza estado em memória
    const idx = this.memoryContacts.findIndex(
      (c) => c.usuario_id === usuarioId && c.contato_id === contatoId
    );
    if (idx >= 0) {
      this.memoryContacts[idx].nome_salvo = cleanName;
    } else {
      this.memoryContacts.push({
        usuario_id: usuarioId,
        contato_id: contatoId,
        nome_salvo: cleanName,
      });
    }

    this.notifyListeners();
    return { success: true, message: 'Contato salvo com sucesso no banco de dados!' };
  }

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
          const user = parseUserRow(data);

          const idx = this.memoryUsers.findIndex((u) => u.id === user.id);
          if (idx >= 0) this.memoryUsers[idx] = user;
          else this.memoryUsers.push(user);

          return user;
        }
      } catch {
        // Safe
      }
    }

    return this.memoryUsers.find((u) => u.handle.toLowerCase() === cleanHandle) || null;
  }

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
        message: `Nenhum usuário foi encontrado com o arroba ${cleanHandle} no banco de dados.`,
      };
    }

    // Salva a relação de contato diretamente no banco de dados Supabase
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

  // --- Deduplicação de Mensagens em Memória ---
  public deduplicateMessages(messages: Message[]): Message[] {
    const seenIds = new Set<string>();
    const result: Message[] = [];

    for (const msg of messages) {
      if (!msg || !msg.id) continue;
      if (seenIds.has(msg.id)) continue;

      const dupIdx = result.findIndex((existing) => {
        if (existing.senderId !== msg.senderId || existing.recipientId !== msg.recipientId) {
          return false;
        }
        if (existing.type !== msg.type) return false;
        if ((existing.text || '') !== (msg.text || '')) return false;
        if (existing.mediaUrl && msg.mediaUrl && existing.mediaUrl !== msg.mediaUrl) {
          return false;
        }
        const diff = Math.abs(
          new Date(existing.timestamp).getTime() - new Date(msg.timestamp).getTime()
        );
        return diff < 25000;
      });

      if (dupIdx >= 0) {
        const existing = result[dupIdx];
        if (existing.id.startsWith('msg_') && !msg.id.startsWith('msg_')) {
          seenIds.delete(existing.id);
          result[dupIdx] = { ...msg };
          seenIds.add(msg.id);
        }
        continue;
      }

      seenIds.add(msg.id);
      result.push(msg);
    }

    return result;
  }

  // --- Mensagens diretamente do Banco de Dados ---
  public getStoredMessages(): Message[] {
    return this.deduplicateMessages(this.memoryMessages);
  }

  public saveMessages(messages: Message[]) {
    this.memoryMessages = this.deduplicateMessages(messages);
    this.notifyListeners();
  }

  public getChatMessages(chatId: string): Message[] {
    const messages = this.getStoredMessages();
    return messages.filter((m) => m.chatId === chatId);
  }

  /**
   * Constrói a lista dinâmica de conversas exclusivamente puxando do banco de dados
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
   * Envio de mensagem com inserção direta no banco de dados Supabase
   * Zero armazenamento no celular!
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

    // Se for foto, envia para o Bucket de Fotos (Supabase Storage) para ter URL pública permanente
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

    const tempId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newMessage: Message = {
      id: tempId,
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

    // Atualiza apenas em memória durante a sessão
    const messages = this.getStoredMessages();
    messages.push(newMessage);
    this.saveMessages(messages);

    soundEffects.playSendSound();

    // Insere diretamente no Banco de Dados Supabase!
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
          console.error('Erro ao inserir mensagem no banco de dados:', error);
        }

        if (!error && data?.id) {
          const finalId = data.id;
          newMessage.id = finalId;
          newMessage.status = 'delivered';
          const currentList = this.getStoredMessages();
          const targetIndex = currentList.findIndex((m) => m.id === tempId || m.id === finalId);
          if (targetIndex >= 0) {
            currentList[targetIndex] = {
              ...currentList[targetIndex],
              id: finalId,
              status: 'delivered',
            };
          } else {
            currentList.push(newMessage);
          }
          this.saveMessages(currentList);
        } else {
          setTimeout(() => {
            this.updateLocalStatus(tempId, 'delivered');
          }, 400);
        }
      } catch (err) {
        console.warn('Erro ao inserir no banco de dados:', err);
        setTimeout(() => {
          this.updateLocalStatus(tempId, 'delivered');
        }, 400);
      }
    } else {
      setTimeout(() => {
        this.updateLocalStatus(tempId, 'delivered');
      }, 400);
    }

    // Dispara notificação por e-mail via Gmail SMTP em segundo plano para o destinatário
    if (resolvedRecipientId) {
      this.sendEmailNotificationForMessage({
        senderId: params.senderId,
        senderHandle: params.senderHandle,
        recipientId: resolvedRecipientId,
        text: params.text,
        type: params.type,
      }).catch((e) => {
        console.warn('Erro ao disparar notificação por e-mail:', e);
      });
    }

    return newMessage;
  }

  /**
   * Envia notificação por e-mail para o destinatário usando o Gmail SMTP
   * Inclui o nome com o qual o remetente está salvo no celular do destinatário
   */
  private async sendEmailNotificationForMessage(params: {
    senderId: string;
    senderHandle: string;
    recipientId: string;
    text?: string;
    type: 'text' | 'image' | 'audio';
  }) {
    try {
      const client = getSupabaseClient();
      if (!client) return;

      // 1. Obter dados do destinatário (incluindo seu e-mail cadastrado)
      let recipient = this.memoryUsers.find((u) => u.id === params.recipientId);
      let recipientEmail = recipient?.email;

      if (!recipientEmail) {
        const { data: recRow } = await client
          .from('usuarios')
          .select('*')
          .eq('id', params.recipientId)
          .maybeSingle();

        if (recRow) {
          const parsed = parseUserRow(recRow);
          recipientEmail = parsed.email;
          if (!recipient) {
            recipient = parsed;
            this.memoryUsers.push(parsed);
          } else {
            recipient.email = parsed.email;
          }
        }
      }

      if (!recipientEmail || !recipientEmail.includes('@')) {
        // Destinatário não possui e-mail cadastrado para notificações
        return;
      }

      // 2. Verificar como o remetente está salvo no celular/contatos do destinatário
      let senderSavedName = '';
      const { data: contactRow } = await client
        .from('contatos')
        .select('nome_salvo')
        .eq('usuario_id', params.recipientId)
        .eq('contato_id', params.senderId)
        .maybeSingle();

      if (contactRow?.nome_salvo && contactRow.nome_salvo.trim()) {
        senderSavedName = contactRow.nome_salvo.trim();
      }

      if (!senderSavedName) {
        const senderUser = this.memoryUsers.find((u) => u.id === params.senderId);
        senderSavedName = senderUser?.name || params.senderHandle || 'Seu contato';
      }

      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const formattedTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // 3. Dispara POST para o endpoint do servidor local (/api/send-email-notification)
      await fetch('/api/send-email-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: recipientEmail,
          senderName: senderSavedName,
          senderHandle: params.senderHandle,
          recipientName: recipient?.name || '',
          messageText: params.text || '',
          messageType: params.type,
          sentAt: formattedTime,
          chatUrl: 'https://zap-programacerto.vercel.app',
        }),
      });
    } catch (err) {
      console.warn('Erro ao processar notificação por e-mail:', err);
    }
  }

  private updateLocalStatus(messageId: string, status: 'delivered' | 'read') {
    const messages = this.getStoredMessages();
    const msg = messages.find((m) => m.id === messageId);
    if (msg && msg.status !== 'read') {
      msg.status = status;
      this.saveMessages(messages);
    }
  }

  public async deleteMessage(messageId: string, forEveryone = true) {
    const messages = this.getStoredMessages().filter((m) => m.id !== messageId);
    this.saveMessages(messages);

    if (forEveryone) {
      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('mensagens').delete().eq('id', messageId);
        } catch (e) {
          console.warn('Erro ao deletar mensagem no banco:', e);
        }
      }
    }
    this.notifyListeners();
  }

  public async deleteChat(chatId: string, user1Id: string, user2Id: string) {
    // Remove mensagens da conversa em memória
    const filtered = this.getStoredMessages().filter((m) => m.chatId !== chatId);
    this.saveMessages(filtered);

    // Remove mensagens no banco de dados Supabase
    const client = getSupabaseClient();
    if (client) {
      try {
        await client
          .from('mensagens')
          .delete()
          .eq('remetente_id', user1Id)
          .eq('destinatario_id', user2Id);

        await client
          .from('mensagens')
          .delete()
          .eq('remetente_id', user2Id)
          .eq('destinatario_id', user1Id);
      } catch (e) {
        console.warn('Erro ao apagar conversa no banco de dados:', e);
      }
    }
    this.notifyListeners();
  }
}

export const storage = new StorageService();
