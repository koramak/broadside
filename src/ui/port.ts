// Port screen: market, shipyard services, and the tavern (where the tone
// lives). Trading logic stays in sim modules; this is DOM only.

import { CLASSES } from '../sim/constants';
import { GOODS, cargoLoad, fleetCargoCap, priceAt } from '../sim/economy';
import * as runOps from '../sim/run';
import type { RunState } from '../sim/types';
import { MAX_ACTIVE, acceptContract, daysLeft } from '../sim/contracts';
import { QUIRK_DESC, TEMPERAMENT, bark, legendAtPort } from '../sim/captains';
import { resolvePortEventChoice } from '../sim/portEvents';
import { Rng } from '../sim/rng';
import { FACTIONS, PORTS } from '../sim/worldgen';
import type { PortDef } from '../sim/worldgen';
import { audio } from '../audio';
import { $ } from './hud';

export class PortScreen {
  onLeave: () => void = () => {};
  /** called after anything that changes the flagship so the map mirror updates */
  onShipChanged: () => void = () => {};
  /** route a feed line (contract signed) to the HUD + chronicle (wired in main) */
  onFeed: (msg: string) => void = () => {};

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

    // the drama that greeted you at the quay (rolled in main on docking)
    const ev = $('pevent');
    if (run.portEvent) {
      const e = run.portEvent;
      ev.className = 'hcard wide';
      ev.style.display = 'block';
      ev.innerHTML = '<h3 style="color:var(--gold)">' + e.title + '</h3><div class="d">' + e.text + '</div>';
      for (const ch of e.choices ?? []) {
        const btn = document.createElement('button');
        btn.textContent = ch.label;
        btn.disabled = ch.key === 'bribe' && run.stores < 8;
        btn.addEventListener('click', () => {
          audio();
          resolvePortEventChoice(run, port, e.id, ch.key, this.onFeed);
          this.onShipChanged();
          this.render(run, day);
        });
        ev.appendChild(btn);
      }
    } else {
      ev.style.display = 'none';
      ev.innerHTML = '';
    }

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

    // the chandler: bolt-on upgrades, paid in stores
    const ch = document.createElement('h3');
    ch.style.marginTop = '10px';
    ch.textContent = 'THE CHANDLER';
    sv.appendChild(ch);
    for (const item of runOps.CHANDLER) {
      const owned = !runOps.chandlerAvailable(run, item);
      const b = document.createElement('button');
      b.textContent = owned
        ? item.label + ' — ' + (item.key === 'swivels' || item.key === 'pumps' ? 'fitted' : 'fully refitted')
        : item.label + ' — ' + item.desc + ' — ' + item.cost + ' stores';
      b.disabled = owned || run.stores < item.cost;
      b.addEventListener('click', () => {
        audio();
        if (runOps.buyChandler(run, item)) this.onShipChanged();
        this.render(run, day);
      });
      sv.appendChild(b);
    }

    // tavern: flavor + the rumor sheet (real price intelligence)
    const tv = $('ptavern');
    const rumor = port.tavern[(day + seed) % port.tavern.length];
    tv.innerHTML =
      '<h3>THE TAVERN</h3>' +
      '<div class="d">«' + rumor + '»<br><br>' + faction.blurb + '</div>' +
      (run.rumors.length
        ? '<h3 style="margin-top:10px">WORTH KNOWING</h3><div class="d">' +
          run.rumors.map((r) => '«' + r.text + '»').join('<br>') +
          '</div>'
        : '');

    // a legendary captain ashore — recruit her and her hull (once per run)
    const leg = legendAtPort(run, port, day);
    if (leg) {
      const lt = TEMPERAMENT[leg.doctrine];
      const lcard = document.createElement('div');
      lcard.innerHTML =
        '<h3 style="margin-top:12px;color:var(--gold)">★ A CAPTAIN IN THE TAVERN</h3>' +
        '<div class="d"><b style="color:var(--parch)">' + leg.name + '</b> · ' + lt.title + '<br>' +
        leg.creed + '<br>Sails the ' + leg.ship.name + '.<br>' +
        '<span style="color:var(--gold)">Knack:</span> ' + QUIRK_DESC[leg.quirk] + '</div>';
      const full = run.armada.length >= runOps.ARMADA_CAP;
      const lbtn = document.createElement('button');
      lbtn.textContent = full
        ? 'RECRUIT — your armada is full (' + runOps.ARMADA_CAP + '/' + runOps.ARMADA_CAP + ')'
        : 'RECRUIT — ' + leg.cost + ' stores';
      lbtn.disabled = full || run.stores < leg.cost;
      lbtn.addEventListener('click', () => {
        audio();
        if (runOps.recruitLegend(run, leg.id)) {
          const rng = new Rng(day * 131 + PORTS.indexOf(port) + 3);
          const line = bark([leg.name, leg.doctrine], 'recruit', rng, leg.id);
          if (line) this.onFeed(line);
          this.onShipChanged();
        }
        this.render(run, day);
      });
      tv.appendChild(lcard);
      tv.appendChild(lbtn);
    }

    // the job board — faction work that turns the whole map into content
    const bd = $('pboard');
    bd.innerHTML = '<h3>THE JOB BOARD</h3>';
    if (run.contracts.length) {
      const act = document.createElement('div');
      act.className = 'd';
      act.innerHTML =
        '<span style="color:var(--gold)">SIGNED ARTICLES (' + run.contracts.length + '/' + MAX_ACTIVE + ')</span><br>' +
        run.contracts
          .map((c) => {
            const d = daysLeft(c, day);
            const warn = d <= 2 ? ' style="color:var(--rust)"' : '';
            return '• ' + c.title + ' — <span' + warn + '>' + d + 'd left</span>';
          })
          .join('<br>');
      bd.appendChild(act);
    }
    if (!run.jobBoard.length) {
      const e = document.createElement('div');
      e.className = 'd';
      e.textContent = 'No work worth a captain’s name pinned here today.';
      bd.appendChild(e);
    } else {
      const full = run.contracts.length >= MAX_ACTIVE;
      run.jobBoard.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'd';
        row.style.marginTop = '8px';
        row.innerHTML = '<b style="color:var(--parch)">' + c.title + '</b> · ' + daysLeft(c, day) + ' days<br>' + c.desc;
        bd.appendChild(row);
        const btn = document.createElement('button');
        btn.textContent = full ? 'SIGN — your articles are full (' + MAX_ACTIVE + ')' : 'SIGN THESE ARTICLES';
        btn.disabled = full;
        btn.addEventListener('click', () => {
          audio();
          if (acceptContract(run, c)) {
            this.onFeed('Articles signed — ' + c.title.toLowerCase() + '. The clock is running.');
          }
          this.render(run, day);
        });
        bd.appendChild(btn);
      });
    }
  }

  bind(): void {
    $('pleave').addEventListener('click', () => {
      audio();
      this.onLeave();
    });
  }
}
