interface AvatarProps {
  size: number;
  /** A real uploaded photo (`lib/avatars.ts`'s `fileToAvatarDataUrl`) — takes priority over `emoji` when both are set. */
  imageUrl?: string | null | undefined;
  emoji?: string | null | undefined;
  /** Shown when neither `imageUrl` nor `emoji` is set — the account's own initial. */
  fallbackLetter: string;
}

/**
 * The one place that decides "photo, or emoji, or plain initial" — three call sites
 * (ProfileButton, PlayerCard, OnlineGameScreen's opponent card) all needed the exact
 * same fallback chain once a real uploaded photo became a third option alongside the
 * existing emoji picker, so it's a shared component rather than three copies of the
 * same branching.
 */
export function Avatar({ size, imageUrl, emoji, fallbackLetter }: AvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          objectFit: 'cover',
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: 'var(--accent-on)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: emoji ? Math.round(size * 0.5) : 'var(--fs-meta)',
        fontWeight: 700,
      }}
    >
      {emoji ?? fallbackLetter}
    </span>
  );
}
