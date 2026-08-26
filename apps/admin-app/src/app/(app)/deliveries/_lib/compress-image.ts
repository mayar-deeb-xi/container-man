/**
 * Downscales a photo before upload, when it is worth it.
 *
 * The deploy target caps request bodies well below what a phone camera produces
 * (Vercel refuses around 4.5 MB), so a raw 12-megapixel JPEG would upload fine in
 * development and 413 in production. A pallet photo is evidence, not art: 2560 px on
 * the long edge keeps labels readable at a fraction of the bytes.
 *
 * Every failure path falls back to the original file — a browser without canvas
 * support should degrade to "big uploads may fail", never to "uploads are broken".
 */

const MAX_DIMENSION = 2_560;
/** Below this, recompression saves little and costs quality — send as-is. */
const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

export interface PreparedUpload {
  file: Blob | File;
  fileName: string;
}

export async function prepareImageUpload(file: File): Promise<PreparedUpload> {
  if (!file.type.startsWith("image/") || file.size <= COMPRESS_THRESHOLD_BYTES) {
    return { file, fileName: file.name };
  }

  try {
    // `from-image` honors the EXIF orientation, so a portrait phone photo is not
    // silently rotated by the resize. Older lib typings predate the option.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return { file, fileName: file.name };

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );

    // A recompression that did not shrink the file is pure quality loss — keep the original.
    if (!blob || blob.size >= file.size) return { file, fileName: file.name };

    return { file: blob, fileName: file.name.replace(/\.[^.]*$/, "") + ".jpg" };
  } catch {
    return { file, fileName: file.name };
  }
}
