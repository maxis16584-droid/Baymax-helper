// Background cover + horizontal lanes demo
// Loads bg_full.png and scales it to cover the game canvas without distorting aspect ratio.

const GAME_WIDTH = window.innerWidth;
const GAME_HEIGHT = window.innerHeight;

const LANE_OFFSET = 70; // vertical spacing between lanes (distance between lane centers)
const LANE_BOTTOM_OFFSET = 100; // distance from bottom of canvas to the bottom-most lane center
const PLAYER_X_OFFSET = 280; // how much to shift the player left from horizontal center
const PLAYER_SCALE = 0.6; // nominal scale factor used to compute display width
const OBSTACLE_Y_OFFSET = 30; // how much to push obstacles downward so they align with player (moved down a bit)
const BG_SCROLL_SPEED = 0.7; // base background scroll multiplier
const BOOST_BG_SPEED = 1.2; // boosted background scroll multiplier (when holding Space)
let currentBgSpeed = BG_SCROLL_SPEED;

const LANES = []; // will hold Y coordinates [top, center, bottom]

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: { preload, create, update }
};

new Phaser.Game(config);

function preload() {
  this.load.image('bg', 'bg_full.png');
  // Load rider sprite sheet. Using run.png from assets as the rider animation.
  // If your sheet has different frame sizes, change frameWidth/frameHeight below.
  // Load the rider graphic as a plain image for a static player sprite.
  // Using the full `run.png` as a static image avoids sprite-sheet frame issues.
  this.load.image('ride_img', 'run.png');
  this.load.image('speed_img', 'speed.png');
  this.load.image('crash_img', 'crash.png');
  // Obstacle
  this.load.image('cone', 'cone.png');
  this.load.image('cone2', 'cone 2.png');
  this.load.image('cone3', 'cone 3.png');
  this.load.image('police', 'police.png');
  this.load.image('police2', 'police 2.png');
  this.load.image('cat', 'cat.png');
  this.load.image('cat2', 'cat 2.png');
  // point collectible (gives a point when hit)
  this.load.image('point', 'point.png');
}

