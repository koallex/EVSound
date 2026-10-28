# Архитектура EVoice

## Принципы

1. **Разделение ответственности**
   - `simulation/` — чистая логика (скорость → обороты → нагрузка → boost)
   - `audio/` — только генерация и микширование звука
   - UI / dashboard — только отображение состояния

2. **Аудио**
   - Основной путь: AudioWorklet (`public/engine-processor.js`)
   - Параметры (rpm, load, boost, state) отправляются с main thread ~60 Гц
   - Внутри worklet — сильное сглаживание параметров + tanh soft-clip
   - Слои: combustion pulses (дизельный характер), mechanical rumble, turbo whistle

3. **Состояния двигателя**
   OFF → STARTING → IDLE ⇄ RUNNING → STOPPING → OFF

4. **Профили**
   Каждый профиль — объект `EngineProfile` с техническими данными и audio-параметрами.
   Первый: `vw-19-tdi-pd`.

5. **Режимы**
   - Drive (будущий GPS)
   - Simulation (throttle slider / в будущем touch-pad)

## Текущий статус (v0.1 scaffold)

- [x] Каркас Vite + React + TS
- [x] VehicleModel
- [x] AudioEngine + Worklet (базовый дизельный синтез)
- [x] Один профиль VW 1.9 TDI PD
- [x] Базовый Classic Diesel dashboard
- [x] Simulation mode + Start/Stop
- [ ] Качественная доводка звука (Этап 3)
- [ ] GPS provider
- [ ] Полноценные индивидуальные панели
- [ ] Остальные профили
