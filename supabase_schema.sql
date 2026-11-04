-- ==============================================================================
-- SCHEMA ZAPPROGRAMACERTO PARA SUPABASE (PostgreSQL)
-- Tabelas: usuarios, contatos, mensagens
-- Políticas RLS: FOR ALL com USING (true) e WITH CHECK (true)
-- ==============================================================================

-- 1. Habilitar geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de USUÁRIOS
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    arroba TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT DEFAULT 'Disponível no ZapProgramaCerto',
    online BOOLEAN DEFAULT false,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_usuarios_arroba ON public.usuarios (LOWER(arroba));

-- 3. Tabela de CONTATOS
CREATE TABLE IF NOT EXISTS public.contatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    contato_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    nome_salvo TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT uq_usuario_contato UNIQUE (usuario_id, contato_id)
);

CREATE INDEX IF NOT EXISTS idx_contatos_usuario ON public.contatos (usuario_id);

-- 4. Tabela de MENSAGENS
-- tipo: 'text', 'image', 'audio'
-- status:
--   'nao_chegou' -> mensagem ainda não chegou no celular da pessoa (nenhuma bolinha)
--   'nao_lida'   -> mensagem tocou no celular da pessoa (bolinha branca/cinza)
--   'lida'       -> a pessoa visualizou a mensagem (bolinha azul)
CREATE TABLE IF NOT EXISTS public.mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remetente_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    destinatario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'text',
    texto TEXT,
    fotos_anexadas TEXT, -- links das fotos anexadas separados por vírgula
    audio_url TEXT,
    audio_duracao NUMERIC(6, 2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'nao_chegou',
    criado_em TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa 
ON public.mensagens (remetente_id, destinatario_id, criado_em);

-- 5. HABILITAR ROW LEVEL SECURITY (RLS) E CRIAR POLÍTICAS "ALL" COM "TRUE"
-- Tabela usuarios:
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissao total usuarios" ON public.usuarios;
CREATE POLICY "Permissao total usuarios" 
ON public.usuarios 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Tabela contatos:
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissao total contatos" ON public.contatos;
CREATE POLICY "Permissao total contatos" 
ON public.contatos 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Tabela mensagens:
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissao total mensagens" ON public.mensagens;
CREATE POLICY "Permissao total mensagens" 
ON public.mensagens 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 6. CONCEDER PERMISSÕES COMPLETAS PARA OS PAPÉIS ANON E AUTHENTICATED
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 7. HABILITAR SUPABASE REALTIME PARA SINCRONIZAÇÃO CONTÍNUA
ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contatos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;

-- 8. DADOS INICIAIS DE TESTE (OPCIONAL)
INSERT INTO public.usuarios (nome, arroba, senha, avatar_url, bio, online)
VALUES 
  ('Ana Clara', '@ana', '123', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'Designer UI/UX', true),
  ('Carlos Eduardo', '@carlos', '123', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Desenvolvedor Full Stack', true),
  ('Maria Silva', '@mariasilva', '123', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Sempre conectada!', true)
ON CONFLICT (arroba) DO NOTHING;

