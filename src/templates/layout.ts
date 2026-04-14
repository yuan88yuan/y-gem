import { html } from 'hono/html';

export const Layout = (title: string, content: any) => html`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - y-gem</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icon.svg">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  </script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#2563eb',
            'primary-hover': '#1d4ed8',
          }
        }
      }
    }
  </script>
  <style>
    input[type="text"], textarea {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
    }
    input[type="text"]:focus, textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6;
    }
  </style>
</head>
<body class="bg-gray-100 min-h-screen font-sans text-gray-900">
  ${content}
</body>
</html>
`;
