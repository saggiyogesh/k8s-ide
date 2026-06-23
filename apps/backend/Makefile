.PHONY: build run test tidy

build:
	go build -o bin/k8s-ide-backend ./cmd/server

run:
	go run ./cmd/server

test:
	go test ./...

tidy:
	go mod tidy
