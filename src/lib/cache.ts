/**
 * Cache en memoria del proceso, con dos formas de usarlo:
 *
 *   · `cached(key, fn, ttlMs)`     → TTL FIJO, decidido por quien llama. Es lo
 *                                    que usa todo lo que lee de Google Sheets,
 *                                    donde la fuente no dice nada sobre cuánto
 *                                    vale su respuesta y el TTL lo ponemos acá.
 *   · `cachedConTtl(key, fn)`      → TTL que sale de la PROPIA RESPUESTA. Es lo
 *                                    que usan los lectores de DRC Gestión, que
 *                                    mandan Cache-Control por endpoint y por
 *                                    mes: guardarlos con un TTL nuestro sería
 *                                    contradecir a la fuente.
 *
 * Las dos comparten almacén y las dos coalescen las peticiones EN VUELO: si
 * llegan cinco pestañas a la vez con la misma clave, se hace UNA llamada y las
 * cinco esperan a la misma promesa. Coalescer no es cachear —no se reutiliza
 * ninguna respuesta ya recibida—, así que también vale con `no-store`: es lo que
 * evita que respetar el `no-store` del mes en curso se convierta en una estampida
 * contra el endpoint remoto.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

/** Peticiones en curso por clave. Se borra la entrada al terminar, pase lo que pase. */
const inFlight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 60_000; // 60s: suficiente para "tiempo real" sin saturar Sheets API

/** Lanza `fn` una sola vez por clave aunque la llamen a la vez, y guarda según `ttlMs`. */
async function runCoalesced<T>(
  key: string,
  fn: () => Promise<{ value: T; ttlMs: number }>
): Promise<T> {
  const enCurso = inFlight.get(key) as Promise<T> | undefined;
  if (enCurso) return enCurso;

  const promesa = (async () => {
    const { value, ttlMs } = await fn();
    if (ttlMs > 0) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    } else {
      // TTL 0 = no se guarda. Y además se tira lo que hubiera de antes: una
      // respuesta que ahora dice "no-store" invalida a la anterior, no convive
      // con ella.
      store.delete(key);
    }
    return value;
  })();

  inFlight.set(key, promesa);
  try {
    return await promesa;
  } finally {
    inFlight.delete(key);
  }
}

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  return runCoalesced(key, async () => ({ value: await fn(), ttlMs }));
}

/**
 * Igual que `cached`, pero el TTL lo decide la respuesta: `fn` devuelve el valor
 * Y cuántos ms vale. Con `ttlMs <= 0` no se guarda nada (el caso `no-store`).
 */
export async function cachedConTtl<T>(
  key: string,
  fn: () => Promise<{ value: T; ttlMs: number }>
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  return runCoalesced(key, fn);
}

export function invalidate(key?: string) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}
