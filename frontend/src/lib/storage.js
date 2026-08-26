import { supabase } from './supabaseClient.js';

const BUCKET = 'evidencias';

/**
 * Sube un archivo (File o Blob) al bucket público "evidencias" y devuelve su URL pública.
 * @param {string} path   ej: "tickets/24FA11BI10A163930/foto.jpg"
 * @param {Blob}   blob
 */
export async function subirArchivo(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'application/octet-stream'
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Convierte un dataURL (canvas.toDataURL) en Blob, para subirlo con subirArchivo(). */
export function dataUrlABlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
