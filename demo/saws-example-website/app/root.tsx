import * as React from "react";
import { LinksFunction, json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  MetaFunction,
  LiveReload,
  useLoaderData,
} from "@remix-run/react";

export const meta: MetaFunction = () => [
  {
    charset: "utf-8",
  },
  {
    title: "PM Docs",
  },
  {
    viewport: "width=device-width,initial-scale=1",
  },
];

export let links: LinksFunction = () => {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&display=swap",
    },
  ];
};

interface DocumentProps {
  children: React.ReactNode;
}

const Document = ({ children }: DocumentProps, emotionCache) => {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
};

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}
