import type { ExtractedSignal } from '../data/demo.js';
import type { AudienceMatch, GtmPlaybookContent, ContentAssetResult, GrowthRecommendationResult } from '../data/demo.js';
import { DEMO_AUDIENCES, DEMO_GTM_PLAYBOOKS, DEMO_CONTENT_ASSETS, DEMO_GROWTH_RECOMMENDATIONS } from '../data/demo.js';
export { syncToZero } from './zero.js';
import { expandAudienceWithRag } from '../rag/pipeline.js';
import { isUnifyConfigured } from './unify.js';

/** Unify — Proof Expansion Engine via RAG over /conversations */
export async function expandAudience(proofQuote: string): Promise<AudienceMatch[]> {
  try {
    const { audiences } = await expandAudienceWithRag(proofQuote);
    if (audiences.length > 0) return audiences;
  } catch {
    /* fall through */
  }

  if (/recruit|staffing|talent|hours?\s*per\s*week/i.test(proofQuote)) {
    return DEMO_AUDIENCES.slice(0, 3);
  }
  return DEMO_AUDIENCES;
}

export async function expandAudienceWithContext(proofQuote: string) {
  return expandAudienceWithRag(proofQuote);
}

export function isUnifyLive(): boolean {
  return isUnifyConfigured();
}

