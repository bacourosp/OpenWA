import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BrainCircuit,
  Loader2,
  MessageSquare,
  Users,
  Search,
  Sparkles,
  MessageSquarePlus,
  Phone,
  MessageSquareWarning,
  Info,
  Lightbulb,
  Copy,
  Check,
} from 'lucide-react';
import { sessionApi } from '../services/api';
import { conversationApi } from '../services/api';
import type { Session, Chat, ConversationAnalysis, RecommendedAction, AnalysisPeriod } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import './ConversationAnalysis.css';

const ACTION_ICONS: Record<RecommendedAction['type'], typeof MessageSquarePlus> = {
  follow_up: MessageSquarePlus,
  schedule_call: Phone,
  respond_pending: MessageSquareWarning,
  send_info: Info,
  other: Lightbulb,
};

const ACTION_LABELS: Record<RecommendedAction['type'], string> = {
  follow_up: 'Seguimiento',
  schedule_call: 'Agendar llamada',
  respond_pending: 'Responder pendiente',
  send_info: 'Enviar información',
  other: 'Otra acción',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="conv-copy-btn" onClick={handleCopy}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

export function ConversationAnalysis() {
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [period, setPeriod] = useState<AnalysisPeriod>('7d');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ConversationAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionApi.list().then(list => {
      const ready = list.filter(s => s.status === 'ready');
      setSessions(ready);
      if (ready.length === 1) setSelectedSessionId(ready[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSessionId) { setChats([]); return; }
    setLoadingChats(true);
    setSelectedChat(null);
    setResult(null);
    setError(null);
    sessionApi.getChats(selectedSessionId)
      .then(list => setChats(list))
      .catch(() => setChats([]))
      .finally(() => setLoadingChats(false));
  }, [selectedSessionId]);

  const filteredChats = chats.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleAnalyze = async () => {
    if (!selectedSessionId || !selectedChat) return;
    setAnalyzing(true);
    setResult(null);
    setError(null);
    try {
      const data = await conversationApi.analyze(selectedSessionId, selectedChat.id, period);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setAnalyzing(false);
    }
  };

  const PERIODS: { value: AnalysisPeriod; label: string }[] = [
    { value: '7d', label: t('conversationAnalysis.period7d') },
    { value: '30d', label: t('conversationAnalysis.period30d') },
    { value: '90d', label: t('conversationAnalysis.period90d') },
  ];

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="conv-analysis-page">
      <PageHeader
        title={t('conversationAnalysis.title')}
        subtitle={t('conversationAnalysis.subtitle')}
      />

      <div className="conv-analysis-layout">
        {/* ── LEFT: chat list ── */}
        <aside className="conv-sidebar">
          <div className="conv-sidebar-header">
            <div>
              <div className="conv-session-label">{t('chats.sessionLabel')}</div>
              <select
                className="conv-session-select"
                value={selectedSessionId}
                onChange={e => setSelectedSessionId(e.target.value)}
              >
                <option value="">{t('common.search')}…</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id} {s.phone ? `· ${s.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="conv-search-input"
                style={{ paddingLeft: '2rem' }}
                placeholder={t('chats.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="conv-chat-list">
            {loadingChats && (
              <div className="conv-empty-chats">
                <Loader2 size={18} className="animate-spin" />
              </div>
            )}
            {!loadingChats && filteredChats.length === 0 && (
              <div className="conv-empty-chats">
                {selectedSessionId ? t('conversationAnalysis.noChats') : t('conversationAnalysis.selectSession')}
              </div>
            )}
            {filteredChats.map(chat => (
              <button
                key={chat.id}
                className={`conv-chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => { setSelectedChat(chat); setResult(null); setError(null); }}
              >
                <div className="conv-chat-avatar">
                  {chat.isGroup ? <Users size={16} /> : <MessageSquare size={16} />}
                </div>
                <div className="conv-chat-info">
                  <div className="conv-chat-name">{chat.name || chat.id}</div>
                  {chat.lastMessage && (
                    <div className="conv-chat-last">{chat.lastMessage}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── RIGHT: analysis panel ── */}
        <div className="conv-main">
          <div className="conv-main-header">
            {selectedChat
              ? <span className="conv-chat-title">{selectedChat.name || selectedChat.id}</span>
              : <span className="conv-placeholder-title">{t('conversationAnalysis.selectChat')}</span>
            }
            <div className="conv-controls">
              <div className="conv-period-group">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    className={`conv-period-btn ${period === p.value ? 'active' : ''}`}
                    onClick={() => setPeriod(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                className="conv-analyze-btn"
                disabled={!selectedChat || !selectedSessionId || analyzing}
                onClick={handleAnalyze}
              >
                {analyzing
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Sparkles size={15} />
                }
                {analyzing ? t('conversationAnalysis.analyzing') : t('conversationAnalysis.analyze')}
              </button>
            </div>
          </div>

          <div className="conv-results">
            {/* Loading state */}
            {analyzing && (
              <div className="conv-loading">
                <Loader2 size={32} className="animate-spin" />
                <p>{t('conversationAnalysis.analyzing')}</p>
              </div>
            )}

            {/* Error state */}
            {!analyzing && error && (
              <div className="conv-error">{error}</div>
            )}

            {/* Empty state */}
            {!analyzing && !error && !result && (
              <div className="conv-placeholder">
                <BrainCircuit size={48} />
                <p>{t('conversationAnalysis.placeholder')}</p>
              </div>
            )}

            {/* No messages */}
            {!analyzing && !error && result && result.meta.messageCount === 0 && (
              <div className="conv-no-messages">{t('conversationAnalysis.noMessages')}</div>
            )}

            {/* Results */}
            {!analyzing && !error && result && result.meta.messageCount > 0 && (
              <>
                <div className="conv-meta-bar">
                  <span>📅 {formatDate(result.meta.from)} → {formatDate(result.meta.to)}</span>
                  <span>💬 {t('conversationAnalysis.messageCount', { count: result.meta.messageCount })}</span>
                </div>

                {/* Summary */}
                <div className="conv-card">
                  <div className="conv-card-title">
                    <BrainCircuit size={14} />
                    {t('conversationAnalysis.summaryTitle')}
                  </div>
                  <p className="conv-summary-text">{result.summary}</p>

                  {result.highlights.length > 0 && (
                    <ul className="conv-highlights" style={{ marginTop: '1rem' }}>
                      {result.highlights.map((h, i) => (
                        <li key={i}>
                          <span className="conv-highlight-dot" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Actions */}
                {result.actions.length > 0 && (
                  <div className="conv-card">
                    <div className="conv-card-title">
                      <Sparkles size={14} />
                      {t('conversationAnalysis.actionsTitle')}
                    </div>
                    <div className="conv-actions-grid">
                      {result.actions.map((action, i) => {
                        const Icon = ACTION_ICONS[action.type] ?? Lightbulb;
                        return (
                          <div key={i} className={`conv-action-card priority-${action.priority}`}>
                            <div className="conv-action-header">
                              <Icon size={15} className="conv-action-type-icon" />
                              <span className="conv-action-type-label">{ACTION_LABELS[action.type]}</span>
                              <span className={`conv-priority-badge ${action.priority}`}>
                                {action.priority === 'high' ? 'Alta' : action.priority === 'medium' ? 'Media' : 'Baja'}
                              </span>
                            </div>
                            <p className="conv-action-description">{action.description}</p>
                            {action.suggestedMessage && (
                              <div className="conv-suggested-msg">
                                <div className="conv-suggested-label">{t('conversationAnalysis.suggestedMsg')}</div>
                                <div className="conv-suggested-text">{action.suggestedMessage}</div>
                                <CopyButton text={action.suggestedMessage} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
