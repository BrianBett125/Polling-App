import { Check } from 'lucide-react';

// Fixed offsets so server and client markup match and nothing random runs at render time.
const BITS = [
  { dx: '-92px', dy: '-70px', rot: '220deg', c: 'bg-[hsl(243_75%_60%)]', d: '0s' },
  { dx: '-60px', dy: '-96px', rot: '-160deg', c: 'bg-[hsl(292_72%_58%)]', d: '0.03s' },
  { dx: '-24px', dy: '-110px', rot: '300deg', c: 'bg-[hsl(42_95%_58%)]', d: '0.06s' },
  { dx: '20px', dy: '-104px', rot: '-240deg', c: 'bg-[hsl(152_60%_46%)]', d: '0.02s' },
  { dx: '58px', dy: '-92px', rot: '180deg', c: 'bg-[hsl(266_78%_62%)]', d: '0.05s' },
  { dx: '92px', dy: '-62px', rot: '-300deg', c: 'bg-[hsl(14_90%_60%)]', d: '0.01s' },
  { dx: '-104px', dy: '-24px', rot: '140deg', c: 'bg-[hsl(42_95%_58%)]', d: '0.08s' },
  { dx: '104px', dy: '-30px', rot: '-120deg', c: 'bg-[hsl(243_75%_60%)]', d: '0.07s' },
];

/** "Your vote is in" moment shown once a browser has voted: a popping check, a few confetti bits. CSS only. */
export function VoteThanks({ closed }: { closed: boolean }) {
  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-success/30 bg-success-soft p-5" role="status">
      <div className="relative shrink-0">
        <span className="animate-pop bg-brand flex size-12 items-center justify-center rounded-full text-white shadow-soft">
          <Check className="size-6" strokeWidth={3} aria-hidden="true" />
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2">
          {BITS.map((b, i) => (
            <span
              key={i}
              className={`confetti-bit absolute -ml-1 -mt-1 block h-2 w-1.5 rounded-[2px] ${b.c}`}
              style={{ '--dx': b.dx, '--dy': b.dy, '--rot': b.rot, '--delay': b.d } as React.CSSProperties}
            />
          ))}
        </span>
      </div>
      <div>
        <p className="font-display text-lg font-extrabold leading-tight text-success" style={{ fontFamily: 'var(--font-bricolage), system-ui, sans-serif' }}>
          Your vote is in
        </p>
        <p className="text-sm text-foreground/80">{closed ? 'Here are the final results.' : 'Thanks for taking part. Results update live below.'}</p>
      </div>
    </div>
  );
}
