import React, { useState } from 'react';
import { 
  RiskReport, 
  ScanJob, 
  RiskLevel 
} from '../types';
import { EvidenceTimeline } from './EvidenceTimeline';
import { 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  CheckCircle2, 
  FileText, 
  ChevronRight, 
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Sliders,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface ReportViewProps {
  report: RiskReport;
  scan: ScanJob;
  onInitiateRescan: (parentScanId: string) => void;
  onViewComparison?: () => void;
  hasComparison?: boolean;
}

export const ReportView: React.FC<ReportViewProps> = ({ 
  report, 
  scan, 
  onInitiateRescan, 
  onViewComparison,
  hasComparison 
}) => {
  const [activeTab, setActiveTab] = useState<'issues' | 'timeline' | 'policies' | 'benchmarks'>('issues');

  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case 'LOW_RISK':
        return {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          title: '🟢 Low Risk',
          bgColor: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          label: 'No major risk signals detected in this scan.',
        };
      case 'NEEDS_REVIEW':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
          title: '🟡 Needs Review',
          bgColor: 'bg-amber-50 border-amber-200 text-amber-900',
          label: 'Potential monetization risks detected. Review before publishing.',
        };
      case 'HIGH_RISK':
        return {
          icon: <XCircle className="w-5 h-5 text-rose-600" />,
          title: '🔴 High Risk',
          bgColor: 'bg-rose-50 border-rose-200 text-rose-900',
          label: 'Significant policy signals detected. Re-editing recommended.',
        };
    }
  };

  const overall = getRiskBadge(report.overallRisk);

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Top Action & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
            <span>VideoRisk Intelligence Report</span>
            <span>·</span>
            <span>Scan {scan.id}</span>
            <span>·</span>
            <span>{scan.scanMode === 'deep' ? 'Deep Scan' : 'Standard Scan'}</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-950 tracking-tight">
            {scan.videoTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {hasComparison && onViewComparison && (
            <button
              onClick={onViewComparison}
              className="px-3.5 py-2 border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>View Re-Scan Comparison</span>
            </button>
          )}

          <button
            onClick={() => onInitiateRescan(scan.id)}
            className="flex-1 sm:flex-initial px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-Scan Revised Video</span>
          </button>
        </div>
      </div>

      {/* OVERALL RISK BANNER */}
      <div className={`p-6 rounded-xl border ${overall.bgColor} shadow-xs`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 shrink-0">{overall.icon}</div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight">{overall.title}</h2>
                <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
                  Pre-Publish Assessment
                </span>
              </div>
              <p className="text-sm font-medium mt-1 leading-relaxed">
                {overall.label}
              </p>
              <p className="text-xs mt-1 text-stone-600">
                {report.riskSummary}
              </p>
            </div>
          </div>

          <div className="border-t md:border-t-0 md:border-l border-current/20 pt-3 md:pt-0 md:pl-6 shrink-0 flex items-center gap-6">
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                Original Contribution
              </span>
              <span className="text-lg font-bold text-stone-900">
                {report.originalContributionRatio}%
              </span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                Reused Material
              </span>
              <span className="text-lg font-bold text-stone-900">
                {report.reusedContentRatio}%
              </span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                Top Issues
              </span>
              <span className="text-lg font-bold text-stone-900">
                {report.topIssues.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FOUR DISTINCT POLICY SCORECARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. YPP Eligibility */}
        <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-500">Channel / YPP</span>
            <span className={`text-[11px] font-bold ${
              report.riskCategories.yppMonetization.status === 'LOW_RISK' ? 'text-emerald-600' :
              report.riskCategories.yppMonetization.status === 'NEEDS_REVIEW' ? 'text-amber-600' : 'text-rose-600'
            }`}>
              {report.riskCategories.yppMonetization.status === 'LOW_RISK' ? 'Low Risk' :
               report.riskCategories.yppMonetization.status === 'NEEDS_REVIEW' ? 'Needs Review' : 'High Risk'}
            </span>
          </div>
          <p className="font-bold text-sm text-stone-900">
            {report.riskCategories.yppMonetization.label}
          </p>
          <p className="text-xs text-stone-600 mt-1 line-clamp-2">
            {report.riskCategories.yppMonetization.explanation}
          </p>
        </div>

        {/* 2. Video Monetization */}
        <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-500">Video Ad Status</span>
            <span className={`text-[11px] font-bold ${
              report.riskCategories.videoMonetization.status === 'LOW_RISK' ? 'text-emerald-600' :
              report.riskCategories.videoMonetization.status === 'NEEDS_REVIEW' ? 'text-amber-600' : 'text-rose-600'
            }`}>
              {report.riskCategories.videoMonetization.status === 'LOW_RISK' ? 'Low Risk' :
               report.riskCategories.videoMonetization.status === 'NEEDS_REVIEW' ? 'Needs Review' : 'High Risk'}
            </span>
          </div>
          <p className="font-bold text-sm text-stone-900">
            {report.riskCategories.videoMonetization.label}
          </p>
          <p className="text-xs text-stone-600 mt-1 line-clamp-2">
            {report.riskCategories.videoMonetization.explanation}
          </p>
        </div>

        {/* 3. Advertiser-Friendly */}
        <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-500">Ad-Friendly</span>
            <span className="text-[11px] font-bold text-emerald-600">
              Low Risk
            </span>
          </div>
          <p className="font-bold text-sm text-stone-900">
            {report.riskCategories.advertiserFriendly.label}
          </p>
          <p className="text-xs text-stone-600 mt-1 line-clamp-2">
            {report.riskCategories.advertiserFriendly.explanation}
          </p>
        </div>

        {/* 4. Copyright Signals */}
        <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-500">Copyright Signals</span>
            <span className={`text-[11px] font-bold ${
              report.riskCategories.copyrightSignals.status === 'LOW_RISK' ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {report.riskCategories.copyrightSignals.status === 'LOW_RISK' ? 'Low Risk' : 'Needs Review'}
            </span>
          </div>
          <p className="font-bold text-sm text-stone-900">
            {report.riskCategories.copyrightSignals.label}
          </p>
          <p className="text-xs text-stone-600 mt-1 line-clamp-2">
            {report.riskCategories.copyrightSignals.explanation}
          </p>
        </div>
      </div>

      {/* REPORT SECTIONS NAVIGATION TABS */}
      <div className="border-b border-stone-200 flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-semibold overflow-x-auto whitespace-nowrap pb-0.5">
        <button
          onClick={() => setActiveTab('issues')}
          className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
            activeTab === 'issues' 
              ? 'border-rose-600 text-stone-900 font-bold' 
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Top Issues & Fixes</span>
          <span className="bg-stone-100 text-stone-700 text-xs px-2 py-0.5 rounded">
            {report.topIssues.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
            activeTab === 'timeline' 
              ? 'border-rose-600 text-stone-900 font-bold' 
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Evidence Timeline</span>
          <span className="bg-stone-100 text-stone-700 text-xs px-2 py-0.5 rounded">
            {report.timeline.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('policies')}
          className={`pb-3 transition-colors border-b-2 shrink-0 ${
            activeTab === 'policies' 
              ? 'border-rose-600 text-stone-900 font-bold' 
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Policy Connections ({report.policyConnections.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('benchmarks')}
          className={`pb-3 transition-colors border-b-2 shrink-0 ${
            activeTab === 'benchmarks' 
              ? 'border-rose-600 text-stone-900 font-bold' 
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Inspection Telemetry</span>
        </button>
      </div>

      {/* SECTION 1: TOP ISSUES WITH WHAT / WHERE / WHY / WHAT TO FIX */}
      {activeTab === 'issues' && (
        <div className="space-y-4">
          {report.topIssues.length === 0 ? (
            <div className="p-8 bg-white rounded-xl border border-stone-200 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="font-bold text-stone-900">No High-Risk Issues Detected</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                Your video exhibits balanced original narration and differentiated editing patterns.
              </p>
            </div>
          ) : (
            report.topIssues.map(issue => (
              <div 
                key={issue.id}
                className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {issue.severity === 'high' ? (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="font-bold text-sm text-stone-900">
                      {issue.policyArea}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-semibold bg-stone-100 px-2 py-0.5 rounded text-stone-700">
                    WHERE: {issue.where}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* WHAT */}
                  <div className="p-3 bg-stone-50 rounded border border-stone-100">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block mb-1">
                      WHAT WAS DETECTED
                    </span>
                    <p className="text-stone-800 font-medium leading-relaxed">
                      {issue.what}
                    </p>
                  </div>

                  {/* WHY */}
                  <div className="p-3 bg-stone-50 rounded border border-stone-100">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block mb-1">
                      WHY IT TRIGGERS SCRUTINY
                    </span>
                    <p className="text-stone-800 leading-relaxed">
                      {issue.why}
                    </p>
                  </div>
                </div>

                {/* WHAT SHOULD I FIX? */}
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    WHAT SHOULD I FIX? (ACTIONABLE EDITING RECOMMENDATION)
                  </span>
                  <p className="text-emerald-950 font-medium leading-relaxed">
                    {issue.fix}
                  </p>
                </div>
              </div>
            ))
          )}

          {/* Quick CTA to Re-scan */}
          <div className="p-5 bg-stone-900 text-white rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-sm">Made changes to your timeline?</h4>
              <p className="text-xs text-stone-300 mt-0.5">
                Export your revised video cut and run a Re-Scan to verify that your edits resolved these policy flags.
              </p>
            </div>
            <button
              onClick={() => onInitiateRescan(scan.id)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded shrink-0 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-Scan Revised Video</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2: EVIDENCE TIMELINE */}
      {activeTab === 'timeline' && (
        <EvidenceTimeline timeline={report.timeline} />
      )}

      {/* SECTION 3: POLICY CONNECTIONS */}
      {activeTab === 'policies' && (
        <div className="space-y-3">
          {report.policyConnections.map((policy, idx) => (
            <div 
              key={idx}
              className="p-4 bg-white rounded-xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-stone-900">
                    {policy.policyName}
                  </span>
                </div>
                <p className="text-stone-600 max-w-2xl leading-relaxed">
                  {policy.description}
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <span className="block text-[10px] uppercase font-bold text-stone-400">
                    Signals
                  </span>
                  <span className="font-bold text-stone-800">
                    {policy.signalsCount}
                  </span>
                </div>

                <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  policy.impact === 'Compliant' ? 'bg-emerald-100 text-emerald-800' :
                  policy.impact === 'Standard Baseline' ? 'bg-stone-100 text-stone-700' :
                  policy.impact === 'Moderate Concern' ? 'bg-amber-100 text-amber-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {policy.impact}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SECTION 4: BENCHMARK TELEMETRY */}
      {activeTab === 'benchmarks' && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
          <div>
            <h3 className="font-bold text-sm text-stone-900">Media Inspection & Processing Telemetry</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Breakdown of execution time across modular pipeline layers.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-stone-50 rounded border border-stone-100">
              <span className="text-stone-500 block">Total Processing</span>
              <strong className="text-stone-900 text-base">{report.benchmarkMetrics.totalProcessingSeconds}s</strong>
            </div>
            <div className="p-3 bg-stone-50 rounded border border-stone-100">
              <span className="text-stone-500 block">Frames Sampled</span>
              <strong className="text-stone-900 text-base">{report.benchmarkMetrics.framesSampled} keyframes</strong>
            </div>
            <div className="p-3 bg-stone-50 rounded border border-stone-100">
              <span className="text-stone-500 block">Scenes Detected</span>
              <strong className="text-stone-900 text-base">{report.benchmarkMetrics.scenesDetected} cuts</strong>
            </div>
            <div className="p-3 bg-stone-50 rounded border border-stone-100">
              <span className="text-stone-500 block">Proxy Used</span>
              <strong className="text-stone-900 text-base">{scan.metadata?.isProxyUsed ? 'Yes (1080p)' : 'No (Native)'}</strong>
            </div>
          </div>

          <div className="p-3 bg-stone-50 rounded border border-stone-100 text-xs font-mono text-stone-600 space-y-1">
            <div>inspection_time: {report.benchmarkMetrics.inspectionMs}ms</div>
            <div>audio_pipeline: {report.benchmarkMetrics.audioProcessingMs}ms</div>
            <div>video_hash_pipeline: {report.benchmarkMetrics.videoAnalysisMs}ms</div>
            <div>policy_reasoning: {report.benchmarkMetrics.policyReasoningMs}ms</div>
          </div>
        </div>
      )}
    </div>
  );
};
