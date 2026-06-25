"""上下文管理数据类型"""

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class EvidenceItem:
    path: str
    title: str
    excerpt: str
    content_hash: str = ""
    tool: str = "wiki_read_page"
    turn_id: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SessionContext:
    learn_mind: dict | None = None  # stores learn_note_v1 JSON
    learn_note: dict | None = None
    mastery_quiz: dict | None = None
    evidence_pack: list[EvidenceItem] = field(default_factory=list)
    tool_digest: list[dict] = field(default_factory=list)
    compact_generation: int = 0
    token_estimate: int = 0
    coverage: str = "unknown"  # sufficient | insufficient | unknown

    def evidence_dicts(self) -> list[dict]:
        return [e.to_dict() for e in self.evidence_pack]

    def to_dict(self) -> dict:
        note = self.learn_note or self.learn_mind
        return {
            "learn_mind": note,
            "learn_note": note,
            "mastery_quiz": self.mastery_quiz,
            "evidence_pack": self.evidence_dicts(),
            "tool_digest": self.tool_digest,
            "compact_generation": self.compact_generation,
            "token_estimate": self.token_estimate,
            "coverage": self.coverage,
        }

    @classmethod
    def from_dict(cls, data: dict | None) -> "SessionContext":
        if not data:
            return cls()
        pack = []
        for item in data.get("evidence_pack") or []:
            if isinstance(item, dict):
                pack.append(EvidenceItem(
                    path=item.get("path", ""),
                    title=item.get("title", ""),
                    excerpt=item.get("excerpt", ""),
                    content_hash=item.get("content_hash", ""),
                    tool=item.get("tool", "wiki_read_page"),
                    turn_id=item.get("turn_id", 0),
                ))
        note = data.get("learn_note") or data.get("learn_mind")
        return cls(
            learn_mind=note,
            learn_note=note,
            mastery_quiz=data.get("mastery_quiz") if isinstance(data.get("mastery_quiz"), dict) else None,
            evidence_pack=pack,
            tool_digest=list(data.get("tool_digest") or []),
            compact_generation=int(data.get("compact_generation") or 0),
            token_estimate=int(data.get("token_estimate") or 0),
            coverage=data.get("coverage") or "unknown",
        )


def empty_learn_mind(topic: str = "未命名学习") -> dict:
    return {
        "topic": topic,
        "concepts": [],
        "links": [],
        "openQuestions": [],
        "keyTakeaways": [],
        "version": 0,
        "updatedAt": __import__("datetime").datetime.now().isoformat(),
    }
