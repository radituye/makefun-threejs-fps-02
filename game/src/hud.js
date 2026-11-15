// The DOM HUD: crosshair, hit marker, health, armour, ammo, money, timer, score,
// team pips, spike status, kill feed, banners and the buy menu. It never touches
// the simulation; main.js pushes numbers in and reads the play callback out. Every
// setter caches its last value so the DOM is only touched when something changes.
const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'A dusk yard, five Ashen defenders, one spike. Plant it at A or B — or clear the yard. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWin: {
    title: 'Round won',
    copy: 'The yard is yours.',
    action: 'Next round',
  },
  roundLose: {
    title: 'Round lost',
    copy: 'The Ashen hold the yard.',
    action: 'Next round',
  },
  matchWin: {
    title: 'Match won',
    copy: 'Emberline takes Duskworks Yard.',
    action: 'Play again',
  },
  matchLose: {
    title: 'Match lost',
    copy: 'The Ashen keep the yard.',
    action: 'Play again',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeCount = el('grenade-count');
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const armorFill = el('armor-fill');
  const armorRow = el('armor-row');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const scoreValue = el('score-value');
  const pips = el('pips');
  const spikeStatus = el('spike-status');
  const killfeed = el('killfeed');
  const banner = el('banner');
  const bannerText = el('banner-text');
  const buyMenu = el('buy-menu');
  const buyMoney = el('buy-money');
  const progressWrap = el('progress-wrap');
  const progressLabel = el('progress-label');
  const progressFill = el('progress-fill');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const vignette = el('vignette');
  const scope = el('scope');
  const direction = el('direction');

  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastGrenades = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastScore = '';
  let lastSpike = '';
  let lastPips = '';
  let bannerTimer = 0;
  let hitTimer = 0;

  function setPipsText(attackersAlive, defendersAlive) {
    const text = `${'●'.repeat(attackersAlive)}${'○'.repeat(1 - attackersAlive)}  vs  ${'●'.repeat(defendersAlive)}${'○'.repeat(5 - defendersAlive)}`;
    if (text === lastPips) return;
    lastPips = text;
    pips.textContent = text;
  }

  return {
    setAmmo(mag, reserve, name, grenades) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        el('ammo').classList.toggle('empty', mag === 0);
      }
      if (name !== lastWeapon) {
        lastWeapon = name;
        weaponName.textContent = name;
      }
      if (grenades !== lastGrenades) {
        lastGrenades = grenades;
        grenadeCount.textContent = grenades > 0 ? `◉ ${grenades}` : '';
      }
    },
    setHealth(health) {
      const value = Math.max(0, Math.ceil(health));
      if (value === lastHealth) return;
      lastHealth = value;
      healthValue.textContent = String(value);
      healthFill.style.width = `${value}%`;
      healthFill.classList.toggle('low', value <= 30);
    },
    setArmor(armor) {
      const value = Math.max(0, Math.ceil(armor));
      if (value === lastArmor) return;
      lastArmor = value;
      armorRow.style.visibility = value > 0 ? 'visible' : 'hidden';
      armorFill.style.width = `${value}%`;
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyValue.textContent = `$${money}`;
      buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds) {
      const value = Math.max(0, Math.ceil(seconds));
      if (value === lastTimer) return;
      lastTimer = value;
      const minutes = Math.floor(value / 60);
      const rest = String(value % 60).padStart(2, '0');
      timerValue.textContent = `${minutes}:${rest}`;
      timerValue.classList.toggle('urgent', value <= 10);
    },
    setScore(wins, losses) {
      const text = `${wins} — ${losses}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreValue.textContent = text;
    },
    setPips(attackersAlive, defendersAlive) {
      setPipsText(attackersAlive, defendersAlive);
    },
    setSpike(text) {
      if (text === lastSpike) return;
      lastSpike = text;
      spikeStatus.textContent = text;
      spikeStatus.classList.toggle('planted', text.includes('PLANTED'));
    },
    killfeed(text, good) {
      const entry = document.createElement('div');
      entry.className = good ? 'feed-good' : 'feed-bad';
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 6000);
    },
    banner(text, ms = 2600) {
      bannerText.textContent = text;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    showBuy(show) {
      buyMenu.hidden = !show;
    },
    setProgress(label, fraction) {
      if (!label) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    setCrosshairSpread(spread) {
      // Spread in radians -> crosshair gap in pixels, clamped to something readable.
      const gap = Math.round(3 + Math.min(26, spread * 900));
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    damageFlash(fromAngle) {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 220);
      if (fromAngle !== undefined) {
        direction.style.setProperty('--angle', `${fromAngle}deg`);
        direction.classList.add('on');
        setTimeout(() => direction.classList.remove('on'), 700);
      }
    },
    setScope(on) {
      scope.hidden = !on;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundWin' || mode === 'roundLose' ? `${text.copy} Score ${score}.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
