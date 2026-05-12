const headers = { 'Content-Type': 'application/json' };

async function handle(res) {
  const payload = await res.json();
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || 'Falha na requisição');
  }
  return payload.data ?? payload;
}

const timeout = () => ({ signal: AbortSignal.timeout(15_000) });

export const api = {
  get: (url) => fetch(url, timeout()).then(handle),
  post: (url, body) => fetch(url, { ...timeout(), method: 'POST', headers, body: JSON.stringify(body) }).then(handle),
  put: (url, body) => fetch(url, { ...timeout(), method: 'PUT', headers, body: JSON.stringify(body) }).then(handle),
  delete: (url) => fetch(url, { ...timeout(), method: 'DELETE' }).then(handle)
};

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
