import React from 'react';
import { ReScanComparison } from '../types';
import { CheckCircle2, AlertTriangle, ArrowRight, TrendingUp, ShieldCheck, RefreshCw } from 'lucide-react';

interface ComparisonViewProps {
  comparison: ReScanComparison;
  onBackToReport: () => void;
  onNewScan: () => void;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ 
  comparison, 
  onBackToReport,
  onNewScan 
}) => {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-wider text-rose-600 font-semibold">
            Workflow Verification
          </span>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            Re-Scan Risk Comparison
          </h1>
          <p className="text-xs text-stone-500">
            Side-by-side delta between your original upload and the revised video cut.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onBackToReport}
            className="px-3.5 py-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold rounded"
          >
            Back to Report
          </button>
          <button
            onClick={onNewScan}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded"
          >
            New Scan
          </button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-bold text-emerald-950 text-base">
              {comparison.comparisonSummary}
            </h3>
            <p className="text-xs text-emerald-800 mt-1">
              Your edits have successfully addressed platform policy scrutiny points.
            </p>
          </div>
        </div>
      </div>

      {/* BEFORE VS AFTER CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BEFORE CARD */}
        <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="font-bold text-xs uppercase tracking-wider text-stone-500">
              ORIGINAL CUT (BEFORE)
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              comparison.originalRisk === 'HIGH_RISK' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {comparison.originalRisk === 'HIGH_RISK' ? '🔴 High Risk' : '🟡 Needs Review'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-stone-50">
              <span className="text-stone-500">Risk Signals:</span>
              <strong className="text-stone-900">{comparison.originalSignalsCount} detected</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-50">
              <span className="text-stone-500">Original Commentary:</span>
              <strong className="text-stone-900">{comparison.originalRatios.originalContribution}%</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-50">
              <span className="text-stone-500">Reused Material:</span>
              <strong className="text-stone-900">{comparison.originalRatios.reusedContent}%</strong>
            </div>
          </div>
        </div>

        {/* AFTER CARD */}
        <div className="bg-white rounded-xl border-2 border-emerald-400 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <span className="font-bold text-xs uppercase tracking-wider text-emerald-700">
              REVISED CUT (AFTER)
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              🟢 Low Risk
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-stone-50">
              <span className="text-stone-500">Risk Signals:</span>
              <strong className="text-emerald-700 font-bold">{comparison.revisedSignalsCount} remaining</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-50">
              <span className="text-stone-500">Original Commentary:</span>
              <strong className="text-emerald-700 font-bold">{comparison.revisedRatios.originalContribution}% (+{comparison.revisedRatios.originalContribution - comparison.originalRatios.originalContribution}%)</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-stone-50">
              <span className="text-stone-500">Reused Material:</span>
              <strong className="text-emerald-700 font-bold">{comparison.revisedRatios.reusedContent}% (-{comparison.originalRatios.reusedContent - comparison.revisedRatios.reusedContent}%)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* RESOLVED ISSUES CHECKLIST */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <h4 className="font-bold text-sm text-stone-900">
          Resolved Signals ({comparison.resolvedIssues.length})
        </h4>

        <div className="space-y-2">
          {comparison.resolvedIssues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs text-stone-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <span>{issue}</span>
            </div>
          ))}
        </div>
      </div>

      {/* IMPROVEMENTS HIGHLIGHTS */}
      <div className="bg-stone-50 rounded-xl border border-stone-200 p-5 space-y-3">
        <h4 className="font-bold text-xs uppercase tracking-wider text-stone-500">
          Workflow Insights
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {comparison.improvements.map((imp, idx) => (
            <div key={idx} className="p-3 bg-white rounded border border-stone-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-stone-800">{imp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