function create() {
  // Pixel-perfect
  this.game.renderer.canvas.style.imageRendering = 'pixelated';
  // Add background texture and layout (computed in recalcLayout)
  this.bg = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'bg').setOrigin(0, 0);

  // initial layout calc
  recalcLayout.call(this);

  // Recalc on resize
  this.scale.on('resize', () => recalcLayout.call(this));

  // Compute lane Y positions anchored to the bottom of the canvas.
  // This places all lanes near the lower part of the background (useful for road near bottom).
  const bottomY = GAME_HEIGHT - LANE_BOTTOM_OFFSET;
  // Bottom-most lane is at bottomY, center lane is above by LANE_OFFSET, top lane is above by 2 * LANE_OFFSET
  LANES[2] = bottomY;                    // bottom lane (index 2)
  LANES[1] = bottomY - LANE_OFFSET;      // center lane (index 1)
  LANES[0] = bottomY - LANE_OFFSET * 2;  // top lane (index 0)
  console.log('LANES (Y):', LANES);

  // (Removed debug lane lines as requested)

  // Test marker: rectangle centered horizontally, start at bottom lane so you can move up
  // Player sprite: use the 'ride' spritesheet as the player placeholder
  // Position: shifted left from center by PLAYER_X_OFFSET, start at center lane per requirement
  const playerX = (GAME_WIDTH / 2) - PLAYER_X_OFFSET;
  // Create a static player sprite from the loaded image and scale it to match desired display width.
  const rideSrc = this.textures.get('ride_img').getSourceImage();
  const speedSrc = this.textures.get('speed_img').getSourceImage();
  const desiredWidth = rideSrc.width * PLAYER_SCALE; // desired display width
  const rideScale = desiredWidth / rideSrc.width; // equals PLAYER_SCALE
  const speedScale = desiredWidth / speedSrc.width; // scale to make speed image match same display width

  // store scales on scene for reuse
  this.rideScale = rideScale;
  this.speedScale = speedScale;

  // Create player as a physics-enabled sprite so we can check overlap with obstacles
  this.player = this.physics.add.sprite(playerX, LANES[1], 'ride_img').setOrigin(0.5);
  this.player.setScale(rideScale);
  this.player.body.setAllowGravity(false);
  this.player.setDepth(5);
  console.log('Player created at x=', playerX, 'y=', LANES[1], 'displayWidth=', desiredWidth);

  // Speed mode state
  this.isSpeedActive = false;

  // Obstacles group: cones
  this.obstacles = this.physics.add.group();
  this.nextSpawn = 0;
  this.spawnIntervalMin = 600;
  this.spawnIntervalMax = 1000; // ms between cones (adjustable)

  // collision detection between player and obstacles
  this.physics.add.overlap(this.player, this.obstacles, onPlayerHit, null, this);

  // Spacebar: press-and-hold speed mode. Keydown activates; keyup deactivates.
  // Speed: use Shift key to hold boost
  // Use arrow Up/Down for lane control and X for speed hold
  this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

  // Speed: press-and-hold X
  this.keyX.on('down', () => {
    if (this.isGameOver) return;
    if (this.isSpeedActive) return;
    this.isSpeedActive = true;
    currentBgSpeed = BOOST_BG_SPEED;
    this.player.setTexture('speed_img');
    this.player.setScale(this.speedScale);
    // update physics body to match new display size
    if (this.player && this.player.body) {
      const pw = this.player.displayWidth;
      const ph = this.player.displayHeight;
      this.player.body.setSize(pw * 0.9, ph * 0.9);
      this.player.body.setOffset((pw - pw * 0.9) / 2, (ph - ph * 0.9) / 2);
    }
    console.log('Speed HOLD activated (X)');
  });

  this.keyX.on('up', () => {
    if (!this.isSpeedActive) return;
    if (this.isGameOver) return;
    this.isSpeedActive = false;
    currentBgSpeed = BG_SCROLL_SPEED;
    this.player.setTexture('ride_img');
    this.player.setScale(this.rideScale);
    // update physics body to match reverted display size
    if (this.player && this.player.body) {
      const pw = this.player.displayWidth;
      const ph = this.player.displayHeight;
      this.player.body.setSize(pw * 0.9, ph * 0.9);
      this.player.body.setOffset((pw - pw * 0.9) / 2, (ph - ph * 0.9) / 2);
    }
    console.log('Speed HOLD released (X)');
  });

  // Score (green text with white rounded border)
  this.score = 0;
  const pad = 10;
  const scoreText = this.add.text(0, 0, 'Score: 0', { font: '36px monospace', fill: '#7CFC00' }).setOrigin(0, 0);
  const scoreBg = this.add.graphics();
  // draw initial border (will be redrawn when score changes)
  const b = scoreText.getBounds();
  scoreBg.lineStyle(6, 0xffffff, 1);
  scoreBg.strokeRoundedRect(-pad, -pad, b.width + pad * 2, b.height + pad * 2, 8);
  const scoreContainer = this.add.container(14, 14, [scoreBg, scoreText]).setDepth(20);
  this.scoreText = scoreText;
  this.scoreBg = scoreBg;
  this.scoreContainer = scoreContainer;

  // Prevent browser from handling arrow keys (scrolling) which can steal focus and cause input to hang
  try {
    this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN, Phaser.Input.Keyboard.KeyCodes.X]);
  } catch (e) {
    console.warn('Failed to add keyboard capture', e);
  }
  // Extra defensive global handler: prevent default for arrow keys and space/X so browser doesn't scroll or change pages
  try {
    const keydownHandler = (ev) => {
      const code = ev.code || ev.key;
      if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'Space' || code === 'KeyX') {
        // prevent scrolling / page navigation
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    // use non-passive so preventDefault is allowed
    window.addEventListener('keydown', keydownHandler, { passive: false });
    // store reference so it could be removed later if needed
    this._globalKeydownHandler = keydownHandler;
  } catch (e) {
    console.warn('Failed to install global keydown handler', e);
  }

  // Tween helper and current lane index
  // movement state (replaces tween-based movement to avoid stuck tweens)
  this.isMoving = false;
  this.moveStartTime = 0;
  this.moveDuration = 180; // ms to move between lanes
  this.moveStartY = 0;
  this.moveTargetY = this.player.y;
  this.currentLane = 1; // start at center lane per requirement
  this.targetLane = this.currentLane; // the lane we're moving to (committed on move finish)
  this.pendingLane = null; // store a queued lane index if player presses while moving

  // Centralized arrow handling: use a single keydown listener to avoid missed events
  const doChange = (dir) => {
    if (this.isGameOver || !this.player || !this.player.body || this.player.body.enable === false) return;
    // debounce duplicate arrow events (Phaser + DOM fallback can both fire)
    const nowLocal = this.time ? this.time.now : Date.now();
    const last = this._lastArrowTime || 0;
    if (nowLocal - last < 150) {
      // ignore rapid duplicate
      return;
    }
    this._lastArrowTime = nowLocal;
    const base = this.isMoving ? this.targetLane : this.currentLane;
    const target = Phaser.Math.Clamp(base + dir, 0, 2);
    console.debug('ARROW press', { dir, base, target, isMoving: this.isMoving, pendingLane: this.pendingLane });
    if (target === base) return;
    if (this.isMoving) { this.pendingLane = target; return; }
    changeLane(this, dir);
  };
  try {
    // explicit named events are more reliable across browsers
    this.input.keyboard.on('keydown-UP', () => doChange(-1));
    this.input.keyboard.on('keydown-DOWN', () => doChange(1));
  } catch (e) {
    console.warn('Keyboard on handler failed', e);
  }
  // DOM-level fallback: call doChange if Phaser doesn't receive the event for some reason
  try {
    const fallbackHandler = (ev) => {
      const code = ev.code || ev.key;
      if (code === 'ArrowUp') {
        console.debug('Fallback DOM ArrowUp');
        ev.preventDefault(); ev.stopPropagation();
        doChange(-1);
      } else if (code === 'ArrowDown') {
        console.debug('Fallback DOM ArrowDown');
        ev.preventDefault(); ev.stopPropagation();
        doChange(1);
      }
    };
    window.addEventListener('keydown', fallbackHandler, { passive: false });
    this._fallbackKeyHandler = fallbackHandler;
  } catch (e) {
    console.warn('Failed to install fallback DOM key handler', e);
  }

  // --- Debug overlay (can be toggled in code) ---
  try {
    const parent = document.getElementById('game-container');
    const overlay = document.createElement('div');
    overlay.id = 'debugOverlay';
    overlay.style.position = 'absolute';
    overlay.style.right = '8px';
    overlay.style.top = '8px';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.color = '#0f0';
    overlay.style.fontFamily = 'monospace';
    overlay.style.fontSize = '12px';
    overlay.style.padding = '8px';
    overlay.style.zIndex = '9999';
    overlay.style.lineHeight = '1.2';
    overlay.style.pointerEvents = 'auto';
    overlay.style.borderRadius = '6px';
    overlay.style.minWidth = '160px';

    const content = document.createElement('div');
    content.id = 'debugOverlayContent';
    overlay.appendChild(content);

    const btn = document.createElement('button');
    btn.innerText = 'Force Reset';
    btn.style.display = 'block';
    btn.style.marginTop = '6px';
    btn.onclick = () => {
      // clear movement state and snap player to committed lane
      try {
        this.isMoving = false;
        this.pendingLane = null;
        this.targetLane = this.currentLane;
        if (this.player && LANES[this.currentLane] !== undefined) {
          this.player.y = LANES[this.currentLane];
        }
        console.log('Debug: Force Reset applied');
      } catch (e) {
        console.warn('Debug reset failed', e);
      }
    };
    overlay.appendChild(btn);
    parent.appendChild(overlay);
    this.debugOverlay = content;
  } catch (e) {
    console.warn('Could not create debug overlay', e);
  }
}

