# EVoice

Браузерный симулятор звука автомобильного двигателя.

Независимая реализация, вдохновлённая идеей Rombo. Фокус — качественный процедурный звук и реалистичное поведение виртуального двигателя.

## Текущий статус (v0.1 — scaffold)

- [x] Исследование Rombo → `docs/ROMBO_RESEARCH.md`
- [x] Архитектура → `docs/ARCHITECTURE.md`
- [x] Vite + React + TypeScript
- [x] `VehicleModel` (состояния, обороты, передачи, turbo spool)
- [x] `AudioEngine` + AudioWorklet (`public/engine-processor.js`)
- [x] Первый профиль: **Volkswagen 1.9 TDI PD**
- [x] Базовая приборная панель Classic Diesel
- [x] Режим Simulation (слайдер газа)
- [x] Start / Stop, сохранение профиля в localStorage
- [ ] Доводка качества звука (Этап 3)
- [ ] GPS + Drive mode
- [ ] Полноценные индивидуальные панели и новые профили

## Быстрый старт

```bash
npm install
npm run dev
```

Откройте http://localhost:5173  

1. Нажмите **Start** (обязательный жест пользователя для AudioContext).
2. Переключитесь в **SIM**.
3. Двигайте слайдер Throttle — обороты, нагрузка, boost и звук должны реагировать.

## Структура

```
src/
  audio/          # AudioEngine + layers + worklet reference
  simulation/     # VehicleModel, gearbox logic
  profiles/       # catalog + diesel/city/retrofuture
  dashboard/      # приборные панели
  ...
public/
  engine-processor.js   # AudioWorklet (plain JS)
docs/
  ROMBO_RESEARCH.md
  ARCHITECTURE.md
```

## Лицензия

MIT — см. `LICENSE`.
