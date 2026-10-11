import { BarChart3, QrCode, Zap } from 'lucide-react';

const POINTS = [
  { Icon: Zap, text: 'Make a poll in under a minute' },
  { Icon: QrCode, text: 'Share it with a link or a QR code' },
  { Icon: BarChart3, text: 'Watch live results as votes arrive' },
];

/** Sign-in, sign-up and password pages share this split layout: a brand panel beside the form. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-[1fr_1.05fr]">
      <aside
        aria-hidden="true"
        className="bg-brand relative hidden overflow-hidden rounded-3xl p-10 text-white shadow-lift lg:flex lg:flex-col lg:justify-between"
      >
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 size-72 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="relative">
          <p className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight" style={{ fontFamily: 'var(--font-bricolage), system-ui, sans-serif' }}>
            Ask the room.
            <br />
            See the answer.
          </p>
          <p className="mt-4 max-w-xs text-lg text-white/90">Sign in to create polls and keep track of every vote.</p>
        </div>
        <ul className="relative mt-12 space-y-4">
          {POINTS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 text-[15px] font-medium backdrop-blur-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Icon className="size-5" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex items-center">
        <div className="animate-fade-up w-full">{children}</div>
      </div>
    </div>
  );
}
