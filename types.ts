export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  ANALYZING = 'ANALYZING',
  PLAYING = 'PLAYING',
}

export interface TrackAnalysis {
  genre: string;
  mood: string;
  instruments: string[];
  suggestedMix: {
    bass: number; // Pan -1 to 1
    mids: number;
    highs: number;
    width: number; // Stereo width 0 to 1
  };
  feedback: string;
}

export interface AudioVisualizationData {
  dataArray: Uint8Array;
}
