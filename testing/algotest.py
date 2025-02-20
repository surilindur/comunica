#!/bin/python

from random import random
from numpy import array
from matplotlib.pyplot import subplot
from matplotlib.pyplot import savefig

MAX_DURATION = 250
MIN_DURATION = 60
REQUEST_COUNT = 1000
FAILED_SHARE = 0.05
CORRECTION_MULTIPLIER = 0.01
FAIL_MULTIPLIER = 100


def simple_average() -> None:
    delay = -1
    delays = []
    durations = []
    averages = []
    average = int((MAX_DURATION + MIN_DURATION) / 2)
    for i in range(0, REQUEST_COUNT):
        failed = random() < FAILED_SHARE
        duration_raw = int(MIN_DURATION + random() * MAX_DURATION)
        duration = (FAIL_MULTIPLIER if failed else 1) * duration_raw
        if delay < 0:
            delay = duration
        else:
            delay = delay + CORRECTION_MULTIPLIER * (duration - delay)
        averages.append(average)
        delays.append(delay)
        durations.append(duration)
    print(
        " ".join(
            (
                f"delay final {delay}",
                f"average {sum(delays) / len(delays):.0f}",
                f"min {min(delays)}",
                f"max {max(delays)}",
            )
        )
    )
    ax = subplot()
    ax.set_ylim(0, max(delays) * 2)
    x = array(range(0, REQUEST_COUNT))
    ax.plot(x, durations, lw=1, label="duration")
    ax.plot(x, delays, lw=1, label="delay")
    ax.plot(x, averages, lw=1, label="average")
    ax.legend()
    savefig(__file__.replace(".py", ".png"))


if __name__ == "__main__":
    simple_average()
