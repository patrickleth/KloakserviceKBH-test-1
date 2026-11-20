// Netlify Function (v2) til mini-CRM'et på /administrator-system/. Logikken ligger i ../lib/crm-core.mjs.
import { getStore } from '@netlify/blobs';
import { handleAdmin } from '../lib/crm-core.mjs';

export default async (req, context) => handleAdmin(req, process.env, {
  store: getStore({ name: 'crm', consistency: 'strong' }),
  ip: context?.ip || req.headers.get('x-nf-client-connection-ip') || ''
});

export const config = {
  path: '/administrator-system/api/*',
  // Ekstra værn mod gætteri ud over låsen i crm-core: højst 60 kald pr. minut pr. IP.
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
