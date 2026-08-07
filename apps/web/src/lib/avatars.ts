/**
 * Mirrors apps/server/src/auth/avatars.ts's AVATAR_OPTIONS exactly — the server is the
 * actual authority (PATCH /auth/me rejects anything not in its own copy of this list),
 * this is just what SettingsModal's picker renders. Hand-mirrored, same reasoning as
 * the client/server wire-type duplication elsewhere in this codebase: no shared
 * package between the two processes.
 */
export const AVATAR_OPTIONS = [
  '😀', '🦁', '🐯', '🐻', '🐼', '🦊', '🐸', '🐙', '🦉', '🐢', '🐲', '🦅', '⚡', '🌟', '🎯', '🏆',
] as const;

/** Mirrors the server's own cap (auth/avatars.ts's MAX_AVATAR_IMAGE_BYTES) — kept here too so the picker can reject an image that's still too large *after* downscaling without a round trip to the server. */
export const MAX_AVATAR_IMAGE_BYTES = 300_000;

const AVATAR_IMAGE_SIDE = 160; // px — plenty for every place this renders (SettingsModal's preview is the largest, at 48px).

/**
 * Downscales/crops any uploaded image to a small square JPEG data URL, client-side,
 * before it ever reaches the server — the server's own size cap is a backstop against
 * a client that skips this, not the primary control. A canvas is the simplest way to
 * get "resize + center-crop to square + re-encode smaller" without a new dependency;
 * `createImageBitmap`/`<img>` + `<canvas>` are both already available in every browser
 * this app targets.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = (bitmap.width - side) / 2;
  const sourceY = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_IMAGE_SIDE;
  canvas.height = AVATAR_IMAGE_SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Couldn't process that image — try a different one.");
  ctx.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, AVATAR_IMAGE_SIDE, AVATAR_IMAGE_SIDE);
  bitmap.close();

  // Step the JPEG quality down until it clears the size cap — a 160×160 photo rarely
  // needs this, but a very high-entropy source image (noise, dense text) still could.
  for (const quality of [0.85, 0.7, 0.5, 0.35]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
    const approxBytes = (base64Length * 3) / 4;
    if (approxBytes <= MAX_AVATAR_IMAGE_BYTES) return dataUrl;
  }
  throw new Error("That image is too detailed to shrink under the size limit — try a simpler photo.");
}
