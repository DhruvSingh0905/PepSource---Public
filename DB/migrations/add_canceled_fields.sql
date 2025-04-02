-- Add canceled and canceled_at columns to the subscriptions table
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS canceled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create a function to handle the subscription expiration automatically 
-- This will run when the subscription billing period ends for canceled subscriptions
CREATE OR REPLACE FUNCTION handle_subscription_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- If the current date is greater than or equal to the expires_on date 
  -- and the subscription was previously canceled, update the has_subscription field
  IF NEW.expires_on IS NOT NULL AND NEW.canceled = TRUE AND 
     CURRENT_DATE >= NEW.expires_on AND NEW.has_subscription = TRUE THEN
    NEW.has_subscription := FALSE;
    NEW.paid := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run the function before each update
DROP TRIGGER IF EXISTS subscription_expiration_trigger ON public.subscriptions;
CREATE TRIGGER subscription_expiration_trigger
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION handle_subscription_expiration();

-- Create a daily task to check for expired subscriptions
-- This requires pg_cron extension to be enabled (needs database admin privileges)
-- If you don't have pg_cron, you'll need to run a scheduled task from your application
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    EXECUTE E'
      SELECT cron.schedule(
        \'check-subscription-expirations\',
        \'0 0 * * *\',  -- Run daily at midnight
        $$UPDATE public.subscriptions 
          SET has_subscription = FALSE, paid = FALSE 
          WHERE expires_on IS NOT NULL 
            AND canceled = TRUE 
            AND CURRENT_DATE >= expires_on 
            AND has_subscription = TRUE$$
      );
    ';
  END IF;
END $$; 