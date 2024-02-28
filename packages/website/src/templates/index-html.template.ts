export const indexHtmlTemplate = ({ name }: { name: string }) => /* html */`<!DOCTYPE html>
<html>
  <head>
    <title>${name}</title>
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <link rel="stylesheet" href="/main.css" />
  </head>
  <body>
    <h1>Hello world!</h1>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
`