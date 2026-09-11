import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat_session import ChatMessage
from app.services.gemini_agent import gemini_agent

router = APIRouter(prefix="/agent", tags=["Lead Research Agent"])


class ChatRequest(BaseModel):
    message: str


@router.post("/chat")
async def chat_with_agent(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Execute Gemini Agent search & analysis
    result = await gemini_agent.chat(user_message=body.message)

    # Save User message to chat history
    user_chat = ChatMessage(
        user_id=current_user.id,
        role="user",
        content=body.message,
        leads_json=None
    )
    db.add(user_chat)

    # Save Assistant response to chat history
    assistant_chat = ChatMessage(
        user_id=current_user.id,
        role="model",
        content=result.get("reply", ""),
        leads_json=json.dumps(result.get("leads", []))
    )
    db.add(assistant_chat)
    await db.commit()

    return {
        "reply": result.get("reply"),
        "leads": result.get("leads", []),
        "stats": result.get("stats", {}),
        "parsed_query": result.get("parsed_query", {})
    }


@router.get("/history")
async def get_agent_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
    )
    chats = result.scalars().all()

    return [
        {
            "id": c.id,
            "role": c.role,
            "content": c.content,
            "leads": json.loads(c.leads_json) if c.leads_json else None,
            "created_at": c.created_at.isoformat()
        }
        for c in chats
    ]
