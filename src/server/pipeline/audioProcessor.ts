import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { MediaMetadata } from '../../types';

const execFileAsync = promisify(execFile);

export class AudioProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioProcessingError';
  }
}

export interface AudioAnalysisResult {
  hasVoiceover: boolean;
  voiceoverRatio: number; // 0 to 1
  silenceRatio: number;
  hasMusicDetected: boolean;
  advertiserSpeechFlags: Array<{ word: string; timestamp: number; category: string }>;
  segments: Array<{ start: number; end: number; type: 'voice' | 'music' | 'silence' | 'mixed' }>;
  transcriptSummary: string;
}

export class AudioProcessor {
  /**
   * Processes audio stream using ffmpeg silencedetect and volume statistics
   * Uses execFile directly without shell
   */
  public async analyzeAudio(videoPath: string, metadata: MediaMetadata): Promise<AudioAnalysisResult> {
    if (!fs.existsSync(videoPath)) {
      throw new AudioProcessingError(`Audio/video file not found at ${videoPath}`);
    }

    if (!metadata.hasAudio) {
      return {
        hasVoiceover: false,
        voiceoverRatio: 0,
        silenceRatio: 1,
        hasMusicDetected: false,
        advertiserSpeechFlags: [],
        segments: [{ start: 0, end: metadata.durationSeconds, type: 'silence' }],
        transcriptSummary: 'No audio stream detected in container.'
      };
    }

    try {
      const args = [
        '-i', videoPath,
        '-af', 'silencedetect=noise=-30dB:d=1.5,volumedetect',
        '-f', 'null',
        '-'
      ];

      // ffmpeg writes filter output and telemetry to stderr
      let output = '';
      try {
        const { stdout, stderr } = await execFileAsync('ffmpeg', args, { timeout: 30000 });
        output = (stdout || '') + (stderr || '');
      } catch (procErr: any) {
        // If ffmpeg errored with fatal exit code
        if (procErr.code && procErr.code !== 0 && !procErr.stderr?.includes('mean_volume')) {
          throw new AudioProcessingError(`FFmpeg audio analysis failed: ${procErr.message || procErr}`);
        }
        output = (procErr.stdout || '') + (procErr.stderr || '');
      }

      // Parse silencedetect events
      const silenceMatches = [...output.matchAll(/silence_start: ([\d.]+)|silence_end: ([\d.]+)/g)];
      let totalSilenceDuration = 0;
      let lastStart: number | null = null;
      const segments: AudioAnalysisResult['segments'] = [];

      for (const m of silenceMatches) {
        if (m[0].startsWith('silence_start')) {
          lastStart = parseFloat(m[1]);
        } else if (m[0].startsWith('silence_end') && lastStart !== null) {
          const end = parseFloat(m[2]);
          totalSilenceDuration += (end - lastStart);
          segments.push({ start: Math.round(lastStart), end: Math.round(end), type: 'silence' });
          lastStart = null;
        }
      }

      const dur = Math.max(0.1, metadata.durationSeconds || 0.1);
      const silenceRatio = Math.min(1, totalSilenceDuration / dur);
      const activeRatio = Math.max(0, 1 - silenceRatio);
      
      // Look for volume level indicators
      const meanVolumeMatch = output.match(/mean_volume: (-?[\d.]+) dB/);
      const meanVol = meanVolumeMatch ? parseFloat(meanVolumeMatch[1]) : -20;
      const isAudible = meanVol > -50;

      // Distinguish measurable acoustic activity from verified speech:
      // Volume and silence filters measure sound energy, NOT speech or narrator identity.
      // Therefore, speech presence remains unverified by acoustic filters alone.
      const hasVoiceover = false;
      const voiceoverRatio = 0;
      const hasMusicDetected = false;

      // Active intervals contain acoustic energy (music, speech, sfx, or ambient)
      if (isAudible) {
        if (segments.length === 0) {
          segments.push({ start: 0, end: dur, type: 'mixed' });
        } else {
          // Fill gaps between silence as mixed acoustic activity
          let curr = 0;
          const activeSegments: AudioAnalysisResult['segments'] = [];
          for (const s of segments) {
            if (s.start > curr + 1) {
              activeSegments.push({ start: curr, end: s.start, type: 'mixed' });
            }
            curr = s.end;
          }
          if (curr < dur) {
            activeSegments.push({ start: curr, end: dur, type: 'mixed' });
          }
          segments.push(...activeSegments);
          segments.sort((a, b) => a.start - b.start);
        }
      }

      return {
        hasVoiceover,
        voiceoverRatio,
        silenceRatio: parseFloat(silenceRatio.toFixed(2)),
        hasMusicDetected,
        advertiserSpeechFlags: [],
        segments,
        transcriptSummary: isAudible 
          ? `Audio stream inspected. Acoustic energy present across ${Math.round(activeRatio * 100)}% of the timeline (mean volume ${meanVol} dB). Speech and voice narration are unverified without transcript analysis.`
          : 'Low volume or quiet audio track.'
      };
    } catch (err: any) {
      if (err instanceof AudioProcessingError) {
        throw err;
      }
      throw new AudioProcessingError(`Audio analysis failed: ${err?.message || 'FFmpeg process error'}`);
    }
  }
}

export const audioProcessor = new AudioProcessor();
