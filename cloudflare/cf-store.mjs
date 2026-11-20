// Lager til Cloudflare: samme små metoder som Netlify Blobs (get, setJSON, set, delete, list, getWithMetadata),
// så crm-core og lead-core virker uændret. JSON (leads, opsætning, brugere) ligger i D1, filer ligger i R2.
// Både D1-databasen og R2-bucketten er oprettet med EU-jurisdiktion, så data gemmes i EU.
// Hver række har et site (kundens id), så én database kan bære alle kunder, når portalen kommer.

const SCHEMA = `CREATE TABLE IF NOT EXISTS kv (site TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (site, k))`;
let ready = null;

export function cfStore(db, bucket, site) {
  if (!db) throw new Error('D1-databasen (DB) mangler i wrangler-opsætningen');
  if (!site) throw new Error('SITE_ID mangler');
  const init = () => (ready ||= db.prepare(SCHEMA).run().catch(e => { ready = null; throw e; }));
  const isFile = k => k.startsWith('fil/');
  const fileKey = k => `${site}/${k}`;
  return {
    async get(key, opts = {}) {
      if (isFile(key)) {
        const o = bucket && await bucket.get(fileKey(key));
        if (!o) return null;
        return opts.type === 'arrayBuffer' ? o.arrayBuffer() : o.text();
      }
      await init();
      const row = await db.prepare('SELECT v FROM kv WHERE site = ? AND k = ?').bind(site, key).first();
      if (!row) return null;
      return opts.type === 'json' ? JSON.parse(row.v) : row.v;
    },
    async setJSON(key, value) {
      await init();
      await db.prepare('INSERT INTO kv (site, k, v, ts) VALUES (?, ?, ?, ?) ON CONFLICT (site, k) DO UPDATE SET v = excluded.v, ts = excluded.ts')
        .bind(site, key, JSON.stringify(value), Date.now()).run();
    },
    async set(key, data, opts = {}) {
      if (isFile(key)) {
        if (!bucket) throw new Error('R2-bucketten (FILES) mangler, filer kan ikke gemmes');
        const meta = Object.fromEntries(Object.entries(opts.metadata || {}).map(([a, b]) => [a, String(b ?? '')]));
        await bucket.put(fileKey(key), data, { customMetadata: meta, httpMetadata: meta.type ? { contentType: meta.type } : undefined });
        return;
      }
      await this.setJSON(key, typeof data === 'string' ? data : null);
    },
    async delete(key) {
      if (isFile(key)) return bucket?.delete(fileKey(key));
      await init();
      await db.prepare('DELETE FROM kv WHERE site = ? AND k = ?').bind(site, key).run();
    },
    async list({ prefix = '' } = {}) {
      await init();
      const { results } = await db.prepare("SELECT k FROM kv WHERE site = ? AND k LIKE ? ESCAPE '\\'").bind(site, prefix.replace(/[\\%_]/g, m => '\\' + m) + '%').all();
      return { blobs: results.map(r => ({ key: r.k })) };
    },
    /** Hurtig udgave af list + get i én forespørgsel (bruges af CRM'ets liste). */
    async listJSON(prefix = '') {
      await init();
      const { results } = await db.prepare("SELECT v FROM kv WHERE site = ? AND k LIKE ? ESCAPE '\\'").bind(site, prefix.replace(/[\\%_]/g, m => '\\' + m) + '%').all();
      return results.map(r => JSON.parse(r.v));
    },
    async getWithMetadata(key) {
      const o = bucket && await bucket.get(fileKey(key));
      if (!o) return null;
      return { data: await o.arrayBuffer(), metadata: o.customMetadata || {} };
    }
  };
}
