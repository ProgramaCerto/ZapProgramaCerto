import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  Key,
  Eye,
  EyeOff,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Database,
  ShieldCheck,
  Camera,
  Trash2,
  Upload,
  Bell,
  BellRing,
  Mic,
  Smartphone,
  Sparkles,
  Mail,
  Send,
} from 'lucide-react';
import { storage } from '../../services/storage';
import { User as UserType } from '../../types/chat';
import {
  requestCameraPermission,
  requestMicrophonePermission,
  requestNotificationPermission,
  getCameraPermissionStatus,
  getMicrophonePermissionStatus,
  getNotificationPermissionStatus,
  requestAllAppPermissions,
  PermissionStatusState,
} from '../../utils/appPermissions';
import { notifyNewMessage } from '../../utils/notifications';

interface SettingsPanelProps {
  currentUser: UserType;
  onBack: () => void;
  onUpdateUser: (user: UserType) => void;
  onLogout: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentUser,
  onBack,
  onUpdateUser,
  onLogout,
}) => {
  const [activeSection, setActiveSection] = useState<'profile' | 'security' | 'permissions'>('profile');
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' ? getNotificationPermissionStatus() : 'unsupported'
  );
  const [cameraStatus, setCameraStatus] = useState<PermissionStatusState>('prompt');
  const [microphoneStatus, setMicrophoneStatus] = useState<PermissionStatusState>('prompt');
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [permissionFeedback, setPermissionFeedback] = useState<string | null>(null);

  useEffect(() => {
    getCameraPermissionStatus().then(setCameraStatus);
    getMicrophonePermissionStatus().then(setMicrophoneStatus);
  }, []);

  const handleRequestNotif = async () => {
    const perm = await requestNotificationPermission();
    setNotificationStatus(perm);
    if (perm === 'granted') {
      setPermissionFeedback('Notificações autorizadas no aplicativo!');
      setTimeout(() => setPermissionFeedback(null), 3000);
    }
  };

  const handleRequestCam = async () => {
    const perm = await requestCameraPermission();
    setCameraStatus(perm);
    if (perm === 'granted') {
      setPermissionFeedback('Câmera autorizada com sucesso!');
      setTimeout(() => setPermissionFeedback(null), 3000);
    }
  };

  const handleRequestMic = async () => {
    const perm = await requestMicrophonePermission();
    setMicrophoneStatus(perm);
    if (perm === 'granted') {
      setPermissionFeedback('Microfone autorizado com sucesso!');
      setTimeout(() => setPermissionFeedback(null), 3000);
    }
  };

  const handleRequestAll = async () => {
    const res = await requestAllAppPermissions();
    setNotificationStatus(res.notifications);
    setMicrophoneStatus(res.microphone);
    setCameraStatus(res.camera);
    setPermissionFeedback('Permissões do aplicativo atualizadas com sucesso!');
    setTimeout(() => setPermissionFeedback(null), 3000);
  };

  const handleTestNotification = () => {
    notifyNewMessage({
      senderName: 'ZapProgramaCerto',
      text: '🔔 Teste de notificação: seu aparelho está pronto para receber alertas!',
    });
    setTestNotificationSent(true);
    setTimeout(() => setTestNotificationSent(false), 3000);
  };

  // Profile
  const [name, setName] = useState(currentUser.name);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestFeedback, setEmailTestFeedback] = useState<string | null>(null);

  // Security / Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Handle Change Photo
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const result = await storage.updateProfile(currentUser.id, { avatar: base64 });
      if (result.success && result.user) {
        onUpdateUser(result.user);
        setProfileSuccess('Foto de perfil atualizada no banco de dados!');
        setTimeout(() => setProfileSuccess(null), 3000);
      }
    };
    reader.readAsDataURL(file);

    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  // Handle Remove Photo
  const handleRemovePhoto = async () => {
    const result = await storage.updateProfile(currentUser.id, { avatar: '' });
    if (result.success && result.user) {
      onUpdateUser(result.user);
      setProfileSuccess('Foto de perfil removida.');
      setTimeout(() => setProfileSuccess(null), 3000);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    if (!name.trim()) return;

    const result = await storage.updateProfile(currentUser.id, { name, bio, email });
    if (result.success && result.user) {
      onUpdateUser(result.user);
      setProfileSuccess('Perfil atualizado com sucesso no banco de dados!');
      setTimeout(() => setProfileSuccess(null), 3000);
    }
  };

  const handleSendTestEmail = async () => {
    if (!email || !email.includes('@')) {
      setEmailTestFeedback('Por favor, informe um endereço de e-mail válido para testar.');
      setTimeout(() => setEmailTestFeedback(null), 3500);
      return;
    }

    setTestingEmail(true);
    setEmailTestFeedback(null);

    try {
      const res = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailTestFeedback(`✅ E-mail de teste enviado com sucesso para ${email}! Verifique sua caixa de entrada.`);
      } else {
        setEmailTestFeedback(`❌ Erro ao enviar e-mail: ${data.error || 'Falha no SMTP'}`);
      }
    } catch {
      setEmailTestFeedback('❌ Falha na conexão com o servidor para envio de e-mail.');
    } finally {
      setTestingEmail(false);
      setTimeout(() => setEmailTestFeedback(null), 6000);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Informe sua senha atual.');
      return;
    }
    if (newPassword.length < 3) {
      setPasswordError('A nova senha deve ter no mínimo 3 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.');
      return;
    }

    const result = await storage.updatePassword(currentUser.id, currentPassword, newPassword);
    if (result.success) {
      setPasswordSuccess(result.message || 'Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 3500);
    } else {
      setPasswordError(result.message || 'Erro ao alterar senha.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white select-none animate-panel-slide-left">
      {/* Hidden file input for changing profile photo */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* WhatsApp Web style header with back arrow */}
      <div className="flex items-center gap-3 px-4 py-4 bg-blue-600 text-white shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para conversas"
          className="p-1.5 hover:bg-blue-700 active:bg-blue-800 rounded-full transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h2 className="text-base font-bold text-white tracking-tight">Configurações</h2>
      </div>

      {/* Navigation tabs inside panel */}
      <div className="flex border-b border-slate-100 px-4 bg-slate-50/50">
        <button
          type="button"
          onClick={() => setActiveSection('profile')}
          className={`py-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'profile'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Perfil da Conta</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('security')}
          className={`py-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'security'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Mudar Senha</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('permissions')}
          className={`py-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
            activeSection === 'permissions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Permissões</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {activeSection === 'profile' && (
          <div className="space-y-5 animate-fade-scale">
            {/* Centered Profile Photo with Action Buttons */}
            <div className="flex flex-col items-center justify-center pt-2 pb-4 text-center">
              <div className="relative mb-3">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-28 h-28 rounded-full object-cover border-4 border-blue-50 shadow-md bg-white"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-slate-100 border-4 border-slate-50 shadow-md flex items-center justify-center text-slate-400">
                    <User className="w-14 h-14" />
                  </div>
                )}
              </div>

              {/* Botões: Trocar foto de perfil ou Retirar foto de perfil */}
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="py-1.5 px-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Trocar foto de perfil</span>
                </button>

                {currentUser.avatar && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="py-1.5 px-3 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Retirar foto</span>
                  </button>
                )}
              </div>
            </div>

            {profileSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{profileSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Seu Nome
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Seu Arroba / Usuário (Fixo)
                </label>
                <input
                  type="text"
                  value={currentUser.handle}
                  disabled
                  className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Recado / Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  placeholder="Disponível no ZapProgramaCerto..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition resize-none"
                />
              </div>

              {/* E-mail para Notificações Gmail SMTP */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    E-mail para Notificações
                  </label>
                  <span className="text-[11px] text-blue-600 font-medium">Gmail SMTP</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@gmail.com"
                    className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Toda vez que te enviarem uma mensagem, você receberá um e-mail avisando quem mandou e o texto enviado.
                </p>

                {emailTestFeedback && (
                  <div className={`mt-2 p-2.5 text-xs rounded-xl border ${emailTestFeedback.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                    {emailTestFeedback}
                  </div>
                )}

                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={testingEmail || !email}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{testingEmail ? 'Enviando teste...' : 'Testar envio de e-mail'}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl transition shadow-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </form>
          </div>
        )}

        {activeSection === 'security' && (
          <div className="space-y-4 animate-fade-scale">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Mudar Senha</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Altere a sua senha de acesso ao ZapProgramaCerto
              </p>
            </div>

            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3.5">
              {/* Senha Atual */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Senha Atual
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showCurrentPass ? 'Ocultar' : 'Ver senha'}</span>
                  </button>
                </div>
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Sua senha atual"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>

              {/* Nova Senha */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Nova Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showNewPass ? 'Ocultar' : 'Ver senha'}</span>
                  </button>
                </div>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 3 caracteres"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>

              {/* Confirmar Senha */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Salvar Nova Senha</span>
              </button>
            </form>
          </div>
        )}

        {activeSection === 'permissions' && (
          <div className="space-y-4 animate-fade-scale">
            {/* Feedback alert */}
            {permissionFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{permissionFeedback}</span>
              </div>
            )}

            {/* 1. NOTIFICAÇÕES */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                    notificationStatus === 'granted' ? 'bg-emerald-600' : notificationStatus === 'denied' ? 'bg-rose-600' : 'bg-blue-600'
                  }`}>
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Notificações</h3>
                    <p className="text-[11px] text-slate-500">
                      Status:{' '}
                      <span className="font-semibold text-slate-800">
                        {notificationStatus === 'granted'
                          ? '✅ Ativado'
                          : notificationStatus === 'denied'
                          ? '❌ Bloqueado'
                          : '⚠️ Pendente'}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestNotif}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-xs rounded-xl transition cursor-pointer"
                >
                  {notificationStatus === 'granted' ? 'Reverificar' : 'Permitir'}
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Permite enviar alertas e avisos no aparelho quando novas mensagens chegarem para você.
              </p>

              {notificationStatus === 'granted' && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="w-full py-1.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Bell className="w-3.5 h-3.5 text-blue-600" />
                    <span>Disparar Notificação de Teste</span>
                  </button>
                  {testNotificationSent && (
                    <p className="text-[10px] text-emerald-600 font-semibold text-center mt-1.5">
                      Notificação enviada com sucesso!
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 2. CÂMERA */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                    cameraStatus === 'granted' ? 'bg-emerald-600' : cameraStatus === 'denied' ? 'bg-rose-600' : 'bg-blue-600'
                  }`}>
                    <Camera className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Câmera</h3>
                    <p className="text-[11px] text-slate-500">
                      Status:{' '}
                      <span className="font-semibold text-slate-800">
                        {cameraStatus === 'granted'
                          ? '✅ Ativado'
                          : cameraStatus === 'denied'
                          ? '❌ Bloqueado'
                          : '⚠️ Solicita ao abrir'}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestCam}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-xs rounded-xl transition cursor-pointer"
                >
                  {cameraStatus === 'granted' ? 'Reverificar' : 'Permitir'}
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Permite tirar fotos na hora quando você clica no ícone de câmera nas conversas.
              </p>
            </div>

            {/* 3. MICROFONE */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                    microphoneStatus === 'granted' ? 'bg-emerald-600' : microphoneStatus === 'denied' ? 'bg-rose-600' : 'bg-blue-600'
                  }`}>
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Microfone</h3>
                    <p className="text-[11px] text-slate-500">
                      Status:{' '}
                      <span className="font-semibold text-slate-800">
                        {microphoneStatus === 'granted'
                          ? '✅ Ativado'
                          : microphoneStatus === 'denied'
                          ? '❌ Bloqueado'
                          : '⚠️ Solicita ao usar'}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestMic}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-xs rounded-xl transition cursor-pointer"
                >
                  {microphoneStatus === 'granted' ? 'Reverificar' : 'Permitir'}
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Permite o uso do microfone no aplicativo para áudios e chamadas.
              </p>
            </div>
          </div>
        )}

        {/* Logout button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Conta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
