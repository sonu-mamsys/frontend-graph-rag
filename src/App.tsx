import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Terminal,
  User,
  Network,
  Hash,
  Cpu,
  CheckCircle2,
  Activity,
  AlertTriangle,
  ChevronDown,
  UploadCloud,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { GraphView } from './components/GraphView';
import { UploadPanel } from './components/UploadPanel';
import {
  queryRag,
  queryHybrid,
  detectContradictions,
  streamAgentQuery,
  type QueryResponse,
  type HybridQueryResponse,
  type AgentQueryResponse,
  type ContradictionExplanation,
  type UploadResponse,
} from './services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type QueryMode = 'basic' | 'hybrid' | 'agent';

interface Source {
  id: string;
  title: string;
  snippet?: string;
  type?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: string;
  critique?: string;
  sources?: Source[];
  seedPapers?: Source[];
  expandedContext?: Source[];
  mode?: QueryMode;
  timestamp: Date;
}

interface GraphNode {
  id: string;
  name: string;
  val: number;
  color?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

/** Build a single context string from conversation history + new query */
function buildContextQuery(messages: Message[], newQuery: string): string {
  const history = messages
    .slice(-6) // last 3 turns
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n');
  return history ? `${history}\nUser: ${newQuery}` : newQuery;
}

/** Normalize any backend shape into a consistent Message payload */
function normalizeResponse(data: QueryResponse | HybridQueryResponse | AgentQueryResponse, mode: QueryMode): Partial<Message> {
  const answer = (data as AgentQueryResponse).answer ?? (data as QueryResponse).answer ?? '';

  // sources: raw RAG chunks
  const rawSources = ((data as QueryResponse).sources as unknown[]) ?? [];
  const sources: Source[] = rawSources.map((s, i) =>
    typeof s === 'string'
      ? { id: `src-${i}`, title: `Chunk ${i + 1}`, snippet: s, type: 'chunk' }
      : { id: (s as Record<string, unknown>).id as string ?? `src-${i}`, ...(s as object) } as Source
  );

  // hybrid-specific
  const hybridData = data as HybridQueryResponse;
  const seedPapers: Source[] = (hybridData.seed_papers ?? []).map((p, i) =>
    typeof p === 'string'
      ? { id: `seed-${i}`, title: p, type: 'primary' }
      : { id: `seed-${i}`, type: 'primary', ...(p as object) } as Source
  );
  const expandedContext: Source[] = (hybridData.expanded_context ?? []).map((p, i) =>
    typeof p === 'string'
      ? { id: `exp-${i}`, title: p, type: 'related' }
      : { id: `exp-${i}`, type: 'related', ...(p as object) } as Source
  );

  const agentData = data as AgentQueryResponse;
  return {
    content: answer,
    plan: agentData.plan,
    critique: agentData.critique,
    sources,
    seedPapers,
    expandedContext,
    mode,
  };
}

/** Convert sources/papers into graph nodes + links */
function buildGraphData(
  seedPapers: Source[],
  expandedContext: Source[]
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seen = new Set<string>();

  const add = (s: Source, color: string, val: number) => {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      nodes.push({ id: s.id, name: s.title, val, color });
    }
  };

  seedPapers.forEach((p) => add(p, '#6366f1', 8));
  expandedContext.forEach((p) => {
    add(p, '#374151', 4);
    // link each expanded node to the first seed paper if available
    if (seedPapers.length > 0) {
      links.push({ source: seedPapers[0].id, target: p.id });
    }
  });

