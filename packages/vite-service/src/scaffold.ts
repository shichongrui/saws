export function scaffoldFiles(name: string): Record<string, string> {
  return {
    "package.json":
      JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
        },
        null,
        2,
      ) + "\n",
    "tsconfig.json":
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            strict: true,
            skipLibCheck: true,
            composite: true,
            declaration: true,
            emitDeclarationOnly: true,
            outDir: ".saws/types",
            types: ["vite/client", "node"],
          },
          include: ["src", "vite.config.ts"],
        },
        null,
        2,
      ) + "\n",
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React application</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
    "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
`,
    "src/App.tsx": `export default function App() {
  return <main><h1>Hello from React</h1><p>Your Vite application is ready.</p></main>;
}
`,
    "src/style.css": `:root { font-family: system-ui, sans-serif; color: #172033; background: #f6f8fb; }
body { margin: 0; }
main { max-width: 48rem; margin: 6rem auto; padding: 2rem; }
`,
    Dockerfile: `FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 80
`,
    "nginx.conf": `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location = /health {
        access_log off;
        default_type text/plain;
        return 200 "ok\\n";
    }

    location /assets/ {
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`,
    ".dockerignore": `*
!dist
!dist/**
!nginx.conf
!Dockerfile
`,
    ".gitignore": `node_modules\ndist\n.saws\n.env*\n!.env.example\n`,
  };
}
