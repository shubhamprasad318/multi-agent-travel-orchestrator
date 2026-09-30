"""Entry point: `python main.py` (or `uvicorn api.routes:app --reload`)."""

import uvicorn

from config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run("api.routes:app", host=settings.host, port=settings.port, reload=settings.debug)
