'use client';

import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type SettingsDefaults = {
  /** `datetime-local` value in the browser's timezone, or "". */
  closesAtLocal: string;
  requireLogin: boolean;
  resultsVisibility: 'always' | 'after_close';
};

export const DEFAULT_SETTINGS: SettingsDefaults = { closesAtLocal: '', requireLogin: false, resultsVisibility: 'always' };

/**
 * Closing time, sign-in requirement and results visibility, shared by the create and edit forms.
 * Field names: `closes_at_local` (the parent converts it to UTC ISO as `closes_at` on submit, in the
 * browser's timezone), `require_login`, `results_visibility`.
 */
export function PollSettingsFields({
  defaults = DEFAULT_SETTINGS,
  closingTimeHint,
}: {
  defaults?: SettingsDefaults;
  /** Replaces the default help under the date field (e.g. the poll already closed by its closing time). */
  closingTimeHint?: string;
}) {
  return (
    <fieldset className="grid gap-5 rounded-2xl border border-border/70 bg-muted/40 p-5">
      <legend className="rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-wider text-secondary-foreground">Settings</legend>

      <div className="space-y-2">
        <Label htmlFor="closes_at_local">Closing date and time (optional)</Label>
        <Input
          id="closes_at_local"
          name="closes_at_local"
          type="datetime-local"
          defaultValue={defaults.closesAtLocal}
          aria-describedby="closes_at_help"
        />
        <p id="closes_at_help" className="text-xs text-muted-foreground">
          {closingTimeHint ??
            "Uses your browser's time zone. Must be in the future. Leave empty to keep voting open until you close it."}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-accent/50">
        <input
          id="require_login"
          name="require_login"
          type="checkbox"
          defaultChecked={defaults.requireLogin}
          className="mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-muted-foreground/60 bg-card transition-colors checked:border-transparent checked:bg-brand checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M5 10.5l3.2 3.2L15 6.8%22/></svg>')] checked:bg-center checked:bg-no-repeat"
          aria-describedby="require_login_help"
        />
        <div>
          <Label htmlFor="require_login" className="cursor-pointer text-[15px]">Require sign-in to vote</Label>
          <p id="require_login_help" className="mt-1 text-xs text-muted-foreground">
            One vote per account, even across browsers. Visitors can still see the poll without signing in.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="results_visibility">Results visibility</Label>
        <div className="relative">
        <select
          id="results_visibility"
          name="results_visibility"
          defaultValue={defaults.resultsVisibility}
          className="flex h-11 w-full cursor-pointer appearance-none rounded-xl pr-10 border border-input bg-background/80 px-3.5 py-2 text-sm shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          <option value="always">Always show results</option>
          <option value="after_close">Only after the poll closes</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-xs text-muted-foreground">You always see the results as the owner.</p>
      </div>
    </fieldset>
  );
}
