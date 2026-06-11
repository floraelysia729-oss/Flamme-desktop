"""Wikilink resolution — unified with frontend resolveVaultLink."""

from fastapi import APIRouter, Query, Request

from src.api.deps import get_request_config_or_default
from src.api.runtime import build_db
from src.knowledge.link_resolver import LinkResolver

router = APIRouter(prefix="/resolve-link")


@router.get("")
def resolve_link(request: Request, target: str = Query(..., min_length=1)):
    cfg = get_request_config_or_default(request)
    db = build_db(cfg)
    try:
        hit = LinkResolver(db, cfg.vault_path).resolve(target)
        if not hit:
            return {"found": False, "target": target}
        return {"found": True, "target": target, **hit}
    finally:
        db.close()