function recalcLayout() {
  // Update game area size from the scale manager
  const w = this.scale.width;
  const h = this.scale.height;
  // Determine scale to cover the canvas (CSS 'cover' behavior)
  const tex = this.textures.get('bg').getSourceImage();
  const coverScale = Math.max(w / tex.width, h / tex.height);
  this.bg.setSize(w, h);
  this.bg.tileScaleX = coverScale;
  this.bg.tileScaleY = coverScale;

  // recompute lanes anchored to bottom
  const bottomY = h - LANE_BOTTOM_OFFSET;
  LANES[2] = bottomY;
  LANES[1] = bottomY - LANE_OFFSET;
  LANES[0] = bottomY - LANE_OFFSET * 2;

  // reposition player horizontally relative to new width
  const playerX = (w / 2) - PLAYER_X_OFFSET;
  if (this.player) {
    this.player.x = playerX;
    // keep player on its current lane index unless we're mid-move
    if (this.isMoving) {
      // adjust the move target to the resized lane Y so movement continues to the correct spot
      if (typeof this.targetLane === 'number' && LANES[this.targetLane] !== undefined) {
        this.moveTargetY = LANES[this.targetLane];
      }
      // don't forcibly set player.y here (preserve interpolation)
    } else {
      this.player.y = LANES[this.currentLane || 1];
    }
  }
}

