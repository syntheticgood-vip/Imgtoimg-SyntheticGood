import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

// Simple Vite plugin to mock Netlify functions during local development
const netlifyFunctionsPlugin = (env) => {
  return {
    name: 'netlify-functions',
    configureServer(server) {
      // Set the API_KEY in the Node process environment for the mocked function
      process.env.API_KEY = env.GEMINI_API_KEY;
      
      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url.split('?')[0];
        if (urlPath === '/.netlify/functions/gemini' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            try {
              // Dynamically import the Netlify function handler
              const { handler } = await import('./netlify/functions/gemini.js');
              
              const event = {
                httpMethod: req.method,
                body: body,
              };
              
              const context = {};
              
              const response = await handler(event, context);
              
              res.statusCode = response.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(response.body);
            } catch (error) {
              console.error('Error executing Netlify function:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), netlifyFunctionsPlugin(env)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY), // Pass API_KEY to the function
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
