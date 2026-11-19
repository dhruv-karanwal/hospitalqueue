"""Pydantic request/response models. Filled in from milestone 2 onward."""
from pydantic import BaseModel


class Health(BaseModel):
    status: str
    app: str
    version: str
