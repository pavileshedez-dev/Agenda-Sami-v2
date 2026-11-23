/**
 * Limitador de tasa en memoria por ventana fija con limpieza automática.
 * Diseñado para proteger /api/auth/login y /api/ia/chat contra fuerza bruta y abuso.
 */
export class MemoryRateLimiter {
  constructor({ windowMs, maxRequests, name = 'limiter' }) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.name = name;
    this.buckets = new Map();
    this.lastCleanup = Date.now();
  }

  _cleanup(now) {
    if (now - this.lastCleanup < Math.max(this.windowMs, 60000)) return;
    this.lastCleanup = now;
    for (const [key, entry] of this.buckets.entries()) {
      if (entry.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Comprueba si la clave está actualmente bloqueada (sin incrementar).
   */
  check(key) {
    const now = Date.now();
    this._cleanup(now);
    const entry = this.buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      return { allowed: true, remaining: this.maxRequests, retryAfterSeconds: 0 };
    }
    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - entry.count),
      retryAfterSeconds: 0,
    };
  }

  /**
   * Registra un intento y devuelve si está permitido.
   */
  consume(key) {
    const now = Date.now();
    this._cleanup(now);
    let entry = this.buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - entry.count),
      retryAfterSeconds: 0,
    };
  }

  reset(key) {
    this.buckets.delete(key);
  }

  clearAll() {
    this.buckets.clear();
  }
}
