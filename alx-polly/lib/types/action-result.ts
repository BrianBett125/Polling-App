// Shared ActionResult type used by server actions to standardize success/failure shapes
export type Ok<T extends object = {}> = { success: true } & T;
export type Err = { success: false; error: string };
export type ActionResult<T extends object = {}> = Ok<T> | Err;

export type { ActionResult as default };