import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ObservabilityPage } from './ObservabilityPage';
import { api, type ObservabilitySnapshot } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    api: {
      ...actual.api,
      getObservabilitySnapshot: vi.fn(),
    },
  };
});

const mockSnapshot: ObservabilitySnapshot = {
  generatedAt: '2026-04-19T10:00:00.000Z',
  sse: { active: 2, max: 32 },
  retries: [
    { label: 'Gemini API request', reason: 'quota', count: 4 },
    { label: 'Gemini API request', reason: 'timeout', count: 1 },
    { label: 'video-provider', reason: 'network', count: 2 },
  ],
  quotaErrors: [{ provider: 'gemini', count: 1 }],
  stages: [
    {
      stage: 'STYLE_EXTRACTION',
      status: 'completed',
      count: 5,
      sumSeconds: 12,
      avgSeconds: 2.4,
      p50Seconds: 2,
      p95Seconds: 5,
      buckets: [
        { le: '1', count: 1 },
        { le: '5', count: 4 },
        { le: '+Inf', count: 5 },
      ],
    },
    {
      stage: 'REFINEMENT',
      status: 'completed',
      count: 3,
      sumSeconds: 90,
      avgSeconds: 30,
      p50Seconds: 30,
      p95Seconds: 60,
      buckets: [],
    },
  ],
};

beforeEach(() => {
  vi.mocked(api.getObservabilitySnapshot).mockResolvedValue(mockSnapshot);
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ObservabilityPage />
    </MemoryRouter>,
  );
}

describe('<ObservabilityPage />', () => {
  it('shows a loading state before the first snapshot resolves', async () => {
    renderPage();
    expect(screen.getByText('正在加载……')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('正在加载……')).not.toBeInTheDocument();
    });
  });

  it('renders the four summary cards once data arrives', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('SSE 连接')).toBeInTheDocument();
    });
    expect(screen.getByText('Stage 执行总次数')).toBeInTheDocument();
    expect(screen.getByText('累计 Retry')).toBeInTheDocument();
    expect(screen.getByText('Quota 错误')).toBeInTheDocument();

    expect(screen.getByText('上限 32')).toBeInTheDocument();
    // Total runs across stages = 5 + 3 = 8
    expect(screen.getByText('8')).toBeInTheDocument();
    // Total retries = 4 + 1 + 2 = 7
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('lists stages sorted by P95 descending', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('REFINEMENT')).toBeInTheDocument();
    });
    const refinement = screen.getByText('REFINEMENT');
    const style = screen.getByText('STYLE_EXTRACTION');
    expect(refinement.compareDocumentPosition(style)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('shows an empty-state message when no retries are reported', async () => {
    vi.mocked(api.getObservabilitySnapshot).mockResolvedValueOnce({
      ...mockSnapshot,
      retries: [],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('尚无 retry 记录。一切平静。')).toBeInTheDocument();
    });
  });

  it('renders an error banner when the snapshot request rejects', async () => {
    // Reject every refresh (initial + StrictMode double-invoke + poll); a
    // single mockRejectedValueOnce can succeed on a subsequent call.
    vi.mocked(api.getObservabilitySnapshot).mockRejectedValue(
      new Error('boom'),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    });
  });
});
