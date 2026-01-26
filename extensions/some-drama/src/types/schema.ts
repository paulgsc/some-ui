
// Shared Types - Can be imported by both content.ts and background.ts
// No executable code, only type definitions

export type EmotionType = 'joy' | 'sadness' | 'love' | 'fear' | 'anger' | 'neutral';

export interface EmotionConfig {
  type: EmotionType;
  emoji: string;
  label: string;
  className: string;
}

export interface CapturedMoment {
  id: string;
  timestamp: number; // seconds into episode
  emotion: EmotionType;
  intensity: number; // 0-1
  emoji: string;
  note?: string;
  episodeId: string;
  dramaTitle: string;
  capturedAt: number; // unix timestamp
}

export interface DramaContext {
  dramaTitle: string;
  episode: number;
  timestamp: number;
}

export interface UIState {
  dramaTitle: string;
  episode: number;
  currentTimestamp: number;
  
  isExpanded: boolean;
  showPolling: boolean;
  
  selectedEmotion: EmotionType | null;
  intensity: number;
  note: string;
  showNote: boolean;
  justCaptured: boolean;
  
  currentEmotion: EmotionType;
  currentRating: number;
  
  capturedMoments: CapturedMoment[];
}

// Message types for background communication
export interface SaveMomentMessage {
  type: 'SAVE_MOMENT';
  moment: CapturedMoment;
}

export interface GetMomentsMessage {
  type: 'GET_MOMENTS';
  dramaTitle?: string;
  episodeId?: string;
}

export interface GetMomentsResponse {
  moments: CapturedMoment[];
}

export type ExtensionMessage = SaveMomentMessage | GetMomentsMessage;
