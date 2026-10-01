// Chat history (migrations/003_chat.sql): every message is saved, newcomers see the last few from
// the past hour in their room, and anything older than the retention period is deleted.
import type { ChatHistoryLine } from '@shopping-mall/shared/protocol';
import type { Sql } from './db.ts';

export async function saveChat(sql: Sql, room: string, line: ChatHistoryLine) {
  await sql`insert into chat (room, name, text, host, at)
    values (${room}, ${line.name}, ${line.text}, ${!!line.host}, ${new Date(line.at)})`;
}

/** The last `limit` messages in `room` said after `since`, oldest first. */
export async function recentChat(
  sql: Sql,
  room: string,
  limit: number,
  since = new Date(0),
): Promise<ChatHistoryLine[]> {
  const rows = await sql<{ name: string; text: string; host: boolean; at: Date }[]>`
    select name, text, host, at from chat where room = ${room} and at > ${since}
    order by at desc limit ${limit}`;
  return rows
    .reverse()
    .map((r) => ({ name: r.name, text: r.text, at: r.at.getTime(), host: r.host || undefined }));
}

/** Delete messages older than `days`. Returns how many went. */
export async function pruneChat(sql: Sql, days: number): Promise<number> {
  const res = await sql`delete from chat where at < now() - make_interval(days => ${days})`;
  return res.count;
}
