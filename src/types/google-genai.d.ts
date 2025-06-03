declare module '@google/genai' {
  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    
    live: {
      connect(options: {
        model: string;
        callbacks: {
          onopen: () => void;
          onmessage: (message: LiveServerMessage) => void;
          onerror: (e: ErrorEvent) => void;
          onclose: (e: CloseEvent) => void;
        };
        config: any;
      }): Session;
    };
  }
  
  export interface Session {
    sendClientContent(content: { turns: string[] }): void;
    close(): void;
  }
  
  export interface LiveServerMessage {
    serverContent?: {
      turnComplete?: boolean;
      modelTurn?: {
        parts?: {
          fileData?: {
            fileUri: string;
          };
          inlineData?: {
            data?: string;
            mimeType?: string;
          };
          text?: string;
        }[];
      };
    };
  }
  
  export enum Modality {
    AUDIO = 'AUDIO'
  }
  
  export enum MediaResolution {
    MEDIA_RESOLUTION_MEDIUM = 'MEDIA_RESOLUTION_MEDIUM'
  }
} 