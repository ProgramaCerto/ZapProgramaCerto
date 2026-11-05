import React from 'react';
import { X, AtSign, Calendar, MessageSquare, Shield, CheckCircle } from 'lucide-react';
import { User } from '../../types/chat';

interface ContactInfoModalProps {
  contact: User | null;
  onClose: () => void;
}

export const ContactInfoModal: React.FC<ContactInfoModalProps> = ({ contact, onClose }) => {
  if (!contact) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-modal-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-modal-content"
      >
        {/* Header */}
        <div className="relative h-28 bg-gradient-to-r from-blue-600 to-blue-500">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-black/20 hover:bg-black/30 text-white rounded-full transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar & Info */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="-mt-12 mb-3 inline-block">
            <img
              src={contact.avatar}
              alt={contact.name}
              className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-md bg-white"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-bold text-slate-900">{contact.name}</h3>
          </div>
          <p className="text-sm font-semibold text-blue-600 mb-4">{contact.handle}</p>

          <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
            {contact.bio && (
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                  Recado
                </span>
                <p className="text-sm text-slate-700 mt-0.5">{contact.bio}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Cadastrado em{' '}
                {new Date(contact.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-600">
              <Shield className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Criptografia de ponta a ponta ativa</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
