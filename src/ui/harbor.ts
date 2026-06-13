// Harbor screen between actions: repairs, armada roster, prize decisions.
// Ported from the prototype; logic lives in sim/run.ts, this is just DOM.

import { CLASSES, DOCTRINES, STRIP_LOOT, PRIZE_VALUE } from '../sim/constants';
import * as runOps from '../sim/run';
import type { RunState } from '../sim/types';
import { Rng } from '../sim/rng';
import { LOYALTY, TEMPERAMENT, bark, loyaltyBand, loyaltyWord } from '../sim/captains';
import { audio } from '../audio';
import { $ } from './hud';

/** Morale band → a colour for the little loyalty bar. */
const LOYALTY_COLOR: Record<string, string> = {
  devoted: 'var(--gold)',
  steady: 'var(--parch)',
  wary: '#d8915a',
  mutinous: 'var(--rust)',
};

export interface HarborOpts {
  title: string;
  nextLabel: string;
  /** at sea: no repairs, no hiring — just prizes, crew, and the ledger */
  atSea: boolean;
}

export class HarborScreen {
  onSetSail: () => void = () => {};
  /** route a captain's bark to the feed + chronicle (wired in main) */
  onFeed: (msg: string) => void = () => {};
  private opts: HarborOpts = { title: 'BETWEEN ACTIONS', nextLabel: 'SET SAIL', atSea: false };
  /** which pending prize's "replace a consort" picker is open (-1 = none) */
  private replacingIdx = -1;

  show(run: RunState, rng: Rng, opts: HarborOpts): void {
    this.opts = opts;
    this.replacingIdx = -1;
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

    // armada — one card per consort: she's a person now, with a mood and a price
    if (!run.armada.length) {
      const acard = document.createElement('div');
      acard.className = 'hcard';
      acard.innerHTML =
        '<h3>YOUR ARMADA (0/2)</h3><div class="d">You sail alone. Crew a prize to take on a captain — ' +
        'and a temperament.</div>';
      ships$.appendChild(acard);
    } else {
      run.armada.forEach((a, ai) => {
        const t = TEMPERAMENT[a.captain[1]];
        const band = loyaltyBand(a.loyalty);
        const shortName = a.name.split(' ').slice(-1)[0];
        const card = document.createElement('div');
        card.className = 'hcard';
        card.innerHTML =
          '<h3>' + CLASSES[a.cls].name.toUpperCase() + ' ' + shortName + ' — Capt. ' + a.captain[0] + '</h3>' +
          '<div class="d">' + t.title + ' · ' + t.creed + '<br>' +
          '<span style="color:var(--parch)">Loves</span> ' + t.loves + '<br>' +
          '<span style="color:var(--parch)">Hates</span> ' + t.hates + '<br>' +
          '<div class="loybar"><i style="width:' + Math.round(a.loyalty) + '%;background:' +
          LOYALTY_COLOR[band] + '"></i></div>' +
          'Morale: <span style="color:' + LOYALTY_COLOR[band] + '">' + loyaltyWord(a.loyalty) + '</span>' +
          (band === 'mutinous' ? ' — she is one bad day from sailing off' : '') +
          '</div>';
        // share the plunder: spend stores to buy back goodwill
        const carouse = document.createElement('button');
        carouse.textContent = a.loyalty >= LOYALTY.max
          ? 'CAROUSE — she could not be happier'
          : 'CAROUSE — a fair split of the plunder (+morale, ' + LOYALTY.carouseCost + ' stores)';
        carouse.disabled = a.loyalty >= LOYALTY.max || run.stores < LOYALTY.carouseCost;
        carouse.addEventListener('click', () => {
          audio();
          if (runOps.carouse(run, ai)) {
            const line = bark(a.captain, 'content', rng);
            if (line) this.onFeed(line);
          }
          this.render(run, rng);
        });
        card.appendChild(carouse);
        ships$.appendChild(card);
      });
    }

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

      const hands = runOps.prizeHands(p.cls);
      const short = runOps.prizeShortfall(run, p.cls);
      const full = run.armada.length >= runOps.ARMADA_CAP;
      const take = document.createElement('button');
      if (!full) {
        take.textContent =
          'CREW HER — join armada (' + hands + ' hands' +
          (short > 0 ? ', hire ' + short + ' for ' + short + ' stores' : ', pool covers it') + ')';
        if (run.stores < short) take.textContent = 'CREW HER — need ' + (short - run.stores) + ' more stores';
        take.disabled = run.stores < short;
        take.addEventListener('click', () => {
          audio();
          if (runOps.crewPrize(run, i, rng)) this.welcomeAboard(run, rng);
          this.render(run, rng);
        });
        card.appendChild(take);
      } else {
        // armada full — offer a swap: pick a consort to pay off for her berth
        take.textContent = this.replacingIdx === i
          ? 'TAKE HER IN — choose who to pay off:'
          : 'TAKE HER IN — replace a consort (' + run.armada.length + '/' + runOps.ARMADA_CAP + ')';
        take.disabled = run.stores < short;
        take.addEventListener('click', () => {
          audio();
          this.replacingIdx = this.replacingIdx === i ? -1 : i;
          this.render(run, rng);
        });
        card.appendChild(take);
        if (this.replacingIdx === i) {
          run.armada.forEach((a, ci) => {
            const doc = DOCTRINES[a.captain[1]];
            const drop = document.createElement('button');
            drop.textContent =
              '↳ drop ' + CLASSES[a.cls].name + ' ' + a.name.split(' ').slice(-1)[0] +
              ' · ' + (doc ? doc.label.split(' · ')[0] : 'Capt ' + a.captain[0]) +
              ' (+' + runOps.consortPayoff(a.cls) + ' stores)';
            drop.disabled = run.stores < short;
            drop.addEventListener('click', () => {
              audio();
              if (runOps.replaceConsort(run, i, ci, rng)) this.welcomeAboard(run, rng);
              this.replacingIdx = -1;
              this.render(run, rng);
            });
            card.appendChild(drop);
          });
        }
      }

      // hoist your flag aboard her — the trade-up. Bigger or smaller, your call.
      const hoist = document.createElement('button');
      hoist.textContent =
        'HOIST YOUR FLAG — sail her as flagship (your ' + CLASSES[run.flag.cls].name +
        ' is sold, +' + PRIZE_VALUE[run.flag.cls] + ' stores)';
      hoist.addEventListener('click', () => {
        audio();
        const oldName = CLASSES[run.flag.cls].name;
        if (runOps.hoistFlag(run, i) !== null) {
          this.onFeed(
            'You strike your own colors and run them up the ' + CLASSES[p.cls].name +
            '. The ' + oldName + ' is paid off down the coast — but Persistence sails on with you.',
          );
        }
        this.render(run, rng);
      });
      card.appendChild(hoist);

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

      card.appendChild(strip);
      card.appendChild(sell);
      pz.appendChild(card);
    });

    $('hnext').textContent = this.opts.nextLabel;
  }

  /** The captain just added to the armada introduces herself, in character. */
  private welcomeAboard(run: RunState, rng: Rng): void {
    const a = run.armada[run.armada.length - 1];
    if (!a) return;
    const line = bark(a.captain, 'recruit', rng);
    if (line) this.onFeed(line);
  }

  bind(): void {
    $('hnext').addEventListener('click', () => {
      audio();
      this.onSetSail();
    });
  }
}
