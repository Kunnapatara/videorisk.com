import React from 'react';
import { 
  ShieldCheck, 
  CheckCircle, 
  ArrowRight, 
  Sparkles, 
  Zap, 
  FileCheck, 
  HelpCircle,
  Video,
  Layers,
  Search
} from 'lucide-react';

interface HomeViewProps {
  onStartUpload: () => void;
  onExplorePricing: () => void;
  onTryDemo: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ 
  onStartUpload, 
  onExplorePricing, 
  onTryDemo 
}) => {
  return (
    <div className="space-y-16 pb-16">
      {/* HERO SECTION */}
      <section className="bg-stone-900 text-white pt-16 pb-20 px-4 border-b border-stone-800">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-stone-800 border border-stone-700 text-xs font-medium text-stone-300">
            <ShieldCheck className="w-4 h-4 text-rose-500" />
            <span>Pre-Publish Video Risk Intelligence</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
            Know the risk before you publish.
          </h1>

          <p className="text-base sm:text-lg text-stone-300 max-w-2xl mx-auto font-normal leading-relaxed">
            Check your video before it goes live. VideoRisk analyzes evidence in your timeline, connects signals to platform policies, explains the risk, tells you what to fix, and lets you re-scan the revised cut.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onStartUpload}
              className="w-full sm:w-auto px-8 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm rounded shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" />
              <span>Upload Video</span>
            </button>

            <button
              onClick={onTryDemo}
              className="w-full sm:w-auto px-6 py-3.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-semibold text-sm rounded transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Try Demo Scan</span>
            </button>
          </div>

          <p className="text-xs text-stone-400 pt-2">
            Supports MP4, MOV, WebM, MKV · Up to 4K resolution · 10 free minutes included
          </p>
        </div>
      </section>

      {/* CORE CAPABILITIES CHECKLIST */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="bg-white rounded-xl border border-stone-200 p-8 shadow-xs">
          <div className="text-center max-w-xl mx-auto mb-8">
            <h2 className="text-xl font-bold text-stone-900 tracking-tight">
              Comprehensive Platform Risk Intelligence
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Multi-dimensional evidence analysis protecting your monetization and channel standing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-stone-900">Reused-content signals</h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Detects third-party footage similarity and flags unaccompanied external sequences.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-stone-900">Original contribution</h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Evaluates presence of creator voice, commentary, analysis, and transformative editing.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-stone-900">Repetitive / mass-produced patterns</h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Identifies automated slideshow pacing, template loops, and low-differentiation patterns.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-stone-900">AI disclosure signals</h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Highlights synthetic voice cadences so you know whether platform disclosure tags are needed.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-stone-900">Third-party content signals</h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Separates copyright signals from YPP reused content for targeted licensing decisions.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-stone-900">Advertiser-friendly risks</h3>
                <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Inspects profanity, shock cues, and sensitive themes independently from YPP eligibility.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CORE WORKFLOW PHILOSOPHY */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs uppercase tracking-wider text-rose-600 font-bold">
            The VideoRisk Philosophy
          </span>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight mt-1">
            Not a simplistic score. An explainable workflow.
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            Every finding provides exact timestamps, policy rationale, and concrete fixes.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center text-xs">
          <div className="p-4 bg-white rounded-lg border border-stone-200">
            <span className="block font-bold text-sm text-stone-900">1. Evidence</span>
            <span className="text-stone-500 text-[11px] mt-1 block">Audio & scene signals</span>
          </div>

          <div className="p-4 bg-white rounded-lg border border-stone-200">
            <span className="block font-bold text-sm text-stone-900">2. Policy</span>
            <span className="text-stone-500 text-[11px] mt-1 block">YPP & Ad guidelines</span>
          </div>

          <div className="p-4 bg-white rounded-lg border border-stone-200">
            <span className="block font-bold text-sm text-stone-900">3. Risk</span>
            <span className="text-stone-500 text-[11px] mt-1 block">Scrutiny exposure</span>
          </div>

          <div className="p-4 bg-white rounded-lg border border-stone-200">
            <span className="block font-bold text-sm text-stone-900">4. Explanation</span>
            <span className="text-stone-500 text-[11px] mt-1 block">What & Why</span>
          </div>

          <div className="p-4 bg-white rounded-lg border border-stone-200">
            <span className="block font-bold text-sm text-stone-900">5. Fix</span>
            <span className="text-stone-500 text-[11px] mt-1 block">Editor guidance</span>
          </div>

          <div className="p-4 bg-white rounded-lg border border-rose-300 bg-rose-50/30">
            <span className="block font-bold text-sm text-rose-700">6. Re-check</span>
            <span className="text-rose-600 text-[11px] mt-1 block">Before/After delta</span>
          </div>
        </div>
      </section>

      {/* FINAL BOTTOM CTA */}
      <section className="max-w-4xl mx-auto px-4 text-center">
        <div className="p-8 bg-stone-100 rounded-2xl border border-stone-200 space-y-4">
          <h3 className="text-xl font-bold text-stone-900">
            Ready to inspect your video before publishing?
          </h3>
          <p className="text-xs text-stone-600 max-w-lg mx-auto">
            Get instant actionable feedback on third-party clips, voiceover balance, and monetization eligibility.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={onStartUpload}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded shadow-xs"
            >
              Upload Video Now
            </button>
            <button
              onClick={onExplorePricing}
              className="px-6 py-2.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 text-xs font-semibold rounded"
            >
              View Pricing & Credits
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
