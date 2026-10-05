// Shared ActionResult type used by server actions to standardize success/failure shapes.
// Failures are returned, not thrown: production Next.js masks the message of a thrown
// server-action error, so users would never see why something failed.
export type Ok<T extends object = {}> = { success: true } & T;
export type Err = { success: false; error: string; code?: 'already_voted' | 'not_authenticated' };
export type ActionResult<T extends object = {}> = Ok<T> | Err;

export type { ActionResult as default };
