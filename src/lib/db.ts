import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

export const sql = neon(process.env.DATABASE_URL);

export type User = {
  id: string;
  email: string;
  name: string;
  plan: "starter" | "pro" | "team";
  created_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  title: string;
  kind: string;
  status: "live" | "ended";
  notes: MeetingNotes | null;
  started_at: string;
  ended_at: string | null;
};

export type TranscriptLine = {
  id: number;
  session_id: string;
  speaker: "me" | "them";
  text: string;
  at_ms: number;
};

export type Assist = {
  id: string;
  session_id: string;
  question: string;
  answer: string;
  created_at: string;
};

export type ContextFile = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: string;
};

export type MeetingNotes = {
  summary: string;
  key_points: string[];
  action_items: { owner: string; task: string }[];
  follow_up_email: string;
};
