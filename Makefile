# EightyTwenty task runner: run from the repo root, no cd needed. `make help` lists targets.
#
# Everyday use, each in its own terminal:
#   make run            backend for the browser and the phone (demo payments, push on)
#   make mobile         Expo Go on the phone (scan the QR)
#   make mobile-clear   same, with Metro's cache cleared (after editing mobile/.env)
#
# The work happens in scripts/dev.sh (backend, website, QA) and scripts/mobile.sh (Expo).
# Variables are passed as make arguments: make test k=refresh, make run port=8001.

# On Windows, `bash` on PATH may be WSL's, which has neither Node nor this repo's venv.
# Use Git's own bash, found from git itself, so make works from PowerShell, CMD or Git Bash.
ifeq ($(OS),Windows_NT)
  BASH := "$(subst \,/,$(shell git --exec-path))/../../../bin/bash.exe"
else
  BASH := bash
endif
DEV := $(BASH) scripts/dev.sh
MOBILE := $(BASH) scripts/mobile.sh

.DEFAULT_GOAL := help

.PHONY: help run run-local website status lan-ip install clean \
	migrate makemigrations showmigrations shell superuser openapi messages \
	test test-pg test-web lint format ci qa pg-up pg-down \
	mobile mobile-clear mobile-prod mobile-mock mobile-tunnel mobile-web mobile-install \
	mobile-check mobile-test mobile-typecheck mobile-lint mobile-doctor mobile-bundle api-smoke

help: ## Show this list.
	@$(DEV) help

##@ Run
run: ## Backend on 0.0.0.0:8000 for browser + phone, demo payments, push on [port=].
	@$(DEV) run "$(port)"

run-local: ## Backend on 127.0.0.1 only, backend/.env as it is [port=].
	@$(DEV) run-local "$(port)"

website: ## Static website on http://localhost:8123 (uses the API on :8000).
	@$(DEV) website

status: ## What is running (backend, phone access, website, Metro) + production health.
	@$(DEV) status

##@ Mobile (Expo)
mobile: ## Expo Go on the phone, dev backend; checks the phone can reach it [port=].
	@$(MOBILE) start "$(port)"

mobile-clear: ## Same as mobile, Metro cache cleared (after editing mobile/.env) [port=].
	@$(MOBILE) clear "$(port)"

mobile-prod: ## Expo Go against the production API on Render (real data).
	@$(MOBILE) prod

mobile-mock: ## Expo Go with the client's mock data, no backend needed.
	@$(MOBILE) mock

mobile-tunnel: ## Expo Go over a tunnel when the Wi-Fi blocks the phone (production API).
	@$(MOBILE) tunnel

mobile-web: ## The app in a desktop browser on http://localhost:8082.
	@$(MOBILE) web

mobile-install: ## npm install in mobile/.
	@$(MOBILE) install

##@ Database
migrate: ## Apply migrations to the local DB [app= to=]. Refuses a non-local DB.
	@$(DEV) migrate "$(app)" "$(to)"

makemigrations: ## Create migrations after a model change [app=].
	@$(DEV) makemigrations "$(app)"

showmigrations: ## List migrations and which are applied [app=].
	@$(DEV) showmigrations "$(app)"

shell: ## Django shell.
	@$(DEV) shell

superuser: ## Create a BOS superuser (chain owner) on the local DB.
	@$(DEV) superuser

pg-up: ## Start local Postgres 17 in Docker (127.0.0.1:54329).
	@$(DEV) pg-up

pg-down: ## Stop local Postgres.
	@$(DEV) pg-down

##@ Test & QA
test: ## Backend tests (pytest) [f=tests/test_auth.py k=refresh].
	@$(DEV) test "$(f)" "$(k)"

test-pg: ## Backend tests on Postgres (starts it in Docker).
	@$(DEV) test-pg

test-web: ## Website + BOS front-end tests (Node).
	@$(DEV) test-web

lint: ## Backend ruff check + format check.
	@$(DEV) lint

format: ## Backend ruff fix + format (changes files).
	@$(DEV) format

ci: ## Backend, exactly the GitHub CI steps (ruff, check, migrations, pytest, OpenAPI).
	@$(DEV) ci

mobile-check: ## App: typecheck + lint + Jest + expo-doctor.
	@$(MOBILE) check

mobile-test: ## App Jest tests [t=smoke to pick files].
	@$(MOBILE) test "$(t)"

mobile-typecheck: ## App TypeScript check only.
	@$(MOBILE) typecheck

mobile-lint: ## App ESLint only.
	@$(MOBILE) lint

mobile-doctor: ## expo-doctor (dependency versions for SDK 58).
	@$(MOBILE) doctor

mobile-bundle: ## Build the iOS + Android JS bundles (catches errors a phone would hit).
	@$(MOBILE) bundle

api-smoke: ## Every app API call against the running local backend [as=customer email].
	@$(MOBILE) smoke "$(as)" "$(port)"

qa: ## Everything without a phone: make ci + test-web + mobile-check + mobile-bundle.
	@$(DEV) ci
	@$(DEV) test-web
	@$(MOBILE) check
	@$(MOBILE) bundle

##@ Tools
openapi: ## Regenerate docs/openapi.yaml after an API change (commit it).
	@$(DEV) openapi

messages: ## Compile backend/locale .po into .mo.
	@$(DEV) messages

install: ## pip install (backend, dev) + npm install (mobile).
	@$(DEV) install

clean: ## Remove __pycache__ / .pytest_cache / .ruff_cache under backend/.
	@$(DEV) clean

lan-ip: ## This computer's Wi-Fi address (what the phone connects to).
	@$(DEV) lan-ip