/** GTMengineer.dev — Simulated internal API */
export async function generateGtmSystem(proofSignals: ExtractedSignal[]): Promise<typeof DEMO_GTM_PLAYBOOKS> {
  if (process.env.GTMENGINEER_API_KEY && process.env.GTMENGINEER_API_URL) {
    try {
      const res = await fetch(`${process.env.GTMENGINEER_API_URL}/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GTMENGINEER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signals: proofSignals })
      });
      if (res.ok) {
        const data = (await res.json()) as typeof DEMO_GTM_PLAYBOOKS;
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      /* fall through */
    }
  }

  if (proofSignals.length === 0) return DEMO_GTM_PLAYBOOKS.slice(0, 2);

  const top = proofSignals.slice(0, 3);
  const [s1, s2, s3] = [
    top[0] ?? proofSignals[0],
    top[1] ?? top[0] ?? proofSignals[0],
    top[2] ?? top[0] ?? proofSignals[0]
  ];

  const industries = [
    s1.signalType?.includes('Revenue') || s1.signalType?.includes('Savings')
      ? 'ROI-focused enterprises with 50-500 employees'
      : s1.signalType?.includes('Time')
        ? 'Operations teams drowning in manual work'
        : s1.signalType?.includes('Growth')
          ? 'Growth-stage companies optimizing conversion'
          : s1.signalType?.includes('Risk')
            ? 'Enterprise sales orgs with long deal cycles'
            : s1.signalType?.includes('Satisfaction')
              ? 'Customer-obsessed B2B companies'
              : 'B2B organizations seeking competitive advantage',
  ];

  const signalQuote = (s: ExtractedSignal) => s.quote.length > 100 ? s.quote.slice(0, 97) + '...' : s.quote;

  const playbook: typeof DEMO_GTM_PLAYBOOKS[number] = {
    title: `GTM System: ${s1.signalType} + ${s2.signalType} + ${s3.signalType}`,
    type: 'outreach',
    content: {
      icp: `${industries[0]}. Best fit for organizations where ${s1.category?.toLowerCase()} resonates most — validated by a ${s1.proofScore}/100 proof score on "${signalQuote(s1)}"`,
      positioning: `We help ${industries[0].toLowerCase()} turn hidden customer outcomes into their highest-converting sales asset. Unlike generic testimonial tools, we automatically rank proof by conversion potential and match it to buyer personas — so your strongest evidence always leads the conversation.`,
      outreachSystem: [
        `Touch 1 — ${s1.signalType}: "${signalQuote(s1)}"`,
        `Touch 2 — ${s2.signalType}: "${signalQuote(s2)}"`,
        `Touch 3 — ${s3.signalType}: "${signalQuote(s3)}"`,
        'Touch 4 — Close with a case study bundling all 3 signals into a single ROI narrative'
      ],
      contentIdeas: [
        { title: `${s1.signalType} Story That Closed Enterprise Deals`, format: 'Case Study', angle: `Lead with "${signalQuote(s1)}" as the hook` },
        { title: `How We Turned ${s1.category} Into a Growth Channel`, format: 'Blog Post', angle: `Deep dive on ${s1.category?.toLowerCase()} proof as a GTM strategy` },
        { title: `The ${s2.signalType} Playbook for B2B Teams`, format: 'LinkedIn Post', angle: `Practical take on "${signalQuote(s2)}"` },
        { title: `Why ${s3.category} Proof Converts Better Than Features`, format: 'Thought Leadership', angle: 'Category creation for proof-led GTM' }
      ],
      landingPageAngles: [
        { headline: `Stop Selling Features. Start Selling ${s1.category}.`, hook: signalQuote(s1), proofQuote: `"${s1.quote}"` },
        { headline: `Your Next ${s2.category} Breakthrough Is Already in Your Inbox`, hook: signalQuote(s2), proofQuote: `"${s2.quote}"` },
        { headline: `The ${s3.signalType} Metric That Changes Everything`, hook: signalQuote(s3), proofQuote: `"${s3.quote}"` }
      ],
      nextActions: [
        { action: `Deploy "${signalQuote(s1)}" as landing page hero proof`, impact: 'High', effort: 'Low', source: 'GTM System' },
        { action: 'Build SDR sequence around top 3 ranked trust signals', impact: 'High', effort: 'Medium', source: 'GTM System' },
        { action: 'Publish LinkedIn post featuring strongest emotional proof signal', impact: 'Medium', effort: 'Low', source: 'GTM System' },
        { action: 'Create case study bundle for sales enablement', impact: 'Medium', effort: 'Medium', source: 'GTM System' }
      ],
      growthLoops: [
        `Customer proof → ${s1.signalType} content → inbound leads → more proof`,
        'SDR deck with ranked signals → faster deals → new testimonials',
        'Case study library → SEO → demo requests → proof discovery'
      ],
      conversionFramework: [
        `Awareness: Lead with ${s1.signalType} proof (score ${s1.proofScore}+)`,
        'Consideration: Stack 3 trust signals by persona',
        `Decision: Deploy case study + ${s1.category} ROI calculator`,
        'Expansion: Surface new proof from customer success calls'
      ],
      playbook: `Start every sequence with your #1 ranked trust signal: "${signalQuote(s1)}". Match proof type to buyer persona: CFO gets ${s1.category}, VP Ops gets ${s2.category}, CEO gets ${s3.category}. Refresh signals weekly as new proof is discovered.`
    } as GtmPlaybookContent
  };

  return [playbook, ...DEMO_GTM_PLAYBOOKS.slice(0, 1)];
}

/** Faxxing — Proof Amplification Engine (integration point) */
export async function amplifyProof(signal: ExtractedSignal): Promise<ContentAssetResult[]> {
  if (process.env.FAXXING_API_KEY && process.env.FAXXING_API_URL) {
    try {
      const res = await fetch(`${process.env.FAXXING_API_URL}/amplify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.FAXXING_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signal })
      });
      if (res.ok) {
        const data = (await res.json()) as ContentAssetResult[];
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      /* fall through */
    }
  }

  return DEMO_CONTENT_ASSETS.map((asset) => ({
    ...asset,
    content: asset.content.replace('£40,000', signal.quote.match(/[£$€][\d,]+/)?.[0] ?? '£40,000')
  }));
}

/** Scaile — Growth Recommendation Engine (integration point) */
export async function getGrowthRecommendations(signals: ExtractedSignal[]): Promise<GrowthRecommendationResult[]> {
  if (process.env.SCAILE_API_KEY && process.env.SCAILE_API_URL) {
    try {
      const res = await fetch(`${process.env.SCAILE_API_URL}/recommendations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SCAILE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signals })
      });
      if (res.ok) {
        const data = (await res.json()) as GrowthRecommendationResult[];
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      /* fall through */
    }
  }

  return DEMO_GROWTH_RECOMMENDATIONS.map((rec, i) => ({
    ...rec,
    proofSignalIds: signals.slice(i, i + 1).map((_, j) => `signal-${j + 1}`)
  }));
}

/** Lightfern — Proof Validation (integration point) */
export async function validateProof(signal: ExtractedSignal): Promise<ExtractedSignal> {
  if (process.env.LIGHTFERN_API_KEY && process.env.LIGHTFERN_API_URL) {
    try {
      const res = await fetch(`${process.env.LIGHTFERN_API_URL}/score`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.LIGHTFERN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quote: signal.quote })
      });
      if (res.ok) {
        const data = (await res.json()) as ExtractedSignal;
        return { ...signal, ...data };
      }
    } catch {
      /* fall through */
    }
  }
  return signal;
}