function update(time, delta) {
  if (this.isGameOver) return; // freeze game when over
  // use the scene clock (consistent with moveStartTime assignments)
  const now = this.time ? this.time.now : time;

  // no watchdog here; rely on tween onComplete to clear state

  // Slowly scroll background horizontally using currentBgSpeed
  this.bg.tilePositionX += currentBgSpeed * delta;

  // Spawn cones periodically with randomized interval
  if (now > this.nextSpawn) {
    spawnCone(this);
    this.nextSpawn = now + Phaser.Math.Between(this.spawnIntervalMin, this.spawnIntervalMax);
  }

  // Move obstacles along with the background so they appear fixed to it
  this.obstacles.children.each(function(ob) {
    if (!ob) return;
    ob.x -= currentBgSpeed * delta;
    // if this obstacle can switch lanes (cats), trigger a single switch when it reaches switchX
    if (ob.canSwitch && !ob.switched && ob.switchX && ob.x <= ob.switchX) {
      ob.switched = true;
      // pick a different lane to move into (prefer adjacent but allow any different lane)
      let targetLane = Phaser.Math.Between(0, 2);
      if (targetLane === ob.laneIndex) {
        // try adjacent: move up or down if possible
        if (ob.laneIndex === 0) targetLane = 1;
        else if (ob.laneIndex === 2) targetLane = 1;
        else targetLane = Phaser.Math.Between(0, 1) === 0 ? 0 : 2;
      }
      const targetY = LANES[targetLane] + ((ob.variant && ob.variant.yOffset) ? ob.variant.yOffset : OBSTACLE_Y_OFFSET);
      // update logical lane immediately so collisions use new lane during the move
      ob.laneIndex = targetLane;
      // tween the obstacle vertically to the new lane
      try {
        ob.scene.tweens.add({ targets: ob, y: targetY, duration: 200, ease: 'Power1' });
      } catch (e) {
        console.warn('Failed to tween obstacle lane switch', e);
        ob.y = targetY;
      }
      console.log('Cat switched lane to', targetLane, 'at x=', ob.x);
    }
    if (ob.x < -200) ob.destroy();
  }, this);

  // Handle player movement interpolation (replaces previous tween-based movement)
  if (this.isMoving) {
    let t = (now - this.moveStartTime) / this.moveDuration;
    if (!isFinite(t) || Number.isNaN(t)) t = 0;
    // clamp
    t = Phaser.Math.Clamp(t, 0, 1);
    // linear interpolation between start and target Y
    this.player.y = Phaser.Math.Linear(this.moveStartY, this.moveTargetY, t);
    // occasional debug log while moving to help find stuck cases
    if (Math.floor(now) % 1000 < 50) {
      console.debug('MOVING', { now, moveStartTime: this.moveStartTime, t, moveStartY: this.moveStartY, moveTargetY: this.moveTargetY, currentY: this.player.y });
    }
    // safety: if movement takes way too long, force finish (timeout) to avoid permanent stuck
    const maxWait = this.moveDuration * 6; // allow some slack
    if (t >= 1 || (now - this.moveStartTime) > maxWait) {
        // movement finished
        this.isMoving = false;
        // commit the target lane as current
        this.currentLane = this.targetLane;
        // snap exactly to lane Y to avoid rounding or drift
        if (LANES[this.currentLane] !== undefined) {
          this.player.y = LANES[this.currentLane];
          this.moveTargetY = this.player.y;
        }
        // if a pending lane change was queued while moving, execute it now
        if (typeof this.pendingLane === 'number' && this.pendingLane !== this.currentLane) {
          const dir = this.pendingLane > this.currentLane ? 1 : -1;
          // clear pending before invoking to avoid re-entrancy
          this.pendingLane = null;
          changeLane(this, dir);
        } else {
          this.pendingLane = null;
        }
    }
  }

  // Update debug overlay if present
  try {
    if (this.debugOverlay) {
      const lines = [];
      lines.push('currentLane: ' + String(this.currentLane));
      lines.push('targetLane: ' + String(this.targetLane));
      lines.push('isMoving: ' + String(this.isMoving));
      lines.push('pendingLane: ' + String(this.pendingLane));
      lines.push('isSpeedActive: ' + String(this.isSpeedActive));
      lines.push('playerY: ' + (this.player ? Math.round(this.player.y) : 'n/a'));
      // join into HTML with small spacing
      this.debugOverlay.innerHTML = lines.join('<br>');
    }
  } catch (e) {
    // ignore overlay update errors
  }

}

