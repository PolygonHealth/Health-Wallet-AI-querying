# Polygon Health AI Query Engine

A FastAPI service that answers patient health questions using their FHIR data. It loads records from PostgreSQL (e.g. AWS RDS), sends them to an LLM (Google Gemini), and returns plain-English answers. Includes a benchmark endpoint that runs queries across strategies and models and returns an Excel report.

## Features

- **POST /api/v1/query** — Natural-language question + patient ID → answer with source resource IDs
- **POST /api/v1/benchmark** — Run queries × strategies × models, download Excel results
- **GET /health** — Liveness check (DB connectivity)

Strategy pattern for query methods, abstract LLM client, and async DB access throughout.

## Requirements

- Python 3.12+
- PostgreSQL with FHIR data (e.g. `fhir_resources` table)
- Google Gemini API key

## Setup

```bash
# Clone and enter project
cd Health-Wallet-AI-querying

# Install
make install
# or for development (with dev deps)
make dev

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL and GEMINI_API_KEY
```

## Environment

| Variable           | Description                          |
|--------------------|--------------------------------------|
| `DATABASE_URL`     | PostgreSQL URL (asyncpg), required   |
| `GEMINI_API_KEY`   | Google Gemini API key, required     |
| `DEFAULT_STRATEGY` | Default strategy (default: `naive_dump`) |
| `DEFAULT_MODEL`    | Default model (default: `gemini-3.0-flash`) |
| `LOG_LEVEL`        | Logging level (default: `INFO`)     |

## Run

```bash
make run
# Server at http://localhost:8000
# Docs: http://localhost:8000/docs
```

## Docker

```bash
make build   # Build image
make up      # Start api + pgadmin
make logs    # Tail api logs
make down    # Stop
```

Ensure `.env` is set; the API container uses it via `env_file`.

## Tests

```bash
make lint       # Ruff check + format
make test-unit  # Unit tests only (no Docker)
make test       # All tests (integration tests need Docker + testcontainers)
```

## Project layout

```
src/
├── api/           # FastAPI app, routes, dependencies
├── core/          # Strategies, context, result, registry
├── llm/           # LLM client abstraction, Gemini provider
├── db/            # Async session, FHIR queries
├── benchmark/     # Runner, Excel writer
└── config/        # Settings, logging
tests/
├── unit/
├── integration/
└── mocks/         # Test doubles (e.g. MockLLMClient)
```
