# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```

# Subscription Cancellation Feature Update

This update modifies the subscription cancellation behavior to allow users to retain access until the end of their current billing period when they cancel their subscription, rather than losing access immediately.

## Implementation

The implementation spans both backend and frontend:

### Backend (API) Changes

- Modified the `/api/cancelSubscription` endpoint to use Stripe's `cancel_at_period_end` option
- Added tracking of canceled subscriptions in the database
- Enhanced the webhook handler to properly process subscription updates and expirations
- Added logic in `getSubscriptionInfo` to correctly display status for canceled subscriptions

### Database Schema Updates

- Added `canceled` (boolean) column to track if a subscription is canceled
- Added `canceled_at` (timestamp) column to record when the cancellation happened
- Created a database trigger to automatically update subscription status when expiration date is reached

### Frontend Changes

- Updated Profile component to show "Canceled" status for canceled subscriptions
- Modified Cancel Subscription flow to show the access end date after cancellation
- Improved date formatting and error handling throughout the subscription management UI

## Applying the Changes

Follow the detailed instructions in the `DB/migrations/README.md` file to apply these changes to your environment.

## Testing

For QA purposes, test the following scenarios:

1. **New Cancellation**: Subscribe a test user, then cancel their subscription and verify they maintain access
2. **End of Period**: Simulate a subscription reaching its end date (manual DB update) and confirm access is revoked
3. **Resubscription**: Test that a user can resubscribe after cancellation but before end date
4. **UI Display**: Verify that all UI components correctly display the "Canceled" state

## Support

If users report issues with their subscription status after cancellation, verify:

1. The `has_subscription` and `canceled` flags in the database
2. The subscription status in Stripe (should have `cancel_at_period_end: true`)
3. The expiration date is correctly set and formatted in the UI
