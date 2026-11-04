import React, { useState, useRef } from 'react';
import { MessageSquare, Eye, EyeOff, Lock, AtSign, User, ArrowLeft, CheckCircle2, AlertCircle, Camera, Upload } from 'lucide-react';
import { storage } from '../../services/storage';

interface RegisterProps {
  onGoToLogin: (prefilledHandle?: string) => void;
}

export const Register: React.FC<RegisterProps> = ({ onGoToLogin }) => {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleHandleChange = (val: string) => {
    // Keep it clean without forcing @
    let clean = val.replace(/\s+/g, '');
    if (!clean.startsWith('@') && clean.length > 0) {
      clean = `@${clean}`;
    }
    setHandle(clean);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor, informe o seu nome completo.');
      return;
    }

    if (!handle.trim() || handle.trim() === '@') {
      setError('Por favor, crie um usuário/arroba para a sua conta.');
      return;
    }

    if (!password || password.length < 3) {
      setError('Crie uma senha com pelo menos 3 dígitos.');
      return;
    }

    setIsLoading(true);
    storage.register(name, handle, password, avatarUrl || undefined).then((result) => {
      setIsLoading(false);

      if (result.success && result.user) {
        onGoToLogin(result.user.handle);
      } else {
        setError(result.message || 'Falha ao realizar cadastro.');
      }
    }).catch(() => {
      setIsLoading(false);
      setError('Erro de conexão ao realizar cadastro.');
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-blue-100">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-3">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">ZapProgramaCerto</h1>
          <p className="text-xs text-slate-500 mt-1">Crie sua conta para conversar agora mesmo</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Cadastre-se</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Envie sua foto de perfil, informe seu nome, crie um arroba e sua senha
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Foto de Perfil Upload */}
            <div className="flex flex-col items-center justify-center pb-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative group cursor-pointer"
                title="Clique para escolher foto de perfil"
              >
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-blue-400 bg-blue-50/60 hover:bg-blue-100/60 overflow-hidden flex items-center justify-center transition shadow-xs">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center flex flex-col items-center justify-center p-2 text-blue-600">
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[10px] font-semibold leading-tight">Foto</span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 p-1.5 bg-blue-600 text-white rounded-full shadow-sm group-hover:scale-110 transition">
                  <Upload className="w-3 h-3" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                {avatarUrl ? 'Foto selecionada! Clique para trocar' : 'Clique para adicionar foto de perfil'}
              </p>
            </div>

            {/* Nome */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Seu Nome
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Lucas Natan"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                  autoFocus
                />
              </div>
            </div>

            {/* Criação do @arroba (sem obrigar a digitar @) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Criar seu Arroba / Usuário
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <AtSign className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => handleHandleChange(e.target.value)}
                  placeholder="Ex: lucas ou @lucas"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Não precisa colocar o @ se não quiser, nós adicionamos automaticamente.
              </p>
            </div>

            {/* Criação da Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Criar Senha
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer transition"
                >
                  {showPassword ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ocultar</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Mostrar senha</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Defina uma senha"
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-xl shadow-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isLoading ? (
                <span>Criando conta...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Cadastrar-se</span>
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => onGoToLogin()}
              className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Já tem uma conta? Entrar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
