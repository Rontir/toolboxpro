# Toolbox - Narzędzia Excel

Zestaw narzędzi do przetwarzania plików Excel, obrazów i innych zadań.

## Proxmox / Docker

Do lokalnego wdrożenia na Proxmoxie użyj plików:

- [docker-compose.yml](/home/mike/Documents/toolboxpro/docker-compose.yml)
- [Dockerfile.frontend](/home/mike/Documents/toolboxpro/Dockerfile.frontend)
- [Dockerfile.backend](/home/mike/Documents/toolboxpro/Dockerfile.backend)
- [DEPLOY_PROXMOX.md](/home/mike/Documents/toolboxpro/DEPLOY_PROXMOX.md)

Najważniejsze:

1. Podmień adres IP w `docker-compose.yml`.
2. Uruchom `docker compose up -d --build`.
3. Otwórz frontend na `http://IP_SERWERA:3000`.

## 🚀 Instalacja (jednorazowo)

1. **Wymagania:**
   - Node.js 18+ (https://nodejs.org/)
   - Python 3.10+ (https://python.org/)

2. **Uruchom instalator:**
   ```
   install.bat
   ```

## ▶️ Uruchomienie

```
start.bat
```

Aplikacja otworzy się na: **http://localhost:3000**

## 🛠️ Dostępne narzędzia

| Narzędzie | Opis |
|-----------|------|
| 🖼️ Konwerter Obrazów | PNG, JPG, WEBP, GIF |
| ✂️ Kadrowanie | Allegro, Shopify |
| 📊 Excel Splitter | Dzielenie i łączenie plików |
| 📝 HTML Fixer | Czyszczenie kodu HTML |
| 🔍 EAN Checker | Walidacja kodów EAN |
| ☁️ PikoEmpiko | Przetwarzanie zdjęć produktów |
| 🧴 Perfumy Helper | Zestawy perfum |
| 🔄 JSON → HTML | Konwersja opisów |
| 📄 Opis → HTML | Generator HTML |
| 🧩 Dopasowywacz | Mapowanie struktur |

## ❓ Problemy

- **"Node.js nie znaleziony"** - Zainstaluj Node.js i zrestartuj komputer
- **"Python nie znaleziony"** - Zainstaluj Python z opcją "Add to PATH"
- **Port zajęty** - Zamknij inne aplikacje używające portów 3000 lub 8000
