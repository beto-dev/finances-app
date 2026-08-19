from pydantic import BaseModel


class TopCategoryOut(BaseModel):
    name: str
    amount: float


class MonthlySummaryResponse(BaseModel):
    month: int
    year: int
    total_expenses: float
    total_income: float
    balance: float
    charge_count: int
    top_categories: list[TopCategoryOut]
