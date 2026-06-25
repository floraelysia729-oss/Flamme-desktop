import tempfile
from pathlib import Path

from src.db.conversation import ConversationStore


def test_truncate_from_message_index():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "conv.db"
        store = ConversationStore(str(db))
        sid = "sess-1"
        store.save_turn(sid, "user", "first", mode="learn")
        store.save_turn(sid, "assistant", "reply one", mode="learn")
        store.save_turn(sid, "user", "second", mode="learn")
        store.save_turn(sid, "assistant", "reply two", mode="learn")

        deleted = store.truncate_from_message_index(sid, 2)
        assert deleted == 2

        msgs = store.get_session_messages(sid)
        assert len(msgs) == 2
        assert msgs[0]["content"] == "first"
        assert msgs[1]["content"] == "reply one"
        store.close()
