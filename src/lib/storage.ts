import { supabase } from './supabase';
import { compressToWebPBlob, isWebPSupported } from './imageOptimizer';
import { Model } from '../types';

export const BUCKET_NAME = 'model-photos';

/**
 * Ensures the Supabase Storage bucket exists and is configured as public.
 */
export const ensureStorageBucket = async (): Promise<boolean> => {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (!error && buckets) {
      const exists = buckets.some(b => b.name === BUCKET_NAME);
      if (exists) return true;
    }
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/gif']
    });
    if (!createError) return true;
  } catch (e) {
    console.warn("Notice: Storage bucket check:", e);
  }
  return true;
};

/**
 * Uploads an image (File or base64 data URL) to Supabase Storage after compressing to WebP format.
 * Returns the direct public URL of the stored file.
 */
export const uploadImageToSupabaseStorage = async (
  input: File | string,
  folderName: string = 'models'
): Promise<string> => {
  try {
    // If it's already an HTTP or HTTPS public URL, return directly
    if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
      return input;
    }

    // Convert input to WebP Blob
    const webpBlob = await compressToWebPBlob(input, {
      maxWidth: 1200,
      maxHeight: 1600,
      quality: 0.82
    });

    const fileExt = isWebPSupported() ? 'webp' : 'jpg';
    const fileName = `${folderName}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    // Upload blob to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, webpBlob, {
        contentType: isWebPSupported() ? 'image/webp' : 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.warn("Upload to Supabase Storage error:", uploadError);
      // Fallback: If Storage upload fails, fallback gracefully to base64 if available
      if (typeof input === 'string' && input.startsWith('data:')) {
        return input;
      }
      throw uploadError;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path);

    if (publicUrlData && publicUrlData.publicUrl) {
      return publicUrlData.publicUrl;
    } else {
      throw new Error("No se pudo obtener la URL pública de la imagen en Supabase Storage");
    }
  } catch (err) {
    console.error("Error al subir a Supabase Storage:", err);
    if (typeof input === 'string') {
      return input;
    }
    throw err;
  }
};

/**
 * Migrates all Base64 photos in the database models table to Supabase Storage.
 * Replaces Base64 strings with direct public Storage URLs in the models' photos column.
 */
export const migrateAllBase64PhotosToStorage = async (
  models: Model[],
  onProgress?: (processed: number, total: number, currentModel: string, migratedCount: number) => void
): Promise<{ totalProcessed: number; totalModelsMigrated: number; totalPhotosMigrated: number }> => {
  await ensureStorageBucket();

  let totalModelsMigrated = 0;
  let totalPhotosMigrated = 0;
  const totalModels = models.length;

  for (let i = 0; i < totalModels; i++) {
    const model = models[i];
    const photos = model.photos || [];
    let hasChanges = false;
    const updatedPhotos: string[] = [];

    for (const photo of photos) {
      if (typeof photo === 'string' && (photo.startsWith('data:') || (!photo.startsWith('http://') && !photo.startsWith('https://') && !photo.startsWith('/')))) {
        try {
          const publicStorageUrl = await uploadImageToSupabaseStorage(photo, `models/${model.id || 'new'}`);
          if (publicStorageUrl && publicStorageUrl.startsWith('http')) {
            updatedPhotos.push(publicStorageUrl);
            hasChanges = true;
            totalPhotosMigrated++;
          } else {
            updatedPhotos.push(photo);
          }
        } catch (e) {
          console.warn(`Error migrando foto de ${model.nombre}:`, e);
          updatedPhotos.push(photo);
        }
      } else {
        updatedPhotos.push(photo);
      }
    }

    if (hasChanges) {
      try {
        const { error } = await supabase
          .from('models')
          .update({ photos: updatedPhotos })
          .eq('id', model.id);

        if (!error) {
          totalModelsMigrated++;
        } else {
          console.error(`Error actualizando modelo en BD para ${model.nombre}:`, error);
        }
      } catch (dbErr) {
        console.error(`Error de base de datos para ${model.nombre}:`, dbErr);
      }
    }

    if (onProgress) {
      onProgress(i + 1, totalModels, `${model.nombre} ${model.apellidos}`, totalPhotosMigrated);
    }
  }

  return {
    totalProcessed: totalModels,
    totalModelsMigrated,
    totalPhotosMigrated
  };
};

/**
 * Migra de forma segura y fila por fila las fotografías en Base64 de casting_applications
 * hacia Supabase Storage, reemplazando solo cuando la URL pública está confirmada.
 * Procesa una fila a la vez para evitar timeouts y saturación de Disco E/S en Postgres.
 */
export const migrateCastingBase64PhotosToStorage = async (
  applicationIds: number[],
  onProgress?: (processed: number, total: number, migratedRows: number, migratedPhotos: number) => void
): Promise<{
  totalProcessed: number;
  totalRowsMigrated: number;
  totalPhotosMigrated: number;
  failedCount: number;
}> => {
  await ensureStorageBucket();

  let totalRowsMigrated = 0;
  let totalPhotosMigrated = 0;
  let failedCount = 0;
  const total = applicationIds.length;

  for (let i = 0; i < total; i++) {
    const id = applicationIds[i];
    try {
      const { data: row, error: readErr } = await supabase
        .from('casting_applications')
        .select('id,foto_cara,foto_cuerpo')
        .eq('id', id)
        .maybeSingle();

      if (readErr || !row) {
        if (readErr) failedCount++;
      } else {
        const patch: Record<string, string> = {};
        let photosInRow = 0;

        if (typeof row.foto_cara === 'string' && row.foto_cara.startsWith('data:')) {
          const uploadedCara = await uploadImageToSupabaseStorage(row.foto_cara, `casting/app_${id}`);
          if (uploadedCara && (uploadedCara.startsWith('http://') || uploadedCara.startsWith('https://'))) {
            patch.foto_cara = uploadedCara;
            photosInRow++;
          } else {
            failedCount++;
          }
        }

        if (typeof row.foto_cuerpo === 'string' && row.foto_cuerpo.startsWith('data:')) {
          const uploadedCuerpo = await uploadImageToSupabaseStorage(row.foto_cuerpo, `casting/app_${id}`);
          if (uploadedCuerpo && (uploadedCuerpo.startsWith('http://') || uploadedCuerpo.startsWith('https://'))) {
            patch.foto_cuerpo = uploadedCuerpo;
            photosInRow++;
          } else {
            failedCount++;
          }
        }

        if (Object.keys(patch).length > 0) {
          const { error: updateErr } = await supabase
            .from('casting_applications')
            .update(patch)
            .eq('id', id);

          if (!updateErr) {
            totalRowsMigrated++;
            totalPhotosMigrated += photosInRow;
          } else {
            failedCount++;
          }
        }
      }
    } catch {
      failedCount++;
    }

    if (onProgress) {
      onProgress(i + 1, total, totalRowsMigrated, totalPhotosMigrated);
    }

    // Pequeña pausa entre filas para mantener el uso de Disco E/S bajo la línea base
    if (i < total - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  return {
    totalProcessed: total,
    totalRowsMigrated,
    totalPhotosMigrated,
    failedCount,
  };
};