  return { nodes, links };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<QueryMode>('hybrid');
  const [activeTab, setActiveTab] = useState<'chat' | 'graph' | 'upload'>('chat');
  const [uploadCount, setUploadCount] = useState(0);
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const [contradictionResult, setContradictionResult] = useState<string | null>(null);
  const [isCheckingContradictions, setIsCheckingContradictions] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Streaming handler for agent mode ──────────────────────────────────────
  const streamAgentResponse = useCallback(
    async (contextQuery: string, msgId: string) => {
      const { url, headers } = streamAgentQuery(contextQuery);
      const res = await fetch(url, { headers });

      if (!res.body) throw new Error('No stream body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: lines starting with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;
          try {
            const chunk = JSON.parse(raw) as { token?: string; answer?: string };
            const token = chunk.token ?? chunk.answer ?? '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: m.content + token } : m
              )
            );
          } catch {
            // non-JSON chunk — append raw
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: m.content + raw } : m
              )
            );
          }
        }
      }
    },
    []
  );

  // ── Upload success handler ────────────────────────────────────────────────
  const handleUploadSuccess = useCallback((_response: UploadResponse) => {
    setUploadCount((c) => c + 1);
  }, []);

  // ── Main submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const contextQuery = buildContextQuery(messages, query);
    setQuery('');
    setIsLoading(true);
    setContradictionResult(null);

    const assistantId = (Date.now() + 1).toString();

    try {
      if (mode === 'agent') {
        // Seed an empty assistant message for streaming
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', mode: 'agent', timestamp: new Date() },
        ]);
        await streamAgentResponse(contextQuery, assistantId);
      } else {
        const data = mode === 'basic'
          ? await queryRag(contextQuery)
          : await queryHybrid(contextQuery);
        const normalized = normalizeResponse(data, mode);

        const assistantMessage: Message = {
          id: assistantId,
          role: 'assistant',
          timestamp: new Date(),
          content: '',
          ...normalized,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Update sources panel
        const allSources = [
          ...(normalized.sources ?? []),
          ...(normalized.seedPapers ?? []),
          ...(normalized.expandedContext ?? []),
        ];
        setCurrentSources(allSources);

        // Update graph
        setGraphData(
          buildGraphData(normalized.seedPapers ?? [], normalized.expandedContext ?? [])
        );
      }
    } catch (err) {
      console.warn('API error:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '[Error: backend unreachable]' }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Contradiction check ───────────────────────────────────────────────────
  const handleContradictionCheck = async () => {
    if (currentSources.length < 2) return;
    setIsCheckingContradictions(true);
    setContradictionResult(null);
    try {
      const texts = currentSources.map((s) => s.snippet ?? s.title).filter(Boolean);
      const data: ContradictionExplanation[] = await detectContradictions(texts);
      if (data.length === 0) {
        setContradictionResult('No contradictions detected.');
      } else {
        const formatted = data
          .map((c, i) =>
            `[${i + 1}] "${c.claim_1}" vs "${c.claim_2}"\n→ ${c.explanation}`
          )
          .join('\n\n');
        setContradictionResult(formatted);
      }
    } catch (err) {
      setContradictionResult(`Error: ${String(err)}`);
    } finally {
      setIsCheckingContradictions(false);
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const modeLabels: Record<QueryMode, string> = { basic: 'RAG', hybrid: 'Hybrid', agent: 'Agent' };
  const modeColors: Record<QueryMode, string> = {
    basic: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
    hybrid: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
    agent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  };

  return (
    <div className="flex h-screen bg-[#0f1115] text-[#d1d5db] font-sans overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">

      {/* Sidebar nav */}
      <aside className="w-14 bg-[#0a0b0d] border-r border-[#1e2128] flex flex-col items-center py-6 shrink-0 z-20">
        <div className="w-8 h-8 flex items-center justify-center bg-indigo-500/10 rounded border border-indigo-500/20 mb-8 group hover:border-indigo-500/50 transition-colors">
          <Activity className="w-4 h-4 text-indigo-400 group-hover:animate-pulse" />
        </div>
        <nav className="flex flex-col gap-4 w-full px-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={cn('p-2 rounded w-full flex justify-center transition-all', activeTab === 'chat' ? 'bg-[#1e2128] text-indigo-400' : 'text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#1a1c22]')}
            title="Console"
          >
            <Terminal className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={cn('p-2 rounded w-full flex justify-center transition-all', activeTab === 'graph' ? 'bg-[#1e2128] text-indigo-400' : 'text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#1a1c22]')}
            title="Graph Explorer"
          >
            <Network className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={cn('p-2 rounded w-full flex justify-center transition-all relative', activeTab === 'upload' ? 'bg-[#1e2128] text-indigo-400' : 'text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#1a1c22]')}
            title="Upload PDF"
          >
            <UploadCloud className="w-5 h-5" />
            {uploadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#13151a] via-[#0f1115] to-[#0a0b0d]">

        {/* Header */}
        <header className="h-12 border-b border-[#1e2128] flex items-center justify-between px-6 shrink-0 bg-[#0f1115]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-[11px] font-mono tracking-widest text-[#9ca3af] uppercase">
              Agent_Workspace <span className="text-[#4b5563]">/</span> REPL
            </h1>
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono uppercase rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">
            <span className="flex items-center gap-1 border-r border-[#1e2128] pr-3">
              <Cpu className="w-3 h-3" /> Graph: Linked
            </span>
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" /> Vector: Indexed
            </span>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col w-full relative h-full">
            <AnimatePresence mode="wait">
              {activeTab === 'chat' ? (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 overflow-y-auto px-6 py-6 pb-28 custom-scrollbar"
                >
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center space-y-4">
                      <Terminal className="w-12 h-12 text-[#374151] mb-2" />
                      <h2 className="text-xl font-mono text-[#e5e7eb] tracking-tight">System Ready.</h2>
                      <p className="text-xs font-mono text-[#6b7280]">
                        Input query to initialize multi-hop hybrid retrieval protocol.
                      </p>
                      <div className="flex gap-4 w-full mt-8 font-mono">
                        <button onClick={() => setQuery('How did transformer models evolve?')} className="flex-1 p-3 text-[11px] text-[#9ca3af] bg-[#151619] border border-[#1e2128] hover:border-indigo-500/50 hover:bg-[#1a1c22] rounded transition-all">
                          ["EXEC", "evolution", "transformers"]
                        </button>
                        <button onClick={() => setQuery('What are conflicting findings on attention?')} className="flex-1 p-3 text-[11px] text-[#9ca3af] bg-[#151619] border border-[#1e2128] hover:border-indigo-500/50 hover:bg-[#1a1c22] rounded transition-all">
                          ["DETECT", "contradictions", "attention"]
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0 max-w-4xl mx-auto">
                      {messages.map((msg, index) => (
                        <div
                          key={msg.id}
                          className={cn('py-6 flex gap-4 transition-all relative group', index !== messages.length - 1 && 'border-b border-dashed border-[#1e2128]')}
                        >
                          <div className="flex flex-col items-center shrink-0 w-8 pt-1">
                            {msg.role === 'assistant' ? (
                              <div className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded bg-[#1e2128] flex items-center justify-center">
                                <User className="w-3.5 h-3.5 text-[#9ca3af]" />
                              </div>
                            )}
                            <span className="text-[9px] font-mono text-[#4b5563] mt-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden md:block">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0 space-y-4">
                            {msg.role === 'user' ? (
                              <div className="text-[13px] font-mono leading-relaxed text-[#e5e7eb]">
                                &gt; {msg.content}
                              </div>
                            ) : (
                              <>
                                {msg.plan && (
                                  <div className="bg-[#0c0d10] border border-[#1e2128] rounded font-mono p-3">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#1e2128]">
                                      <div className="w-2 h-2 rounded-full bg-amber-500/80 animate-pulse" />
                                      <span className="text-[10px] text-[#6b7280] uppercase tracking-widest">Orchestration Trace</span>
                                    </div>
                                    <pre className="text-[11px] text-[#9ca3af] whitespace-pre-wrap leading-relaxed">{msg.plan}</pre>
                                  </div>
                                )}

                                <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#0c0d10] prose-pre:border prose-pre:border-[#1e2128] text-[#d1d5db] text-sm max-w-none">
                                  <ReactMarkdown>{msg.content || (isLoading ? '▋' : '')}</ReactMarkdown>
                                </div>

                                {msg.critique && (
                                  <div className="flex gap-3 mt-4 items-start bg-emerald-950/20 border border-emerald-900/30 p-3 rounded font-mono text-[11px] text-emerald-400/90">
                                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span className="leading-relaxed">[CRITIQUE_PASS]: {msg.critique}</span>
                                  </div>
                                )}

                                {/* Inline source pills */}
                                {(msg.seedPapers?.length ?? 0) > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {msg.seedPapers!.map((p) => (
                                      <span key={p.id} className="text-[9px] font-mono px-2 py-0.5 rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 truncate max-w-[200px]" title={p.title}>
                                        ◆ {p.title}
                                      </span>
                                    ))}
                                    {msg.expandedContext?.map((p) => (
                                      <span key={p.id} className="text-[9px] font-mono px-2 py-0.5 rounded border border-[#2b2d35] bg-[#151619] text-[#6b7280] truncate max-w-[200px]" title={p.title}>
                                        ◇ {p.title}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}

                      {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                        <div className="py-6 flex gap-4">
                          <div className="w-8 shrink-0 flex justify-center pt-1">
                            <div className="w-6 h-6 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                          </div>
                          <div className="flex-1 space-y-3 pt-2 max-w-2xl">
                            <div className="h-3 bg-[#1e2128] rounded w-1/4 animate-pulse" />
                            <div className="h-3 bg-[#1e2128] rounded w-full animate-pulse" />
                            <div className="h-3 bg-[#1e2128] rounded w-3/4 animate-pulse" />
                          </div>
                        </div>
                      )}

                      {/* Contradiction result */}
                      {contradictionResult && (
                        <div className="py-4 px-4 bg-rose-950/20 border border-rose-900/30 rounded font-mono text-[11px] text-rose-400/90 flex gap-3 items-start">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span className="leading-relaxed whitespace-pre-wrap">{contradictionResult}</span>
                        </div>
                      )}

                      <div ref={messagesEndRef} className="h-4" />
                    </div>
                  )}
                </motion.div>
              ) : activeTab === 'graph' ? (
                <motion.div
                  key="graph"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 p-6 z-0"
                >
                  <GraphView data={graphData} />
                </motion.div>
              ) : (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 max-w-xl mx-auto w-full"
                >
                  <UploadPanel onUploadSuccess={handleUploadSuccess} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input bar — hidden on upload tab */}
            {activeTab !== 'upload' && (
            <div className="absolute bottom-6 left-0 right-0 px-6 pointer-events-none">
              <div className="max-w-4xl mx-auto w-full pointer-events-auto space-y-2">

                {/* Mode selector + contradiction button */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    {(['basic', 'hybrid', 'agent'] as QueryMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          'px-2.5 py-1 rounded border transition-all uppercase tracking-wider',
                          mode === m ? modeColors[m] : 'text-[#4b5563] border-[#1e2128] hover:text-[#9ca3af] hover:border-[#374151]'
                        )}
                      >
                        {modeLabels[m]}
                      </button>
                    ))}
                    {mode === 'agent' && (
                      <span className="ml-2 text-[9px] text-amber-500/60 flex items-center gap-1">
                        <ChevronDown className="w-3 h-3" /> streaming
                      </span>
                    )}
                  </div>

                  {currentSources.length >= 2 && (
                    <button
                      onClick={handleContradictionCheck}
                      disabled={isCheckingContradictions}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-400 text-[10px] font-mono uppercase tracking-wider hover:border-rose-500/60 transition-all disabled:opacity-40"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {isCheckingContradictions ? 'Checking…' : 'Check Contradictions'}
                    </button>
                  )}
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="bg-[#151619]/95 backdrop-blur-xl border border-[#2b2d35] rounded-lg shadow-2xl p-1.5 flex items-center transition-all focus-within:border-indigo-500/50 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                >
                  <span className="pl-3 pr-2 text-[#4b5563] font-mono text-[14px]">~</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Initialize query protocol..."
                    className="flex-1 bg-transparent border-none py-2 px-1 text-[13px] font-mono text-[#e5e7eb] focus:outline-none placeholder:text-[#4b5563]"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !query.trim()}
                    className="p-2 text-[#9ca3af] hover:text-white disabled:opacity-30 transition-colors rounded hover:bg-[#2b2d35] mr-0.5"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
            )}
          </div>

          {/* Sources panel */}
          {activeTab === 'chat' && currentSources.length > 0 && (
            <aside className="w-[320px] shrink-0 border-l border-[#1e2128] bg-[#0c0d10]/50 backdrop-blur-sm z-10 hidden xl:block">
              <div className="h-full overflow-y-auto p-5 custom-scrollbar">
                <h3 className="text-[10px] tracking-widest uppercase font-mono text-[#6b7280] mb-4 flex items-center gap-2">
                  <Network className="w-3 h-3 text-indigo-400" />
                  Retrieved Context ({currentSources.length})
                </h3>
                <div className="space-y-3">
                  {currentSources.map((s) => (
                    <div key={s.id} className="bg-[#151619] border border-[#1e2128] hover:border-[#374151] rounded p-3 transition-colors cursor-default group">
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          'text-[9px] font-mono px-1.5 py-0.5 rounded border',
                          s.type === 'primary' ? 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' :
                          s.type === 'related' ? 'text-[#6b7280] bg-[#1e2128] border-[#2b2d35]' :
                          'text-sky-400 bg-sky-400/10 border-sky-400/20'
                        )}>
                          {s.type ?? 'chunk'}
                        </span>
                        <span className="text-[9px] font-mono text-[#4b5563]">{s.id}</span>
                      </div>
                      <h4 className="text-sm font-medium text-[#e5e7eb] leading-snug mb-2 group-hover:text-indigo-300 transition-colors truncate">
                        {s.title}
                      </h4>
                      {s.snippet && (
                        <div className="text-[11px] text-[#9ca3af] leading-relaxed line-clamp-4 border-l border-[#2b2d35] pl-2 font-mono">
                          {s.snippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2b2d35; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
      `}</style>
    </div>
  );
}
