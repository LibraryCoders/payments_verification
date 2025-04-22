/**
 * Helper module for Vercel deployment
 * Provides utility functions for working with Vercel environment
 */

// Log deployment environment for debugging
const logVercelEnvironment = () => {
    console.log('VERCEL:', process.env.VERCEL);
    console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
    console.log('VERCEL_REGION:', process.env.VERCEL_REGION);
    console.log('NODE_ENV:', process.env.NODE_ENV);

    // Log non-sensitive configuration variables
    console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
    console.log('PORT:', process.env.PORT);
    console.log('DATABASE_URL:', process.env.FIREBASE_DATABASE_URL);

    // Check if sensitive variables exist without logging their values
    console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
    console.log('STRIPE_WEBHOOK_SECRET exists:', !!process.env.STRIPE_WEBHOOK_SECRET);
    console.log('FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
};

module.exports = {
    logVercelEnvironment
};