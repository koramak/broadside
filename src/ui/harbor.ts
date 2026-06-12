// Harbor screen between actions: repairs, armada roster, prize decisions.
// Ported from the prototype; logic lives in sim/run.ts, this is just DOM.

import { CLASSES, STRIP_LOOT, PRIZE_VALUE } from '../sim/constants';
import * as runOps from '../sim/run';
import type { RunState } from '../sim/types';
import { Rng } from '../sim/rng';
import { audio } from '../audio';
import { $ } from './hud';

export interface HarborOpts {
  title: string;
  nextLabel: string;
  /** at sea: no repairs, no hiring — just prizes, crew, and the ledger */
  atSea: boolean;
}

export class HarborScreen {
  onSetSail: () => void = () => {};
  private opts: HarborOpts = { title: 'BETWEEN ACTIONS', nextLabel: 'SET SAIL', atSea: false };

  show(run: RunState, rng: Rng, opts: HarborOpts): void {
    this.opts = opts;
    $('harbor').style.display = 'flex';
    $('htitle').textContent = opts.title;
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

    if (!this.opts.atSea) {
      fcard.appendChild(mk('REPAIR HULL +' + Math.round(runOps.REPAIR_AMT() * 100) + '%', runOps.REPAIR_COST(), () => runOps.repairHull(run), f.hullPct >= 1));
      fcard.appendChild(mk('MEND SAILS to full', 8, () => runOps.mendSails(run), f.sailHP >= 100));
      fcard.appendChild(mk('REMOUNT GUNS & RUDDER', 8, () => runOps.remountGuns(run), f.gunDef[0] + f.gunDef[1] === 0 && f.rudderHP >= 100));
      const m = runOps.musterCost(run);
      fcard.appendChild(mk(
        m.need <= 0 ? 'MUSTER CREW — full strength' : 'MUSTER CREW to full (+' + m.need + ' hands)',
        m.cost,
        () => runOps.musterCrew(run),
        m.need <= 0,
      ));
    } else {
      fcard.appendChild(mk('MUSTER FROM THE POOL (free)', 0, () => runOps.topUpCrew(run), f.crewPct >= 1 || run.pool <= 0));
    }
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
      const hands = runOps.prizeHands(p.cls);
      const short = runOps.prizeShortfall(run, p.cls);
      const full = run.armada.length >= 2;
      take.textContent =
        'CREW HER — join armada (' + hands + ' hands' + (short > 0 ? ', hire ' + short + ' for ' + short + ' stores' : ', pool covers it') + ')';
      if (full) take.textContent = 'CREW HER — armada is full (2/2)';
      else if (run.stores < short) take.textContent = 'CREW HER — need ' + (short - run.stores) + ' more stores';
      take.disabled = full || run.stores < short;
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

    $('hnext').textContent = this.opts.nextLabel;
  }

  bind(): void {
    $('hnext').addEventListener('click', () => {
      audio();
      this.onSetSail();
    });
  }
}
