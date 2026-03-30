-- Chat tables for live chat lancio.fr ↔ mizra-bo
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/rofkgmwjggvxlgrdnsyt/sql

-- Conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_name TEXT NOT NULL,
  visitor_email TEXT,
  page_url TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  seen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('visitor', 'admin')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);

-- Enable RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies: allow anon to insert conversations and messages, and read their own
CREATE POLICY "Anyone can create conversations" ON chat_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read conversations" ON chat_conversations FOR SELECT USING (true);
CREATE POLICY "Anyone can update conversations" ON chat_conversations FOR UPDATE USING (true);

CREATE POLICY "Anyone can create messages" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read messages" ON chat_messages FOR SELECT USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
