/**
 * UnifyGTM integration surface for ProofLoop
 * Uses UnifyGTM Data API for outbound proof sync; demo conversations for RAG discovery.
 */

import {
  getUnifyGtmStatus,
  isUnifyGtmConfigured,
  listUnifyGtmObjects,
  syncTrustSignalsToUnifyGtm,
  upsertProofToUnifyGtm
} from './unifygtm.js';

export interface UnifyConversation {
  id: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface UnifyConversationsResponse {
  conversations: UnifyConversation[];
  source: 'unifygtm' | 'demo';
  total: number;
}

/** Demo conversation corpus for proof discovery (UnifyGTM has no conversations API) */
export const DEMO_UNIFY_CONVERSATIONS: UnifyConversation[] = [
  {
    id: 'conv-recruitment-001',
    title: 'TalentFlow — Recruitment Agency',
    text: `Customer: We're a recruitment agency with 120 staff. Our recruiters were spending 12+ hours per week on manual CV screening.
Support: Have you tried automating shortlist generation?
Customer: After onboarding, we saved £40,000 in operational costs within 3 months. Screening time dropped dramatically.
Customer: This proof point is exactly what our enterprise prospects ask for — quantified ROI and time savings.`,
    metadata: { industry: 'Staffing & Recruiting', companySize: '50-500', channel: 'support' }
  },
  {
    id: 'conv-staffing-002',
    title: 'StaffingCo — Enterprise Staffing',
    text: `Customer: We run high-volume hiring for enterprise clients. Before switching, sales cycles were 90+ days.
Customer: One case study about reducing sales cycle by 40% would help our SDR team massively.
Customer: Our VP Operations said team adoption hit 95% in week one — that's rare for HR tech.`,
    metadata: { industry: 'Human Resources', companySize: '200-2000', channel: 'success' }
  },
  {
    id: 'conv-talent-003',
    title: 'HireBridge — Talent Platform',
    text: `Customer: We're a talent platform connecting employers with candidates at scale.
Customer: The emotional moment for us was a customer quote about saving their team from burnout.
Customer: We need proof-led messaging for LinkedIn — financial impact converts CFOs, emotional proof converts champions.`,
    metadata: { industry: 'HR Tech', companySize: '20-200', channel: 'sales' }
  },
  {
    id: 'conv-saas-004',
    title: 'ScaleStack — B2B SaaS',
    text: `Customer: We're a growth-stage SaaS startup without a big marketing team.
Customer: ProofLoop surfaced 47 trust signals from 2 years of support tickets we never used.
Customer: Landing page conversion jumped 34% after updating hero with a single ROI quote from customer email.`,
    metadata: { industry: 'Software', companySize: '10-100', channel: 'support' }
  },
  {
    id: 'conv-cs-005',
    title: 'RevOps — Customer Success',
    text: `Customer: Our CS team sits on gold — NPS responses, renewal calls, QBR notes.
Customer: Time savings of 8 hours per rep per week showed up repeatedly in survey data.
Customer: Customer satisfaction scores up 28 points after we started leading with ranked proof in outreach.`,
    metadata: { industry: 'Cross-industry', companySize: '100-1000', channel: 'survey' }
  }
];

export function isUnifyConfigured(): boolean {
  return isUnifyGtmConfigured();
}

export function getUnifyBaseUrl(): string {
  return getUnifyGtmStatus().dataApiUrl;
}

/** Fetch conversations from Unify / Mitel API */
/**
 * Deprecated live path: UnifyGTM has no "conversations" endpoint — that was a
 * Mitel CloudLink mismatch. Corroba's proof corpus now comes from uploads + demo
 * data, and Unify is integrated via the Analytics API (see unify-analytics.ts).
 * These demo conversations remain as sample proof sources for the RAG index.
 */
export async function fetchUnifyConversations(): Promise<UnifyConversationsResponse> {
  return { conversations: DEMO_UNIFY_CONVERSATIONS, source: 'demo', total: DEMO_UNIFY_CONVERSATIONS.length };
}

export {
  getUnifyGtmStatus,
  isUnifyGtmConfigured,
  listUnifyGtmObjects,
  syncTrustSignalsToUnifyGtm,
  upsertProofToUnifyGtm
};
