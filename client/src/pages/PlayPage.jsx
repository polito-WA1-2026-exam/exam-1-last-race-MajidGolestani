/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Col, ProgressBar, Row, Spinner } from 'react-bootstrap';
import { api } from '../api';

const WIDTH = 765;
const HEIGHT = 357;

const getNeonColor = (hex) => hex;

function segmentKey(a, b) {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

function endpointAfterRoute(startId, route) {
  let current = startId;
  for (const seg of route) {
    current =
      seg.stationAId === current ? seg.stationBId : seg.stationAId;
  }
  return current;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRouteValidity(startStationId, route) {
  let current = startStationId;
  return route.map((seg) => {
    const isConnected = seg.stationAId === current || seg.stationBId === current;
    if (isConnected) {
      current = seg.stationAId === current ? seg.stationBId : seg.stationAId;
    }
    return {
      ...seg,
      connected: isConnected,
    };
  });
}

const REASON_MESSAGES = {
  empty: 'The submitted route is empty.',
  start: 'The route does not start at your designated start station.',
  segment: 'One of the segments in your route does not exist in the metro network.',
  continuity: 'The route segments are not continuous (there is a disconnection).',
  duplicate: 'A segment was traversed more than once, which is not allowed.',
  interchange: 'You attempted to switch metro lines at a station that is not an interchange.',
  dest: 'The route does not reach your designated destination station.',
};

export default function PlayPage() {
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [network, setNetwork] = useState(null);
  const [planningData, setPlanningData] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [memorizeDuration, setMemorizeDuration] = useState('unlimited');
  const [memorizeSecondsLeft, setMemorizeSecondsLeft] = useState(null);
  const [executionStep, setExecutionStep] = useState(0);
  const [uiPhase, setUiPhase] = useState('setup');
  const timeoutSent = useRef(false);
  const routeRef = useRef([]);

  useEffect(() => {
    routeRef.current = selectedRoute;
  }, [selectedRoute]);

  const loadNetwork = useCallback(async () => {
    const data = await api.network();
    setNetwork(data);
  }, []);

  const startNewGame = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelectedRoute([]);
    setPlanningData(null);
    setExecutionStep(0);
    setUiPhase('setup');
    timeoutSent.current = false;
    try {
      await loadNetwork();
      const g = await api.createGame();
      setGame(g);
      setUiPhase('setup');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadNetwork]);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  useEffect(() => {
    const isActive = game !== null && uiPhase !== 'result';
    window.isGameActive = isActive;

    const handleBeforeUnload = (e) => {
      if (isActive) {
        e.preventDefault();
        e.returnValue = 'You have an active game in progress. Leaving now will forfeit your game.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.isGameActive = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [game, uiPhase]);

  useEffect(() => {
    const isActive = game !== null && uiPhase !== 'result';
    if (!isActive) return undefined;

    const handlePopState = (e) => {
      const confirmLeave = window.confirm(
        "You have an active game in progress. Leaving now will forfeit your game. Are you sure you want to leave?"
      );
      if (!confirmLeave) {
        window.history.pushState(null, '', window.location.pathname);
      } else {
        window.isGameActive = false;
      }
    };

    window.history.pushState(null, '', window.location.pathname);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [game, uiPhase]);

  useEffect(() => {
    if (game?.phase !== 'planning' || !game.planningEndsAt) return undefined;

    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((new Date(game.planningEndsAt) - Date.now()) / 1000)
      );
      setSecondsLeft(left);
      if (left === 0 && !timeoutSent.current) {
        timeoutSent.current = true;
        api
          .timeoutRoute(game.id, routeRef.current)
          .then((updated) => {
            setGame(updated);
            setExecutionStep(0);
            if (updated.execution?.valid && updated.execution.steps?.length) {
              setUiPhase('execution');
            } else {
              setUiPhase('result');
            }
          })
          .catch((err) => setError(err.message));
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [game]);

  const beginPlanning = async () => {
    setError('');
    try {
      const data = await api.startPlanning(game.id);
      setGame(data.game);
      setPlanningData({
        stations: data.stations,
        segmentPairs: shuffleArray(data.segmentPairs),
      });
      setUiPhase('planning');
      setSecondsLeft(90);
      timeoutSent.current = false;
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (uiPhase !== 'setup' || !game) return undefined;

    if (memorizeDuration === 'unlimited') {
      setMemorizeSecondsLeft(null);
      return undefined;
    }

    const durationVal = parseInt(memorizeDuration, 10);
    setMemorizeSecondsLeft(durationVal);

    const tick = () => {
      setMemorizeSecondsLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          beginPlanning();
          return 0;
        }
        return prev - 1;
      });
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [uiPhase, game, memorizeDuration]);

  const stationNames = {};
  (planningData?.stations || network?.stations || []).forEach((s) => {
    stationNames[s.id] = s.name;
  });

  const validatedRoute = game ? getRouteValidity(game.startStationId, selectedRoute) : [];

  const handleSelectSegment = (pair) => {
    if (uiPhase !== 'planning') return;
    setError('');
    const connects = selectedRoute.length === 0
      ? (pair.stationAId === game.startStationId || pair.stationBId === game.startStationId)
      : (pair.stationAId === currentStationId || pair.stationBId === currentStationId);
    if (!connects) {
      setError('You must select a segment that connects to your current route endpoint.');
      return;
    }
    const usedKeys = new Set(selectedRoute.map((s) => segmentKey(s.stationAId, s.stationBId)));
    const key = segmentKey(pair.stationAId, pair.stationBId);
    if (usedKeys.has(key)) {
      setError('That segment is already selected in your route.');
      return;
    }
    setSelectedRoute([...selectedRoute, pair]);
  };

  const currentStationId = game
    ? selectedRoute.length === 0
      ? game.startStationId
      : endpointAfterRoute(game.startStationId, selectedRoute.filter((_, idx) => validatedRoute[idx]?.connected))
    : null;

  const handleStationClick = (clickedStationId) => {
    if (uiPhase !== 'planning') return;
    if (clickedStationId === currentStationId) return;

    // Must find a segment connecting the current station to the clicked station
    const pair = planningData.segmentPairs.find(
      (p) =>
        (p.stationAId === currentStationId && p.stationBId === clickedStationId) ||
        (p.stationAId === clickedStationId && p.stationBId === currentStationId)
    );

    if (pair) {
      const usedKeys = new Set(selectedRoute.map((s) => segmentKey(s.stationAId, s.stationBId)));
      const key = segmentKey(pair.stationAId, pair.stationBId);
      if (usedKeys.has(key)) {
        setError('That segment is already selected in your route.');
        return;
      }
      handleSelectSegment(pair);
    } else {
      setError(`Station ${stationNames[clickedStationId]} is not adjacent to your current station ${stationNames[currentStationId]}. Please select an adjacent station.`);
    }
  };

  const submitRoute = async () => {
    setError('');
    try {
      const updated = await api.submitRoute(game.id, selectedRoute);
      setGame(updated);
      setExecutionStep(0);
      if (updated.execution?.valid && updated.execution.steps?.length) {
        setUiPhase('execution');
      } else {
        setUiPhase('result');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const finishExecution = () => {
    setUiPhase('result');
  };

  const advanceExecution = () => {
    const steps = game?.execution?.steps || [];
    if (executionStep < steps.length - 1) {
      setExecutionStep((s) => s + 1);
    } else {
      finishExecution();
    }
  };

  if (loading && !game) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  const steps = game?.execution?.steps || [];
  const currentStep = steps[executionStep];

  return (
    <div>
      {/* Multi-Step Progress Stepper */}
      <div className="card mb-4 border-0 shadow-sm">
        <div className="card-body py-3">
          <div className="d-flex justify-content-between align-items-center position-relative flex-wrap flex-md-nowrap gap-3">
            {/* Progress line connector (desktop only) */}
            <div
              className="position-absolute d-none d-md-block"
              style={{
                top: '50%',
                left: '5%',
                right: '5%',
                height: '4px',
                backgroundColor: 'var(--border-color)',
                zIndex: 1,
                transform: 'translateY(-50%)'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width:
                    uiPhase === 'setup' ? '0%' :
                      uiPhase === 'planning' ? '33.33%' :
                        uiPhase === 'execution' ? '66.66%' : '100%',
                  backgroundColor: 'var(--accent-emerald)',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>

            {[
              { phase: 'setup', step: '1', title: 'Setup', desc: 'Study Network Map' },
              { phase: 'planning', step: '2', title: 'Planning', desc: 'Build Metro Route' },
              { phase: 'execution', step: '3', title: 'Execution', desc: 'Simulate Daily Events' },
              { phase: 'result', step: '4', title: 'Result', desc: 'Final Score & Details' }
            ].map((step, idx) => {
              const isActive = uiPhase === step.phase;
              const isCompleted =
                (uiPhase === 'planning' && idx < 1) ||
                (uiPhase === 'execution' && idx < 2) ||
                (uiPhase === 'result' && idx < 3);

              let circleBg = 'var(--btn-secondary-disabled-bg)';
              let circleBorder = 'var(--btn-secondary-disabled-border)';
              let circleTextColor = 'var(--text-muted)';
              let titleColor = 'var(--text-muted)';

              if (isActive) {
                circleBg = 'var(--primary-color)';
                circleBorder = 'var(--primary-color)';
                circleTextColor = '#ffffff';
                titleColor = 'var(--primary-color)';
              } else if (isCompleted) {
                circleBg = 'var(--accent-emerald)';
                circleBorder = 'var(--accent-emerald)';
                circleTextColor = '#ffffff';
                titleColor = 'var(--accent-emerald)';
              }

              return (
                <div
                  key={step.phase}
                  className="d-flex align-items-center gap-3 px-2"
                  style={{ zIndex: 2, background: 'var(--bg-panel)', borderRadius: '6px', padding: '0.25rem 0.5rem' }}
                >
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm"
                    style={{
                      width: '30px',
                      height: '30px',
                      backgroundColor: circleBg,
                      border: `2px solid ${circleBorder}`,
                      color: circleTextColor,
                      transition: 'all 0.3s ease',
                      fontSize: '0.85rem'
                    }}
                  >
                    {isCompleted ? '✓' : step.step}
                  </div>
                  <div>
                    <div className="fw-bold mb-0 stepper-label-title" style={{ color: titleColor, fontSize: '0.85rem' }}>{step.title}</div>
                    <div className="small text-muted stepper-label-desc" style={{ fontSize: '0.72rem' }}>{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2>Game #{game?.id}</h2>
          {uiPhase === 'setup' && (
            <div className="mt-1">
              <span className="badge bg-primary fs-6">
                🪙 Starting Balance: 20 Coins
              </span>
            </div>
          )}
        </div>
        <span className="badge bg-secondary text-uppercase">{uiPhase}</span>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      {uiPhase === 'setup' && network && (
        <>
          <div className="card mb-3 border-0 shadow-sm">
            <div className="card-body py-3 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <p className="mb-0 text-muted small">
                🗺️ Study the network topology below. Interchange stations are marked in orange.
                <strong> Memorize the routes before starting!</strong>
              </p>
              <div className="d-flex align-items-center gap-2 text-primary fw-semibold small">
                <span>⏱️ Planning timer: 90 seconds.</span>
              </div>
            </div>
          </div>

          <Alert variant="info" className="mb-3 d-flex align-items-center border-0 shadow-sm">
            <span className="fs-4 me-3">🧠</span>
            <div>
              <strong>Memory Challenge:</strong> All transit connections (colored lines) will <strong>disappear</strong> during the Planning phase. You must mentally reconstruct and trace the path using the segment coordinates.
            </div>
          </Alert>

          <div className="card mb-3 border-0 shadow-sm">
            <div className="card-body py-3 px-3">
              <div className="row g-2 align-items-center">
                <div className="col-12 col-md-auto border-end-md pe-md-3">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="fw-bold text-muted small text-uppercase tracking-wider">Lines:</span>
                    {network.lines.map((line) => (
                      <div key={line.id} className="d-flex align-items-center px-2 py-1 rounded bg-light border">
                        <span
                          className="d-inline-block rounded-circle me-1"
                          style={{
                            width: '10px',
                            height: '10px',
                            backgroundColor: getNeonColor(line.color),
                            border: '1px solid rgba(0,0,0,0.15)'
                          }}
                        />
                        <span className="small fw-semibold text-dark">{line.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-md ps-md-3">
                  <div className="d-flex align-items-center gap-2">
                    <span
                      className="d-inline-block rounded-circle"
                      style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: 'var(--accent-orange)',
                        border: '2px solid var(--bg-panel)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                      }}
                    />
                    <span className="small text-muted">
                      <strong className="text-dark">Interchange Stations:</strong> Served by multiple lines. Changing lines is allowed <strong className="text-warning">ONLY</strong> at these hubs.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="setup-map-wrapper">
            <NetworkMap
              stations={network.stations}
              lines={network.lines}
              lineStations={network.lineStations}
              segments={network.segments}
              showLines
              interchanges={network.interchanges}
              highlightStationIds={[]}
              isSetupMap={true}
            />
          </div>
          <Button variant="primary" size="lg" className="mt-3 w-100 py-3 text-uppercase" onClick={beginPlanning}>
            Start planning
          </Button>
        </>
      )}

      {uiPhase === 'planning' && planningData && (
        <>
          <Alert variant="warning" className="mb-3 d-flex align-items-center shadow-sm">
            <span className="fs-4 me-3">🏁</span>
            <div>
              <strong>Start:</strong> {game.startName} — <strong>Destination:</strong>{' '}
              {game.destName} (Trace adjacent segment connections).
            </div>
          </Alert>
          <div className="mb-3 p-3 card border-0 shadow-sm">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span>⏱️ Time left:</span>
              <strong className={secondsLeft < 15 ? 'text-danger fs-5' : 'text-primary fs-5'}>{secondsLeft}s</strong>
            </div>
            <ProgressBar
              now={(secondsLeft / 90) * 100}
              variant={secondsLeft < 15 ? 'danger' : 'info'}
              className="progress"
            />
          </div>
          {validatedRoute.some((s) => !s.connected) && (
            <Alert variant="danger" className="mb-3 py-2 small border-0 shadow-sm">
              ⚠️ <strong>Disconnected segment:</strong> Your route has segments that do not form a continuous path. Please undo or fix it to ensure a valid route.
            </Alert>
          )}
          <Row>
            <Col lg={8}>
              <NetworkMap
                stations={planningData.stations}
                showLines={false}
                highlightStationIds={[game.startStationId, game.destStationId]}
                onStationClick={handleStationClick}
                currentStationId={currentStationId}
                selectedRoute={validatedRoute}
              />
            </Col>
            <Col lg={4}>
              <SegmentPicker
                segmentPairs={planningData.segmentPairs}
                stationNames={stationNames}
                selectedRoute={validatedRoute}
                onSelectSegment={handleSelectSegment}
                onRemoveLast={() => setSelectedRoute((r) => r.slice(0, -1))}
                disabled={secondsLeft === 0}
                currentStationId={currentStationId}
              />
              <Button
                variant="success"
                className="mt-3 w-100 py-3 text-uppercase"
                onClick={submitRoute}
                disabled={secondsLeft === 0 || selectedRoute.length === 0}
              >
                Submit Route
              </Button>
            </Col>
          </Row>
        </>
      )}

      {uiPhase === 'execution' && game.execution?.valid && steps.length > 0 && (
        <>
          <Row>
            <Col lg={7}>
              <NetworkMap
                stations={network.stations}
                lines={network.lines}
                lineStations={network.lineStations}
                segments={network.segments}
                showLines={true}
                interchanges={network.interchanges}
                highlightStationIds={[game.startStationId, game.destStationId]}
                currentStationId={currentStep.toId}
                selectedRoute={steps.slice(0, executionStep + 1).map(s => ({
                  stationAId: s.fromId,
                  stationBId: s.toId
                }))}
              />
            </Col>
            <Col lg={5}>
              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body py-4">
                  <h4 className="card-title text-primary mb-3">Journey Simulation</h4>
                  <div className="mb-3">
                    <span className="badge bg-secondary mb-2">
                      Segment {executionStep + 1} of {steps.length}
                    </span>
                    <h5 className="mb-0 text-dark">
                      Traversing: <strong className="text-primary">{currentStep.fromName}</strong> →{' '}
                      <strong className="text-primary">{currentStep.toName}</strong>
                    </h5>
                  </div>

                  <Alert variant={currentStep.event.effect > 0 ? 'success' : currentStep.event.effect < 0 ? 'danger' : 'info'} className="border-0 mb-3">
                    <div className="d-flex align-items-center mb-2">
                      <span className="fs-3 me-2">
                        {currentStep.event.effect > 0 ? '🎉' : currentStep.event.effect < 0 ? '💥' : 'ℹ️'}
                      </span>
                      <strong className="fs-5">{currentStep.event.description}</strong>
                    </div>
                    <div className="fs-6">
                      Coin Effect:{' '}
                      <strong className={currentStep.event.effect > 0 ? 'text-success' : currentStep.event.effect < 0 ? 'text-danger' : 'text-dark'}>
                        {currentStep.event.effect > 0 ? `+${currentStep.event.effect}` : currentStep.event.effect} coins
                      </strong>
                    </div>
                  </Alert>

                  <div className="p-3 rounded mb-3 bg-light border d-flex justify-content-between align-items-center">
                    <span className="fw-bold text-muted small">COINS BALANCE:</span>
                    <span className="fs-4 fw-bold text-success">{currentStep.coinsAfter} 🪙</span>
                  </div>

                  <Button variant="primary" size="lg" className="w-100 py-3 text-uppercase" onClick={advanceExecution}>
                    {executionStep < steps.length - 1 ? 'Next segment' : 'See final result'}
                  </Button>
                </div>
              </div>

              {/* Traversed route log */}
              <div className="card border-0 shadow-sm small">
                <div className="card-body py-3">
                  <h6 className="card-title text-muted text-uppercase tracking-wider mb-2">Traversed So Far</h6>
                  <ol className="mb-0 ps-3">
                    {steps.slice(0, executionStep + 1).map((step, idx) => (
                      <li key={idx} className={idx === executionStep ? 'fw-bold text-primary' : 'text-muted'}>
                        {step.fromName} → {step.toName}: {step.event.description} ({step.event.effect >= 0 ? '+' : ''}{step.event.effect} coins)
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Col>
          </Row>
        </>
      )}

      {uiPhase === 'result' && (
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <div className="card border-0 text-center p-4 shadow-sm">
              <div className="card-body">
                <div className="mb-4">
                  <span className="fs-1">{Math.max(0, game.score) > 0 ? '🏆' : '💀'}</span>
                  <h2 className="card-title text-dark mt-2">Game Over</h2>
                  <p className="text-muted small">Thank you for playing Last Race!</p>
                </div>

                <div
                  className="p-4 rounded-3 mb-4"
                  style={{
                    background: 'var(--bg-header)',
                    border: game.execution?.valid ? '1px solid var(--accent-emerald-border)' : '1px solid var(--accent-rose-border)',
                  }}
                >
                  <div className="text-muted text-uppercase small fw-bold tracking-wider mb-1">Final Score</div>
                  <div className="display-4 fw-bold text-success mb-2">
                    {Math.max(0, game.score)} <span className="fs-3">🪙</span>
                  </div>
                  {game.execution?.valid ? (
                    <div className="text-success fw-bold d-flex align-items-center justify-content-center">
                      <span className="me-2">✓</span> VALID ROUTE COMPLETED
                    </div>
                  ) : (
                    <div className="text-danger fw-bold d-flex align-items-center justify-content-center">
                      <span className="me-2">⚠️</span> ROUTE DISQUALIFIED
                    </div>
                  )}
                </div>

                {!game.execution?.valid ? (
                  <Alert variant="danger" className="text-start mb-4 border-0 shadow-sm">
                    <h5 className="alert-heading small fw-bold text-uppercase">Reason</h5>
                    <p className="mb-0 small">
                      <strong>{REASON_MESSAGES[game.execution?.reason] || 'Your route was invalid or incomplete.'}</strong>
                    </p>
                    <div className="text-muted small mt-2">
                      Error Code: <span className="text-danger">{game.execution?.reason || 'unknown'}</span>
                    </div>
                  </Alert>
                ) : (
                  <div className="text-start mb-4">
                    <h5 className="text-muted mb-3 small fw-bold text-uppercase tracking-wider">Journey History & Events</h5>
                    <div
                      className="p-3 rounded bg-light border"
                      style={{
                        maxHeight: '200px',
                        overflowY: 'auto',
                      }}
                    >
                      <ol className="mb-0 ps-3">
                        {game.execution?.steps?.map((step, i) => (
                          <li key={i} className="mb-2 text-muted">
                            <strong>{step.fromName} → {step.toName}</strong>: <span className="text-dark">{step.event.description}</span>{' '}
                            <span className={step.event.effect > 0 ? 'text-success fw-bold' : step.event.effect < 0 ? 'text-danger fw-bold' : 'text-muted'}>
                              ({step.event.effect >= 0 ? '+' : ''}{step.event.effect} coins)
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                <div className="d-flex gap-3 mt-4">
                  <Button variant="primary" size="lg" className="w-50 py-3 text-uppercase" onClick={startNewGame}>
                    Play again
                  </Button>
                  <Button variant="outline-primary" size="lg" className="w-50 py-3 text-uppercase" onClick={() => navigate('/leaderboard')}>
                    Leaderboard
                  </Button>
                </div>
              </div>
            </div>
          </Col>
        </Row>
      )}
    </div>
  );
}

const VISUAL_COORDS = {
  'Stazione Ovest': { x: 85, y: 85, labelPos: 'top' },
  'Centrale': { x: 255, y: 85, labelPos: 'top' },
  'Porta Velaria': { x: 425, y: 85, labelPos: 'top' },
  'Crocevia del Falco': { x: 595, y: 85, labelPos: 'top' },
  'Piazza delle Lanterne': { x: 765, y: 85, labelPos: 'top' },
  'Parco dei Pini': { x: 935, y: 85, labelPos: 'top' },
  'Fontana Oscura': { x: 340, y: 170, labelPos: 'left' },
  'Torre Cinerea': { x: 510, y: 170, labelPos: 'top' },
  "Campo dell'Eco": { x: 680, y: 170, labelPos: 'top' },
  'Belvedere': { x: 765, y: 170, labelPos: 'top' },
  'Mercato Antico': { x: 850, y: 170, labelPos: 'top' },
  'Borgo Sereno': { x: 425, y: 255, labelPos: 'bottom' },
  'Viale dei Mosaici': { x: 595, y: 255, labelPos: 'bottom' },
  'Lago Sotterraneo': { x: 765, y: 255, labelPos: 'bottom' }
};

const getSegmentPath = (a, b) => {
  const aName = a.name;
  const bName = b.name;

  // Route Piazza delle Lanterne - Torre Cinerea via (595, 85)
  if (
    (aName === 'Piazza delle Lanterne' && bName === 'Torre Cinerea') ||
    (aName === 'Torre Cinerea' && bName === 'Piazza delle Lanterne')
  ) {
    const start = aName === 'Piazza delle Lanterne' ? a : b;
    const end = aName === 'Piazza delle Lanterne' ? b : a;
    return [
      { x: start.mapX, y: start.mapY },
      { x: 595, y: 85 },
      { x: end.mapX, y: end.mapY }
    ];
  }

  return [
    { x: a.mapX, y: a.mapY },
    { x: b.mapX, y: b.mapY }
  ];
};

function drawRoutedPath(a, b, props) {
  const path = getSegmentPath(a, b);
  const isReversed = path[0].x !== a.mapX || path[0].y !== a.mapY;
  const orderedPath = isReversed ? [...path].reverse() : path;

  const d = orderedPath.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <path
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

function renderStationLabel(s, isCurrent, isStart, isDest, isInterchange) {
  const vc = VISUAL_COORDS[s.name];
  const pos = vc?.labelPos || 'top';

  let lines = [s.name];
  if (s.name.length > 12 && s.name.includes(' ')) {
    if (s.name === 'Stazione Ovest') lines = ['Stazione', 'Ovest'];
    else if (s.name === 'Piazza delle Lanterne') lines = ['Piazza delle', 'Lanterne'];
    else if (s.name === 'Lago Sotterraneo') lines = ['Lago', 'Sotterraneo'];
    else if (s.name === 'Fontana Oscura') lines = ['Fontana', 'Oscura'];
    else if (s.name === 'Crocevia del Falco') lines = ['Crocevia', 'del Falco'];
    else if (s.name === 'Mercato Antico') lines = ['Mercato', 'Antico'];
    else if (s.name === 'Viale dei Mosaici') lines = ['Viale dei', 'Mosaici'];
    else if (s.name === 'Torre Cinerea') lines = ['Torre', 'Cinerea'];
    else if (s.name === "Campo dell'Eco") lines = ["Campo", "dell'Eco"];
    else if (s.name === 'Parco dei Pini') lines = ['Parco dei', 'Pini'];
    else if (s.name === 'Porta Velaria') lines = ['Porta', 'Velaria'];
  }

  let prefix = '';
  if (isCurrent) prefix += '📍 ';
  if (isStart) prefix += '🏁 ';
  if (isDest) prefix += '🏆 ';

  let x = s.mapX;
  let y = s.mapY;
  let textAnchor = 'middle';

  if (pos === 'top') {
    textAnchor = 'middle';
    y = s.mapY - 14 - (lines.length - 1) * 10;
  } else if (pos === 'bottom') {
    textAnchor = 'middle';
    y = s.mapY + 18;
  } else if (pos === 'left') {
    textAnchor = 'end';
    x = s.mapX - 14;
    y = s.mapY + (lines.length === 1 ? 3 : -1);
  } else if (pos === 'right') {
    textAnchor = 'start';
    x = s.mapX + 14;
    y = s.mapY + (lines.length === 1 ? 3 : -1);
  }

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      fontSize="9.5"
      fill="var(--map-station-text)"
      fontWeight={isCurrent || isStart || isDest ? '600' : '400'}
      style={{
        paintOrder: 'stroke',
        stroke: 'var(--map-station-text-shadow)',
        strokeWidth: 2,
        strokeLinejoin: 'round',
        fontFamily: '"Inter", "Manrope", sans-serif',
        userSelect: 'none'
      }}
    >
      {lines.map((lineText, idx) => (
        <tspan
          key={idx}
          x={x}
          dy={idx === 0 ? '0em' : '1.2em'}
        >
          {idx === 0 ? prefix + lineText : lineText}
          {idx === lines.length - 1 && isInterchange ? ' 🔄' : ''}
        </tspan>
      ))}
    </text>
  );
}

function NetworkMap({
  stations,
  lines,
  lineStations,
  segments,
  showLines = true,
  highlightStationIds = [],
  interchanges = [],
  onStationClick,
  currentStationId = null,
  selectedRoute = [],
  isSetupMap = false
}) {
  const mappedStations = stations.map(s => {
    const vc = VISUAL_COORDS[s.name];
    if (vc) {
      return { ...s, mapX: vc.x, mapY: vc.y };
    }
    return { ...s, mapX: s.mapX ?? s.map_x, mapY: s.mapY ?? s.map_y };
  });

  const stationById = Object.fromEntries(mappedStations.map((s) => [s.id, s]));
  const highlight = new Set(highlightStationIds);
  const interchangeSet = new Set(interchanges);

  const linePaths = (lines || []).map((line) => {
    const ordered = (lineStations || [])
      .filter((ls) => ls.line_id === line.id)
      .sort((a, b) => a.position - b.position);

    const stationsList = ordered.map((ls) => stationById[ls.station_id]).filter(Boolean);
    let pathPoints = [];
    for (let i = 0; i < stationsList.length; i++) {
      if (i === 0) {
        pathPoints.push({ x: stationsList[0].mapX, y: stationsList[0].mapY });
      } else {
        const segPath = getSegmentPath(stationsList[i - 1], stationsList[i]);
        const isReversed = segPath[0].x !== stationsList[i - 1].mapX || segPath[0].y !== stationsList[i - 1].mapY;
        const orderedPath = isReversed ? [...segPath].reverse() : segPath;
        for (let j = 1; j < orderedPath.length; j++) {
          pathPoints.push(orderedPath[j]);
        }
      }
    }

    const points = pathPoints.map((p) => `${p.x},${p.y}`).join(' ');
    return { line, points };
  });

  const startStationId = highlightStationIds[0];
  const destStationId = highlightStationIds[1];

  const drawnEdges = new Set();
  const edgeElements = showLines
    ? (segments || []).map((seg, idx) => {
      const aId = seg.stationAId ?? seg.a_id;
      const bId = seg.stationBId ?? seg.b_id;
      const key = segmentKey(aId, bId);
      if (drawnEdges.has(key)) return null;
      drawnEdges.add(key);

      const a = stationById[aId];
      const b = stationById[bId];
      if (!a || !b) return null;

      const line = (lines || []).find((l) => l.id === seg.lineId);

      return (
        <g key={`edge-group-${key}-${idx}`}>
          {drawRoutedPath(a, b, {
            stroke: getNeonColor(line?.color || '#888'),
            strokeWidth: 5,
            opacity: 0.85
          })}
        </g>
      );
    })
    : [];

  const selectedEdges = (selectedRoute || []).map((seg, idx) => {
    const a = stationById[seg.stationAId];
    const b = stationById[seg.stationBId];
    if (!a || !b) return null;
    return (
      <g key={`selected-edge-${idx}`}>
        {drawRoutedPath(a, b, {
          stroke: seg.connected === false ? "var(--accent-rose)" : "var(--accent-emerald)",
          strokeWidth: 7,
          opacity: 0.9
        })}
      </g>
    );
  });

  const xCoords = mappedStations.map(s => s.mapX).filter((x) => x !== undefined);
  const yCoords = mappedStations.map(s => s.mapY).filter((y) => y !== undefined);

  let viewBoxStr = `0 0 ${WIDTH} ${HEIGHT}`;
  if (xCoords.length > 0 && yCoords.length > 0) {
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);
    const paddingX = isSetupMap ? 30 : 70;
    const paddingY = isSetupMap ? 35 : 70;
    const vx = minX - paddingX;
    const vy = minY - paddingY;
    const vw = (maxX - minX) + 2 * paddingX;
    const vh = (maxY - minY) + 2 * paddingY;
    viewBoxStr = `${vx} ${vy} ${vw} ${vh}`;
  }

  return (
    <svg
      viewBox={viewBoxStr}
      className="network-map w-100"
      role="img"
      aria-label="Metro network map"
    >
      {showLines &&
        linePaths.map(
          ({ line, points }) =>
            points && (
              <polyline
                key={`poly-${line.id}`}
                points={points}
                fill="none"
                stroke={getNeonColor(line.color)}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
              />
            )
        )}
      {edgeElements}
      {selectedEdges}
      {mappedStations.map((s) => {
        const isCurrent = s.id === currentStationId;
        const isHighlight = highlight.has(s.id);
        const isInterchange = interchangeSet.has(s.id);
        const isStart = s.id === startStationId;
        const isDest = s.id === destStationId;

        let fillColor = 'var(--map-station-bg)';
        if (isCurrent) fillColor = '#06b6d4'; // Cyan neon
        else if (isStart) fillColor = '#10b981'; // Emerald neon
        else if (isDest) fillColor = '#f43f5e'; // Rose neon
        else if (isInterchange) fillColor = '#f59e0b'; // Amber neon

        const radius = isCurrent || isStart || isDest ? 12 : (isInterchange ? 9.5 : 8);
        const titleText = `${s.name}${isInterchange ? ' (Interchange Station)' : ''}${isStart ? ' (Start)' : ''}${isDest ? ' (Destination)' : ''}${isCurrent ? ' (Your Location)' : ''}`;

        return (
          <g
            key={s.id}
            onClick={() => onStationClick && onStationClick(s.id)}
            style={{ cursor: onStationClick ? 'pointer' : 'default' }}
          >
            <circle
              cx={s.mapX}
              cy={s.mapY}
              r={radius}
              fill={fillColor}
              stroke="var(--map-station-stroke)"
              strokeWidth={2}
            >
              <title>{titleText}</title>
            </circle>
            {renderStationLabel(s, isCurrent, isStart, isDest, isInterchange)}
          </g>
        );
      })}
    </svg>
  );
}

function SegmentPicker({
  segmentPairs,
  stationNames,
  selectedRoute,
  onSelectSegment,
  onRemoveLast,
  disabled,
  currentStationId,
}) {
  const usedKeys = new Set(
    selectedRoute.map((s) => segmentKey(s.stationAId, s.stationBId))
  );

  return (
    <div className="segment-picker">
      <h5>All network segments</h5>
      <p className="text-muted small">
        Click segments in order to build your route. Each segment can be used once and must be selected in sequence.
      </p>
      <div className="selected-route mb-3">
        <strong>Your route ({selectedRoute.length} segments):</strong>
        {selectedRoute.length === 0 ? (
          <span className="text-muted ms-2">None selected</span>
        ) : (
          <ol className="mb-0 mt-1">
            {selectedRoute.map((seg, i) => (
              <li key={i} className={seg.connected === false ? 'text-danger fw-bold' : ''}>
                {stationNames[seg.stationAId]} — {stationNames[seg.stationBId]}
                {seg.connected === false && <span className="ms-2 badge bg-danger">Disconnected</span>}
              </li>
            ))}
          </ol>
        )}
        {selectedRoute.length > 0 && !disabled && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary mt-2"
            onClick={onRemoveLast}
          >
            Undo last segment
          </button>
        )}
      </div>
      <div className="segment-list border rounded p-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {segmentPairs.map((pair) => {
          const key = segmentKey(pair.stationAId, pair.stationBId);
          const used = usedKeys.has(key);
          const isConnectable = pair.stationAId === currentStationId || pair.stationBId === currentStationId;
          const label = `${stationNames[pair.stationAId]} — ${stationNames[pair.stationBId]}`;

          let btnClass = 'btn-outline-primary';
          if (used) {
            btnClass = 'btn-secondary disabled';
          } else if (!isConnectable) {
            btnClass = 'btn-outline-secondary opacity-50';
          }

          return (
            <button
              key={key}
              type="button"
              className={`btn btn-sm w-100 text-start mb-1 ${btnClass}`}
              disabled={disabled || used || !isConnectable}
              onClick={() => onSelectSegment(pair)}
            >
              {label} {!used && isConnectable && '👉 Next'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
