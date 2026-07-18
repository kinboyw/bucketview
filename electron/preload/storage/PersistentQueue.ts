import { EventEmitter } from 'events';
import Database from 'better-sqlite3';

const TABLE = 'queue';
const TABLE_COUNT = 'queue_count';
const TABLE_FAILED = 'queue_failed';
const TABLE_SUCCEEDED = 'queue_succeded';
const TABLE_RECORDS = 'transfer_records';

interface JobRow {
  id: number;
  job: string;
}

export default class PersistentQueue extends EventEmitter {
  private debug: boolean = false;
  private empty: boolean | undefined = undefined;
  private dbPath: string;
  private batchSize: number;
  private queue: { id: number; job: any }[] = [];
  private length: number | null = null;
  private db: Database.Database | null = null;
  private opened: boolean = false;
  private run: boolean = false;

  constructor(filename: string, batchSize?: number) {
    super();
    if (filename === undefined) throw new Error('No filename parameter provided');
    this.dbPath = (filename === '') ? ':memory:' : filename;
    this.batchSize = (batchSize === undefined) ? 10 : batchSize;
    if (typeof this.batchSize !== 'number' || this.batchSize < 1)
      throw new Error('Invalid batchSize parameter.  Must be a number > 0');

    this.on('start', () => {
      if (this.db === null) throw new Error('Open queue database before starting queue');
      if (this.run === false) {
        this.run = true;
        this.emit('trigger_next');
      }
    });

    this.on('stop', () => { this.run = false; });

    this.on('trigger_next', () => {
      if (this.debug) console.log('trigger_next');
      if (!this.run || this.empty) {
        if (this.debug) console.log('run=' + this.run + ' and empty=' + this.empty);
        return;
      }
      if (this.queue.length === 0 && this.length !== 0) {
        this.hydrateQueue();
        setImmediate(() => this.emit('next', this.queue[0]));
      } else if (this.queue.length) {
        setImmediate(() => this.emit('next', this.queue[0]));
      } else {
        this.emit('empty');
      }
    });

    this.on('empty', () => {
      this.empty = true;
      this.db?.exec("VACUUM;");
    });

    this.on('add', () => {
      if (this.empty) {
        this.empty = false;
        if (this.run) this.emit('trigger_next');
      }
    });

    this.on('open', () => { this.opened = true; });
    this.on('close', () => {
      this.opened = false;
      this.db = null;
      this.empty = undefined;
      this.run = false;
      this.queue = [];
    });
  }

