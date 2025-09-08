import { describe, it, expect, vi } from 'vitest';

// Mocks for Next.js server helpers used by our utilities
vi.mock('next/headers', () => {
  let headerValue: string | null = null;
  return {
    __esModule: true,
    headers: vi.fn(async () => ({
      get: (key: string) => (key.toLowerCase() === 'x-forwarded-for' ? headerValue : null),
    })),
    __setForwardedFor: (value: string | null) => {
      headerValue = value;
    },
  };
});

// We don't exercise getServerSupabase here; we only need the helpers
import { parseAndValidatePollForm, requireUser, getClientIp, getCurrentUser } from './actions';
import * as headersMod from 'next/headers';

// Access the test helper from mocked module
const setForwardedFor = (headersMod as unknown as { __setForwardedFor: (v: string | null) => void }).__setForwardedFor;

describe('parseAndValidatePollForm', () => {
  it('parses a valid form and trims option text', () => {
    const fd = new FormData();
    fd.set('title', '  My Poll  ');
    fd.set('description', 'desc');
    fd.set('option-1', '  A  ');
    fd.set('option-2', 'B');
    fd.set('option-3', '   '); // blank should be filtered out

    const parsed = parseAndValidatePollForm(fd);
    expect(parsed).toEqual({
      title: 'My Poll',
      description: 'desc',
      options: [{ text: 'A' }, { text: 'B' }],
    });
  });

  it('throws if title is missing or blank', () => {
    const fd = new FormData();
    fd.set('title', '   ');
    fd.set('option-1', 'A');
    fd.set('option-2', 'B');

    expect(() => parseAndValidatePollForm(fd)).toThrowError(/Title is required/);
  });

  it('throws if fewer than two options provided', () => {
    const fd = new FormData();
    fd.set('title', 'Poll');
    fd.set('option-1', 'Only one');

    expect(() => parseAndValidatePollForm(fd)).toThrowError(/At least two options are required/);
  });
});

describe('requireUser', () => {
  it('returns the user when authenticated', async () => {
    const supabaseMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } } }),
      },
    } as any;

    const user = await requireUser(supabaseMock);
    expect(user).toEqual({ id: 'user-1', email: 'u@example.com' });
  });

  it('throws when not authenticated', async () => {
    const supabaseMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any;

    await expect(requireUser(supabaseMock)).rejects.toThrow(/Not authenticated/);
  });
});

describe('getClientIp', () => {
  it('returns first IP from x-forwarded-for when present', async () => {
    setForwardedFor('203.0.113.5, 70.41.3.18, 150.172.238.178');
    const ip = await getClientIp();
    expect(ip).toBe('203.0.113.5');
  });

  it('falls back to localhost when header missing', async () => {
    setForwardedFor(null);
    const ip = await getClientIp();
    expect(ip).toBe('127.0.0.1');
  });
});

describe('getCurrentUser', () => {
  it('returns the user object or null', async () => {
    const supabaseMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }),
      },
    } as any;
    const user = await getCurrentUser(supabaseMock);
    expect(user).toEqual({ id: 'u-1' });

    const supabaseMock2 = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any;
    const user2 = await getCurrentUser(supabaseMock2);
    expect(user2).toBeNull();
  });
});