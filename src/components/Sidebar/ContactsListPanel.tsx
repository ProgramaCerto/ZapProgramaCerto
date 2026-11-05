import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, User as UserIcon, UserPlus, MessageSquare } from 'lucide-react';
import { storage } from '../../services/storage';
import { User as UserType } from '../../types/chat';

interface ContactsListPanelProps {
  currentUser: UserType;
  onBack: () => void;
  onSelectContact: (contact: UserType) => void;
  onOpenAddContact: () => void;
}

export const ContactsListPanel: React.FC<ContactsListPanelProps> = ({
  currentUser,
  onBack,
  onSelectContact,
  onOpenAddContact,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<UserType[]>([]);

  const loadContacts = () => {
    const saved = storage.getSavedContacts().filter((sc) => sc.usuario_id === currentUser.id);
    const allUsers = storage.getUsers();

    const list: UserType[] = [];
    for (const sc of saved) {
      const u = allUsers.find((user) => user.id === sc.contato_id);
      if (u) {
        list.push({
          ...u,
          name: sc.nome_salvo || u.name,
        });
      }
    }
    setContacts(list);
  };

  useEffect(() => {
    loadContacts();
    const unsub = storage.subscribe(() => {
      loadContacts();
    });
    return () => unsub();
  }, [currentUser.id]);

  const filteredContacts = contacts.filter((c) => {
    const term = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(term) || c.handle.toLowerCase().includes(term);
  });

  return (
    <div className="flex flex-col h-full bg-white select-none animate-panel-slide-left">
      {/* WhatsApp style header with back arrow */}
      <div className="flex items-center gap-3 px-4 py-4 bg-blue-600 text-white shrink-0 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para conversas"
          className="p-1.5 hover:bg-blue-700 active:scale-95 rounded-full transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white tracking-tight leading-tight">Contatos</h2>
          <p className="text-[11px] text-blue-100 font-medium">
            {contacts.length} {contacts.length === 1 ? 'contato' : 'contatos'}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/60">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquise um contato"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
            autoFocus
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80">
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {contacts.length === 0 ? 'Nenhum contato adicionado' : 'Nenhum contato encontrado'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                {contacts.length === 0
                  ? 'Adicione seus amigos para conversar de forma rápida e segura.'
                  : 'Tente pesquisar com outro nome ou usuário.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAddContact}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-xs rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Adicionar Novo Contato</span>
            </button>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => onSelectContact(contact)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-blue-50/50 active:scale-[0.98] cursor-pointer transition-all duration-150"
            >
              <div className="relative shrink-0">
                {contact.avatar ? (
                  <img
                    src={contact.avatar}
                    alt={contact.name}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{contact.name}</h3>
                <p className="text-xs text-blue-600 font-medium truncate">{contact.handle}</p>
                {contact.bio && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{contact.bio}</p>
                )}
              </div>

              <div className="p-2 text-slate-400 hover:text-blue-600">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
