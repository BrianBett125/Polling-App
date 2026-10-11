'use client';

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
    <fieldset className="space-y-4 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">Settings</legend>

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

      <div className="flex items-start gap-2">
        <input
          id="require_login"
          name="require_login"
          type="checkbox"
          defaultChecked={defaults.requireLogin}
          className="mt-1 size-4"
          aria-describedby="require_login_help"
        />
        <div>
          <Label htmlFor="require_login">Require sign-in to vote</Label>
          <p id="require_login_help" className="text-xs text-muted-foreground">
            One vote per account, even across browsers. Visitors can still see the poll without signing in.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="results_visibility">Results visibility</Label>
        <select
          id="results_visibility"
          name="results_visibility"
          defaultValue={defaults.resultsVisibility}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="always">Always show results</option>
          <option value="after_close">Only after the poll closes</option>
        </select>
        <p className="text-xs text-muted-foreground">You always see the results as the owner.</p>
      </div>
    </fieldset>
  );
}
