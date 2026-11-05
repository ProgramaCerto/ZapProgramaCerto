import React, { useState } from 'react';
import { ArrowLeft, UserPlus, User, AtSign, Search, Check, AlertCircle } from 'lucide-react';
import { storage } from '../../services/storage';
import { User as UserType, Chat } from '../../types/chat';

interface NewContactPanelProps {
  currentUser: UserType;
  onBack: () => void;
  onContactAdded: (chat: Chat) => void;
}

export const NewContactPanel: React.FC<NewContactPanelProps> = ({
  currentUser,
  onBack,
  onContactAdded,
}) => {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleHandleChange = (val: string) => {
    // Clean spaces, allow with or without @
    let clean = val.replace(/\s+/g, '');
    setHandle(clean);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setError('Por favor, informe o nome da pessoa primeiro.');
      return;
    }

    if (!handle.trim()) {
      setError('Por favor, informe o nome de usuário ou arroba.');
      return;
    }

    setIsSearching(true);
    let clean = handle.trim();
    if (!clean.startsWith('@')) {
      clean = `@${clean}`;
    }

    storage.addContact(currentUser.id, clean, name.trim()).then((result) => {
      setIsSearching(false);
      if (result.success && result.chat) {
        setSuccessMsg('Contato adicionado com sucesso!');
        setTimeout(() => {
          onContactAdded(result.chat!);
        }, 300);
      } else {
        setError(result.message || 'Não foi possível adicionar o contato.');
      }
    }).catch(() => {
      setIsSearching(false);
      setError('Erro de conexão ao adicionar contato.');
    });
  };

  return (
    <div className="flex flex-col h-full bg-white select-none animate-panel-slide-left">
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
        <h2 className="text-base font-bold text-white tracking-tight">Novo Contato</h2>
      </div>

      {/* Form content */}
      <div className="p-5 flex-1 overflow-y-auto space-y-5">
        <p className="text-xs text-slate-500">
          Informe o nome e o usuário da pessoa para iniciar uma conversa direta.
        </p>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-start gap-2.5">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1º: Nome da pessoa (First as requested) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nome da Pessoa
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Eduardo"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                autoFocus
              />
            </div>
          </div>

          {/* 2º: Usuário / Arroba (sem obrigar a digitar @) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Usuário ou Arroba
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <AtSign className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={handle}
                onChange={(e) => handleHandleChange(e.target.value)}
                placeholder="Ex: carlos ou @carlos"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Não precisa digitar o @ se não quiser.
            </p>
          </div>

          {/* Action button */}
          <button
            type="submit"
            disabled={isSearching}
            className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            {isSearching ? (
              <>
                <Search className="w-4 h-4 animate-spin" />
                <span>Buscando contato...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Adicionar Contato</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
