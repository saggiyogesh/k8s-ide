.PHONY: build test run clean

BIN := bin/k8s-ide-server

build:
	go build -o $(BIN) ./cmd/server

test:
	go test ./... -v

run: build
	$(BIN)

clean:
	rm -rf bin/
