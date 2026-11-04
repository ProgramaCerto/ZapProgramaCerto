/**
 * Utility to compress and resize images before sending over network
 * Prevents Supabase 413 Payload Too Large errors and speeds up real-time delivery
 */
export function compressImage(
  dataUrlOrFile: string | File,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const processImage = (src: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let { width, height } = img;

        // Calculate aspect-ratio preserved dimensions
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        // Draw and compress to JPEG
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };

      img.onerror = () => {
        // Fallback to original if compression fails
        resolve(src);
      };

      img.src = src;
    };

    if (typeof dataUrlOrFile === 'string') {
      processImage(dataUrlOrFile);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        processImage(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error('Falha ao ler o arquivo de imagem'));
      };
      reader.readAsDataURL(dataUrlOrFile);
    }
  });
}
