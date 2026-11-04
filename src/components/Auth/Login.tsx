import React, { useState, useEffect } from 'react';
import { MessageSquare, Eye, EyeOff, Lock, AtSign, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import { storage } from '../../services/storage';
import { User } from '../../types/chat';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  onGoToRegister: () => void;
  initialHandle?: string;
}

export const Login: React.FC<LoginProps> = ({
  onLoginSuccess,
  onGoToRegister,
  initialHandle = '',
}) => {
  const [handle, setHandle] = useState(initialHandle);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if there is a prefilled handle from recent registration
    const prefilled = storage.getPrefilledHandle();
    if (prefilled) {
      setHandle(prefilled);
      setNotice(`Conta cadastrada com sucesso! Preencha sua senha para entrar com ${prefilled}.`);
    } else if (initialHandle) {
      setHandle(initialHandle);
    }
  }, [initialHandle]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!handle.trim()) {
      setError('Por favor, informe seu arroba (@).');
      return;
    }
    if (!password) {
      setError('Por favor, digite sua senha.');
      return;
    }

    setIsLoading(true);
    storage.login(handle, password).then((result) => {
      setIsLoading(false);
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setError(result.message || 'Falha ao entrar.');
      }
    }).catch(() => {
      setIsLoading(false);
      setError('Erro de conexão ao tentar entrar.');
    });
  };

  const fillQuickDemo = (demoHandle: string) => {
    setHandle(demoHandle);
    setPassword('123');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-blue-100">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-4">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">ZapProgramaCerto</h1>
          <p className="text-sm text-slate-500 mt-1">
            Conversas em tempo real, envio de áudio, fotos e contatos
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Entrar na sua conta</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Digite seu @arroba e sua senha para acessar as conversas
            </p>
          </div>

          {notice && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Arroba Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Seu Arroba (@)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <AtSign className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@seunome"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                  autoFocus={!handle}
                />
              </div>
            </div>

            {/* Senha Input with Show/Hide toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Senha
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
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                  autoFocus={Boolean(handle)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
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
                <span>Entrando...</span>
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration link */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-600">
              Não é cadastrado ainda?{' '}
              <button
                type="button"
                onClick={onGoToRegister}
                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
              >
                Cadastrar-se
              </button>
            </p>
          </div>
        </div>

        {/* Quick test accounts */}
        <div className="mt-6 bg-white/70 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-500 mb-2">Contas demonstrativas para teste rápido (senha: 123):</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {['@ana', '@carlos', '@mariasilva'].map((demo) => (
              <button
                key={demo}
                type="button"
                onClick={() => fillQuickDemo(demo)}
                className="text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 py-1 px-2.5 rounded-lg border border-slate-200 transition cursor-pointer"
              >
                Entrar como {demo}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
