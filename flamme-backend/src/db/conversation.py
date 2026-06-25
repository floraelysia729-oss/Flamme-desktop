"""会话记忆存储 — SQLite 存储对话历史与会话元数据"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path


class ConversationStore:
    """SQLite 对话历史存储"""

    def __init__(self, db_path: str):
        self._db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._ensure_tables()

    def _ensure_tables(self):
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
              content TEXT,
              tool_calls TEXT,
              tool_call_id TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id, created_at)"
        )
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS session_meta (
              session_id TEXT PRIMARY KEY,
              mode TEXT DEFAULT 'search',
              title TEXT,
              learn_mind TEXT,
              session_context TEXT,
              selected_files TEXT,
              archived_note_path TEXT,
              last_archived_at TEXT,
              last_archived_message_idx INTEGER DEFAULT 0,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self._conn.commit()

    def _touch_meta(self, session_id: str, mode: str | None = None):
        row = self._conn.execute(
            "SELECT session_id FROM session_meta WHERE session_id = ?", (session_id,)
        ).fetchone()
        now = datetime.now().isoformat()
        if row:
            if mode:
                self._conn.execute(
                    "UPDATE session_meta SET updated_at = ?, mode = ? WHERE session_id = ?",
                    (now, mode, session_id),
                )
            else:
                self._conn.execute(
                    "UPDATE session_meta SET updated_at = ? WHERE session_id = ?",
                    (now, session_id),
                )
        else:
            self._conn.execute(
                """INSERT INTO session_meta (session_id, mode, updated_at)
                   VALUES (?, ?, ?)""",
                (session_id, mode or "search", now),
            )
        self._conn.commit()

    def save_turn(self, session_id: str, role: str, content: str,
                  tool_calls: list | None = None, tool_call_id: str | None = None,
                  mode: str | None = None):
        """保存一轮对话"""
        self._conn.execute(
            """INSERT INTO conversations (session_id, role, content, tool_calls, tool_call_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, role, content,
             json.dumps(tool_calls, ensure_ascii=False) if tool_calls else None,
             tool_call_id,
             datetime.now().isoformat()),
        )
        self._touch_meta(session_id, mode)
        self._conn.commit()

    def get_recent(self, session_id: str, n: int = 20) -> list[dict]:
        """获取最近 N 轮对话（不含 system）"""
        rows = self._conn.execute(
            """SELECT * FROM conversations
               WHERE session_id = ? AND role != 'system'
               ORDER BY created_at DESC LIMIT ?""",
            (session_id, n),
        ).fetchall()
        rows = list(reversed(rows))
        result = []
        for r in rows:
            entry = {"role": r["role"], "content": r["content"] or ""}
            if r["tool_calls"]:
                entry["tool_calls"] = json.loads(r["tool_calls"])
            if r["tool_call_id"]:
                entry["tool_call_id"] = r["tool_call_id"]
            result.append(entry)
        return result

    def get_messages_for_llm(self, session_id: str, n: int = 10) -> list[dict]:
        """获取格式化后的消息列表，可直接传给 LLM（仅 user/assistant）"""
        rows = self._conn.execute(
            """SELECT role, content FROM conversations
               WHERE session_id = ? AND role IN ('user', 'assistant')
               ORDER BY created_at DESC LIMIT ?""",
            (session_id, n),
        ).fetchall()
        rows = list(reversed(rows))
        return [{"role": r["role"], "content": r["content"] or ""} for r in rows]

    def count_user_assistant(self, session_id: str) -> int:
        row = self._conn.execute(
            """SELECT COUNT(*) as c FROM conversations
               WHERE session_id = ? AND role IN ('user', 'assistant')""",
            (session_id,),
        ).fetchone()
        return row["c"] if row else 0

    def clear_session(self, session_id: str):
        """清空某个会话"""
        self._conn.execute(
            "DELETE FROM conversations WHERE session_id = ?", (session_id,)
        )
        self._conn.execute(
            "DELETE FROM session_meta WHERE session_id = ?", (session_id,)
        )
        self._conn.commit()

    def get_meta(self, session_id: str) -> dict | None:
        row = self._conn.execute(
            "SELECT * FROM session_meta WHERE session_id = ?", (session_id,)
        ).fetchone()
        if not row:
            return None
        return self._row_to_meta(row)

    def upsert_meta(self, session_id: str, **fields):
        existing = self.get_meta(session_id)
        now = datetime.now().isoformat()
        if not existing:
            self._conn.execute(
                """INSERT INTO session_meta (session_id, mode, updated_at)
                   VALUES (?, ?, ?)""",
                (session_id, fields.get("mode", "search"), now),
            )
            self._conn.commit()
        for key, val in fields.items():
            if key == "learn_mind" and val is not None:
                self._conn.execute(
                    "UPDATE session_meta SET learn_mind = ?, updated_at = ? WHERE session_id = ?",
                    (json.dumps(val, ensure_ascii=False), now, session_id),
                )
            elif key == "session_context" and val is not None:
                self._conn.execute(
                    "UPDATE session_meta SET session_context = ?, updated_at = ? WHERE session_id = ?",
                    (json.dumps(val, ensure_ascii=False), now, session_id),
                )
            elif key == "selected_files" and val is not None:
                self._conn.execute(
                    "UPDATE session_meta SET selected_files = ?, updated_at = ? WHERE session_id = ?",
                    (json.dumps(val, ensure_ascii=False), now, session_id),
                )
            elif key in ("mode", "title", "archived_note_path", "last_archived_at"):
                self._conn.execute(
                    f"UPDATE session_meta SET {key} = ?, updated_at = ? WHERE session_id = ?",
                    (val, now, session_id),
                )
            elif key == "last_archived_message_idx":
                self._conn.execute(
                    "UPDATE session_meta SET last_archived_message_idx = ?, updated_at = ? WHERE session_id = ?",
                    (int(val), now, session_id),
                )
        self._conn.commit()

    def _row_to_meta(self, row) -> dict:
        meta = {
            "session_id": row["session_id"],
            "mode": row["mode"] or "search",
            "title": row["title"],
            "updated_at": row["updated_at"],
            "archived_note_path": row["archived_note_path"],
            "last_archived_at": row["last_archived_at"],
            "last_archived_message_idx": row["last_archived_message_idx"] or 0,
        }
        if row["learn_mind"]:
            try:
                meta["learn_mind"] = json.loads(row["learn_mind"])
            except json.JSONDecodeError:
                meta["learn_mind"] = None
        if row["session_context"]:
            try:
                meta["session_context"] = json.loads(row["session_context"])
            except json.JSONDecodeError:
                meta["session_context"] = None
        if row["selected_files"]:
            try:
                meta["selected_files"] = json.loads(row["selected_files"])
            except json.JSONDecodeError:
                meta["selected_files"] = []
        return meta

    def list_sessions(self, mode: str | None = None) -> list[dict]:
        """返回会话摘要（按最后更新时间倒序）"""
        if mode:
            rows = self._conn.execute("""
                SELECT m.*,
                    (SELECT COUNT(*) FROM conversations c
                     WHERE c.session_id = m.session_id AND c.role IN ('user','assistant')) as message_count,
                    (SELECT content FROM conversations c
                     WHERE c.session_id = m.session_id AND c.role = 'user'
                     ORDER BY c.created_at ASC LIMIT 1) as first_user_msg
                FROM session_meta m
                WHERE m.mode = ?
                ORDER BY m.updated_at DESC
            """, (mode,)).fetchall()
        else:
            rows = self._conn.execute("""
                SELECT
                    session_id,
                    COUNT(*) as message_count,
                    MAX(created_at) as last_updated,
                    MIN(CASE WHEN role = 'user' THEN content END) as first_user_msg
                FROM conversations
                WHERE role IN ('user', 'assistant')
                GROUP BY session_id
                ORDER BY last_updated DESC
            """).fetchall()
            result = []
            for r in rows:
                title = (r["first_user_msg"] or "新对话")[:40]
                result.append({
                    "session_id": r["session_id"],
                    "title": title,
                    "message_count": r["message_count"],
                    "updated_at": r["last_updated"],
                })
            return result

        result = []
        for r in rows:
            title = r["title"]
            if not title:
                lm = None
                if r["learn_mind"]:
                    try:
                        lm = json.loads(r["learn_mind"])
                    except json.JSONDecodeError:
                        pass
                if lm and lm.get("rootTopic"):
                    title = lm["rootTopic"]
                elif lm and lm.get("topic"):
                    title = lm["topic"]
                else:
                    title = (r["first_user_msg"] or "新对话")[:40]
            result.append({
                "session_id": r["session_id"],
                "mode": r["mode"] or "search",
                "title": title,
                "message_count": r["message_count"],
                "updated_at": r["updated_at"],
                "archived_note_path": r["archived_note_path"],
            })
        return result

    def get_session_detail(self, session_id: str) -> dict:
        """完整会话（消息 + 元数据）"""
        messages = self.get_recent(session_id, n=200)
        meta = self.get_meta(session_id) or {"session_id": session_id, "mode": "search"}
        ctx = meta.get("session_context") or {}
        return {
            "session_id": session_id,
            "mode": meta.get("mode", "search"),
            "title": meta.get("title"),
            "messages": messages,
            "learn_mind": meta.get("learn_mind"),
            "evidence_pack": ctx.get("evidence_pack") if isinstance(ctx, dict) else None,
            "selected_files": meta.get("selected_files") or [],
            "archived_note_path": meta.get("archived_note_path"),
            "last_archived_at": meta.get("last_archived_at"),
            "last_archived_message_idx": meta.get("last_archived_message_idx") or 0,
            "updated_at": meta.get("updated_at"),
        }

    def get_session_messages(self, session_id: str) -> list[dict]:
        """获取会话全部消息（用于前端恢复）"""
        detail = self.get_session_detail(session_id)
        return [m for m in detail.get("messages", []) if m["role"] in ("user", "assistant")]

    def truncate_from_message_index(self, session_id: str, message_index: int) -> int:
        """删除 message_index 及之后的消息（与前端 messages 数组下标对齐）。返回删除条数。"""
        if message_index < 0:
            return 0
        rows = self._conn.execute(
            """SELECT id, created_at FROM conversations
               WHERE session_id = ? AND role IN ('user', 'assistant')
               ORDER BY created_at ASC, id ASC""",
            (session_id,),
        ).fetchall()
        if message_index >= len(rows):
            return 0
        cutoff = rows[message_index]["created_at"]
        cur = self._conn.execute(
            """DELETE FROM conversations
               WHERE session_id = ? AND role IN ('user', 'assistant')
               AND created_at >= ?""",
            (session_id, cutoff),
        )
        self._touch_meta(session_id)
        self._conn.commit()
        return cur.rowcount

    def close(self):
        self._conn.close()
