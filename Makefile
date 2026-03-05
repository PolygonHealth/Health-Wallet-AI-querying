run:
	uvicorn src.api.app:create_app --factory --reload

test:
	pytest --cov=src --cov-report=term-missing

lint:
	ruff check . && ruff format --check .

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f ai-query-engine

