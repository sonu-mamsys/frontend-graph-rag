// ─── Types ────────────────────────────────────────────────────────────────────

export type QueryResponse = {
  answer: string;
  sources: string[];
};

export type HybridQueryResponse = {
  answer: string;
  seed_papers: string[];
  expanded_context: string[];
};

export type AgentQueryResponse = {
  plan: string;
  answer: string;
  critique: string;
};

export type ContradictionExplanation = {
  claim_1: string;
  claim_2: string;
  explanation: string;
};

export type UploadResponse = {
  message: string;
  filename: string;
  stored_filename: string;
  stored_path: string;
  content_type: string | null;
};

// ─── Base URL ─────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/`);
  return handleResponse(res);
}

export async function queryRag(q: string): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE}/query?q=${encodeURIComponent(q)}`);
  return handleResponse(res);
}

export async function queryHybrid(q: string): Promise<HybridQueryResponse> {
  const res = await fetch(`${API_BASE}/query/hybrid?q=${encodeURIComponent(q)}`);
  return handleResponse(res);
}

export async function queryAgent(q: string): Promise<AgentQueryResponse> {
  const res = await fetch(`${API_BASE}/query/agent?q=${encodeURIComponent(q)}`);
  return handleResponse(res);
}

export async function detectContradictions(texts: string[]): Promise<ContradictionExplanation[]> {
  const res = await fetch(`${API_BASE}/query/contradictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  });
  return handleResponse(res);
}

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/query/upload`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse(res);
}

// ─── Streaming agent query (SSE) ──────────────────────────────────────────────

export function streamAgentQuery(q: string): { url: string; headers: Record<string, string> } {
  return {
    url: `${API_BASE}/query/agent?q=${encodeURIComponent(q)}`,
    headers: { Accept: 'text/event-stream' },
  };
}
