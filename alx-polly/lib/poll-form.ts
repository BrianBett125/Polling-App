export const LIMITS = { title: 200, description: 2000, option: 200, minOptions: 2, maxOptions: 20 } as const;

export type PollFormValue = { title: string; description: string; options: string[] };
export type ParseResult = { ok: true; value: PollFormValue } | { ok: false; error: string };

/** Validate the create-poll form. Mirrors the database limits so users get friendly errors first. */
export function parsePollForm(formData: FormData): ParseResult {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  const options = Array.from(formData.keys())
    .filter((k) => /^option-\d+$/.test(k))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
    .map((k) => String(formData.get(k) ?? '').trim())
    .filter(Boolean);

  if (!title) return { ok: false, error: 'Title is required' };
  if (title.length > LIMITS.title) return { ok: false, error: `Title must be at most ${LIMITS.title} characters` };
  if (description.length > LIMITS.description) {
    return { ok: false, error: `Description must be at most ${LIMITS.description} characters` };
  }
  if (options.length < LIMITS.minOptions) return { ok: false, error: 'At least two options are required' };
  if (options.length > LIMITS.maxOptions) return { ok: false, error: `At most ${LIMITS.maxOptions} options are allowed` };
  if (options.some((o) => o.length > LIMITS.option)) {
    return { ok: false, error: `Each option must be at most ${LIMITS.option} characters` };
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { ok: false, error: 'Options must be different from each other' };
  }
  return { ok: true, value: { title, description, options } };
}

/** Validate the edit-poll form (title and description only). */
export function parsePollEdit(formData: FormData):
  | { ok: true; value: { id: string; title: string; description: string } }
  | { ok: false; error: string } {
  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing poll id' };
  if (!title) return { ok: false, error: 'Title is required' };
  if (title.length > LIMITS.title) return { ok: false, error: `Title must be at most ${LIMITS.title} characters` };
  if (description.length > LIMITS.description) {
    return { ok: false, error: `Description must be at most ${LIMITS.description} characters` };
  }
  return { ok: true, value: { id, title, description } };
}
