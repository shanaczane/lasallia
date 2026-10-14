-- 0053_chat_message_sources.sql
-- Where each assistant reply came from (handbook section, book record,
-- catalog search, operating hours, the student's own account), so the
-- "Sources" footer under an answer survives a page reload. Shape is
-- schemas/chat.py's ChatSource: [{kind, label, detail, book_id}, ...].
-- Null on user messages and on replies that drew on nothing.
alter table chat_messages add column if not exists sources jsonb;
