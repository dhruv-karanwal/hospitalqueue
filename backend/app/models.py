"""Pydantic request/response models: every input is bounded and type-checked."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .engine.pcb import IORequest, PatientSpec
from .engine.simulator import POLICIES, SimConfig

Policy = Literal["FCFS", "SJF", "SRTF", "PRIORITY_NP", "PRIORITY_P", "RR", "PRIORITY_AGING"]
DeviceName = Literal["lab", "xray", "pharmacy"]
ID_PATTERN = r"^[A-Za-z0-9_\-]{1,20}$"

MAX_PATIENTS = 1000
MAX_TOTAL_BURST = 100_000


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Health(BaseModel):
    status: str
    app: str
    version: str


class IORequestIn(Strict):
    at: int = Field(ge=1, le=999, description="CPU minutes done before the request")
    device: DeviceName
    duration: int = Field(ge=1, le=500)


class PatientIn(Strict):
    id: str = Field(pattern=ID_PATTERN)
    name: str = Field(default="", max_length=60)
    arrival_time: int = Field(ge=0, le=100_000)
    burst_time: int = Field(ge=1, le=1000)
    priority: int = Field(default=3, ge=1, le=5)
    triage_category: str | None = Field(default=None, max_length=30)
    doctor_id: int | None = Field(default=None, ge=1, le=20)
    io_requests: list[IORequestIn] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _io_inside_burst(self):
        ats = [r.at for r in self.io_requests]
        if any(a >= self.burst_time for a in ats):
            raise ValueError("each io_requests[].at must be less than burst_time")
        if len(set(ats)) != len(ats):
            raise ValueError("io_requests[].at values must be distinct")
        return self

    def to_spec(self) -> PatientSpec:
        return PatientSpec(id=self.id, arrival=self.arrival_time, burst=self.burst_time,
                           priority=self.priority, name=self.name, triage=self.triage_category,
                           doctor=self.doctor_id,
                           io=tuple(IORequest(r.at, r.device, r.duration) for r in self.io_requests))


class Devices(Strict):
    lab: int = Field(default=1, ge=1, le=10)
    xray: int = Field(default=1, ge=1, le=10)
    pharmacy: int = Field(default=1, ge=1, le=10)


class SimParams(Strict):
    quantum: int = Field(default=2, ge=1, le=100)
    context_switch_cost: int = Field(default=0, ge=0, le=10)
    aging_interval: int = Field(default=5, ge=1, le=1000)
    aging_step: int = Field(default=1, ge=1, le=4)
    starvation_threshold: int = Field(default=30, ge=1, le=100_000)
    queue_mode: Literal["global", "per_doctor"] = "global"
    devices: Devices = Field(default_factory=Devices)
    include_trace: bool = True


def _check_workload(patients: list[PatientIn], doctors: int) -> None:
    ids = [p.id for p in patients]
    if len(set(ids)) != len(ids):
        raise ValueError("patient ids must be unique")
    if sum(p.burst_time for p in patients) > MAX_TOTAL_BURST:
        raise ValueError(f"total burst time must be <= {MAX_TOTAL_BURST}")
    for p in patients:
        if p.doctor_id is not None and p.doctor_id > doctors:
            raise ValueError(f"{p.id}: doctor_id {p.doctor_id} exceeds number of doctors")


class Workload(Strict):
    patients: list[PatientIn] = Field(max_length=MAX_PATIENTS)
    doctors: int = Field(default=1, ge=1, le=20)
    params: SimParams = Field(default_factory=SimParams)

    @model_validator(mode="after")
    def _valid(self):
        _check_workload(self.patients, self.doctors)
        return self

    def specs(self) -> list[PatientSpec]:
        return [p.to_spec() for p in self.patients]

    def config(self, policy: str = "FCFS", **over) -> SimConfig:
        pr = self.params
        kw = dict(policy=policy, doctors=self.doctors, quantum=pr.quantum,
                  context_switch_cost=pr.context_switch_cost, aging_interval=pr.aging_interval,
                  aging_step=pr.aging_step, starvation_threshold=pr.starvation_threshold,
                  queue_mode=pr.queue_mode, include_trace=pr.include_trace,
                  devices=(("lab", pr.devices.lab), ("xray", pr.devices.xray), ("pharmacy", pr.devices.pharmacy)))
        kw.update(over)
        return SimConfig(**kw)


class SimulateRequest(Workload):
    policy: Policy = "FCFS"
    save_run: bool = True


class CompareRequest(Workload):
    policies: list[Policy] = Field(default_factory=lambda: list(POLICIES), min_length=1, max_length=7)


class MultiDoctorRequest(Workload):
    policy: Policy = "FCFS"
    doctors: int = Field(default=2, ge=2, le=20)


class BankerRequest(Strict):
    resources: list[str] = Field(default_factory=lambda: ["beds", "ambulances", "lab_devices"], min_length=1, max_length=6)
    processes: list[str] | None = Field(default=None, max_length=20)
    available: list[int] = Field(min_length=1, max_length=6)
    max: list[list[int]] = Field(max_length=20)
    allocation: list[list[int]] = Field(max_length=20)
    request: "ResourceRequest | None" = None

    @model_validator(mode="after")
    def _shape(self):
        m = len(self.available)
        if len(self.resources) != m:
            raise ValueError("resources must name every column of available")
        if len(self.max) != len(self.allocation):
            raise ValueError("max and allocation need the same number of rows")
        for row in self.max + self.allocation:
            if len(row) != m:
                raise ValueError("every matrix row must have one entry per resource")
            if any(not 0 <= x <= 1000 for x in row):
                raise ValueError("matrix values must be within 0..1000")
        if any(not 0 <= x <= 1000 for x in self.available):
            raise ValueError("available values must be within 0..1000")
        for i, (mx, al) in enumerate(zip(self.max, self.allocation)):
            if any(a > b for a, b in zip(al, mx)):
                raise ValueError(f"row {i}: allocation exceeds max")
        if self.processes is not None and len(self.processes) != len(self.max):
            raise ValueError("processes must name every row")
        if self.request is not None:
            if not 0 <= self.request.process < len(self.max):
                raise ValueError("request.process out of range")
            if len(self.request.vector) != m:
                raise ValueError("request.vector must have one entry per resource")
        return self


class ResourceRequest(Strict):
    process: int = Field(ge=0, le=19)
    vector: list[int] = Field(min_length=1, max_length=6)

    @field_validator("vector")
    @classmethod
    def _nonneg(cls, v):
        if any(not 0 <= x <= 1000 for x in v):
            raise ValueError("request values must be within 0..1000")
        return v


BankerRequest.model_rebuild()


class DeadlockRequest(Strict):
    available: list[int] = Field(min_length=1, max_length=6)
    allocation: list[list[int]] = Field(max_length=20)
    request: list[list[int]] = Field(max_length=20)

    @model_validator(mode="after")
    def _shape(self):
        m = len(self.available)
        if len(self.allocation) != len(self.request):
            raise ValueError("allocation and request need the same number of rows")
        for row in self.allocation + self.request + [self.available]:
            if len(row) != m or any(not 0 <= x <= 1000 for x in row):
                raise ValueError("rows must have one value per resource, each within 0..1000")
        return self


class RaceRequest(Strict):
    workers: int = Field(default=2, ge=2, le=4)
    tokens: int = Field(default=5, ge=1, le=30)
    mode: Literal["none", "mutex", "semaphore"] = "none"
    phase: Literal["pickup", "issue"] = "pickup"


class ProducerConsumerRequest(Strict):
    capacity: int = Field(default=3, ge=1, le=20)
    consumers: int = Field(default=2, ge=1, le=6)
    service_time: int = Field(default=3, ge=1, le=30)
    arrivals: list[int] | None = Field(default=None, max_length=200)
    count: int = Field(default=12, ge=0, le=200)
    interval: int = Field(default=1, ge=0, le=60)
    horizon: int = Field(default=600, ge=1, le=5000)

    @field_validator("arrivals")
    @classmethod
    def _times(cls, v):
        if v is not None and any(not 0 <= x <= 5000 for x in v):
            raise ValueError("arrival times must be within 0..5000")
        return v

    def arrival_times(self) -> list[int]:
        return self.arrivals if self.arrivals is not None else [i * self.interval for i in range(self.count)]


class SessionCreate(Strict):
    patients: list[PatientIn] = Field(default_factory=list, max_length=300)
    doctors: int = Field(default=2, ge=1, le=20)
    policy: Policy = "PRIORITY_P"
    params: SimParams = Field(default_factory=SimParams)

    @model_validator(mode="after")
    def _valid(self):
        _check_workload(self.patients, self.doctors)
        return self


class SessionPatients(Strict):
    patients: list[PatientIn] = Field(min_length=1, max_length=50)


class SessionStep(Strict):
    ticks: int = Field(default=1, ge=1, le=1000)


class ScenarioSave(Strict):
    id: str = Field(pattern=r"^[a-z0-9\-]{3,40}$")
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    doctors: int = Field(default=1, ge=1, le=20)
    policy: Policy = "FCFS"
    params: SimParams = Field(default_factory=SimParams)
    patients: list[PatientIn] = Field(max_length=MAX_PATIENTS)

    @model_validator(mode="after")
    def _valid(self):
        _check_workload(self.patients, self.doctors)
        return self
