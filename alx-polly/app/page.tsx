import Link from 'next/link';
import { ArrowRight, BarChart3, CalendarClock, Download, Link2, QrCode, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroQr } from '@/components/HeroQr';
import { resolveSiteUrl } from '@/lib/seo';

const FEATURES = [
  {
    Icon: QrCode,
    title: 'Share anywhere',
    text: 'Every poll gets its own link and a QR code you can download, print or put on a slide.',
  },
  {
    Icon: BarChart3,
    title: 'Live results',
    text: 'Votes show up on the page within seconds, as counts and percentages that always add up.',
  },
  {
    Icon: ShieldCheck,
    title: 'Fair by design',
    text: 'One vote per browser, optional sign-in for voters, and bot protection when you switch it on.',
  },
  {
    Icon: CalendarClock,
    title: 'Close on schedule',
    text: 'Set a closing time or end voting yourself. You can even hold results back until the poll closes.',
  },
  {
    Icon: Link2,
    title: 'Unlisted by default',
    text: 'Polls cannot be browsed or searched. Only people you send the link to can find them.',
  },
  {
    Icon: Download,
    title: 'Take the data with you',
    text: 'Export results as a CSV when you want to dig deeper in a spreadsheet.',
  },
];

const STEPS = [
  { n: '1', title: 'Write your question', text: 'Add two to twenty options. Add a closing time if you want one.' },
  { n: '2', title: 'Share the link or QR code', text: 'Send it in a chat, show it on a screen, or print it on a flyer.' },
  { n: '3', title: 'Watch the votes arrive', text: 'Results update live. Close the poll and export when you are done.' },
];

const DEMO = [
  { label: 'Lisbon', pct: 46, votes: 59, lead: true },
  { label: 'Cape Town', pct: 31, votes: 40, lead: false },
  { label: 'Mexico City', pct: 23, votes: 29, lead: false },
];

export default function Home() {
  const siteUrl = resolveSiteUrl();

  return (
    <div className="space-y-24 overflow-x-clip sm:space-y-32">
      {/* Hero */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="animate-fade-up">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-accent/70 px-3.5 py-1.5 text-sm font-medium text-accent-foreground">
            <span aria-hidden="true" className="bg-brand size-2 rounded-full" />
            Free polls with instant QR sharing
          </p>
          <h1 className="text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Ask the room.
            <br />
            <span className="text-brand">See the answer</span> in seconds.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Make a poll in under a minute, share it with a link or a QR code, and watch live results come in. No
            sign-up for voters.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link href="/polls/new">
                Create a poll <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {['Free to use', 'No app to install', 'Works on any phone'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden="true" className="flex size-4 items-center justify-center rounded-full bg-success-soft text-[10px] font-bold text-success">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Product mock-up */}
        <div className="relative mx-auto w-full max-w-md animate-fade-up lg:max-w-none" style={{ '--delay': '0.15s' } as React.CSSProperties} aria-hidden="true">
          <div className="bg-brand absolute -inset-4 -z-10 rotate-3 rounded-[2rem] opacity-20 blur-2xl dark:opacity-45" />
          <div className="rounded-3xl border border-border/70 bg-card p-6 pb-24 shadow-lift sm:p-8 sm:pb-20">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">Open</span>
              <span className="text-xs text-muted-foreground">128 votes</span>
            </div>
            <p className="font-display mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-[1.7rem]" style={{ fontFamily: 'var(--font-bricolage), system-ui, sans-serif' }}>
              Where should we host the team offsite?
            </p>
            <ul className="mt-6 space-y-4">
              {DEMO.map((d, i) => (
                <li key={d.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-semibold">
                      {d.label}
                      {d.lead && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Leading</span>}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{d.pct}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`animate-bar h-full rounded-full ${d.lead ? 'bg-brand' : 'bg-primary/35'}`}
                      style={{ width: `${d.pct}%`, '--delay': `${0.5 + i * 0.15}s` } as React.CSSProperties}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div
            className="animate-float absolute -bottom-7 right-0 flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-lift"
            style={{ '--r': '-4deg' } as React.CSSProperties}
          >
            <HeroQr value={siteUrl} />
            <div className="pr-1 text-sm leading-tight">
              <p className="font-bold">Scan to vote</p>
              <p className="text-xs text-muted-foreground">Opens on any phone</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="features-title">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 id="features-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything a good poll needs
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">Simple for the people who vote. Powerful for the person who asks.</p>
        </div>
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }, i) => (
            <li
              key={title}
              className="animate-fade-up group rounded-2xl border border-border/70 bg-card p-6 shadow-soft transition-all duration-300 dark:bg-gradient-to-b dark:from-white/[0.06] dark:to-card hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift"
              style={{ '--delay': `${i * 0.06}s` } as React.CSSProperties}
            >
              <span className="bg-brand mb-5 inline-flex size-11 items-center justify-center rounded-xl text-white shadow-soft transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-title" className="scroll-mt-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 id="how-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            From question to answer in three steps
          </h2>
        </div>
        <ol className="grid list-none gap-5 p-0 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="relative rounded-2xl border border-border/70 bg-card/70 p-7">
              <span aria-hidden="true" className="text-brand font-display text-6xl font-extrabold leading-none">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing call to action */}
      <section aria-labelledby="cta-title" className="bg-brand relative overflow-hidden rounded-3xl px-6 py-14 text-center text-white shadow-lift sm:px-12 sm:py-20">
        <div aria-hidden="true" className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)' }} />
        <div className="relative">
          <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Ready to ask your first question?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">It takes less than a minute, and voters never need an account.</p>
          <Link
            href="/polls/new"
            className="mt-9 inline-flex h-14 items-center gap-2 rounded-xl bg-white px-9 text-lg font-bold text-[hsl(254_78%_40%)] shadow-lift transition-all hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Create a poll <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
