// Worker wrapper around Stockfish (UCI text over postMessage). Only talks UCI.
import { parseInfo, parseBestmove } from "./uci.js";

export const DEFAULTS = { movetime: 1500, depth: 0, multipv: 3 };

export class Engine {
  /** makeWorker: () => Worker-like {postMessage, onmessage, onerror, terminate}. */
  constructor(makeWorker, opts = {}, handlers = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.onUpdate = handlers.onUpdate ?? (() => {});
    this.onStatus = handlers.onStatus ?? (() => {});
    this.makeWorker = makeWorker;
    this.worker = null;
    this.ready = false;
    this.status = "idle"; // idle | loading | ready | unavailable
    this.pending = null; // { fen, turn } wanted before ready
    this.current = null; // search in flight: { fen, turn, lines: [] }
    this.stopping = 0; // bestmove lines still owed by searches we stopped
    this.log = [];
  }

  _setStatus(s) { this.status = s; this.onStatus(s); }

  start() {
    if (this.worker) return;
    this._setStatus("loading");
    try {
      this.worker = this.makeWorker();
    } catch (e) { this._fail(e); return; }
    this.worker.onmessage = (ev) => this._line(typeof ev.data === "string" ? ev.data : String(ev.data));
    this.worker.onerror = (e) => this._fail(e);
    this._send("uci");
  }

  _fail(e) {
    this.ready = false;
    this.current = null;
    this._setStatus("unavailable");
    this.error = e;
  }

  _send(cmd) { this.log.push(`> ${cmd}`); this.worker.postMessage(cmd); }

  _line(line) {
    this.log.push(line);
    if (line === "uciok") {
      this._send(`setoption name MultiPV value ${this.opts.multipv}`);
      this._send("isready");
    } else if (line === "readyok") {
      if (!this.ready) {
        this.ready = true;
        this._setStatus("ready");
        if (this.pending) { const p = this.pending; this.pending = null; this._go(p.fen, p.turn); }
      }
    } else if (line.startsWith("info")) {
      if (!this.current || this.stopping) return;
      const info = parseInfo(line);
      if (!info || info.multipv > this.opts.multipv) return;
      const lines = this.current.lines;
      lines[info.multipv - 1] = info;
      // Drop slots deeper than the newest depth of line 1 only when they are stale.
      this.onUpdate({ fen: this.current.fen, turn: this.current.turn, lines: lines.filter(Boolean), done: false });
    } else if (line.startsWith("bestmove")) {
      if (this.stopping > 0) {
        this.stopping--;
        if (this.stopping === 0 && this.pending && this.ready) { const p = this.pending; this.pending = null; this._go(p.fen, p.turn); }
        return;
      }
      if (parseBestmove(line) && this.current) {
        const c = this.current;
        this.current = null;
        this.onUpdate({ fen: c.fen, turn: c.turn, lines: c.lines.filter(Boolean), done: true });
      }
    }
  }

  _go(fen, turn) {
    this.current = { fen, turn, lines: [] };
    this._send("ucinewgame");
    this._send("isready");
    this._send(`position fen ${fen}`);
    const lim = this.opts.depth > 0 ? ` depth ${this.opts.depth}` : "";
    this._send(`go movetime ${this.opts.movetime}${lim}`);
  }

  /** Search a new position; any search in flight is stopped first. */
  analyze(fen) {
    if (this.status === "unavailable") return;
    const turn = fen.split(" ")[1] === "b" ? "b" : "w";
    if (!this.worker) this.start();
    if (!this.ready) { this.pending = { fen, turn }; return; }
    if (this.current) {
      this.stopping++;
      this._send("stop");
      this.current = null;
      this.pending = { fen, turn };
      return;
    }
    if (this.stopping > 0) { this.pending = { fen, turn }; return; }
    this._go(fen, turn);
  }

  /** Stop any search and do not start another. */
  stop() {
    this.pending = null;
    if (this.current) {
      this.current = null;
      this.stopping++;
      this._send("stop");
    }
  }

  get searching() { return !!this.current; }

  terminate() {
    if (this.worker) { try { this.worker.terminate(); } catch {} }
    this.worker = null; this.ready = false; this.current = null; this.pending = null; this.stopping = 0;
    this.status = "idle";
  }
}
