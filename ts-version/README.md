# Polygon Health AI Query Engine - TypeScript Version

TypeScript implementation of the Polygon Health AI Query Engine, maintaining feature parity with the Python version.

## Features

- **POST /api/v1/query** — Natural-language question + patient ID → answer with source resource IDs
- **POST /api/v1/benchmark** — Run queries × strategies × models, download Excel results
- **GET /health** — Liveness check (DB connectivity)

## Setup

```bash
cd ts-version

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and API keys
```

## Run

```bash
npm run dev
# Server at http://localhost:3000
```

## Build

```bash
npm run build
npm start
```

## Test

```bash
npm test
npm run lint
npm run typecheck
```

## Project Structure

```
src/
├── api/           # Express app, routes, middleware
├── core/          # Strategies, context, result, registry
├── llm/           # LLM client abstraction, providers
├── db/            # Database session, FHIR queries
├── benchmark/     # Runner, Excel writer
└── config/        # Settings, logging
```

## LangGraph Implementation

Uses LangGraph.js for the agentic strategy with the same workflow as the Python version:
- Query classification
- Tool execution loop
- Answer synthesis with resource citations

## Development

The TypeScript version maintains the same folder structure and API as the Python version for easy comparison and maintenance.
