'use client';
import { setApiKey } from '@/lib/api-client';

export function ApiKeyControl() {
  return <button className="text-xs text-cyan-400" onClick={() => {
    const key = window.prompt('API key (stored in this tab until it closes; leave blank to clear):');
    if (key !== null) {
      try { setApiKey(key.trim()); window.location.reload(); }
      catch { window.alert('Could not store the key in this browser tab.'); }
    }
  }}>API key</button>;
}
