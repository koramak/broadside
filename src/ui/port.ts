// Port screen: market, shipyard services, and the tavern (where the tone
// lives). Trading logic stays in sim modules; this is DOM only.

import { CLASSES } from '../sim/constants';
import { GOODS, cargoLoad, fleetCargoCap, priceAt } from '../sim/economy';
import * as runOps from '../sim/run';
import type { RunState } from '../sim/types';
import { FACTIONS, PORTS } from '../sim/worldgen';
import type { PortDef } from '../sim/worldgen';
import { audio } from '../audio';
import { $ } from './hud';

export class PortScreen {
  onLeave: () => void = () => {};
  /** called after anything that changes the flagship so the map mirror updates */
  onShipChanged: () => void = () => {};

  private port: PortDef | null = null;

  show(port: PortDef, run: RunState, day: number): void {
    this.port = port;
    $('port').style.display = 'flex';
    this.render(run, day);
  }

  hide(): void {
    $('port').style.display = 'none';
    this.port = null;
  }

  private render(run: RunState, day: number): void {
    const port = this.port!;
    const faction = FACTIONS.find((f) => f.key === port.faction)!;
    const rep = run.rep[port.faction];
    const mood = rep > 30 ? 'They pour before you ask.' : rep > -20 ? 'They serve you, watching your hands.' : 'They serve you because the alternative is a fire.';
    $('ptitle').textContent = port.name.toUpperCase();
    $('pmeta').textContent = faction.name + ' · standing ' + rep + ' · ' + mood;
    $('pstores2').textContent =
      'STORES: ' + run.stores + ' · HOLD: ' + cargoLoad(run) + '/' + fleetCargoCap(run) + ' · SPARE HANDS: ' + run.pool;

    // market
    const seed = PORTS.indexOf(port);
    const market = $('pmarket');
    market.innerHTML = '<h3>THE MARKET</h3>';
    for (const g of GOODS) {
      const price = priceAt(port.bias, g, day, seed);
      const row = document.createElement('div');
      row.className = 'mrow';
      const have = run.cargo[g.key] || 0;
      row.innerHTML =
        `<span class="mname">${g.name}</span><span class="mprice">${price}</span>` +
        `<span class="mqty">hold ${have}</span>`;
      const mkBtn = (label: string, fn: () => void, dis: boolean) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.disabled = dis;
        b.addEventListener('click', () => {
          audio();
          fn();
          this.render(run, day);
        });
        row.appendChild(b);
      };
      const cap = fleetCargoCap(run);
      const room = cap - cargoLoad(run);
      mkBtn('BUY 1', () => { run.stores -= price; run.cargo[g.key] = have + 1; }, run.stores < price || room < 1);
      mkBtn('BUY 5', () => { run.stores -= price * 5; run.cargo[g.key] = have + 5; }, run.stores < price * 5 || room < 5);
      mkBtn('SELL 1', () => { run.stores += price; run.cargo[g.key] = have - 1; }, have < 1);
      mkBtn('SELL ALL', () => { run.stores += price * have; run.cargo[g.key] = 0; }, have < 1);
      market.appendChild(row);
    }

    // services
    const f = run.flag;
    const fc = CLASSES[f.cls];
    const sv = $('pservices');
    sv.innerHTML =
      '<h3>THE YARD</h3>' +
      '<div class="d">' + fc.name + ' Persistence — hull ' + Math.round(f.hullPct * 100) + '% · sails ' +
      Math.round(f.sailHP) + '% · crew ' + Math.round(f.crewPct * 100) + '%<br>Rudder ' +
      (f.rudderHP <= 0 ? 'SHOT AWAY' : f.rudderHP < 50 ? 'damaged' : 'sound') +
      ' · guns down ' + (f.gunDef[0] + f.gunDef[1]) + '</div>';
    const mk = (label: string, cost: number, fn: () => boolean, dis: boolean) => {
      const b = document.createElement('button');
      b.textContent = label + (cost ? ' — ' + cost + ' stores' : '');
      b.disabled = dis || (cost > 0 && run.stores < cost);
      b.addEventListener('click', () => {
        audio();
        if (fn()) this.onShipChanged();
        this.render(run, day);
      });
      sv.appendChild(b);
    };
    mk('REPAIR HULL +' + Math.round(runOps.REPAIR_AMT() * 100) + '%', runOps.REPAIR_COST(), () => runOps.repairHull(run), f.hullPct >= 1);
    mk('MEND SAILS to full', 8, () => runOps.mendSails(run), f.sailHP >= 100);
    mk('REMOUNT GUNS & RUDDER', 8, () => runOps.remountGuns(run), f.gunDef[0] + f.gunDef[1] === 0 && f.rudderHP >= 100);
    const m = runOps.musterCost(run);
    mk(
      m.need <= 0 ? 'MUSTER CREW — full strength' : 'MUSTER CREW to full (+' + m.need + ' hands)',
      m.cost,
      () => runOps.musterCrew(run),
      m.need <= 0,
    );

    // tavern
    const tv = $('ptavern');
    const rumor = port.tavern[(day + seed) % port.tavern.length];
    tv.innerHTML =
      '<h3>THE TAVERN</h3>' +
      '<div class="d">«' + rumor + '»<br><br>' + faction.blurb + '</div>';
  }

  bind(): void {
    $('pleave').addEventListener('click', () => {
      audio();
      this.onLeave();
    });
  }
}
