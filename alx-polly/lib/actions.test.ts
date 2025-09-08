import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for Next.js modules used in server actions
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => ({ redirectedTo: path })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key.toLowerCase() === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : null),
  })),
  cookies: vi.fn(async () => ({} as any)),
}));

// Create a re-assignable Supabase mock that our factory can return
const mockSupabase: any = {
  rpc: vi.fn(),
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerActionClient: vi.fn(() => mockSupabase),
}));

// Import after mocks so the actions use our mocked modules
import { voteForOption, createPoll, deletePollAction, updatePollAction } from './actions';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function setupCreatePollSuccess(pollId = 'poll-1', optionInsertOk = true) {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'polls') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: pollId }, error: null }),
      };
    }
    if (table === 'poll_options') {
      return {
        insert: vi.fn().mockResolvedValue(optionInsertOk ? { error: null } : { error: new Error('options failed') }),
      } as any;
    }
    return {} as any;
  });
}

function setupCreatePollInsertError() {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'polls') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('insert failed') }),
      };
    }
    return {} as any;
  });
}

function setupDeleteSuccess() {
  const chain: any = {
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    error: null,
  };
  mockSupabase.from.mockReturnValue(chain);
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  return chain;
}

function setupDeleteError() {
  const chain: any = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    error: new Error('delete failed'),
  };
  mockSupabase.from.mockReturnValue(chain);
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  return chain;
}

function setupUpdateSuccess() {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    error: null,
  };
  mockSupabase.from.mockReturnValue(chain);
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  return chain;
}

function setupUpdateError() {
  const chain: any = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    error: new Error('update failed'),
  };
  mockSupabase.from.mockReturnValue(chain);
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('voteForOption', () => {
  it('calls RPC and revalidates on success', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 'vote-123', error: null });

    const res = await voteForOption('opt-1', 'poll-abc');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('vote_for_option', {
      p_option_id: 'opt-1',
      p_poll_id: 'poll-abc',
      p_ip_address: '1.2.3.4',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/polls/poll-abc');
    expect(res).toEqual({ success: true, voteId: 'vote-123' });
  });

  it('returns failure on RPC error', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error('boom') });

    const res = await voteForOption('opt-1', 'poll-abc');

    expect(res.success).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('createPoll', () => {
  it('validates title and options', async () => {
    const fd1 = new FormData();
    fd1.set('description', 'desc');
    await expect(createPoll(fd1 as any)).rejects.toThrow('Title is required');

    const fd2 = new FormData();
    fd2.set('title', 'T');
    fd2.set('option-1', 'Only one');
    await expect(createPoll(fd2 as any)).rejects.toThrow('At least two options are required');
  });

  it('inserts poll and options, revalidates and redirects', async () => {
    setupCreatePollSuccess('poll-new');

    const fd = new FormData();
    fd.set('title', 'My Poll');
    fd.set('description', 'My Desc');
    fd.set('option-1', 'A');
    fd.set('option-2', 'B');

    // Call
    await createPoll(fd as any);

    // Assert redirect and revalidate
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
    expect(redirect).toHaveBeenCalledWith('/polls?created=1');
  });

  it('throws on insert error', async () => {
    setupCreatePollInsertError();

    const fd = new FormData();
    fd.set('title', 'My Poll');
    fd.set('option-1', 'A');
    fd.set('option-2', 'B');

    await expect(createPoll(fd as any)).rejects.toThrow('Failed to create poll. Please try again.');
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('deletePollAction', () => {
  it('requires auth and poll id', async () => {
    const fd = new FormData();
    await expect(deletePollAction(fd as any)).rejects.toThrow('Missing poll id');

    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: null } });
    const fd2 = new FormData();
    fd2.set('id', 'poll-1');
    await expect(deletePollAction(fd2 as any)).rejects.toThrow('Not authenticated');
  });

  it('deletes the poll and revalidates', async () => {
    const chain = setupDeleteSuccess();

    const fd = new FormData();
    fd.set('id', 'poll-1');
    await deletePollAction(fd as any);

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
  });

  it('throws on delete error', async () => {
    setupDeleteError();
    const fd = new FormData();
    fd.set('id', 'poll-1');
    await expect(deletePollAction(fd as any)).rejects.toThrow('Failed to delete poll');
  });
});

describe('updatePollAction', () => {
  it('validates id, title and auth', async () => {
    const fd1 = new FormData();
    await expect(updatePollAction(fd1 as any)).rejects.toThrow('Missing poll id');

    const fd2 = new FormData();
    fd2.set('id', 'poll-1');
    await expect(updatePollAction(fd2 as any)).rejects.toThrow('Title is required');

    (mockSupabase.auth.getUser as any).mockResolvedValue({ data: { user: null } });
    const fd3 = new FormData();
    fd3.set('id', 'poll-1');
    fd3.set('title', 'Hi');
    await expect(updatePollAction(fd3 as any)).rejects.toThrow('Not authenticated');
  });

  it('updates and revalidates then redirects', async () => {
    const chain = setupUpdateSuccess();

    const fd = new FormData();
    fd.set('id', 'poll-1');
    fd.set('title', 'New title');
    fd.set('description', 'New desc');

    await updatePollAction(fd as any);

    expect(chain.update).toHaveBeenCalledWith({ title: 'New title', description: 'New desc' });
    expect(revalidatePath).toHaveBeenCalledWith('/polls');
    expect(revalidatePath).toHaveBeenCalledWith('/polls/poll-1');
    expect(redirect).toHaveBeenCalledWith('/polls');
  });

  it('throws on update error', async () => {
    setupUpdateError();

    const fd = new FormData();
    fd.set('id', 'poll-1');
    fd.set('title', 'New title');

    await expect(updatePollAction(fd as any)).rejects.toThrow('Failed to update poll');
  });
});