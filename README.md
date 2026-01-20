W głównym katalogu, czyli tam gdzie jest `docker-compose.yml` uruchom docker compose za pomocą poniższej komendy:

```bash
docker compose up -d --build
```

Następnie pobierz modele Ollamy używane w projekcie:

```bash
docker compose exec ollama ollama pull llama2
docker compose exec ollama ollama pull mxbai-embed-large
```