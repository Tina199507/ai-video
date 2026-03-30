import { Fragment, useEffect, useRef, useState } from 'react';
import { useWorkbench } from '../hooks/useWorkbench';
import { api } from '../api/client';
import type { ChatMode, ModelOption, ProviderId } from '../types';

/** Read a File as base64 string (data portion only). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:...;base64," prefix
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function Dashboard() {
  const { state, refresh } = useWorkbench();
  const [text, setText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [detectingModels, setDetectingModels] = useState(false);
  const [detectHint, setDetectHint] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set initial selected provider from state
  useEffect(() => {
    if (!selectedProvider && state.providers.length > 0) {
      setSelectedProvider(state.providers[0].id);
    }
  }, [state.providers, selectedProvider]);

  // Sync models from state (SSE-pushed detectedModels) or fetch fallback
  useEffect(() => {
    const detected = state.detectedModels?.[selectedProvider];
    if (detected && detected.length > 0) {
      setModels(detected);
      setSelectedModel((prev) => detected.find((m) => m.id === prev) ? prev : detected[0].id);
    } else {
      api.getModels(selectedProvider).then((m) => {
        setModels(m);
        setSelectedModel(m[0]?.id ?? '');
      }).catch(() => {
        setModels([]);
        setSelectedModel('');
      });
    }
  }, [selectedProvider, state.detectedModels]);

  const pending = state.tasks.filter((t) => t.status === 'pending').length;
  const running = state.tasks.filter((t) => t.status === 'running').length;
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const failed = state.tasks.filter((t) => t.status === 'failed').length;
  const available = state.accounts.filter((a) => !a.quotaExhausted).length;
  const exhausted = state.accounts.filter((a) => a.quotaExhausted).length;

  const handleStart = async () => {
    await api.start();
    refresh();
  };

  const handleStop = async () => {
    await api.stop();
    refresh();
  };

  const handleChatMode = async (mode: ChatMode) => {
    await api.setChatMode(mode);
    refresh();
  };

  const handleAddTasks = async () => {
    const questions = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (questions.length === 0) return;

    let attachments: string[] | undefined;

    // Upload selected files first if any
    if (selectedFiles.length > 0) {
      setUploading(true);
      try {
        const fileDatas = await Promise.all(
          selectedFiles.map(async (f) => ({
            name: f.name,
            data: await fileToBase64(f),
          })),
        );
        const { paths } = await api.uploadFiles(fileDatas);
        attachments = paths;
        setUploadedPaths(paths);
      } catch (err) {
        console.error('File upload failed:', err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    await api.addTasks(questions, selectedProvider, selectedModel || undefined, attachments);
    setText('');
    setSelectedFiles([]);
    setUploadedPaths([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    refresh();
  };

  const handleRemoveTask = async (taskId: string) => {
    await api.removeTask(taskId);
    refresh();
  };

  const handleClearTasks = async () => {
    await api.clearTasks();
    refresh();
  };

  const handleDetectModels = async () => {
    setDetectingModels(true);
    setDetectHint('');
    try {
      const detected = await api.detectModels(selectedProvider);
      if (detected.length > 0 && !(detected.length === 1 && detected[0].id === 'default')) {
        setModels(detected);
        setSelectedModel(detected[0]?.id ?? '');
        setDetectHint(`✅ Found ${detected.length} model(s)`);
      } else {
        setDetectHint(
          '⚠️ No models detected. Tip: open Login browser first, click the model picker on the site to open the dropdown, then try Detect again.',
        );
      }
    } catch (err) {
      setDetectHint(`❌ Detection failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setDetectingModels(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>

      {/* ① Primary action: Add questions (top, prominent) */}
      <div className="card input-card">
        <div className="input-card-selectors">
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label>AI Provider</label>
            <select
              className="form-select"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as ProviderId)}
            >
              {state.providers.map((p) => {
                const acc = state.accounts.find((a) => a.provider === p.id && !a.quotaExhausted);
                return (
                  <option key={p.id} value={p.id} disabled={!acc}>
                    {p.label}{!p.builtin ? ' ✦' : ''}{acc ? '' : ' (no account)'}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label>
              Model / Mode
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px' }}
                onClick={handleDetectModels}
                disabled={detectingModels || state.isRunning}
                title="Re-detect models from the site"
              >
                {detectingModels ? '⏳' : '🔄'}
              </button>
            </label>
            <select
              className="form-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {detectHint && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {detectHint}
              </div>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Chat Mode</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn btn-sm ${state.chatMode === 'new' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => handleChatMode('new')}
                disabled={state.isRunning}
              >
                🆕 New
              </button>
              <button
                className={`btn btn-sm ${state.chatMode === 'continue' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => handleChatMode('continue')}
                disabled={state.isRunning}
              >
                💬 Continue
              </button>
            </div>
          </div>
        </div>

        <textarea
          className="form-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"What is quantum computing?\nHow does machine learning work?\nExplain the concept of neural networks."}
          rows={5}
          style={{ marginTop: 12 }}
        />

        <div className="input-card-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleAddTasks}
              disabled={!text.trim() || uploading}
            >
              {uploading ? '⏳ Uploading…' : '➕ Add to Queue'}
            </button>
            {state.isRunning ? (
              <button className="btn btn-danger" onClick={handleStop}>⏹ Stop</button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ background: 'var(--success)' }}
                onClick={handleStart}
                disabled={pending === 0 || available === 0}
              >
                ▶ Start
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={refresh}>🔄</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              📎 Attach
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = e.target.files;
                  setSelectedFiles(files ? [...files] : []);
                  setUploadedPaths([]);
                }}
              />
            </label>
            {selectedFiles.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {selectedFiles.map((f) => f.name).join(', ')}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 10, padding: '0 4px', marginLeft: 4 }}
                  onClick={() => {
                    setSelectedFiles([]);
                    setUploadedPaths([]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >✕</button>
                {uploadedPaths.length > 0 && ' ✅'}
              </span>
            )}
          </div>
        </div>
        {pending === 0 && !state.isRunning && state.tasks.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 12 }}>
            Enter questions above and register accounts in the Accounts page to get started.
          </p>
        )}
      </div>

      {/* ② Compact status bar */}
      <div className="status-bar">
        <span className="status-indicator">
          {state.isRunning ? '🟢 Running' : '⚪ Idle'}
        </span>
        <span className="status-pill" title="Pending"><span style={{ color: 'var(--accent)' }}>{pending}</span> pending</span>
        <span className="status-pill" title="Running"><span style={{ color: '#60a5fa' }}>{running}</span> running</span>
        <span className="status-pill" title="Done"><span style={{ color: 'var(--success)' }}>{done}</span> done</span>
        {failed > 0 && <span className="status-pill" title="Failed"><span style={{ color: 'var(--danger)' }}>{failed}</span> failed</span>}
        <span className="status-divider">|</span>
        <span className="status-pill" title="Available accounts"><span style={{ color: 'var(--success)' }}>{available}</span> accounts</span>
        {exhausted > 0 && <span className="status-pill" title="Exhausted accounts"><span style={{ color: 'var(--warning)' }}>{exhausted}</span> exhausted</span>}
        {state.activeAccountId && (
          <>
            <span className="status-divider">|</span>
            <span className="status-pill">Active: {state.activeAccountId.slice(0, 12)}…</span>
          </>
        )}
      </div>

      {/* ③ Task list with inline results */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ marginBottom: 0 }}>Tasks &amp; Results</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{state.tasks.length} task(s)</span>
            <button className="btn btn-ghost btn-sm" onClick={handleClearTasks} disabled={state.tasks.length === 0}>
              🗑 Clear
            </button>
          </div>
        </div>
        {state.tasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet. Add questions above to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Status</th>
                  <th style={{ width: 120 }}>Provider</th>
                  <th>Question</th>
                  <th style={{ width: 140 }}>Result</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {state.tasks.map((task) => (
                  <Fragment key={task.id}>
                    <tr
                      style={{ cursor: task.status === 'done' && task.answer ? 'pointer' : undefined }}
                      onClick={() => {
                        if (task.status === 'done' && task.answer) {
                          setExpandedTaskId(expandedTaskId === task.id ? null : task.id);
                        }
                      }}
                    >
                      <td>
                        <span className={`badge badge-${task.status}`}>{task.status}</span>
                      </td>
                      <td>
                        {task.preferredProvider && (
                          <span className={`provider-tag provider-${task.preferredProvider}`}>
                            {task.preferredProvider}
                            {task.preferredModel ? ` · ${task.preferredModel}` : ''}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ maxWidth: 500 }}>
                          {task.question}
                          {task.attachments && task.attachments.length > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>
                              📎 {task.attachments.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {task.status === 'done' && task.answer ? (
                          <span className="btn btn-ghost btn-sm">
                            {expandedTaskId === task.id ? '▼ Hide' : '▶ View'}
                          </span>
                        ) : task.status === 'failed' && task.error ? (
                          <span style={{ color: 'var(--danger)', fontSize: 12 }} title={task.error}>
                            {task.error.slice(0, 50)}{task.error.length > 50 ? '…' : ''}
                          </span>
                        ) : task.status === 'running' ? (
                          <span style={{ color: '#60a5fa', fontSize: 12 }}>processing…</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleRemoveTask(task.id); }}
                          disabled={task.status === 'running'}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {expandedTaskId === task.id && task.answer && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="answer-box" style={{ margin: 8, maxHeight: 400 }}>
                            {task.answer}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '0 12px 8px' }}>
                            {task.accountId && <span>Account: {task.accountId.slice(0, 16)}… · </span>}
                            {task.startedAt && <span>Started: {new Date(task.startedAt).toLocaleString()} · </span>}
                            {task.completedAt && <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
