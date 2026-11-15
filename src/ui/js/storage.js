/* Acceso seguro a localStorage (no falla si está bloqueado). */
export const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del: k => { try { localStorage.removeItem(k); } catch { /* ignorar */ } },
};

