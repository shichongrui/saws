export function scaffoldFiles(): Record<string, string> {
  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Static site</title>
  </head>
  <body>
    <h1>Your static site is ready</h1>
    <p>Add HTML pages and assets to this service folder.</p>
  </body>
</html>
`,
    Dockerfile: `FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/nginx.conf /usr/share/nginx/html/Dockerfile
EXPOSE 80
`,
    "nginx.conf": `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    autoindex off;
    disable_symlinks on;

    location = /_saws/health {
        access_log off;
        default_type text/plain;
        return 200 "ok\\n";
    }

    # Keep dotfiles and service configuration private, including in development.
    location ~ (^|/)\\. {
        return 404;
    }

    location ~ (^|/)(Dockerfile|nginx\\.conf)$ {
        return 404;
    }

    # Assets and explicit HTML URLs are served as-is.
    location ~ /[^/]+\\.[^/]+$ {
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
`,
    ".dockerignore": `Dockerfile
.dockerignore
.git
.gitignore
.saws
.env*
node_modules
`,
  };
}
