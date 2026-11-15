import logging
import signal
import time

from service.core.database import SessionLocal
import service.main  # noqa: F401
from service.calendar import scheduling

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("reminder_worker")

_stop = False


def _handle_signal(signum, frame):
    global _stop
    _stop = True
    logger.info("Shutdown signal received")


def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    logger.info(
        "Reminder worker started (interval=%ss, horizon=%sd)",
        scheduling.SCHEDULER_INTERVAL_SECONDS,
        scheduling.SCHEDULING_HORIZON_DAYS,
    )

    while not _stop:
        try:
            with SessionLocal() as db:
                scheduled = scheduling.schedule_upcoming_reminders(db)
                db.commit()
            with SessionLocal() as db:
                processed = scheduling.process_due_scheduled_reminders(db)
                db.commit()
            if scheduled or processed:
                logger.info("Scheduled %s reminders, processed %s", scheduled, processed)
        except Exception:
            logger.exception("Worker iteration failed")
        # Sleep in small increments to allow prompt shutdown.
        for _ in range(max(1, scheduling.SCHEDULER_INTERVAL_SECONDS)):
            if _stop:
                break
            time.sleep(1)

    logger.info("Reminder worker stopped")


if __name__ == "__main__":
    main()
