// IP Helper for Orbit / Vimos

export async function fetchClientIp(): Promise<string> {
  // Try server endpoint first
  try {
    const res = await fetch('/api/get-ip');
    if (res.ok) {
      const data = await res.json();
      if (data.ip && data.ip !== '127.0.0.1' && data.ip !== 'localhost' && data.ip !== '::1') {
        return data.ip;
      }
    }
  } catch (e) {
    // Continue to external lookup
  }

  // Fallback to public ipify
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        return data.ip;
      }
    }
  } catch (e) {
    // Continue to next fallback
  }

  // Secondary fallback
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      if (data.ip) {
        return data.ip;
      }
    }
  } catch (e) {
    //
  }

  // Persistent simulated device IP if in offline/local environment
  let localSimulated = '';
  try {
    localSimulated = localStorage.getItem('vimos_client_ip_cached') || '';
  } catch {}

  if (!localSimulated) {
    const r1 = Math.floor(Math.random() * 150) + 100;
    const r2 = Math.floor(Math.random() * 200) + 20;
    const r3 = Math.floor(Math.random() * 250) + 1;
    localSimulated = `182.${r1}.${r2}.${r3}`;
    try {
      localStorage.setItem('vimos_client_ip_cached', localSimulated);
    } catch {}
  }

  return localSimulated;
}

export function sanitizeIpKey(ip: string): string {
  if (!ip) return 'unknown_ip';
  return ip.replace(/\./g, '_').replace(/:/g, '_').replace(/\//g, '_');
}

export function desanitizeIpKey(sanitized: string): string {
  if (!sanitized) return '';
  return sanitized.replace(/_/g, '.');
}
