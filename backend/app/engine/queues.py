"""Ready queue: a binary heap with lazy deletion.

push/pop/peek are O(log n). Re-pushing an index (e.g. after aging changes its
priority) invalidates the older heap entry instead of searching for it.
The FIFO policies (FCFS, RR) use a constant key, so the insertion counter
gives pure first-in-first-out order.
"""
from __future__ import annotations

import heapq
from itertools import count


class ReadyQueue:
    __slots__ = ("_heap", "_live", "_counter")

    def __init__(self) -> None:
        self._heap: list[tuple] = []
        self._live: dict[int, int] = {}      # idx -> counter of its valid entry
        self._counter = count()

    def push(self, key: tuple, idx: int) -> None:
        c = next(self._counter)
        self._live[idx] = c
        heapq.heappush(self._heap, (key, c, idx))

    def _clean(self) -> None:
        h, live = self._heap, self._live
        while h and live.get(h[0][2]) != h[0][1]:
            heapq.heappop(h)

    def peek(self) -> int | None:
        self._clean()
        return self._heap[0][2] if self._heap else None

    def pop(self) -> int:
        self._clean()
        _, _, idx = heapq.heappop(self._heap)
        del self._live[idx]
        return idx

    def remove(self, idx: int) -> None:
        self._live.pop(idx, None)

    def __len__(self) -> int:
        return len(self._live)

    def __contains__(self, idx: int) -> bool:
        return idx in self._live

    def ids(self) -> set[int]:
        return set(self._live)

    def ordered(self) -> list[int]:
        """Live members in dispatch order (for display only, O(n log n))."""
        live = self._live
        return [e[2] for e in sorted(self._heap) if live.get(e[2]) == e[1]]
