export type ContentStyle = "深度专栏" | "短视频口播" | "社交媒体短文";

export type HotTopic = {
  rank: number;
  topic: string;
  heat: string;
  change: string;
  url?: string;
  source?: string;
  summary?: string;
};

export type GeneratedContent = {
  id: string;
  style: ContentStyle;
  channel: string;
  title: string;
  summary: string;
  body: string;
  createdAt: string;
  factCheck: {
    passed: boolean;
    checked: number;
    corrected: number;
    notes: string[];
  };
};