  open(): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS ${TABLE} (id INTEGER PRIMARY KEY ASC AUTOINCREMENT, job TEXT);
          CREATE TABLE IF NOT EXISTS ${TABLE_FAILED} (id INTEGER PRIMARY KEY ASC AUTOINCREMENT, job TEXT);
          CREATE TABLE IF NOT EXISTS ${TABLE_SUCCEEDED} (id INTEGER PRIMARY KEY ASC AUTOINCREMENT, job TEXT);
          CREATE TABLE IF NOT EXISTS ${TABLE_RECORDS} (uid TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS ${TABLE_COUNT} (counter BIGINT);
          INSERT INTO ${TABLE_COUNT} SELECT 0 AS counter WHERE NOT EXISTS(SELECT * FROM ${TABLE_COUNT});
          UPDATE ${TABLE_COUNT} SET counter = (SELECT count(*) FROM ${TABLE});

          CREATE TRIGGER IF NOT EXISTS queue_insert
          AFTER INSERT ON ${TABLE}
          BEGIN UPDATE ${TABLE_COUNT} SET counter = counter + 1; END;

          CREATE TRIGGER IF NOT EXISTS queue_delete
          AFTER DELETE ON ${TABLE}
          BEGIN UPDATE ${TABLE_COUNT} SET counter = counter - 1; END;
        `);

        const row = this.db!.prepare(`SELECT counter FROM ${TABLE_COUNT} LIMIT 1`).get() as { counter: number } | undefined;
        this.length = row?.counter ?? 0;

        this.hydrateQueue();
        this.empty = (this.queue.length === 0);
        this.emit('open');
        resolve(this.queue);
      } catch (err) {
        reject(err);
      }
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.db?.close();
      this.emit('close');
      resolve();
    });
  }

  getLength(): number { return this.length ?? 0; }

  start(): void { this.emit('start'); }
  stop(): void { this.emit('stop'); }

  done(): void {
    if (this.debug) console.log('Calling done!');
    this.removeJob();
    this.length--;
    this.emit('trigger_next');
  }

  abort(): void {
    if (this.debug) console.log('Calling abort!');
    this.stop();
  }

  add(job: any): number {
    const stmt = this.db!.prepare(`INSERT INTO ${TABLE} (job) VALUES (?)`);
    const info = stmt.run(JSON.stringify(job));
    const id = info.lastInsertRowid as number;
    this.length++;
    this.emit('add', { id, job });
    return id;
  }

  addFailed(job: any): number {
    const stmt = this.db!.prepare(`INSERT INTO ${TABLE_FAILED} (job) VALUES (?)`);
    const info = stmt.run(JSON.stringify(job));
    const id = info.lastInsertRowid as number;
    this.emit('failed', { id, job });
    return id;
  }

  addSucceeded(job: any): number {
    const stmt = this.db!.prepare(`INSERT INTO ${TABLE_SUCCEEDED} (job) VALUES (?)`);
    const info = stmt.run(JSON.stringify(job));
    const id = info.lastInsertRowid as number;
    this.emit('succeeded', { id, job });
    return id;
  }

  setDebug(debug: boolean): PersistentQueue {
    this.debug = debug;
    return this;
  }

  isEmpty(): boolean {
    if (this.empty === undefined) throw new Error('Call open() method before calling isEmpty()');
    return this.empty;
  }

  isStarted(): boolean { return this.run; }
  isOpen(): boolean { return this.opened; }

  has(id: number): boolean {
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].id === id) return true;
    }
    const row = this.db!.prepare(`SELECT id FROM ${TABLE} WHERE id = ?`).get(id) as { id: number } | undefined;
    return row !== undefined;
  }

  getJobIds(job: any): number[] {
    return this.searchQueue(job);
  }

  getFirstJobId(job: any): number | null {
    const jobstr = JSON.stringify(job);
    const i = this.queue.findIndex(j => JSON.stringify(j.job) === jobstr);
    if (i !== -1) return this.queue[i].id;
    const ids = this.searchQueue(job);
    return ids.length > 0 ? ids[0] : null;
  }

  delete(id: number): number {
    this.removeJob(id);
    this.emit('delete', { id });
    this.length--;
    return id;
  }

  listFailedQueue(offset: number, limit: number): JobRow[] {
    return this.listTable(offset, limit, TABLE_FAILED);
  }

  listSuccededQueue(offset: number, limit: number): JobRow[] {
    return this.listTable(offset, limit, TABLE_SUCCEEDED);
  }

  listQueue(offset: number, limit: number): JobRow[] {
    return this.listTable(offset, limit, TABLE);
  }

  // ── Transfer records (UI persistence) ──

  upsertTransferRecord(uid: string, data: any): void {
    if (this.db === null) throw new Error('Open queue database before upserting records');
    const now = Date.now();
    this.db!.prepare(`INSERT OR REPLACE INTO ${TABLE_RECORDS} (uid, data, updated_at) VALUES (?, ?, ?)`).run(uid, JSON.stringify(data), now);
  }

  getTransferRecord(uid: string): string | null {
    if (this.db === null) throw new Error('Open queue database before getting records');
    const row = this.db!.prepare(`SELECT data FROM ${TABLE_RECORDS} WHERE uid = ?`).get(uid) as { data: string } | undefined;
    return row ? row.data : null;
  }

  listTransferRecords(offset: number, limit: number): string[] {
    if (this.db === null) throw new Error('Open queue database before listing records');
    const rows = this.db!.prepare(`SELECT data FROM ${TABLE_RECORDS} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(limit, offset) as { data: string }[];
    return rows.map((r: { data: string }) => r.data);
  }

  countTransferRecords(): number {
    if (this.db === null) throw new Error('Open queue database before counting records');
    const row = this.db!.prepare(`SELECT COUNT(*) as cnt FROM ${TABLE_RECORDS}`).get() as { cnt: number };
    return row.cnt;
  }

  deleteTransferRecord(uid: string): void {
    if (this.db === null) throw new Error('Open queue database before deleting records');
    this.db!.prepare(`DELETE FROM ${TABLE_RECORDS} WHERE uid = ?`).run(uid);
  }

  clearTransferRecords(): void {
    if (this.db === null) throw new Error('Open queue database before clearing records');
    this.db!.exec(`DELETE FROM ${TABLE_RECORDS}`);
  }

  recoverInterrupted(): string[] {
    if (this.db === null) throw new Error('Open queue database before recovering');
    const rows = this.db!.prepare(`SELECT job FROM ${TABLE} ORDER BY id ASC`).all() as { job: string }[];
    return rows.map((r: { job: string }) => r.job);
  }

  private hydrateQueue(): void {
    if (this.db === null) throw new Error('Open queue database before starting queue');
    const rows = this.db!.prepare(`SELECT * FROM ${TABLE} ORDER BY id ASC LIMIT ?`).all(this.batchSize) as JobRow[];
    this.queue = rows.map(row => ({ id: row.id, job: JSON.parse(row.job) }));
  }

  private searchQueue(job: any): number[] {
    if (this.db === null) throw new Error('Open queue database before starting queue');
    const rows = this.db!.prepare(`SELECT id FROM ${TABLE} WHERE job = ? ORDER BY id ASC`).all(JSON.stringify(job)) as { id: number }[];
    return rows.map(r => r.id);
  }

  private removeJob(id?: number): void {
    if (id === undefined) {
      const item = this.queue.shift();
      id = item?.id;
    } else {
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].id === id) {
          this.queue.splice(i, 1);
          break;
        }
      }
    }
    if (id !== undefined) {
      this.db!.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id);
    }
  }

  private listTable(offset: number, limit: number, tableName: string): JobRow[] {
    if (this.db === null) throw new Error('Open queue database before listing queue');
    return this.db!.prepare(`SELECT * FROM ${tableName} ORDER BY id ASC LIMIT ? OFFSET ?`).all(limit, offset) as JobRow[];
  }
}
