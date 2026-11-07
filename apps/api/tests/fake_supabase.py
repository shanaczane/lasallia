# In-memory stand-in for the parts of the Supabase client the books router
# uses, so endpoint tests run without a database. RPCs are recorded and
# answered by handlers the test registers.

import copy
import uuid
from datetime import datetime
from types import SimpleNamespace


def _comparable(value):
    # Timestamps compare as moments, like Postgres, whatever their offset
    # is written as ("Z" or "+00:00").
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return value


class _Query:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = []
        self._negate = False
        self._limit = None
        self._range = None

    # ── building ──
    def select(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload, **_kwargs):
        # Insert, or update the row with the same id.
        self.op, self.payload = "upsert", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _add(self, predicate):
        negate, self._negate = self._negate, False
        self.filters.append((lambda r: not predicate(r)) if negate else predicate)
        return self

    def eq(self, col, value):
        return self._add(lambda r: r.get(col) == value)

    def neq(self, col, value):
        return self._add(lambda r: r.get(col) != value)

    def gte(self, col, value):
        return self._add(lambda r: r.get(col) is not None and _comparable(r.get(col)) >= _comparable(value))

    def lte(self, col, value):
        return self._add(lambda r: r.get(col) is not None and _comparable(r.get(col)) <= _comparable(value))

    def lt(self, col, value):
        return self._add(lambda r: r.get(col) is not None and _comparable(r.get(col)) < _comparable(value))

    def in_(self, col, values):
        return self._add(lambda r: r.get(col) in values)

    def is_(self, col, value):
        assert value == "null"
        return self._add(lambda r: r.get(col) is None)

    def ilike(self, col, pattern):
        # Only used as a case-insensitive equals (no wildcards).
        return self._add(lambda r: (r.get(col) or "").lower() == pattern.lower())

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        # Pages like PostgREST: rows start..end, both included.
        self._range = (start, end)
        return self

    # ── running ──
    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "insert":
            new = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for row in new:
                row = {"id": str(uuid.uuid4()), **self.db.column_defaults.get(self.table, {}), **copy.deepcopy(row)}
                rows.append(row)
                inserted.append(copy.deepcopy(row))
            self.db.writes.append((self.table, "insert", new))
            return SimpleNamespace(data=inserted, count=None)

        if self.op == "upsert":
            done = []
            for row in self.payload if isinstance(self.payload, list) else [self.payload]:
                existing = next((r for r in rows if r.get("id") == row.get("id")), None)
                if existing is None:
                    existing = {"id": str(uuid.uuid4()), **copy.deepcopy(row)}
                    rows.append(existing)
                else:
                    existing.update(copy.deepcopy(row))
                done.append(copy.deepcopy(existing))
            self.db.writes.append((self.table, "upsert", self.payload))
            return SimpleNamespace(data=done, count=None)

        matched = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op == "update":
            for r in matched:
                r.update(copy.deepcopy(self.payload))
            self.db.writes.append((self.table, "update", self.payload))
            return SimpleNamespace(data=copy.deepcopy(matched), count=None)
        if self.op == "delete":
            for r in matched:
                rows.remove(r)
            return SimpleNamespace(data=matched, count=None)
        # Like count="exact": every match, not just this page.
        total = len(matched)
        if self._range is not None:
            matched = matched[self._range[0]: self._range[1] + 1]
        if self._limit is not None:
            matched = matched[: self._limit]
        return SimpleNamespace(data=copy.deepcopy(matched), count=total)


class _Rpc:
    def __init__(self, db, name, params):
        self.db, self.name, self.params = db, name, params

    def execute(self):
        self.db.rpc_calls.append((self.name, self.params))
        handler = self.db.rpc_handlers[self.name]
        return SimpleNamespace(data=handler(self.params))


class FakeSupabase:
    def __init__(self, **tables):
        self.tables = {name: [copy.deepcopy(r) for r in rows] for name, rows in tables.items()}
        self.rpc_calls: list[tuple[str, dict]] = []
        self.rpc_handlers: dict = {}
        # {table: {column: value}}, what Postgres would fill in on insert.
        self.column_defaults: dict = {}
        self.writes: list = []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, name, params):
        return _Rpc(self, name, params)