function spawnCone(scene) {
  // Choose random lane index 0..2
  const laneIndex = Phaser.Math.Between(0, 2);
  const y = LANES[laneIndex];
  // Spawn off-screen to the right using current canvas width
  const x = scene.scale.width + 80;
  // Obstacle variants with per-type tuning
  // Obstacle variants with per-type tuning and weights (weighted spawn)
  // Weights are chosen so 'point' has ~15% chance (about 50% more likely than previous ~10%)
  const variants = [
    { key: 'cone', scale: 0.4, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.6, weight: 25 },
    { key: 'cone2', scale: 0.4, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.6, weight: 10 },
    { key: 'cone3', scale: 0.4, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.6, weight: 10 },
    { key: 'police', scale: 0.43, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.6, weight: 8 },
    { key: 'police2', scale: 0.43, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.6, weight: 8 },
    { key: 'cat', scale: 0.38, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.4, weight: 5 },
    { key: 'cat2', scale: 0.38, yOffset: OBSTACLE_Y_OFFSET, hitFactor: 0.4, weight: 5 },
    { key: 'point', scale: 0.28, yOffset: OBSTACLE_Y_OFFSET - 6, hitFactor: 0.8, isPoint: true, weight: 20 }
  ];

  // Weighted selection helper
  const totalWeight = variants.reduce((s, it) => s + (it.weight || 0), 0);
  let pick = Phaser.Math.Between(1, Math.max(1, totalWeight));
  let v = variants[0];
  for (let i = 0; i < variants.length; i++) {
    const it = variants[i];
    pick -= (it.weight || 0);
    if (pick <= 0) { v = it; break; }
  }
  const spawnY = y + (v.yOffset || 0);
  const obs = scene.physics.add.image(x, spawnY, v.key).setOrigin(0.5);
  obs.setScale(v.scale || 0.35);
  // store variant metadata for later (used for cat lane-switching)
  obs.variant = v;
  // mark point collectibles
  obs.isPoint = !!v.isPoint;
  // store lane index for lane-specific collision checking
  obs.laneIndex = laneIndex;
  // if this is a cat variant, allow a single lane switch before reaching the player
  if (v.key === 'cat' || v.key === 'cat2') {
    obs.canSwitch = true;
    obs.switched = false;
    // trigger switch when the obstacle gets near the player (a bit before collision)
    // pick a distance ahead of player where switch happens
    obs.switchX = Math.max(scene.player.x + Phaser.Math.Between(140, 260), scene.player.x + 120);
  }
  // tighten hitbox: set body size smaller than sprite so collision happens only when aligned
  const hitW = obs.displayWidth * (v.hitFactor || 0.6);
  const hitH = obs.displayHeight * (v.hitFactor || 0.6);
  obs.body.setSize(hitW, hitH);
  // center the body
  obs.body.setOffset((obs.displayWidth - hitW) / 2, (obs.displayHeight - hitH) / 2);
  obs.setDepth(4);
  scene.obstacles.add(obs);

  console.log('Spawned', v.key, 'at lane', laneIndex, 'y=', spawnY, 'x=', x, 'scale=', v.scale);
}

