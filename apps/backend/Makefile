.PHONY: build run test lint tidy

BIN := bin/k8s-ide-backend

build:
	go build -o $(BIN) ./cmd/server

run:
	go run ./cmd/server

test:
	go test ./...

lint:
	go vet ./...

tidy:
	go mod tidy
