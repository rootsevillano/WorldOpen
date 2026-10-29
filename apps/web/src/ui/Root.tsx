import { useEffect, useState } from 'react';
import { App } from './App';
import type { AppSession } from './useEngine';

type Boot = { kind: 'detecting' } | { kind: 'login'; error?: string } | { kind: 'ready'; session: AppSession };

/**
 * Detecta si la web la sirve un servidor de WorldOpen (ADR-0016): si `/api/session` responde JSON, hay servidor y hace
 * falta sesión; si no, la app funciona en local con el motor en un Worker.
 */
async function detect(): Promise<Boot> {
  try {
    const res = await fetch('/api/session', { headers: { Accept: 'application/json' } });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { kind: 'ready', session: { mode: 'local' } };
    if (res.status === 401) return { kind: 'login' };
    if (res.ok) {
      const s = (await res.json()) as { name: string; role: 'admin' | 'observer' };
      return { kind: 'ready', session: { mode: 'server', name: s.name, role: s.role } };
    }
  } catch {
    // Sin servidor: modo local.
  }
  return { kind: 'ready', session: { mode: 'local' } };
}

export function Root() {
  const [boot, setBoot] = useState<Boot>({ kind: 'detecting' });
  useEffect(() => {
    void detect().then(setBoot);
  }, []);

  if (boot.kind === 'detecting') return <div className="center muted">Conectando…</div>;
  if (boot.kind === 'login') return <Login error={boot.error} onDone={() => void detect().then(setBoot)} />;
  return <App session={boot.session} />;
}

function Login({ error, onDone }: { error?: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(error ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <div className="center">
      <form
        className="panel login"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setMessage('');
          void fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password }),
          })
            .then(async (res) => {
              if (res.ok) onDone();
              else setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo entrar');
            })
            .catch(() => setMessage('Sin conexión con el servidor'))
            .finally(() => {
              setBusy(false);
              setPassword('');
            });
        }}
      >
        <h1>WorldOpen</h1>
        <p className="muted small">Entra para ver el mundo. Solo el administrador puede intervenir en él.</p>
        <label>
          Usuario
          <input autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {message && <div className="error-text" role="alert">{message}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
