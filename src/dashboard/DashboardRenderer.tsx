import type { VehicleState, EngineProfile, SpeedUnit } from '../types';

interface Props {
  state: VehicleState;
  profile: EngineProfile;
  speedUnit: SpeedUnit;
  gpsQuality: string;
}

export function DashboardRenderer({ state, profile, speedUnit, gpsQuality }: Props) {
  const speedDisplay =
    speedUnit === 'mph'
      ? Math.round(state.speedKmh * 0.621371)
      : Math.round(state.speedKmh);

  const unitLabel = speedUnit === 'mph' ? 'MPH' : 'KM/H';
  const rpmPct = Math.min(1, state.rpm / profile.redlineRpm);
  const loadPct = state.load;
  const boostPct = state.boost;

  // Simple classic-diesel style: dark panel, red/orange digits, analog-ish bars
  return (
    <div className="dashboard classic-diesel">
      <div className="dash-header">
        <span className="profile-name">{profile.shortName}</span>
        <span className={`gps-badge ${gpsQuality}`}>{gpsQuality.toUpperCase()}</span>
      </div>

      <div className="dash-main">
        <div className="speedo">
          <div className="speed-value">{speedDisplay}</div>
          <div className="speed-unit">{unitLabel}</div>
        </div>

        <div className="center-col">
          <div className="gear-box">
            <span className="gear-label">GEAR</span>
            <span className="gear-value">
              {state.gear === 0 ? (state.engineState === 'OFF' ? '—' : 'N') : state.gear}
            </span>
          </div>
          <div className="state-label">{state.engineState}</div>
        </div>

        <div className="tacho">
          <div className="rpm-value">{Math.round(state.rpm)}</div>
          <div className="rpm-label">RPM</div>
          <div className="rpm-bar">
            <div
              className="rpm-fill"
              style={{ width: `${rpmPct * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="dash-bottom">
        <div className="meter">
          <span>LOAD</span>
          <div className="bar">
            <div className="fill load" style={{ width: `${loadPct * 100}%` }} />
          </div>
        </div>
        <div className="meter">
          <span>BOOST</span>
          <div className="bar">
            <div className="fill boost" style={{ width: `${boostPct * 100}%` }} />
          </div>
        </div>
        <div className="meter">
          <span>THR</span>
          <div className="bar">
            <div className="fill thr" style={{ width: `${state.throttle * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
