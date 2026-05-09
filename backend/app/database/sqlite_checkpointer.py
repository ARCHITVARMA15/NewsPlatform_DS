"""
SQLite checkpointer for LangGraph thread persistence.

AsyncSqliteSaver stores the full agent state after every node execution,
enabling resume-from-interrupt across sessions.
"""
from contextlib import asynccontextmanager

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from app.config import settings


@asynccontextmanager
async def get_checkpointer():
    """
    Async context manager that yields an AsyncSqliteSaver instance.

    Usage:
        async with get_checkpointer() as checkpointer:
            graph = builder.compile(checkpointer=checkpointer)
    """
    async with AsyncSqliteSaver.from_conn_string(settings.sqlite_db_path) as checkpointer:
        yield checkpointer


def get_thread_config(thread_id: str) -> dict:
    """
    Returns the LangGraph config dict for a given thread_id.

    Usage:
        config = get_thread_config("abc-123")
        await graph.ainvoke(state, config=config)
    """
    return {"configurable": {"thread_id": thread_id}}
