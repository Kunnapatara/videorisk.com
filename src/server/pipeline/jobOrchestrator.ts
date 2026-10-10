import { storage } from '../storage';
import { mediaInspector, MediaInspectionError } from './mediaInspector';
import { proxyGenerator } from './proxyGenerator';
import { audioProcessor } from './audioProcessor';
import { videoProcessor, VideoProcessingError } from './videoProcessor';
import { thumbnailInspector } from './thumbnailInspector';
import { policyIntelligenceEngine } from '../intelligence/policyIntelligence';
import { creditService } from '../services/creditService';
import { ScanJob, ScanStage, JobStatus, ThumbnailMetadata } from '../../types';

export class JobOrchestrator {
  private activeJobs = new Set<string>();

  /**
   * Starts asynchronous job execution in the background
   */
  public startJob(scanId: string): void {
    if (this.activeJobs.has(scanId)) return;
    this.activeJobs.add(scanId);

    // Fire and forget, does NOT block HTTP request
    this.processJob(scanId).catch(async (err) => {
      console.error(`[JobOrchestrator] Job ${scanId} failed:`, err);
      const scan = await storage.scans.getScan(scanId);

      // Deterministic Refund if credits were deducted
      if (scan && scan.creditsUsed > 0) {
        await storage.users.addCredits(scan.userId, scan.creditsUsed);
        console.log(`[JobOrchestrator] Refunded ${scan.creditsUsed} credits to user ${scan.userId} for failed job ${scanId}`);
      }

      await storage.scans.updateScan(scanId, {
        status: 'FAILED',
        error: (err instanceof MediaInspectionError || err instanceof VideoProcessingError) 
          ? err.message 
          : 'We couldn’t complete this scan. Your video was not published or shared. Credits have been refunded. Please try again.'
      });
    }).finally(() => {
      this.activeJobs.delete(scanId);
    });
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async processJob(scanId: string): Promise<void> {
    const scan = await storage.scans.getScan(scanId);
    if (!scan) throw new Error('Scan not found');

    const startTime = Date.now();
    let tempFramesDirToClean: string | null = null;
    let deductedCredits = 0;

    try {
      // 1. Stage: Media inspection
      await storage.scans.updateScan(scanId, {
        status: 'INSPECTING',
        currentStage: 'Media inspection',
        completedStages: ['Upload']
      });

      const inspectionStart = Date.now();
      const metadata = await mediaInspector.inspect(scan.videoPath, scan.videoFilename);
      const inspectionMs = Date.now() - inspectionStart;

      // Check proxy requirements for 4K / UHD
      let proxyPath = scan.videoPath;
      if (metadata.isProxyUsed) {
        proxyPath = await proxyGenerator.generateProxyIfNeeded(scan.videoPath, metadata);
      }

      // Deduct credits based on real duration
      const requiredCredits = creditService.calculateRequiredCredits(metadata.durationSeconds, scan.scanMode);
      const deducted = await storage.users.deductCredits(scan.userId, requiredCredits);
      
      if (!deducted) {
        throw new Error(`Insufficient credits. Required: ${requiredCredits} minute(s), but available balance is lower.`);
      }

      deductedCredits = requiredCredits;
      await storage.usage.recordUsage(
        scan.userId, 
        scan.id, 
        creditService.formatMinutes(metadata.durationSeconds), 
        requiredCredits, 
        scan.scanMode
      );

      await storage.scans.updateScan(scanId, {
        metadata,
        proxyPath,
        creditsUsed: requiredCredits,
        completedStages: ['Upload', 'Media inspection']
      });

      await this.sleep(300);

      // 2. Stage: Audio & transcript
      await storage.scans.updateScan(scanId, {
        status: 'PROCESSING_AUDIO',
        currentStage: 'Audio & transcript',
        completedStages: ['Upload', 'Media inspection']
      });
      const audioStart = Date.now();
      const audioResult = await audioProcessor.analyzeAudio(proxyPath, metadata);
      const audioMs = Date.now() - audioStart;

      await this.sleep(300);

      // 3. Stage: Scene analysis
      await storage.scans.updateScan(scanId, {
        status: 'PROCESSING_VIDEO',
        currentStage: 'Scene analysis',
        completedStages: ['Upload', 'Media inspection', 'Audio & transcript']
      });
      const videoStart = Date.now();
      const videoResult = await videoProcessor.analyzeVideo(proxyPath, metadata, scan.scanMode);
      tempFramesDirToClean = videoResult.tempFramesDir;
      const videoMs = Date.now() - videoStart;

      await this.sleep(300);

      // 4. Stage: Visual evidence
      await storage.scans.updateScan(scanId, {
        status: 'BUILDING_EVIDENCE',
        currentStage: 'Visual evidence',
        completedStages: ['Upload', 'Media inspection', 'Audio & transcript', 'Scene analysis']
      });

      // Thumbnail Inspection if provided
      let thumbnailMetadata: ThumbnailMetadata | null = null;
      if (scan.thumbnailPath && scan.thumbnailFilename) {
        try {
          thumbnailMetadata = await thumbnailInspector.inspect(scan.thumbnailPath, scan.thumbnailFilename);
        } catch (thumbErr) {
          console.warn('[JobOrchestrator] Thumbnail inspection error:', thumbErr);
        }
      }

      // Fetch Channel Context Profile snapshot if exists for user
      const channelProfile = await storage.channelProfiles.getProfile(scan.userId);

      const evidenceStart = Date.now();
      const timeline = policyIntelligenceEngine.generateEvidenceTimeline({
        scanId,
        metadata,
        scanMode: scan.scanMode,
        audioResult,
        videoResult,
        videoTitle: scan.videoTitle,
        videoDescription: scan.videoDescription,
        videoTags: scan.videoTags,
        thumbnailMetadata,
        channelProfile,
        isRescan: scan.isRescan,
      });
      await storage.evidence.saveEvidence(scanId, timeline);
      const evidenceMs = Date.now() - evidenceStart;

      await this.sleep(300);

      // 5. Stage: Policy analysis & Risk report
      await storage.scans.updateScan(scanId, {
        status: 'MAPPING_POLICY',
        currentStage: 'Policy analysis',
        completedStages: ['Upload', 'Media inspection', 'Audio & transcript', 'Scene analysis', 'Visual evidence']
      });

      await this.sleep(300);

      await storage.scans.updateScan(scanId, {
        status: 'BUILDING_REPORT',
        currentStage: 'Risk report',
        completedStages: ['Upload', 'Media inspection', 'Audio & transcript', 'Scene analysis', 'Visual evidence', 'Policy analysis']
      });
      const policyStart = Date.now();
      const report = policyIntelligenceEngine.buildReport({
        scanId,
        metadata,
        scanMode: scan.scanMode,
        audioResult,
        videoResult,
        videoTitle: scan.videoTitle,
        videoDescription: scan.videoDescription,
        videoTags: scan.videoTags,
        thumbnailMetadata,
        channelProfile,
        isRescan: scan.isRescan,
      }, timeline);

      report.benchmarkMetrics = {
        totalProcessingSeconds: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
        inspectionMs,
        audioProcessingMs: audioMs,
        videoAnalysisMs: videoMs,
        evidenceBuildingMs: evidenceMs,
        policyReasoningMs: Date.now() - policyStart,
        framesSampled: videoResult.framesSampled,
        scenesDetected: videoResult.scenesCount,
      };

      await storage.scans.saveReport(scanId, report);

      // Save thumbnail metadata and channel profile snapshot on scan job record
      await storage.scans.updateScan(scanId, {
        thumbnailMetadata: thumbnailMetadata || undefined,
        channelProfileSnapshot: channelProfile || undefined,
      });

      // If this is a re-scan, generate and save the comparison with parent scan
      if (scan.parentScanId) {
        const parentReport = await storage.scans.getReport(scan.parentScanId);
        if (parentReport) {
          const comparison = policyIntelligenceEngine.generateComparison(parentReport, report);
          await storage.scans.saveComparison(comparison);
        }
      }

      // 6. Complete
      await storage.scans.updateScan(scanId, {
        status: 'COMPLETED',
        currentStage: 'Risk report',
        completedStages: [
          'Upload', 
          'Media inspection', 
          'Audio & transcript', 
          'Scene analysis', 
          'Visual evidence', 
          'Policy analysis', 
          'Risk report'
        ],
        completedAt: new Date().toISOString()
      });
    } finally {
      // Clean up temporary extracted frames to prevent disk exhaustion
      if (tempFramesDirToClean) {
        await videoProcessor.cleanupFrames(tempFramesDirToClean);
      }
    }
  }
}

export const jobOrchestrator = new JobOrchestrator();
