// Netlify Function (v2). Al logik ligger i ../lib/lead-core.mjs, så den kan testes lokalt.
import { getStore } from '@netlify/blobs';
import { handleLead } from '../lib/lead-core.mjs';
import { crmStore } from '../lib/crm-core.mjs';

export default async (req, context) => {
  // Mini-CRM'et (/administrator-system/) får hvert lead. Slås fra med CRM_ENABLED=false.
  let crm = null;
  if (process.env.CRM_ENABLED !== 'false') {
    try { crm = crmStore(getStore({ name: 'crm', consistency: 'strong' })); } catch (e) { console.error('[lead] CRM-lager utilgængeligt', e?.message); }
  }
  return handleLead(req, process.env, { waitUntil: context?.waitUntil?.bind(context), crm });
};

export const config = {
  path: '/api/lead',
  // Netlifys indbyggede rate limit: højst 10 indsendelser pr. minut pr. IP.
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
