# Subscription Lifecycle Management

This document outlines the complete subscription lifecycle management system implemented in our application, covering normal billing, cancellations, and reactivations.

## Overview

Our subscription management system provides a seamless user experience where:

1. Users can cancel subscriptions while retaining access until the end of their billing period
2. Users who cancel can reactivate their subscription before the end date
3. The UI clearly shows subscription status (Active, Canceled) with appropriate information

## Database Schema

The `subscriptions` table includes the following key fields:

- `uuid` - User ID
- `stripe_id` - Stripe Customer ID
- `has_subscription` - Boolean indicating if subscription is active
- `paid` - Boolean indicating if payment is current
- `expires_on` - Date when the subscription expires
- `canceled` - Boolean indicating if subscription has been canceled
- `canceled_at` - Timestamp when cancelation occurred

## Cancellation Flow

When a user cancels their subscription:

1. Frontend sends cancellation request with user_id and reason
2. Backend updates Stripe with `cancel_at_period_end=true`
3. Backend sets `canceled=true` and `canceled_at=now()` in database
4. User keeps access (`has_subscription=true`, `paid=true`) until billing period ends
5. UI shows "Canceled" status and end date, with "Reactivate" button
6. When `expires_on` date is reached, a trigger or webhook automatically sets `has_subscription=false`

## Reactivation Flow

If a user wants to continue their subscription before the period ends:

1. User clicks "Reactivate Subscription" in the Profile
2. Frontend calls `/api/reactivateSubscription` with user_id
3. Backend removes `cancel_at_period_end` flag in Stripe
4. Backend updates database: `canceled=false`, `canceled_at=null`
5. UI updates to show "Active" status and next payment date
6. Normal billing resumes at the end of the current period

## Stripe Webhook Handling

Our system handles the following Stripe webhook events:

- `invoice.payment_succeeded`: Resets counters, updates expiration date
- `invoice.payment_failed`: Revokes access immediately
- `customer.subscription.deleted`: Fully deactivates the subscription
- `customer.subscription.updated`: Handles cancellations/reactivations

## UI Components

The user interface provides clear status indicators:

- **Active Subscription**: Green "Active" badge, "Next Payment" date, "Cancel" button
- **Canceled Subscription**: Orange "Canceled" badge, "Access Until" date, "Reactivate" button
- **Expired Subscription**: Gray "Inactive" badge, subscription upgrade option

## Implementation Details

Our implementation uses:

1. Stripe API for billing management
2. Database triggers for automated state changes
3. Webhook handlers for real-time updates
4. React UI components for status display and actions

## Testing

Test the following scenarios:

1. Normal subscription creation and billing
2. Cancellation - verify access continues until period end
3. Reactivation - verify subscription resumes normally
4. End of period for canceled subscription - verify access is revoked

## Future Improvements

Potential enhancements:

1. Email notifications for subscription events
2. Prorated billing for mid-cycle changes
3. Subscription pausing option
4. Grace period for payment failures 