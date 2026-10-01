import { COUNTRIES } from '@leaddesk/shared';
import { avatarStyle, cn, initials } from '@/lib/utils';

/**
 * Owner avatar: two-letter initials on the user's colour with a contrast-checked text colour.
 * `showName` prints the first name next to it, because the title tooltip is unreachable on touch.
 */
export function UserAvatar({
  name,
  color,
  size = 'sm',
  showName = false,
  className,
}: {
  name: string;
  color: string;
  size?: 'xs' | 'sm';
  showName?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)} title={name}>
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
          size === 'xs' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]',
        )}
        style={avatarStyle(color)}
      >
        {initials(name)}
      </span>
      {showName ? (
        <span className="truncate text-xs text-slate-300">{name.split(' ')[0]}</span>
      ) : null}
      <span className="sr-only">
        {showName ? name.split(' ').slice(1).join(' ') : `Owner: ${name}`}
      </span>
    </span>
  );
}

/** Country as a short text code ("IT"). Flag emoji render as bare letters on Windows. */
export function CountryCode({ code }: { code: string }) {
  return (
    <abbr
      title={COUNTRIES[code.toUpperCase() as keyof typeof COUNTRIES]?.name ?? code}
      className="rounded bg-slate-800 px-1 text-[10px] font-medium tracking-wide text-slate-300 no-underline"
    >
      {code.toUpperCase()}
    </abbr>
  );
}
