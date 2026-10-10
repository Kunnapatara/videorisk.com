import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { mediaInspector } from '../src/server/pipeline/mediaInspector';
import { thumbnailInspector, ThumbnailInspectionError } from '../src/server/pipeline/thumbnailInspector';
import { audioProcessor } from '../src/server/pipeline/audioProcessor';
import { videoProcessor } from '../src/server/pipeline/videoProcessor';
import { policyIntelligenceEngine } from '../src/server/intelligence/policyIntelligence';
import { contextAnalyzer } from '../src/server/intelligence/contextAnalyzer';
import { ChannelContextProfile, MediaMetadata } from '../src/types';

const execFileAsync = promisify(execFile);

export async function runProductCapabilitiesTests() {
  console.log('\n======================================================');
  console.log('--- TEST SUITE 2: PRODUCT CAPABILITIES & PIPELINE ---');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      throw new Error(`Test assertion failed: ${desc}`);
    }
  }

  const testDir = path.resolve(process.cwd(), 'uploads', 'test_media');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const validVideoPath = path.join(testDir, 'synth_with_audio.mp4');
  const silentVideoPath = path.join(testDir, 'synth_silent.mp4');
  const validThumbPath = path.join(testDir, 'synth_thumb_16x9.jpg');
  const nonStandardThumbPath = path.join(testDir, 'synth_thumb_square.jpg');
  const corruptFilePath = path.join(testDir, 'corrupt_media.mp4');

  try {
    // ---------------------------------------------------------
    // GENERATE SYNTHETIC TEST ASSETS WITH REAL FFMPEG
    // ---------------------------------------------------------
    console.log('[Generating real synthetic media assets with ffmpeg/lavfi...]');

    // 1. Synthetic video with audio tone (2 seconds, 640x360)
    if (!fs.existsSync(validVideoPath)) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        validVideoPath
      ], { timeout: 20000 });
    }

    // 2. Synthetic silent video (2 seconds, 640x360)
    if (!fs.existsSync(silentVideoPath)) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=25',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        silentVideoPath
      ], { timeout: 20000 });
    }

    // 3. Synthetic standard 16:9 thumbnail (1280x720 JPEG)
    if (!fs.existsSync(validThumbPath)) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'color=c=navy:s=1280x720:d=1',
        '-frames:v', '1',
        validThumbPath
      ], { timeout: 15000 });
    }

    // 4. Synthetic non-standard square thumbnail (600x600 JPEG)
    if (!fs.existsSync(nonStandardThumbPath)) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'color=c=red:s=600x600:d=1',
        '-frames:v', '1',
        nonStandardThumbPath
      ], { timeout: 15000 });
    }

    // 5. Corrupt file
    fs.writeFileSync(corruptFilePath, 'THIS_IS_NOT_A_VALID_MEDIA_STREAM_DATA_HEADER');

    // ---------------------------------------------------------
    // 1. REAL MEDIA INSPECTION PIPELINE
    // ---------------------------------------------------------
    console.log('\n[1. Real Media Inspection Pipeline]');

    const metaWithAudio = await mediaInspector.inspect(validVideoPath, 'synth_with_audio.mp4');
    assert(metaWithAudio.hasAudio === true, 'Real video with audio correctly detects audio stream');
    assert(metaWithAudio.durationSeconds >= 1.9, 'Real video duration measured accurately (~2s)');
    assert(metaWithAudio.width === 640 && metaWithAudio.height === 360, 'Real video dimensions measured accurately (640x360)');

    const metaSilent = await mediaInspector.inspect(silentVideoPath, 'synth_silent.mp4');
    assert(metaSilent.hasAudio === false, 'Real video without audio correctly reports hasAudio = false');

    let corruptHandled = false;
    try {
      await mediaInspector.inspect(corruptFilePath, 'corrupt.mp4');
    } catch {
      corruptHandled = true;
    }
    assert(corruptHandled === true, 'Corrupt media file is safely rejected with error');

    // ---------------------------------------------------------
    // 2. THUMBNAIL ANALYSIS PIPELINE
    // ---------------------------------------------------------
    console.log('\n[2. Thumbnail Analysis Pipeline]');

    const validThumbMeta = await thumbnailInspector.inspect(validThumbPath, 'synth_thumb_16x9.jpg');
    assert(validThumbMeta.width === 1280 && validThumbMeta.height === 720, 'Thumbnail dimensions extracted accurately (1280x720)');
    assert(validThumbMeta.isStandardAspect === true, '1280x720 thumbnail confirmed as standard 16:9 aspect');
    assert(typeof validThumbMeta.meanLuminance === 'number', 'Deterministic mean luminance computed from image signal');

    const squareThumbMeta = await thumbnailInspector.inspect(nonStandardThumbPath, 'synth_thumb_square.jpg');
    assert(squareThumbMeta.isStandardAspect === false, 'Square thumbnail correctly flagged as non-standard aspect ratio');
    const squareNotes = squareThumbMeta.notes || '';
    assert(squareNotes.includes('16:9') || squareNotes.includes('aspect'), 'Helpful recommendation provided for non-standard image aspect');

    let corruptThumbHandled = false;
    try {
      await thumbnailInspector.inspect(corruptFilePath, 'corrupt.jpg');
    } catch (err: any) {
      corruptThumbHandled = true;
    }
    assert(corruptThumbHandled === true, 'Corrupt image input is safely caught and rejected');

    // ---------------------------------------------------------
    // 3. CONTEXT INTELLIGENCE & CHANNEL PROFILE
    // ---------------------------------------------------------
    console.log('\n[3. Context Intelligence]');

    const mockProfile: ChannelContextProfile = {
      id: 'cp_test_1',
      userId: 'user_test',
      version: 1,
      channelTopic: 'Automotive Engineering & Crash Safety',
      contentType: 'educational',
      productionWorkflow: 'Original technical narration and CAD model animations',
      thirdPartyFootageUsage: 'fair_use_commentary',
      originalVoiceNarration: 'always',
      aiAssistedContent: true,
      aiDisclosureDetails: 'CAD simulations assisted by generative physics tooling',
      typicalSources: 'NHTSA crash records and public technical papers',
      updatedAt: new Date().toISOString()
    };

    // 3.1 Context interpretation with Profile
    const contextWithProfile = contextAnalyzer.interpretContext({
      videoTitle: 'How Modern Crumple Zones Save Lives (Crash Analysis)',
      videoDescription: 'Technical breakdown of automotive crumple zone physics.',
      channelProfile: mockProfile,
      hasAudio: true,
      hasVoiceover: true,
      voiceoverRatio: 75,
      durationSeconds: 120
    });
    assert(contextWithProfile.primaryContext === 'educational', 'Profile contentType grounds primary context as educational');
    assert(contextWithProfile.contextConfidence === 'HIGH', 'Grounding in channel profile provides HIGH confidence');

    // 3.2 Context interpretation WITHOUT Profile (Honest limitation message)
    const contextWithoutProfile = contextAnalyzer.interpretContext({
      videoTitle: 'Vlog and Random Thoughts',
      hasAudio: true,
      hasVoiceover: false,
      voiceoverRatio: 0,
      durationSeconds: 120
    });
    assert(contextWithoutProfile.uncertaintyReason === 'AMBIGUOUS_CONTEXT', 'Missing profile and generic title honestly declares AMBIGUOUS_CONTEXT');

    // ---------------------------------------------------------
    // 4. PUBLISHING RISK REPORT & EVIDENCE TIMELINE
    // ---------------------------------------------------------
    console.log('\n[4. Publishing Risk Report Generation]');

    const audioRes = await audioProcessor.analyzeAudio(validVideoPath, metaWithAudio);
    const videoRes = await videoProcessor.analyzeVideo(validVideoPath, metaWithAudio, 'standard');

    const timeline = policyIntelligenceEngine.generateEvidenceTimeline({
      scanId: 'scan_cap_1',
      metadata: metaWithAudio,
      scanMode: 'standard',
      audioResult: audioRes,
      videoResult: videoRes,
      videoTitle: 'How Modern Crumple Zones Save Lives',
      videoDescription: 'Check out our technical breakdown at http://store.example.com promo code CRASH50',
      thumbnailMetadata: squareThumbMeta,
      channelProfile: mockProfile
    });

    assert(timeline.length > 0, 'Evidence timeline contains generated evidence signals');
    assert(timeline.some(t => t.domain === 'thumbnail'), 'Timeline includes Thumbnail domain evidence findings');
    assert(timeline.some(t => t.domain === 'channel_context'), 'Timeline includes Channel Context declaration evidence');

    const report = policyIntelligenceEngine.buildReport({
      scanId: 'scan_cap_1',
      metadata: metaWithAudio,
      scanMode: 'standard',
      audioResult: audioRes,
      videoResult: videoRes,
      videoTitle: 'How Modern Crumple Zones Save Lives',
      videoDescription: 'Check out our technical breakdown at http://store.example.com promo code CRASH50',
      thumbnailMetadata: squareThumbMeta,
      channelProfile: mockProfile
    }, timeline);

    assert(report.scanId === 'scan_cap_1', 'Report tied to scan ID');
    assert(['LOW_RISK', 'NEEDS_REVIEW', 'HIGH_RISK'].includes(report.overallRisk), 'Overall risk level calculated');
    assert(!!report.domainReports.video_audio, 'Report contains video_audio domain scorecard');
    assert(!!report.domainReports.thumbnail, 'Report contains thumbnail domain scorecard');
    assert(!!report.domainReports.channel_context, 'Report contains channel_context domain scorecard');
    assert(report.domainReports.thumbnail.status === 'REVIEW_RECOMMENDED', 'Square thumbnail triggers REVIEW_RECOMMENDED status');
    assert(report.policyConnections.length >= 3, 'Policy connections map to YPP, Originality, and Disclosures');

    // ---------------------------------------------------------
    // 5. RE-SCAN COMPARISON DELTA
    // ---------------------------------------------------------
    console.log('\n[5. Re-scan Comparison Delta]');

    const revisedReport = {
      ...report,
      overallRisk: 'LOW_RISK' as const,
      originalContributionRatio: 95,
      reusedContentRatio: 0,
      topIssues: []
    };

    const comparison = policyIntelligenceEngine.generateComparison(report, revisedReport);
    assert(comparison.originalScanId === report.scanId, 'Comparison links original scan ID');
    assert(comparison.revisedRisk === 'LOW_RISK', 'Comparison delta captures risk reduction');
    assert(typeof comparison.comparisonSummary === 'string', 'Summary recorded in comparison delta');
    assert(typeof comparison.signalsDelta === 'number', 'Numerical signals delta recorded in comparison');

    console.log(`\n======================================================`);
    console.log(`TEST SUITE 2 COMPLETE: ${passed}/${total} assertions passed!`);
    console.log(`======================================================\n`);
  } finally {
    // Clean up temporary synthetic media files
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}
