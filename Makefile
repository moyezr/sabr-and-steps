.PHONY: setup test dev

setup:
	./init.sh
	pnpm db:configure
	pnpm db:up
	pnpm db:migrate

test:
	pnpm check
	pnpm test:db

dev:
	pnpm dev --hostname 127.0.0.1
