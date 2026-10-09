export type RiskLevel = 'LOW_RISK' | 'NEEDS_REVIEW' | 'HIGH_RISK';

export type JobStatus = 
  | 'QUEUED'
  | 'INSPECTING'
  | 'PROCESSING_AUDIO'
  | 'PROCESSING_VIDEO'
  | 'BUILDING_EVIDENCE'
  | 'MAPPING_POLICY'
  | 'BUILDING_REPORT'
  | 'COMPLETED'
  | 'FAILED';

export type ScanStage = 
  | 'Upload'
  | 'Media inspection'
  | 'Audio & transcript'
  | 'Scene analysis'
  | 'Visual evidence'
  | 'Policy analysis'
  | 'Risk report';

export type ScanMode = 'standard' | 'deep';

export interface MediaMetadata {
  filename: string;
  originalSize: number;
  durationSeconds: number;
  width: number;
  height: number;
  resolutionLabel: string;
  fps: number;
  hasAudio: boolean;
  audioCodec?: string;
  videoCodec?: string;
  isProxyUsed: boolean;
}

export type EvidenceCategory = 
  | 'reused_content'
  | 'original_contribution'
  | 'inauthentic_pattern'
  | 'ai_disclosure'
  | 'advertiser_friendly'
  | 'community_guidelines'
  | 'metadata_coherence';

export type EvidenceSeverity = 'info' | 'warning' | 'high';

export interface EvidenceItem {
  id: string;
  scanId: string;
  timestampStart: number;
  timestampEnd: number;
  timestampLabel: string;
  type: string;
  category: EvidenceCategory;
  severity: EvidenceSeverity;
  confidence: number;
  source: string;
  label: string;
  details: string;
  frameThumbnailUrl?: string;
}

export interface TopIssue {
  id: string;
  what: string;
  where: string;
  why: string;
  fix: string;
  severity: EvidenceSeverity;
  policyArea: string;
  category: EvidenceCategory;
  timestampSeconds: number;
}

export interface RiskCategorySummary {
  status: RiskLevel;
  score: number; // 0-100 (lower score = lower risk)
  label: string;
  explanation: string;
}

export interface PolicyConnection {
  policyName: string;
  category: EvidenceCategory;
  impact: 'High Scrutiny' | 'Moderate Concern' | 'Standard Baseline' | 'Compliant';
  signalsCount: number;
  description: string;
}

export interface RiskReport {
  scanId: string;
  overallRisk: RiskLevel;
  riskSummary: string;
  riskCategories: {
    yppMonetization: RiskCategorySummary;
    videoMonetization: RiskCategorySummary;
    advertiserFriendly: RiskCategorySummary;
    copyrightSignals: RiskCategorySummary;
  };
  topIssues: TopIssue[];
  policyConnections: PolicyConnection[];
  timeline: EvidenceItem[];
  originalContributionRatio: number; // 0 - 100%
  reusedContentRatio: number; // 0 - 100%
  transformationScore: number; // 0 - 100%
  metadataScore: number; // 0 - 100%
  benchmarkMetrics: {
    totalProcessingSeconds: number;
    inspectionMs: number;
    audioProcessingMs: number;
    videoAnalysisMs: number;
    evidenceBuildingMs: number;
    policyReasoningMs: number;
    framesSampled: number;
    scenesDetected: number;
  };
}

export interface ScanJob {
  id: string;
  userId: string;
  videoTitle: string;
  videoDescription?: string;
  videoFilename: string;
  videoPath: string;
  proxyPath?: string;
  scanMode: ScanMode;
  status: JobStatus;
  currentStage: ScanStage;
  completedStages: ScanStage[];
  creditsUsed: number;
  metadata?: MediaMetadata;
  createdAt: string;
  completedAt?: string;
  error?: string;
  parentScanId?: string; // For re-scans
  isRescan?: boolean;
}

export interface ReScanComparison {
  originalScanId: string;
  revisedScanId: string;
  originalRisk: RiskLevel;
  revisedRisk: RiskLevel;
  originalSignalsCount: number;
  revisedSignalsCount: number;
  signalsDelta: number; // negative is improvement
  resolvedIssues: string[];
  remainingIssues: string[];
  improvements: string[];
  comparisonSummary: string;
  originalRatios: {
    originalContribution: number;
    reusedContent: number;
  };
  revisedRatios: {
    originalContribution: number;
    reusedContent: number;
  };
}

export interface UserAccount {
  id: string;
  email: string;
  plan: 'free' | 'creator' | 'pro' | 'agency';
  creditsRemaining: number;
  creditsUsedTotal: number;
  totalScansCount: number;
  createdAt: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  passwordHash?: string;
  salt?: string;
}

export interface AuthSessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEventRecord {
  eventId: string;
  provider: 'stripe';
  eventType: string;
  processedAt: string;
  userId?: string;
  creditsGranted?: number;
  planGranted?: string;
}

export interface PlanDetails {
  id: string;
  name: string;
  priceUsd: number;
  period: 'month' | 'one-time';
  credits: number;
  costPerMinuteStandard: string;
  features: string[];
  highlight?: boolean;
}
