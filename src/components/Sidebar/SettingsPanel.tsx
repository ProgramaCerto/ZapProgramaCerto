import React, { useState } from 'react';
import { ArrowLeft, User, Key, Eye, EyeOff, LogOut, CheckCircle2, AlertCircle, Database, ShieldCheck } from 'lucide-react';
import { storage } from '../../services/storage';
import { User as UserType } from '../../types/chat';

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
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>('profile');

  // Profile
  const [name, setName] = useState(currentUser.name);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Security / Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    if (!name.trim()) return;

    const result = storage.updateProfile(currentUser.id, { name, bio });
    if (result.success && result.user) {
      onUpdateUser(result.user);
      setProfileSuccess('Perfil atualizado com sucesso!');
      setTimeout(() => setProfileSuccess(null), 3000);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
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

    const result = storage.updatePassword(currentUser.id, currentPassword, newPassword);
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
    <div className="flex flex-col h-full bg-white select-none animate-in slide-in-from-left-4 duration-150">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {activeSection === 'profile' && (
          <div className="space-y-4">
            {/* Profile Avatar Card */}
            <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-blue-50/50 border border-blue-100">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 truncate">{currentUser.name}</h4>
                <p className="text-xs font-semibold text-blue-600">{currentUser.handle}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Online no AzulChat</p>
              </div>
            </div>

            {profileSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{profileSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
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
                  Seu Arroba (@)
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
                  placeholder="Disponível no AzulChat..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl transition shadow-xs cursor-pointer"
              >
                Salvar Dados do Perfil
              </button>
            </form>
          </div>
        )}

        {activeSection === 'security' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Mudar Senha</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Altere a sua senha de acesso ao AzulChat
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

        {/* Database & Supabase connection manager */}
        <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Database className="w-4 h-4 text-blue-600" />
            <span>Banco de Dados Supabase</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            As tabelas <code>usuarios</code>, <code>contatos</code> e <code>mensagens</code> com políticas <code>ALL</code> estão configuradas.
          </p>
          <div className="pt-1 text-[11px] text-blue-700 font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Pronto para receber sua API Key e URL</span>
          </div>
        </div>

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
