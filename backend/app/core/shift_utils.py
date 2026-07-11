"""
Helpers for resolving a Shift's *effective* timing on a given date.

A Shift normally has one start_time/end_time used every working day.
Optionally it can carry Saturday-specific overrides (sat_start_time,
sat_end_time, sat_work_hours). When those are set and the date in
question is a Saturday, they take priority. Everything else (Sun-Fri,
or a shift with no override configured) behaves exactly as before.
"""
from datetime import date as date_type, time as time_type
from typing import Optional, Tuple


def is_saturday(on_date: date_type) -> bool:
    return on_date.weekday() == 5  # Mon=0 ... Sat=5, Sun=6


def get_effective_shift_times(shift, on_date: date_type) -> Tuple[time_type, time_type]:
    """Return (start_time, end_time) that should apply for this shift on this date."""
    if shift is None:
        return None, None
    if is_saturday(on_date) and shift.sat_start_time:
        start = shift.sat_start_time
        end = shift.sat_end_time or shift.end_time
        return start, end
    return shift.start_time, shift.end_time


def get_effective_work_hours(shift, on_date: date_type) -> Optional[float]:
    """Return the shift-specific required work hours for this date, if an
    override is configured. Returns None when the caller should fall back
    to the company-wide CompanySettings.work_hours value instead."""
    if shift is None:
        return None
    if is_saturday(on_date) and shift.sat_work_hours:
        return shift.sat_work_hours
    return None
