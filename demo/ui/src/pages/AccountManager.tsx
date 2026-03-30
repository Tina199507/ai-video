import { useState } from 'react';
import { useWorkbench } from '../hooks/useWorkbench';
import { api } from '../api/client';
import type { ProviderId } from '../types';

export function AccountManager() {
  const { state, refresh } = useWorkbench();

  // Simple add flow: just a Chat URL
  const [chatUrl, setChatUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addStatus, setAddStatus] = useState('');

  // Advanced mode toggle for manual selector override
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advProviderId, setAdvProviderId] = useState('');
  const [advLabel, setAdvLabel] = useState('');
  const [advPromptInput, setAdvPromptInput] = useState('');
  const [advResponseBlock, setAdvResponseBlock] = useState('');
  const [advReadyIndicator, setAdvReadyIndicator] = useState('');
  const [advSendButton, setAdvSendButton] = useState('');

  const providers = state.providers;

  /** One-click: paste URL → auto-create provider + account + open browser */
  const handleAddFromUrl = async () => {
    if (!chatUrl.trim()) return;
    setAdding(true);
    setAddStatus('');
    try {
      const result = await api.addProviderFromUrl(chatUrl.trim());
      setAddStatus(`✅ Added "${result.providerId}" — browser opened for login. Selectors & models will be auto-detected.`);
      setChatUrl('');
      refresh();
    } catch (err) {
      setAddStatus(`❌ ${err instanceof Error ? err.message : 'Failed to add provider'}`);
    } finally {
      setAdding(false);
    }
  };

  /** Advanced: manually add a custom provider with explicit selectors */
  const handleAddAdvanced = async () => {
    if (!advProviderId.trim() || !advLabel.trim() || !chatUrl.trim()) return;
    try {
      await api.addProvider(advProviderId.trim(), advLabel.trim(), {
        chatUrl: chatUrl.trim(),
        promptInput: advPromptInput.trim() || 'textarea',
        responseBlock: advResponseBlock.trim() || '[class*="markdown"]',
        readyIndicator: advReadyIndicator.trim() || advPromptInput.trim() || 'textarea',
        sendButton: advSendButton.trim() || undefined,
      } as Record<string, string>);
      setChatUrl('');
      setAdvProviderId('');
      setAdvLabel('');
      setAdvPromptInput('');
      setAdvResponseBlock('');
      setAdvReadyIndicator('');
      setAdvSendButton('');
      setShowAdvanced(false);
      setAddStatus('✅ Custom provider added successfully');
      refresh();
    } catch (err) {
      setAddStatus(`❌ ${err instanceof Error ? err.message : 'Failed'}`);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    await api.removeAccount(accountId);
    refresh();
  };

  const handleResetQuotas = async () => {
    await api.resetQuotas();
    refresh();
  };

  const handleLogin = async (accountId: string) => {
    try {
      await api.openLoginBrowser(accountId);
      refresh();
    } catch (err) {
      console.error('Failed to open login browser:', err);
    }
  };

  const handleCloseLogin = async (accountId: string) => {
    await api.closeLoginBrowser(accountId);
    refresh();
  };

  const handleRemoveProvider = async (id: string) => {
    await api.removeProvider(id);
    refresh();
  };

  const loginOpenIds = state.loginOpenAccountIds ?? [];

  return (
    <div>
      <div className="page-header">
        <h2>Account Manager</h2>
        <p>Add AI chat sites and manage login sessions</p>
      </div>

      {/* ---- Simple add: just a URL ---- */}
      <div className="card">
        <h3>➕ Add AI Chat Site</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
          Paste a chat URL — the system will auto-detect the provider, create an account, open a browser for login, and probe page selectors automatically.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Chat URL</label>
            <input
              className="form-input"
              value={chatUrl}
              onChange={(e) => setChatUrl(e.target.value)}
              placeholder="https://claude.ai/new"
              onKeyDown={(e) => { if (e.key === 'Enter' && !adding && chatUrl.trim()) handleAddFromUrl(); }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleAddFromUrl}
            disabled={!chatUrl.trim() || adding}
            style={{ marginBottom: 4 }}
          >
            {adding ? '⏳ Adding…' : '🚀 Add & Login'}
          </button>
        </div>

        {addStatus && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {addStatus}
          </div>
        )}

        {/* Advanced settings toggle */}
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12 }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '▼ Hide Advanced Settings' : '▶ Advanced Settings (manual selectors)'}
          </button>
        </div>

        {showAdvanced && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 8px' }}>
              Only needed if auto-detection fails. Fill in the Chat URL above first.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
              <div className="form-group">
                <label>Provider ID</label>
                <input className="form-input" value={advProviderId} onChange={(e) => setAdvProviderId(e.target.value)} placeholder="claude" />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input className="form-input" value={advLabel} onChange={(e) => setAdvLabel(e.target.value)} placeholder="Claude" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 8, alignItems: 'end' }}>
              <div className="form-group">
                <label>Prompt Input</label>
                <input className="form-input" value={advPromptInput} onChange={(e) => setAdvPromptInput(e.target.value)} placeholder="textarea" />
              </div>
              <div className="form-group">
                <label>Response Block</label>
                <input className="form-input" value={advResponseBlock} onChange={(e) => setAdvResponseBlock(e.target.value)} placeholder='[class*="markdown"]' />
              </div>
              <div className="form-group">
                <label>Ready Indicator</label>
                <input className="form-input" value={advReadyIndicator} onChange={(e) => setAdvReadyIndicator(e.target.value)} placeholder="(auto)" />
              </div>
              <div className="form-group">
                <label>Send Button</label>
                <input className="form-input" value={advSendButton} onChange={(e) => setAdvSendButton(e.target.value)} placeholder="(auto)" />
              </div>
            </div>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddAdvanced}
                disabled={!advProviderId.trim() || !advLabel.trim() || !chatUrl.trim()}
              >
                ➕ Add with Manual Selectors
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Usage tip ---- */}
      <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
        <h3>💡 How It Works</h3>
        <ol style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Paste a chat URL (e.g. <code>https://claude.ai/new</code>) and click <strong>"Add &amp; Login"</strong></li>
          <li>A browser opens — <strong>log in manually</strong> (handles captchas, 2FA, etc.)</li>
          <li>The system <strong>auto-detects</strong> page selectors and available models in the background</li>
          <li>Close the browser — your session is saved and reused during batch processing</li>
          <li>For built-in providers (ChatGPT, Gemini, etc.), just click <strong>"🔑 Login"</strong> below</li>
        </ol>
      </div>

      {/* ---- Registered accounts ---- */}
      <div className="card">
        <h3>Registered Accounts ({state.accounts.length})</h3>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleResetQuotas} disabled={state.accounts.length === 0}>
            🔄 Reset All Quotas
          </button>
        </div>
        {state.accounts.length === 0 ? (
          <div className="empty-state">
            <p>No accounts yet. Add one by pasting a Chat URL above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Label</th>
                  <th>Quota</th>
                  <th>Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>
                      <span className={`provider-tag provider-${acc.provider}`}>{acc.provider}</span>
                    </td>
                    <td>{acc.label}</td>
                    <td>
                      {acc.quotaExhausted ? (
                        <span className="badge badge-quota">Exhausted</span>
                      ) : (
                        <span className="badge badge-done">Available</span>
                      )}
                    </td>
                    <td>
                      {loginOpenIds.includes(acc.id) ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleCloseLogin(acc.id)}>
                          ✅ Close Browser
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => handleLogin(acc.id)} disabled={state.isRunning}>
                          🔑 Login
                        </button>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveAccount(acc.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Custom providers list ---- */}
      {providers.filter((p) => !p.builtin).length > 0 && (
        <div className="card">
          <h3>Custom Providers</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.filter((p) => !p.builtin).map((p) => (
                  <tr key={p.id}>
                    <td><span className="provider-tag provider-custom">{p.id}</span></td>
                    <td>{p.label}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveProvider(p.id)}>
                        ✕ Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
