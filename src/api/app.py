import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import benchmark, health, query
from src.config.logging import setup_logging
from src.config.settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.LOG_LEVEL)
    logger.info("app_startup | log_level=%s", settings.LOG_LEVEL)
    yield
    logger.info("app_shutdown")


def create_app() -> FastAPI:
    app = FastAPI(title="Polygon Health AI Query Engine", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def global_handler(request, exc):
        logger.error(
            "unhandled_exception | path=%s | error=%s",
            request.url.path if request else "",
            str(exc),
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"},
        )

    app.include_router(query.router, prefix="/api/fhir", tags=["query"])
    app.include_router(benchmark.router, prefix="/api/v1", tags=["benchmark"])
    app.include_router(health.router, prefix="/api/fhir", tags=["health"])


    @app.get("/")
    async def root():
        return {
            "service": "Polygon Health AI Query Engine",
            "status": "running",
            "docs": "/docs",
            "health": "/health",
        }
    return app
