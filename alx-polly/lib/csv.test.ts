import { describe, expect, it } from 'vitest';
import { buildPollCsv, csvCell, csvFilename, csvRow } from './csv';

describe('csvCell: formula injection', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd', '=HYPERLINK("http://evil","x")', '-2+3'])(
    'prefixes %j with a single quote',
    (text) => {
      const cell = csvCell(text);
      // After undoing RFC 4180 quoting, the first character is the neutralising quote.
      const unquoted = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
      expect(unquoted.startsWith("'")).toBe(true);
      expect(unquoted).toBe(`'${text}`);
    },
  );

  it('does not touch text that merely contains a trigger later on', () => {
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell('x-ray')).toBe('x-ray');
    expect(csvCell('me@example.com')).toBe('me@example.com');
  });

  it('leaves numbers alone, including zero, and never prefixes them', () => {
    expect(csvCell(0)).toBe('0');
    expect(csvCell(42)).toBe('42');
  });

  it('writes null, undefined and non-finite numbers as empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('csvCell: RFC 4180', () => {
  it('quotes commas, doubles inner quotes, keeps newlines inside quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('applies the injection prefix before quoting', () => {
    expect(csvCell('=a,b')).toBe(`"'=a,b"`);
    expect(csvCell('@"x"')).toBe(`"'@""x"""`);
  });

  it('leaves unicode untouched', () => {
    expect(csvCell('Pizza 🍕 / 寿司 / café')).toBe('Pizza 🍕 / 寿司 / café');
  });

  it('joins a row with commas', () => {
    expect(csvRow(['a', 'b,c', 3])).toBe('a,"b,c",3');
  });
});

describe('buildPollCsv', () => {
  const options = [
    { id: '1', text: 'Yes', votes: 2 },
    { id: '2', text: '=cmd|"/c calc"!A1', votes: 1 },
    { id: '3', text: 'Maybe, later', votes: 0 },
  ];

  it('writes a header block, a blank line and one row per option with CRLF endings', () => {
    const csv = buildPollCsv({ title: 'Lunch?', isClosed: false, closesAt: null, options });
    expect(csv).toBe(
      [
        'Poll,Lunch?',
        'Status,Open',
        'Total votes,3',
        '',
        'Option,Votes,Percent',
        'Yes,2,67',
        `"'=cmd|""/c calc""!A1",1,33`,
        '"Maybe, later",0,0',
        '',
      ].join('\r\n'),
    );
  });

  it('includes closing time as UTC ISO and the Closed status', () => {
    const csv = buildPollCsv({ title: 'T', isClosed: true, closesAt: '2030-01-02T10:30:00.000Z', options: [] });
    expect(csv).toContain('Status,Closed\r\n');
    expect(csv).toContain('Closes at (UTC),2030-01-02T10:30:00.000Z\r\n');
  });

  it('neutralises a hostile title', () => {
    const csv = buildPollCsv({ title: '=1+1', isClosed: false, closesAt: null, options });
    expect(csv.split('\r\n')[0]).toBe("Poll,'=1+1");
  });

  it('has zero totals and zero percents for a poll without votes', () => {
    const csv = buildPollCsv({
      title: 'Empty',
      isClosed: false,
      closesAt: null,
      options: [
        { id: 'a', text: 'A', votes: 0 },
        { id: 'b', text: 'B', votes: 0 },
      ],
    });
    expect(csv).toContain('Total votes,0');
    expect(csv).toContain('A,0,0\r\nB,0,0\r\n');
  });

  it('percentages add up to 100 when there are votes', () => {
    const csv = buildPollCsv({
      title: 'Thirds',
      isClosed: false,
      closesAt: null,
      options: [1, 2, 3].map((n) => ({ id: String(n), text: `o${n}`, votes: 1 })),
    });
    const percents = csv
      .split('\r\n')
      .filter((l) => /^o\d,/.test(l))
      .map((l) => Number(l.split(',')[2]));
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('keeps multi-line titles in one quoted cell', () => {
    const csv = buildPollCsv({ title: 'a\nb', isClosed: false, closesAt: null, options: [] });
    expect(csv.startsWith('Poll,"a\nb"\r\n')).toBe(true);
  });
});

describe('csvFilename', () => {
  it('slugifies to ASCII and strips accents', () => {
    expect(csvFilename('Café ou Thé ?', 'abcdef12-0000')).toBe('poll-cafe-ou-the.csv');
  });
  it('falls back to the id prefix when nothing ASCII survives', () => {
    expect(csvFilename('寿司🍣', 'abcdef12-3456')).toBe('poll-abcdef12.csv');
  });
  it('cannot inject header or path characters', () => {
    const name = csvFilename('x"\r\nSet-Cookie: a=b/../../etc', 'abcdef12');
    expect(name).toMatch(/^poll-[a-z0-9-]+\.csv$/);
  });
  it('limits length and leaves no trailing dash', () => {
    const name = csvFilename(`${'a'.repeat(39)} b`, 'id123456');
    expect(name.length).toBeLessThanOrEqual('poll-.csv'.length + 40);
    expect(name).not.toMatch(/-\.csv$/);
  });
});
