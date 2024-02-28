<div align='center'>

# SAWS CLI

CLI for interacting with your SAWS application.

</div>

## Table of Contents
- [Installation](#installation)
- [Commands](#commands)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/cli
```

Then run `npx saws init` to initialize your SAWS application in your current directory.

## Commands <a id='commands'>

### `init`

```bash
npx saws init
```

This command will initialize a SAWS application in your current working directory.

It will
 - Install any needed dependencies
 - Create a `.gitignore`
 - Create a `tsconfig.json`
 - Create your `saws.js` config file

### `dev`

```bash
npx saws dev
```

This command will intitialize any new services in your `saws.js` file and stand up a local development environment for your application.

### `deploy`

```bash
npx saws deploy --stage <stage>
```

This command will deploy all the services in your `saws.js` file to AWS. You will need to have your AWS session configured in your terminal for this command to succeed.

### `execute`

```bash
npx saws execute ./path/to/script.ts --stage <stage>

```
This command will execute a script against your application. `stage` by default will be local. If your script depends on services being running locally, you will need to run them using `npx saws dev` in another terminal tab/window.
