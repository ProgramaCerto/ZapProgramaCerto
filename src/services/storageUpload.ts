import { getSupabaseClient } from './supabase';
import { compressImage } from '../utils/image';

/**
 * Converte base64 / Data URL para Blob para upload eficiente no Supabase Storage
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0]?.split(':')[1] || 'image/jpeg';
  const raw = window.atob(parts[1] || '');
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

/**
 * Envia uma foto para o Supabase Storage (Banco de Fotos)
 * e retorna a URL pública permanente da imagem.
 */
export async function uploadPhotoToSupabase(
  fileOrBase64: File | string,
  userId?: string
): Promise<string> {
  // 1. Otimiza e comprime a foto para envio rápido e leve
  let compressedBase64 = '';
  try {
    compressedBase64 = await compressImage(fileOrBase64, 1280, 1280, 0.78);
  } catch (err) {
    console.warn('Compressão falhou, prosseguindo com imagem original:', err);
    if (typeof fileOrBase64 === 'string') {
      compressedBase64 = fileOrBase64;
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    return compressedBase64 || (typeof fileOrBase64 === 'string' ? fileOrBase64 : '');
  }

  try {
    const blob = compressedBase64
      ? dataUrlToBlob(compressedBase64)
      : typeof fileOrBase64 === 'string'
      ? dataUrlToBlob(fileOrBase64)
      : fileOrBase64;

    const folder = (userId || 'geral').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;

    // Lista de buckets candidatos para armazenar as fotos
    // 'fotos' é o padrão principal solicitado pelo usuário
    const candidateBuckets = ['fotos', 'banco_de_fotos', 'bancodefotos', 'imagens', 'chat', 'public'];

    // Descobrir se há algum bucket existente configurado no Supabase
    let preferredBucket = 'fotos';
    try {
      const { data: buckets } = await client.storage.listBuckets();
      if (buckets && buckets.length > 0) {
        const found = buckets.find((b) =>
          candidateBuckets.includes(b.name.toLowerCase())
        );
        if (found) {
          preferredBucket = found.name;
        } else {
          preferredBucket = buckets[0].name;
        }
      }
    } catch {
      // Ignora erro de listagem (pode ser restrição de RLS) e tenta o bucket 'fotos'
    }

    // Tentar upload no preferredBucket
    const { data: uploadData, error: uploadError } = await client.storage
      .from(preferredBucket)
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (!uploadError && uploadData) {
      const { data: publicUrlData } = client.storage
        .from(preferredBucket)
        .getPublicUrl(fileName);

      if (publicUrlData?.publicUrl) {
        console.log(`Foto salva com sucesso no Supabase Storage (${preferredBucket}):`, publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
      }
    }

    // Se o upload falhou no bucket preferido, testar os outros buckets candidatos
    for (const bucketName of candidateBuckets) {
      if (bucketName === preferredBucket) continue;

      const { data: fbData, error: fbError } = await client.storage
        .from(bucketName)
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (!fbError && fbData) {
        const { data: fbUrlData } = client.storage
          .from(bucketName)
          .getPublicUrl(fileName);

        if (fbUrlData?.publicUrl) {
          console.log(`Foto salva com sucesso no Supabase Storage (${bucketName}):`, fbUrlData.publicUrl);
          return fbUrlData.publicUrl;
        }
      }
    }

    // Se todos os buckets de storage falharam (ex: bucket ainda não criado no Supabase),
    // retorna a imagem comprimida como fallback temporário
    console.warn(
      'Não foi possível enviar para o bucket do Supabase Storage. Verifique se o bucket "fotos" foi criado no Supabase com acesso público.'
    );
    return compressedBase64;
  } catch (err) {
    console.error('Erro ao enviar foto para Supabase Storage:', err);
    return compressedBase64;
  }
}
