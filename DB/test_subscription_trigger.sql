-- Test Script for Subscription Trigger Validation
-- This script tests the subscription cancellation/expiration trigger

-- Step 1: Create a test subscription with a future expiration date
INSERT INTO subscriptions (
    uuid, 
    email, 
    has_subscription, 
    paid, 
    stripe_id, 
    expires_on, 
    canceled, 
    canceled_at, 
    ai_searches
) VALUES (
    '00000000-0000-0000-0000-000000000000', -- Test UUID
    'test@example.com',
    TRUE,  -- active subscription
    TRUE,  -- paid
    'cus_test12345',
    (CURRENT_DATE + INTERVAL '30 days')::date, -- expires in 30 days
    FALSE, -- not canceled
    NULL,  -- no cancellation date
    0      -- AI searches
)
ON CONFLICT (id) DO NOTHING; -- Skip if test record already exists

-- Step 2: Simulate cancellation - this should keep access
UPDATE subscriptions
SET 
    canceled = TRUE,
    canceled_at = CURRENT_TIMESTAMP
WHERE uuid = '00000000-0000-0000-0000-000000000000'
RETURNING id, uuid, has_subscription, paid, expires_on, canceled, canceled_at;

-- Step 3: Verify the subscription is still active but marked as canceled
SELECT 
    id, uuid, email, has_subscription, paid, 
    expires_on, canceled, canceled_at, ai_searches
FROM subscriptions 
WHERE uuid = '00000000-0000-0000-0000-000000000000';

-- Step 4: Simulate expiration by updating the expiry date to yesterday
UPDATE subscriptions
SET 
    expires_on = (CURRENT_DATE - INTERVAL '1 day')::date
WHERE uuid = '00000000-0000-0000-0000-000000000000';

-- Step 5: Simulate any update that should trigger the expiration check
-- The trigger should automatically set has_subscription and paid to FALSE
UPDATE subscriptions
SET 
    updated_at = CURRENT_TIMESTAMP -- just update timestamp to trigger the function
WHERE uuid = '00000000-0000-0000-0000-000000000000'
RETURNING id, uuid, has_subscription, paid, expires_on, canceled, canceled_at;

-- Step 6: Verify the subscription is now inactive
SELECT 
    id, uuid, email, has_subscription, paid, 
    expires_on, canceled, canceled_at, ai_searches
FROM subscriptions 
WHERE uuid = '00000000-0000-0000-0000-000000000000';

-- Step 7: Simulate reactivation
UPDATE subscriptions
SET 
    canceled = FALSE,
    canceled_at = NULL,
    has_subscription = TRUE,
    paid = TRUE,
    expires_on = (CURRENT_DATE + INTERVAL '30 days')::date
WHERE uuid = '00000000-0000-0000-0000-000000000000'
RETURNING id, uuid, has_subscription, paid, expires_on, canceled, canceled_at;

-- Clean up (uncomment to remove test data)
-- DELETE FROM subscriptions WHERE uuid = '00000000-0000-0000-0000-000000000000'; 