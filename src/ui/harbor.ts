// Harbor screen between actions: repairs, armada roster, prize decisions.
// Ported from the prototype; logic lives in sim/run.ts, this is just DOM.

import { CLASSES, ESCALATION, STRIP_LOOT, CREW_COST, PRIZE_VALUE } from '../sim/constants';
import * as runOps from '../sim/run';
import type { RunState } from '../sim/types';
import { Rng } from '../sim/rng';
import { audio } from '../audio';
import { $ } from './hud';

export class HarborScreen {
  onSetSail: () => void = () => {};

  show(run: RunState, rng: Rng): void {
    $('harbor').style.display = 'flex';
    $('htitle').textContent = 'ACTION ' + run.battle + ' WON';
    this.render(run, rng);
  }

  hide(): void {
    $('harbor').style.display = 'none';
  }

  private render(run: RunState, rng: Rng): void {
    $('hstores').textContent = 'STORES: ' + run.stores + ' · SPARE HANDS: ' + run.pool;
    const f = run.flag;
    const fc = CLASSES[f.cls];
    const ships$ = $('hships');
    ships$.innerHTML = '';

    // flagship card
    const fcard = document.createElement('div');
    fcard.className = 'hcard';
    fcard.innerHTML =
      '<h3>' + fc.name.toUpperCase() + ' PERSISTENCE — your flag</h3>' +
      '<div class="d">Hull ' + Math.round(f.hullPct * 100) + '% · Sails ' + Math.round(f.sailHP) +
      '% · Crew ' + Math.round(f.crewPct * 100) + '%<br>' +
      'Rudder ' + (f.rudderHP <= 0 ? 'SHOT AWAY' : f.rudderHP < 50 ? 'damaged' : 'sound') +
      ' · Guns down: ' + (f.gunDef[0] + f.gunDef[1]) + '<br>Refits: ' +
      (run.up.guns ? '+' + run.up.guns + ' guns ' : '') +
      (run.up.canvas ? '+canvas×' + run.up.canvas + ' ' : '') +
      (run.up.timbers ? '+timbers×' + run.up.timbers : '') +
      (run.up.guns || run.up.canvas || run.up.timbers ? '' : 'none') +
      '</div>';

    const mk = (label: string, cost: number, fn: () => boolean, dis: boolean): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label + (cost ? ' — ' + cost + ' stores' : '');
      b.disabled = dis || (cost > 0 && run.stores < cost);
      b.addEventListener('click', () => {
        audio();
        fn();
        this.render(run, rng);
      });
      return b;
    };

    fcard.appendChild(mk('REPAIR HULL +35%', 12, () => runOps.repairHull(run), f.hullPct >= 1));
    fcard.appendChild(mk('MEND SAILS to full', 8, () => runOps.mendSails(run), f.sailHP >= 100));
    fcard.appendChild(mk('REMOUNT GUNS & RUDDER', 8, () => runOps.remountGuns(run), f.gunDef[0] + f.gunDef[1] === 0 && f.rudderHP >= 100));
    fcard.appendChild(mk('HIRE 10 HANDS to the pool', 10, () => runOps.hireHands(run), false));
    fcard.appendChild(mk('TOP UP CREW from pool (free)', 0, () => runOps.topUpCrew(run), f.crewPct >= 1 || run.pool <= 0));
    ships$.appendChild(fcard);

    // armada card
    const acard = document.createElement('div');
    acard.className = 'hcard';
    acard.innerHTML =
      '<h3>YOUR ARMADA (' + run.armada.length + '/2)</h3>' +
      '<div class="d">' +
      (run.armada.length
        ? run.armada
            .map((a) => CLASSES[a.cls].name + ' ' + a.name.split(' ').slice(-1)[0] + ' — Capt. ' + a.captain[0])
            .join('<br>')
        : 'You sail alone.') +
      '<br><br>Consorts refit between actions for free, but a consort lost is lost.</div>';
    ships$.appendChild(acard);

    // prizes
    const pz = $('hprizes');
    pz.innerHTML = '';
    run.pendingPrizes.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'hcard';
      const loot = STRIP_LOOT[p.cls];
      card.innerHTML =
        '<h3>PRIZE: ' + p.name + '</h3>' +
        '<div class="d">' + CLASSES[p.cls].name + ', ' + p.crew + ' prisoners aboard.<br>What is your pleasure, captain?</div>';

      const take = document.createElement('button');
      take.textContent = 'CREW HER — join armada (' + CREW_COST[p.cls] + ' hands)';
      take.disabled = run.armada.length >= 2 || run.pool < CREW_COST[p.cls];
      take.addEventListener('click', () => {
        audio();
        runOps.crewPrize(run, i, rng);
        this.render(run, rng);
      });

      const strip = document.createElement('button');
      strip.textContent = 'STRIP HER — ' + loot[1] + ' (+12 stores)';
      strip.disabled = run.up[loot[0]] >= 3;
      strip.addEventListener('click', () => {
        audio();
        runOps.stripPrize(run, i);
        this.render(run, rng);
      });

      const sell = document.createElement('button');
      sell.textContent = 'SELL HER — +' + PRIZE_VALUE[p.cls] + ' stores';
      sell.addEventListener('click', () => {
        audio();
        runOps.sellPrize(run, i);
        this.render(run, rng);
      });

      card.appendChild(take);
      card.appendChild(strip);
      card.appendChild(sell);
      pz.appendChild(card);
    });

    $('hnext').textContent = 'SET SAIL — ACTION ' + (run.battle + 1) + ': ' + ESCALATION[run.battle].desc.toUpperCase();
  }

  bind(): void {
    $('hnext').addEventListener('click', () => {
      audio();
      this.onSetSail();
    });
  }
}
