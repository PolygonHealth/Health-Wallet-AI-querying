from fastapi import APIRouter, Depends
from sqlalchemy import text

from src.api.dependencies import get_db

router = APIRouter()


@router.get("/health")
async def health(db=Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}
