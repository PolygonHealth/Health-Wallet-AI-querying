# TypeScript Version Setup Instructions

## Important Notes

the py version of health-wallet-AI-querying has been updated. 
Please check the py version for the latest changes and updates. and update the ts version accordingly.

 keep moest recent packages from package.json

- This TypeScript version is a direct port of the Python version
- some of the files in ts-version have been adjusted with TS and annotated with comments indicating so.  If you see these comments, keep the ts code in such files as is.
- All configuration is done directly in code (no external files)
- The design decision was made to avoid external dependencies
- Future ports should maintain this direct configuration approach

## Current Status

✅ **Completed:**
- Project structure created
- Package.json with LangGraph.js dependencies
- TypeScript configuration
- Core models and interfaces
- LangGraph strategy implementation
- Express API routes
- Database session management
- Gemini LLM provider

⚠️ **Next Steps Needed:**
1. Install dependencies: `cd ts-version && npm install`
2. Create `.env` file from `.env.example`
3. Complete remaining LangGraph nodes (classify, synthesize, decline, edges)
4. Port database queries from Python
5. Add remaining utility files

## Installation

```bash
cd ts-version
npm install
cp .env.example .env
# Edit .env with your database and API keys
```

## Run

```bash
npm run dev
```

## Port Mapping (Python → TypeScript)

| Python File | TypeScript File | Status |
|-------------|------------------|---------|
| `src/core/models.py` | `src/core/models.ts` | ✅ |
| `src/core/strategies/langgraph/strategy.py` | `src/core/strategies/langgraph/strategy.ts` | ✅ |
| `src/api/app.py` | `src/api/app.ts` | ✅ |
| `src/db/session.py` | `src/db/session.ts` | ✅ |
| `src/llm/providers/gemini.py` | `src/llm/providers/gemini.ts` | ✅ |
| `src/core/strategies/langgraph/nodes/` | `src/core/strategies/langgraph/nodes/` | 🔄 |
| `src/core/strategies/langgraph/tools.py` | `src/core/strategies/langgraph/tools.ts` | ✅ |
| `src/db/queries.py` | `src/db/queries.ts` | 🔄 |

## Dependencies

The TypeScript version uses:
- **LangGraph.js** instead of LangGraph (Python)
- **LangChain.js** for LLM integration
- **Express** instead of FastAPI
- **PostgreSQL** with `pg` driver
- **Zod** for schema validation
- **Winston** for logging

## Development

Both versions can run simultaneously:
- Python: `make run` (port 8000)
- TypeScript: `npm run dev` (port 3000)

They share the same database and environment variables structure.
