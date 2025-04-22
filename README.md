# Origin by the Sea - Backend

Backend server for Origin by the Sea e-commerce site.

## Security Notice

This project uses sensitive API keys and service account credentials. Never commit these directly to your repository!

## Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `.env` file based on `.env.example`
4. Create a `serviceAccountKey.json` file based on `serviceAccountKey.example.json`

## Development

```bash
# Run in development mode with nodemon
npm run dev

# Run in production mode
npm start
```

## Environment Variables

- `STRIPE_SECRET_KEY`: Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook secret
- `FIREBASE_DATABASE_URL`: URL to your Firebase Realtime Database
- `FRONTEND_URL`: URL of your frontend application (for CORS)
- `PORT`: Port to run the server on (defaults to 3001)
- `NODE_ENV`: Environment (development, production)
- `FIREBASE_SERVICE_ACCOUNT`: (Optional) JSON string of your Firebase service account key

## Deployment on Vercel

1. Install the Vercel CLI: `npm install -g vercel`
2. Login to Vercel: `vercel login`
3. Set up your environment variables in the Vercel dashboard:
   - Go to your project settings
   - Add all environment variables from your `.env` file
   - For `FIREBASE_SERVICE_ACCOUNT`, create a JSON string from your Firebase service account key
4. Deploy using the CLI: `vercel` or `vercel --prod`

Alternative deployment steps:
1. Connect your GitHub repository to Vercel
2. Configure environment variables in the Vercel project settings
3. Deploy automatically from your GitHub repository

## API Endpoints

- `GET /health`: Health check endpoint
- `POST /api/payment/create-intent`: Create a payment intent
- `GET /api/payment/:paymentIntentId`: Get payment status
- `POST /api/payment/refund`: Process a refund
- `POST /api/payment/webhook`: Stripe webhook handler 