import React, { useState, useRef } from 'react';
import { UploadCloud, Film, Play, Settings, AlertCircle, CheckCircle, Info, Zap } from 'lucide-react';
import { ScanMode, UserAccount } from '../types';
import { authFetch } from '../utils/api';

interface UploadModalProps {
  user: UserAccount | null;
  onScanCreated: (scanId: string) => void;
  onCancel: () => void;
  parentScanId?: string; // If doing a re-scan
}

export const UploadModal: React.FC<UploadModalProps> = ({ 
  user, 
  onScanCreated, 
  onCancel,
  parentScanId 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('standard');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Client-side quick file metadata inspect
  const [clientMeta, setClientMeta] = useState<{
    durationSeconds: number;
    width: number;
    height: number;
    sizeMb: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
    setUploadError(null);
    if (!videoTitle) {
      setVideoTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }

    // Try reading video metadata client-side via video element
    const videoElem = document.createElement('video');
    videoElem.preload = 'metadata';
    videoElem.src = URL.createObjectURL(selectedFile);
    videoElem.onloadedmetadata = () => {
      setClientMeta({
        durationSeconds: Math.round(videoElem.duration || 60),
        width: videoElem.videoWidth || 1920,
        height: videoElem.videoHeight || 1080,
        sizeMb: parseFloat((selectedFile.size / (1024 * 1024)).toFixed(2))
      });
      URL.revokeObjectURL(videoElem.src);
    };
    videoElem.onerror = () => {
      setClientMeta({
        durationSeconds: 120,
        width: 1920,
        height: 1080,
        sizeMb: parseFloat((selectedFile.size / (1024 * 1024)).toFixed(2))
      });
    };
  };

  const calculateRequiredCredits = () => {
    const mins = clientMeta ? Math.max(1, Math.ceil(clientMeta.durationSeconds / 60)) : 2;
    return scanMode === 'deep' ? mins * 2 : mins;
  };

  const handleStartRealScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadError('Please select or drag a video file.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('video', file);

      // 1. Upload file
      const uploadRes = await authFetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || 'Failed to upload video.');
      }

      const uploadData = await uploadRes.json();

      // 2. Create scan
      const scanRes = await authFetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: uploadData.filePath,
          videoFilename: uploadData.filename,
          videoTitle: videoTitle || uploadData.filename,
          videoDescription,
          scanMode,
          parentScanId,
          isRescan: !!parentScanId,
        }),
      });

      if (!scanRes.ok) {
        const errData = await scanRes.json();
        throw new Error(errData.error || 'Failed to start scan.');
      }

      const scanJob = await scanRes.json();
      onScanCreated(scanJob.id);
    } catch (err: any) {
      setUploadError(err.message || 'Error occurred while processing video.');
      setIsUploading(false);
    }
  };

  const handleStartDemoScan = async (demoType: 'problematic' | 'revised') => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const scanRes = await authFetch('/api/scans/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demoType,
          scanMode,
          parentScanId: demoType === 'revised' ? parentScanId : undefined
        }),
      });

      if (!scanRes.ok) {
        throw new Error('Failed to start demo scan.');
      }

      const scanJob = await scanRes.json();
      onScanCreated(scanJob.id);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to launch demo scan.');
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">
            {parentScanId ? 'Re-Scan Revised Video' : 'Upload Video for Risk Intelligence'}
          </h2>
          <p className="text-xs text-stone-300">
            {parentScanId 
              ? 'Upload your updated cut to verify resolved issues and compare risk reduction.' 
              : 'Inspect your video prior to publishing. Identify reused footage, policy conflicts, and ad risks.'}
          </p>
        </div>
        <button 
          onClick={onCancel}
          className="text-stone-400 hover:text-white text-sm px-2 py-1"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleStartRealScan} className="p-6 space-y-6">
        {uploadError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Unable to process video</p>
              <p className="text-xs">{uploadError}</p>
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) {
              handleFileChange(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
            isDragOver ? 'border-rose-500 bg-rose-50/50' : 'border-stone-300 hover:border-stone-400 bg-stone-50'
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
            className="hidden" 
          />

          <UploadCloud className="w-10 h-10 mx-auto text-stone-400 mb-2" />
          {file ? (
            <div>
              <p className="font-semibold text-stone-900">{file.name}</p>
              <p className="text-xs text-stone-500 mt-1">
                {(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to scan · Click to change file
              </p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-stone-800 text-sm">
                Drag and drop your video file here, or <span className="text-rose-600 underline">browse files</span>
              </p>
              <p className="text-xs text-stone-500 mt-1">
                Supports MP4, MOV, WebM, MKV (Up to 4K resolution supported via 1080p proxy)
              </p>
            </div>
          )}
        </div>

        {/* Client Metadata Preview */}
        {clientMeta && (
          <div className="bg-stone-50 rounded p-3 border border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-stone-500 block">Duration</span>
              <span className="font-semibold text-stone-900">
                {Math.floor(clientMeta.durationSeconds / 60)}m {clientMeta.durationSeconds % 60}s
              </span>
            </div>
            <div>
              <span className="text-stone-500 block">Resolution</span>
              <span className="font-semibold text-stone-900">
                {clientMeta.width}x{clientMeta.height}
              </span>
            </div>
            <div>
              <span className="text-stone-500 block">File Size</span>
              <span className="font-semibold text-stone-900">{clientMeta.sizeMb} MB</span>
            </div>
            <div>
              <span className="text-stone-500 block">Required Credits</span>
              <span className="font-bold text-rose-600">{calculateRequiredCredits()} mins</span>
            </div>
          </div>
        )}

        {/* Video Title & Description for Metadata Coherence Check */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Planned Video Title (For Metadata Coherence Analysis)
            </label>
            <input 
              type="text"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              placeholder="e.g., How I Built a Real Business in 30 Days"
              className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Planned Description (Optional)
            </label>
            <textarea 
              rows={2}
              value={videoDescription}
              onChange={(e) => setVideoDescription(e.target.value)}
              placeholder="Enter video summary or planned description to detect misleading metadata signals..."
              className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>

        {/* Scan Level Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider">
            Analysis Level
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div 
              onClick={() => setScanMode('standard')}
              className={`p-3 rounded border cursor-pointer transition-all ${
                scanMode === 'standard' 
                  ? 'border-rose-600 bg-rose-50/30 ring-1 ring-rose-500' 
                  : 'border-stone-200 hover:border-stone-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-stone-900">Standard Scan</span>
                <span className="text-xs text-rose-600 font-medium">1 credit / min</span>
              </div>
              <p className="text-xs text-stone-600">
                Fast media inspection, audio transcription, scene detection, OCR sampling, and full policy risk mapping.
              </p>
            </div>

            <div 
              onClick={() => setScanMode('deep')}
              className={`p-3 rounded border cursor-pointer transition-all ${
                scanMode === 'deep' 
                  ? 'border-rose-600 bg-rose-50/30 ring-1 ring-rose-500' 
                  : 'border-stone-200 hover:border-stone-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-stone-900">Deep Scan</span>
                <span className="text-xs text-stone-600 font-medium">2 credits / min</span>
              </div>
              <p className="text-xs text-stone-600">
                Adds granular perceptual frame hashing, heavier cross-segment pattern comparison, and extensive evidence points.
              </p>
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="pt-2 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-stone-500">
            Available balance: <strong className="text-stone-800">{user?.creditsRemaining ?? 45} minutes</strong>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-medium rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className={`flex-1 sm:flex-initial px-6 py-2 text-white text-xs font-semibold rounded flex items-center justify-center gap-2 transition-colors ${
                isUploading || !file ? 'bg-rose-300 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 shadow-sm'
              }`}
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Risk Analysis</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Interactive Instant Demo Options */}
        <div className="pt-4 border-t border-stone-100 bg-stone-50 -mx-6 -mb-6 p-6">
          <div className="flex items-center gap-1.5 text-xs text-stone-600 mb-2">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-semibold text-stone-800">Quick Test Playground</span>
            <span>— Test the intelligence engine with sample creator video profiles:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => handleStartDemoScan('problematic')}
              className="p-2.5 bg-white border border-stone-200 hover:border-rose-400 rounded text-left transition-colors group"
            >
              <div className="font-semibold text-stone-800 group-hover:text-rose-600 flex items-center justify-between">
                <span>Sample A: Raw Montage Clip</span>
                <span className="text-[10px] text-amber-600 font-normal">Reused Signals</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Simulation of video with third-party clips, low voiceover, and template sequences.
              </p>
            </button>

            <button
              type="button"
              disabled={isUploading}
              onClick={() => handleStartDemoScan('revised')}
              className="p-2.5 bg-white border border-stone-200 hover:border-emerald-400 rounded text-left transition-colors group"
            >
              <div className="font-semibold text-stone-800 group-hover:text-emerald-600 flex items-center justify-between">
                <span>Sample B: Clean Commentary Cut</span>
                <span className="text-[10px] text-emerald-600 font-normal">High Transformation</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Simulation of revised video with original voiceover, narrative framing, and transformed excerpts.
              </p>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
