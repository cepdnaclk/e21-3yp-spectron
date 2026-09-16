-- Apply the new one-second minimum to controllers that were created with the
-- former five- or ten-minute default. Explicitly slower schedules continue to
-- be calculated from each sensor configuration.
UPDATE controllers
SET min_reporting_interval_sec = 1
WHERE min_reporting_interval_sec IS NULL
   OR min_reporting_interval_sec > 1;