function onPlayerHit(playerObj, obstacle) {
  // 'this' is not bound here; use playerObj.scene
  const scene = playerObj.scene;
  if (scene.isGameOver) return;
  // Determine player's effective lane by nearest lane Y (handles mid-move cases)
  const getNearestLane = (y) => {
    let best = 0;
    let bestD = Math.abs(y - LANES[0]);
    for (let i = 1; i < LANES.length; i++) {
      const d = Math.abs(y - LANES[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  const playerLane = (playerObj && playerObj.y) ? getNearestLane(playerObj.y) : scene.currentLane;
  // Only treat as a hit if player is in the same lane as the obstacle (use effective lane)
  if (obstacle.laneIndex !== playerLane) {
    // ignore collision if not same lane
    console.log('Ignored overlap: different lane', 'playerLane=', playerLane, 'obLane=', obstacle.laneIndex);
    return;
  }
  // If this obstacle is a point collectible, collect it (no game over)
  if (obstacle.isPoint) {
    // award points and show floating +100
    try {
      if (typeof scene.score === 'number') scene.score += 100;
      if (scene.scoreText) {
        scene.scoreText.setText('Score: ' + scene.score);
        // redraw border
        try {
          const b2 = scene.scoreText.getBounds();
          scene.scoreBg.clear();
          scene.scoreBg.lineStyle(6, 0xffffff, 1);
          scene.scoreBg.strokeRoundedRect(-pad, -pad, b2.width + pad * 2, b2.height + pad * 2, 8);
        } catch (e) {}
      }
      // floating +100 text (green)
      const fx = scene.add.text(obstacle.x, obstacle.y - 6, '+100', { font: '20px monospace', fill: '#9bff9b', stroke: '#0b5', strokeThickness: 2 }).setOrigin(0.5).setDepth(30);
      scene.tweens.add({ targets: fx, y: fx.y - 36, alpha: 0, scale: 1.2, duration: 700, ease: 'Cubic.easeOut', onComplete: () => fx.destroy() });
      // pop the point sprite and destroy
      obstacle.scene.tweens.add({ targets: obstacle, scale: obstacle.scale * 1.4, alpha: 0, duration: 220, ease: 'Power1', onComplete: () => obstacle.destroy() });
    } catch (e) {
      try { obstacle.destroy(); } catch (e2) {}
    }
    return;
  }
  scene.isGameOver = true;
  // stop background movement
  currentBgSpeed = 0;
  // swap player to crash texture and scale to match ride width
  const crashSrc = scene.textures.get('crash_img').getSourceImage();
  const desiredWidth = scene.textures.get('ride_img').getSourceImage().width * PLAYER_SCALE;
  // Make crash slightly larger for a more dramatic effect (+0.1)
  const crashScale = (desiredWidth / crashSrc.width) + 0.1;
  scene.player.setTexture('crash_img');
  scene.player.setScale(crashScale);
  // update player's physics body to match crash image size and center it
  if (scene.player.body) {
    const pw = scene.player.displayWidth;
    const ph = scene.player.displayHeight;
    const bodyW = pw * 0.9;
    const bodyH = ph * 0.9;
    scene.player.body.setSize(bodyW, bodyH);
    // center the body inside the sprite (positive offsets)
    scene.player.body.setOffset((pw - bodyW) / 2, (ph - bodyH) / 2);
    // prevent further movement
    scene.player.body.enable = false;
  }

  // show simple Game Over modal (DOM)
  const parent = document.getElementById('game-container');
  // full-screen overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(0,0,0,0.85)';
  overlay.style.zIndex = '9999';

  const box = document.createElement('div');
  box.style.textAlign = 'center';
  box.style.color = '#fff';
  box.style.padding = '28px';
  box.style.borderRadius = '12px';
  box.style.minWidth = '360px';
  box.style.maxWidth = '90%';
  box.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))';

  const title = document.createElement('h1');
  title.innerText = 'Game Over';
  title.style.margin = '0 0 8px 0';
  title.style.fontSize = '48px';
  title.style.letterSpacing = '1px';
  box.appendChild(title);

  const msg = document.createElement('p');
  msg.innerText = 'คุณชนสิ่งกีดขวาง';
  msg.style.margin = '0 0 18px 0';
  msg.style.fontSize = '18px';
  box.appendChild(msg);

  const bigBtn = document.createElement('button');
  bigBtn.innerText = 'Restart';
  bigBtn.style.fontSize = '20px';
  bigBtn.style.padding = '12px 22px';
  bigBtn.style.border = 'none';
  bigBtn.style.background = '#ff5252';
  bigBtn.style.color = '#fff';
  bigBtn.style.borderRadius = '8px';
  bigBtn.style.cursor = 'pointer';
  bigBtn.onclick = () => { window.location.reload(); };
  box.appendChild(bigBtn);

  overlay.appendChild(box);
  parent.appendChild(overlay);
}

function changeLane(scene, dir) {
  if (!scene.player || !scene.player.body || scene.isGameOver) return;
  // determine base lane: if already moving, use targetLane as base, otherwise currentLane
  const base = scene.isMoving ? scene.targetLane : scene.currentLane;
  const target = Phaser.Math.Clamp(base + dir, 0, 2);
  if (target === base) return;
  // set the intended lane (commit to currentLane when movement finishes)
  scene.targetLane = target;
  // Compute target Y from lanes array, then clamp into visible bounds so top lane is reachable
  let y = LANES[target];
  // determine half height of player for safe clamping (fallback if not yet available)
  const halfH = (scene.player && scene.player.displayHeight) ? scene.player.displayHeight / 2 : (36 * (PLAYER_SCALE || 1)) / 2;
  const minY = halfH + 4; // keep a small margin
  const maxY = GAME_HEIGHT - halfH - 4;
  y = Phaser.Math.Clamp(y, minY, maxY);
    // For robustness, snap immediately to target lane (prevents cases where interpolation can get stuck)
    try {
      scene.isMoving = false;
      scene.moveStartTime = 0;
      scene.moveStartY = 0;
      scene.moveTargetY = y;
      scene.player.y = y;
      // commit immediately
      scene.currentLane = target;
      scene.targetLane = target;
      console.log('Snapped to lane', target, 'y=', y);
      // if there's a pending lane change queued while moving, execute it now
      if (typeof scene.pendingLane === 'number' && scene.pendingLane !== scene.currentLane) {
        const dir2 = scene.pendingLane > scene.currentLane ? 1 : -1;
        scene.pendingLane = null;
        // perform next move
        changeLane(scene, dir2);
      } else {
        scene.pendingLane = null;
      }
      return;
    } catch (e) {
      console.warn('Immediate snap failed, falling back to interpolation', e);
    }
}
