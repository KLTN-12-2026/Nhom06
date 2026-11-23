from datetime import date
from pathlib import Path

import pandas as pd

from training.generate_data import END_DATE, START_DATE, main


def test_generate_same_seed_byte_identical(tmp_path: Path) -> None:
    out1 = tmp_path / "run1" / "synthetic_sales.csv"
    out2 = tmp_path / "run2" / "synthetic_sales.csv"

    main(["--seed", "42", "--out", str(out1)])
    main(["--seed", "42", "--out", str(out2)])

    assert out1.read_bytes() == out2.read_bytes()
    assert (out1.parent / "products.csv").read_bytes() == (
        out2.parent / "products.csv"
    ).read_bytes()


def test_generate_different_seed_differs(tmp_path: Path) -> None:
    out1 = tmp_path / "seed42.csv"
    out2 = tmp_path / "seed99.csv"

    main(["--seed", "42", "--out", str(out1)])
    main(["--seed", "99", "--out", str(out2)])

    assert out1.read_bytes() != out2.read_bytes()


def test_generate_completeness_non_negative_and_weekly_seasonality(
    tmp_path: Path,
) -> None:
    out_csv = tmp_path / "synthetic_sales.csv"
    main(["--seed", "42", "--out", str(out_csv)])

    products_csv = tmp_path / "products.csv"
    assert products_csv.exists()
    products_df = pd.read_csv(products_csv)
    assert list(products_df.columns) == [
        "product_code",
        "name",
        "group",
        "unit",
        "shelf_life_days",
    ]
    assert len(products_df) == 20
    assert set(products_df["product_code"]) == {f"SP{i:03d}" for i in range(1, 21)}
    assert products_df["group"].nunique() == 4

    sales_df = pd.read_csv(out_csv)
    assert list(sales_df.columns) == ["date", "product_code", "qty"]

    expected_days = (END_DATE - START_DATE).days + 1
    assert START_DATE == date(2024, 12, 1)
    assert END_DATE == date(2026, 11, 22)
    assert len(sales_df) == 20 * expected_days
    assert sales_df.duplicated(subset=["date", "product_code"]).sum() == 0

    assert (sales_df["qty"] >= 0).all()
    assert pd.api.types.is_integer_dtype(sales_df["qty"])
    assert (sales_df["qty"] == 0).any()

    # Mùa vụ tuần: trung bình cuối tuần (T7=5, CN=6) > ngày thường (T2=0..T6=4)
    dates = pd.to_datetime(sales_df["date"])
    is_weekend = dates.dt.dayofweek >= 5
    weekend_mean = sales_df.loc[is_weekend, "qty"].mean()
    weekday_mean = sales_df.loc[~is_weekend, "qty"].mean()
    assert weekend_mean > weekday_mean
