import { useEffect, useRef, useState, useCallback } from 'react';
import { GameController, Screen } from './game/gameController';
import type { MatchMode, MatchResult, GameSettings } from './core/types';
import { MAP_WIDTH, MAP_HEIGHT } from './core/constants';
import { RECIPES, getSpell, getRecipe, getHerb, HERBS } from './core/simulation';

// Стили
const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .game-root { width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0d0d1a; color: #eee; font-family: 'Segoe UI', sans-serif; overflow: hidden; position: relative; }
  .game-container { position: relative; width: 100%; max-width: 1024px; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }
  .hud { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 10; }
  .hud-top { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 16px; }
  .hp-bar-container { width: 200px; }
  .hp-bar-label { font-size: 11px; margin-bottom: 2px; text-shadow: 1px 1px 2px #000; }
  .hp-bar { height: 16px; background: #333; border-radius: 8px; overflow: hidden; border: 1px solid #555; }
  .hp-bar-fill { height: 100%; transition: width 0.3s ease; border-radius: 8px; }
  .hp-bar-fill.player { background: linear-gradient(90deg, #4488ff, #66aaff); }
  .hp-bar-fill.enemy { background: linear-gradient(270deg, #ff4444, #ff6666); }
  .timer { font-size: 24px; font-weight: bold; text-shadow: 2px 2px 4px #000; text-align: center; min-width: 80px; }
  .hud-bottom { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-end; padding: 8px 16px; }
  .spell-bar { display: flex; gap: 6px; }
  .spell-slot { width: 48px; height: 48px; background: rgba(0,0,0,0.7); border: 2px solid #555; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10px; position: relative; }
  .spell-slot.active { border-color: #ffcc00; box-shadow: 0 0 8px rgba(255,204,0,0.5); }
  .spell-slot.empty { opacity: 0.4; }
  .spell-slot .charges { font-size: 14px; font-weight: bold; }
  .spell-slot .spell-icon { width: 20px; height: 20px; border-radius: 50%; margin-bottom: 2px; }
  .spell-slot .cd-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
  .herb-panel { display: flex; gap: 8px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 8px; }
  .herb-item { display: flex; align-items: center; gap: 4px; font-size: 13px; }
  .herb-dot { width: 12px; height: 12px; border-radius: 50%; }
  .controls-hint { font-size: 10px; color: #888; text-align: center; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); }
  .shield-indicator { position: absolute; top: 60px; left: 16px; font-size: 12px; color: #ffcc00; text-shadow: 1px 1px 2px #000; }
  /* Меню */
  .menu-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 100; pointer-events: all; }
  .menu-title { font-size: 48px; font-weight: bold; margin-bottom: 32px; text-shadow: 0 0 20px rgba(100,150,255,0.5); }
  .menu-btn { display: block; width: 260px; padding: 12px 24px; margin: 8px 0; font-size: 18px; background: #2a2a4a; border: 2px solid #4a4a7a; border-radius: 8px; color: #eee; cursor: pointer; text-align: center; transition: all 0.2s; }
  .menu-btn:hover, .menu-btn.focused { background: #3a3a6a; border-color: #6a6aaa; transform: scale(1.02); }
  .menu-btn.selected { background: #4a4a8a; border-color: #ffcc00; }
  .menu-row { display: flex; align-items: center; gap: 12px; margin: 8px 0; font-size: 16px; }
  .menu-row label { min-width: 120px; text-align: right; }
  .menu-row .value { color: #ffcc00; min-width: 80px; text-align: center; }
  /* Результат */
  .result-title { font-size: 56px; font-weight: bold; margin-bottom: 16px; }
  .result-title.win { color: #44ff44; }
  .result-title.lose { color: #ff4444; }
  .result-title.draw { color: #ffcc00; }
  .result-stats { font-size: 14px; margin-bottom: 24px; color: #aaa; }
  /* Крафт выбор */
  .craft-choice { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(20,20,40,0.95); border: 2px solid #6a6aaa; border-radius: 12px; padding: 24px; z-index: 100; pointer-events: all; }
  .craft-choice h3 { margin-bottom: 16px; text-align: center; font-size: 18px; }
  .craft-options { display: flex; gap: 12px; margin-bottom: 16px; }
  .craft-option { padding: 12px 16px; background: #2a2a4a; border: 2px solid #4a4a7a; border-radius: 8px; cursor: pointer; text-align: center; min-width: 100px; }
  .craft-option.selected { border-color: #ffcc00; background: #3a3a6a; }
  .craft-cancel { display: block; margin: 0 auto; padding: 8px 24px; background: #4a2a2a; border: 1px solid #6a4a4a; border-radius: 6px; color: #eee; cursor: pointer; }
  /* Настройки */
  .settings-panel { background: rgba(20,20,40,0.95); border: 2px solid #4a4a7a; border-radius: 12px; padding: 24px; min-width: 320px; }
  .settings-panel h3 { margin-bottom: 16px; text-align: center; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; margin: 12px 0; }
  .setting-row label { font-size: 14px; }
  .setting-row input[type="range"] { width: 120px; }
  .setting-row input[type="checkbox"] { width: 18px; height: 18px; }
`;

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameController | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [playerHp, setPlayerHp] = useState(100);
  const [enemyHp, setEnemyHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [slots, setSlots] = useState<(null | { spellId: string; charges: number })[]>([null, null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [herbs, setHerbs] = useState<Record<string, number>>({ fire: 0, moon: 0, stone: 0 });
  const [timeLeft, setTimeLeft] = useState(120);
  const [matchMode, setMatchMode] = useState<MatchMode>('timed');
  const [duration, setDuration] = useState(120);
  const [craftProgress, setCraftProgress] = useState<{ progress: number; duration: number } | null>(null);
  const [craftChoice, setCraftChoice] = useState<{ options: string[]; selected: number } | null>(null);
  const [result, setResult] = useState<{ result: MatchResult; stats: { hp: number; damage: number; herbs: number }[] } | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [gcd, setGcd] = useState(0);
  const [shieldTime, setShieldTime] = useState(0);
  const [settings, setSettings] = useState<GameSettings>({ volume: 0.5, screenShake: true, debugGrid: false, stickDeadzone: 0.3 });
  const [menuFocus, setMenuFocus] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const initGame = useCallback(() => {
    if (!containerRef.current || gameRef.current) return;
    const gc = new GameController(containerRef.current, {
      onScreenChange: (s) => { setScreen(s); },
      onHpChange: (id, hp, mhp) => { if (id === 0) setPlayerHp(hp); else setEnemyHp(hp); setMaxHp(mhp); },
      onSlotsChange: (s, a) => { setSlots(s); setActiveSlot(a); },
      onHerbsChange: (h) => setHerbs(h),
      onTimerChange: (t, m) => { setTimeLeft(t); setMatchMode(m); },
      onCraftProgress: (p, d) => { if (p === 0 && d === 0) setCraftProgress(null); else setCraftProgress({ progress: p, duration: d }); },
      onCraftChoice: (opts, sel) => setCraftChoice({ options: opts, selected: sel }),
      onResult: (r, s) => { setResult({ result: r, stats: s }); setScreen('result'); },
      onCooldownChange: (c, g) => { setCooldowns(c); setGcd(g); },
      onShieldChange: (st) => setShieldTime(st),
    });
    gameRef.current = gc;
  }, []);

  useEffect(() => {
    initGame();
    return () => { gameRef.current?.destroy(); gameRef.current = null; };
  }, [initGame]);

  // Keyboard handler for menus
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (screen === 'menu' && !showSettings && !showControls) {
        const items = 5; // start, mode, duration, settings, controls
        if (e.key === 'ArrowUp' || e.key === 'w') { setMenuFocus(f => (f - 1 + items) % items); e.preventDefault(); }
        if (e.key === 'ArrowDown' || e.key === 's') { setMenuFocus(f => (f + 1) % items); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'a') {
          if (menuFocus === 1) { setMatchMode(m => m === 'timed' ? 'deathmatch' : 'timed'); }
          if (menuFocus === 2) {
            const durations = [60, 120, 300, Infinity];
            const idx = durations.indexOf(duration);
            setDuration(durations[(idx - 1 + durations.length) % durations.length]);
          }
          e.preventDefault();
        }
        if (e.key === 'ArrowRight' || e.key === 'd') {
          if (menuFocus === 1) { setMatchMode(m => m === 'timed' ? 'deathmatch' : 'timed'); }
          if (menuFocus === 2) {
            const durations = [60, 120, 300, Infinity];
            const idx = durations.indexOf(duration);
            setDuration(durations[(idx + 1) % durations.length]);
          }
          e.preventDefault();
        }
        if (e.key === 'Enter') {
          if (menuFocus === 0) startGame();
          if (menuFocus === 3) setShowSettings(true);
          if (menuFocus === 4) setShowControls(true);
          e.preventDefault();
        }
      }
      if (screen === 'paused') {
        if (e.key === 'Escape' || e.key === 'Enter') { gameRef.current?.resume(); e.preventDefault(); }
      }
      if (showSettings) {
        if (e.key === 'Escape') setShowSettings(false);
      }
      if (showControls) {
        if (e.key === 'Escape') setShowControls(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [screen, menuFocus, showSettings, showControls, duration, matchMode]);

  const startGame = () => {
    if (!gameRef.current) initGame();
    if (gameRef.current) {
      gameRef.current.setMode(matchMode);
      gameRef.current.setDuration(duration);
      gameRef.current.startMatch();
      setScreen('playing');
    }
  };

  const formatTime = (t: number): string => {
    if (t === Infinity || !isFinite(t)) return '∞';
    const m = Math.floor(Math.max(0, t) / 60);
    const s = Math.floor(Math.max(0, t) % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getSpellColor = (spellId: string): string => {
    const spell = getSpell(spellId);
    return spell ? spell.color : '#888';
  };

  const getSpellName = (spellId: string): string => {
    const spell = getSpell(spellId);
    return spell ? spell.displayName : '?';
  };

  const getRecipeName = (recipeId: string): string => {
    const recipe = getRecipe(recipeId);
    if (!recipe) return recipeId;
    const spell = getSpell(recipe.resultSpell);
    return spell ? spell.displayName : recipeId;
  };

  return (
    <div className="game-root">
      <style>{styles}</style>

      {/* Game container */}
      <div className="game-container" ref={containerRef}>
        {/* HUD overlay */}
        {screen === 'playing' && (
          <div className="hud">
            <div className="hud-top">
              <div className="hp-bar-container">
                <div className="hp-bar-label">ВЫ</div>
                <div className="hp-bar">
                  <div className="hp-bar-fill player" style={{ width: `${(playerHp / maxHp) * 100}%` }} />
                </div>
              </div>
              <div className="timer">{formatTime(timeLeft)}</div>
              <div className="hp-bar-container" style={{ textAlign: 'right' }}>
                <div className="hp-bar-label">ПРОТИВНИК</div>
                <div className="hp-bar">
                  <div className="hp-bar-fill enemy" style={{ width: `${(enemyHp / maxHp) * 100}%`, marginLeft: 'auto' }} />
                </div>
              </div>
            </div>

            {shieldTime > 0 && (
              <div className="shield-indicator">🛡 Щит: {shieldTime.toFixed(1)}с</div>
            )}

            <div className="hud-bottom">
              <div>
                <div className="spell-bar">
                  {slots.map((slot, i) => {
                    const isActive = i === activeSlot;
                    const spell = slot ? getSpell(slot.spellId) : null;
                    const cd = spell ? (cooldowns[spell.id] || 0) : 0;
                    const onGcd = gcd > 0 && isActive;
                    return (
                      <div key={i} className={`spell-slot ${isActive ? 'active' : ''} ${!slot ? 'empty' : ''}`}>
                        {slot && spell ? (
                          <>
                            <div className="spell-icon" style={{ background: spell.color }} />
                            <div className="charges">{slot.charges}</div>
                            {(cd > 0 || onGcd) && <div className="cd-overlay">{Math.max(cd, gcd).toFixed(1)}</div>}
                          </>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#666' }}>—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>Q/E — слоты</div>
              </div>

              <div className="herb-panel">
                {HERBS.map(h => (
                  <div key={h.id} className="herb-item">
                    <div className="herb-dot" style={{ background: h.color }} />
                    <span>×{herbs[h.id] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="controls-hint">F — варить у котла | Space — каст | Esc — пауза</div>
          </div>
        )}

        {/* Craft progress */}
        {screen === 'playing' && craftProgress && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.7)', padding: '8px 16px', borderRadius: '8px', pointerEvents: 'none' }}>
            <div style={{ fontSize: '12px', marginBottom: '4px', textAlign: 'center' }}>Варка...</div>
            <div style={{ width: '120px', height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${(craftProgress.progress / craftProgress.duration) * 100}%`, height: '100%', background: '#ffaa00', transition: 'width 0.1s' }} />
            </div>
          </div>
        )}

        {/* Craft choice dialog */}
        {screen === 'playing' && craftChoice && (
          <div className="craft-choice">
            <h3>{craftChoice.options[0] && getRecipe(craftChoice.options[0]) ? 'Выберите рецепт:' : 'Заменить слот?'}</h3>
            <div className="craft-options">
              {craftChoice.options.map((opt, i) => {
                const recipe = getRecipe(opt);
                const isSlotChoice = !recipe;
                return (
                  <div key={i} className={`craft-option ${i === craftChoice.selected ? 'selected' : ''}`}
                    onClick={() => gameRef.current?.handleCraftChoice(i)}>
                    {recipe ? (
                      <>
                        <div>{getSpell(recipe.resultSpell)?.displayName || opt}</div>
                        <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px' }}>
                          {recipe.ingredients.map(ing => `${getHerb(ing.herb)?.displayName || ing.herb} ×${ing.amount}`).join(', ')}
                        </div>
                      </>
                    ) : (
                      <div>{opt === `empty(${i})` ? `Пусто (${i + 1})` : getSpell(opt.split('(')[0])?.displayName || opt}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="craft-cancel" onClick={() => gameRef.current?.handleCraftChoice(-1)}>Отменить</button>
          </div>
        )}

        {/* Main menu */}
        {screen === 'menu' && !showSettings && !showControls && (
          <div className="menu-overlay">
            <div className="menu-title">🧙 Волшебники</div>
            <button className={`menu-btn ${menuFocus === 0 ? 'focused' : ''}`} onClick={startGame}>
              ⚔️ Начать бой
            </button>
            <div className="menu-row">
              <label>Режим:</label>
              <button className={`menu-btn ${menuFocus === 1 ? 'focused' : ''}`} style={{ width: '140px', display: 'inline-block' }}
                onClick={() => setMatchMode(m => m === 'timed' ? 'deathmatch' : 'timed')}>
                {matchMode === 'timed' ? 'На время' : 'Насмерть'}
              </button>
            </div>
            <div className="menu-row">
              <label>Время:</label>
              <button className={`menu-btn ${menuFocus === 2 ? 'focused' : ''}`} style={{ width: '100px', display: 'inline-block', opacity: matchMode === 'deathmatch' ? 0.4 : 1 }}
                onClick={() => {
                  if (matchMode !== 'timed') return;
                  const durations = [60, 120, 300, Infinity];
                  const idx = durations.indexOf(duration);
                  setDuration(durations[(idx + 1) % durations.length]);
                }}>
                {matchMode === 'deathmatch' ? '∞' : formatTime(duration)}
              </button>
            </div>
            <button className={`menu-btn ${menuFocus === 3 ? 'focused' : ''}`} onClick={() => setShowSettings(true)}>
              ⚙️ Настройки
            </button>
            <button className={`menu-btn ${menuFocus === 4 ? 'focused' : ''}`} onClick={() => setShowControls(true)}>
              🎮 Управление
            </button>
          </div>
        )}

        {/* Settings */}
        {showSettings && (
          <div className="menu-overlay">
            <div className="settings-panel">
              <h3>Настройки</h3>
              <div className="setting-row">
                <label>Громкость</label>
                <input type="range" min="0" max="1" step="0.1" value={settings.volume}
                  onChange={(e) => { const v = parseFloat(e.target.value); setSettings(s => ({ ...s, volume: v })); gameRef.current?.setSetting('volume', v); }} />
              </div>
              <div className="setting-row">
                <label>Тряска экрана</label>
                <input type="checkbox" checked={settings.screenShake}
                  onChange={(e) => setSettings(s => ({ ...s, screenShake: e.target.checked }))} />
              </div>
              <div className="setting-row">
                <label>Отладочная сетка</label>
                <input type="checkbox" checked={settings.debugGrid}
                  onChange={(e) => { const v = e.target.checked; setSettings(s => ({ ...s, debugGrid: v })); gameRef.current?.setSetting('debugGrid', v); }} />
              </div>
              <div className="setting-row">
                <label>Мёртвая зона стика</label>
                <input type="range" min="0.1" max="0.5" step="0.05" value={settings.stickDeadzone}
                  onChange={(e) => { const v = parseFloat(e.target.value); setSettings(s => ({ ...s, stickDeadzone: v })); gameRef.current?.setSetting('stickDeadzone', v); }} />
              </div>
              <button className="menu-btn" style={{ marginTop: '16px' }} onClick={() => setShowSettings(false)}>Назад (Esc)</button>
            </div>
          </div>
        )}

        {/* Controls info */}
        {showControls && (
          <div className="menu-overlay">
            <div className="settings-panel" style={{ minWidth: '400px' }}>
              <h3>Управление</h3>
              <div style={{ fontSize: '13px', lineHeight: '2' }}>
                <div><b>Клавиатура:</b></div>
                <div>WASD / Стрелки — движение</div>
                <div>Space — каст заклинания</div>
                <div>F — варить у котла / отмена</div>
                <div>Q / E — предыдущий / следующий слот</div>
                <div>1 / 2 / 3 — прямой выбор слота</div>
                <div>Esc — пауза</div>
                <div>F3 — отладочная сетка</div>
                <div style={{ marginTop: '12px' }}><b>Геймпад:</b></div>
                <div>Левый стик / D-Pad — движение</div>
                <div>A — каст / подтвердить</div>
                <div>X — варить</div>
                <div>LB / RB — слоты</div>
                <div>Start — пауза</div>
                <div>B — назад</div>
              </div>
              <button className="menu-btn" style={{ marginTop: '16px' }} onClick={() => setShowControls(false)}>Назад (Esc)</button>
            </div>
          </div>
        )}

        {/* Pause menu */}
        {screen === 'paused' && (
          <div className="menu-overlay">
            <div className="menu-title" style={{ fontSize: '36px' }}>⏸ Пауза</div>
            <button className="menu-btn" onClick={() => gameRef.current?.resume()}>▶ Продолжить</button>
            <button className="menu-btn" onClick={() => gameRef.current?.restart()}>🔄 Начать заново</button>
            <button className="menu-btn" onClick={() => { setShowSettings(true); }}>⚙️ Настройки</button>
            <button className="menu-btn" onClick={() => gameRef.current?.goToMenu()}>🏠 В главное меню</button>
          </div>
        )}

        {/* Result screen */}
        {screen === 'result' && result && (
          <div className="menu-overlay">
            <div className={`result-title ${result.result}`}>
              {result.result === 'win' ? '🏆 Победа!' : result.result === 'lose' ? '💀 Поражение' : '🤝 Ничья'}
            </div>
            <div className="result-stats">
              <div>Ваше HP: {result.stats[0].hp} | Урон: {result.stats[0].damage} | Травы: {result.stats[0].herbs}</div>
              <div style={{ marginTop: '8px' }}>Противник HP: {result.stats[1].hp} | Урон: {result.stats[1].damage} | Травы: {result.stats[1].herbs}</div>
            </div>
            <button className="menu-btn" onClick={() => { setResult(null); gameRef.current?.restart(); }}>🔄 Повторить</button>
            <button className="menu-btn" onClick={() => { setResult(null); gameRef.current?.goToMenu(); }}>🏠 В главное меню</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
