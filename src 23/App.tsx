import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import { VehicleModel } from './simulation/VehicleModel';
import { getDefaultProfile, getProfileById, PROFILE_CATALOG } from './profiles/catalog';
import { DashboardRenderer } from './dashboard/DashboardRenderer';
import type { AppSettings, EngineProfile, VehicleState } from './types';
import { DEFAULT_SETTINGS } from './types';
import './App.css';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('evoice-settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem('evoice-settings', JSON.stringify(s));
  } catch { /* ignore */ }
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [profile, setProfile] = useState<EngineProfile>(
    () => getProfileById(settings.profileId) ?? getDefaultProfile()
  );
  const [vehicleState, setVehicleState] = useState<VehicleState>({
    engineState: 'OFF',
    rpm: 0,
    speedKmh: 0,
    gear: 0,
    load: 0,
    throttle: 0,
    boost: 0,
    transmissionMode: settings.transmissionMode,
    isShifting: false,
  });
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [simThrottle, setSimThrottle] = useState(0);
  const [showProfiles, setShowProfiles] = useState(false);
  const [gpsQuality] = useState<'unavailable' | 'good' | 'poor' | 'lost'>('unavailable');

  const vehicleRef = useRef<VehicleModel | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // Init models
  useEffect(() => {
    const v = new VehicleModel(profile);
    v.setTransmissionMode(settings.transmissionMode);
    vehicleRef.current = v;

    const a = new AudioEngine();
    audioRef.current = a;

    return () => {
      cancelAnimationFrame(rafRef.current);
      a.dispose();
    };
  }, []); // once

  // Profile change
  useEffect(() => {
    vehicleRef.current?.setProfile(profile);
    audioRef.current?.setProfile(profile);
    setSettings((s) => {
      const next = { ...s, profileId: profile.id };
      saveSettings(next);
      return next;
    });
  }, [profile]);

  // Simulation loop
  useEffect(() => {
    const loop = (ts: number) => {
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0.016;
      lastTsRef.current = ts;

      const v = vehicleRef.current;
      const a = audioRef.current;
      if (v) {
        if (settings.simulationMode) {
          v.setSimulationThrottle(simThrottle);
          // Simple free-running speed from throttle for demo
          const cur = v.getState();
          const target = cur.speedKmh + (simThrottle * 12 - (1 - simThrottle) * 4) * dt * 10;
          v.setTargetSpeed(Math.max(0, target));
        }
        v.update(dt);
        const st = v.getState();
        setVehicleState(st);
        a?.update(st);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [settings.simulationMode, simThrottle]);

  const handleStart = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    setAudioError(null);
    const ok = await a.init();
    if (!ok) {
      setAudioError('Не удалось инициализировать AudioContext / Worklet');
      return;
    }
    a.setMasterVolume(settings.masterVolume);
    a.setProfile(profile);
    a.start();
    vehicleRef.current?.start();
    setAudioReady(true);
  }, [profile, settings.masterVolume]);

  const handleStop = useCallback(() => {
    vehicleRef.current?.stop();
    audioRef.current?.stop();
  }, []);

  const selectProfile = (p: EngineProfile) => {
    setProfile(p);
    setShowProfiles(false);
  };

  const toggleSim = () => {
    setSettings((s) => {
      const next = { ...s, simulationMode: !s.simulationMode };
      saveSettings(next);
      return next;
    });
  };

  return (
    <div className={`app theme-${settings.theme}`}>
      <header className="top-bar">
        <div className="brand">EVoice</div>
        <div className="top-actions">
          <button
            className={`mode-btn ${settings.simulationMode ? 'active' : ''}`}
            onClick={toggleSim}
          >
            {settings.simulationMode ? 'SIM' : 'DRIVE'}
          </button>
          <button className="mode-btn" onClick={() => setShowProfiles(true)}>
            {profile.shortName}
          </button>
          {vehicleState.engineState === 'OFF' || vehicleState.engineState === 'STOPPING' ? (
            <button className="start-btn" onClick={handleStart}>
              Start
            </button>
          ) : (
            <button className="stop-btn" onClick={handleStop}>
              Stop
            </button>
          )}
        </div>
      </header>

      <main className="main-stage">
        <DashboardRenderer
          state={vehicleState}
          profile={profile}
          speedUnit={settings.speedUnit}
          gpsQuality={settings.simulationMode ? 'unavailable' : gpsQuality}
        />

        {settings.simulationMode && (
          <div className="sim-controls">
            <div className="pedal-label">Throttle (hold or drag)</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={simThrottle}
              onChange={(e) => setSimThrottle(parseFloat(e.target.value))}
              className="throttle-slider"
            />
            <div className="pedal-value">{Math.round(simThrottle * 100)}%</div>
          </div>
        )}

        {audioError && <div className="error-banner">{audioError}</div>}
        {!audioReady && vehicleState.engineState === 'OFF' && (
          <div className="hint">Нажмите Start для запуска звука (требуется жест пользователя)</div>
        )}
      </main>

      {showProfiles && (
        <div className="modal-overlay" onClick={() => setShowProfiles(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Выбор профиля</h2>
            <div className="profile-grid">
              {PROFILE_CATALOG.map((p) => (
                <button
                  key={p.id}
                  className={`profile-card ${p.id === profile.id ? 'selected' : ''}`}
                  onClick={() => selectProfile(p)}
                >
                  <div className="pc-name">{p.name}</div>
                  <div className="pc-desc">{p.description}</div>
                  <div className="pc-meta">
                    {p.cylinders} cyl · {p.maxPowerHp} hp · {p.hasTurbo ? 'Turbo' : 'NA'}
                  </div>
                </button>
              ))}
            </div>
            <button className="close-modal" onClick={() => setShowProfiles(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
